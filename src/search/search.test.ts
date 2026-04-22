import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { openDatabase, upsertChunks } from '../indexer/database.js'
import { cosineSimilarity } from '../indexer/embeddings.js'
import { searchCode, getSymbol } from './search.js'
import type Database from 'better-sqlite3'
import type { EmbeddingsConfig } from '../indexer/embeddings.js'

vi.mock('../indexer/embeddings.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../indexer/embeddings.js')>()
  return {
    ...actual,
    getEmbedding: vi.fn(),
  }
})

import { getEmbedding } from '../indexer/embeddings.js'

const embeddingsConfig: EmbeddingsConfig = { provider: 'ollama' }

let tmpDir: string
let db: Database.Database

// Three orthogonal unit-vector embeddings for predictable cosine scores
const vecA = [1, 0, 0]   // "most similar" to query [1,0,0]
const vecB = [0, 1, 0]   // orthogonal
const vecC = [-1, 0, 0]  // opposite

const chunks = [
  { id: 'a', filepath: 'src/a.ts', startLine: 1, endLine: 5, content: 'class Foo {}', embedding: vecA, updatedAt: 1 },
  { id: 'b', filepath: 'src/b.ts', startLine: 1, endLine: 5, content: 'function bar() {}', embedding: vecB, updatedAt: 1 },
  { id: 'c', filepath: 'src/c.ts', startLine: 1, endLine: 5, content: 'const baz = 1', embedding: vecC, updatedAt: 1 },
]

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcplens-search-'))
  db = openDatabase(tmpDir)
  upsertChunks(db, chunks)
})

afterEach(() => {
  db.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// searchCode
// ---------------------------------------------------------------------------

describe('searchCode', () => {
  it('returns results sorted descending by cosine score', async () => {
    vi.mocked(getEmbedding).mockResolvedValue(vecA)

    const results = await searchCode(db, 'query', embeddingsConfig, { minScore: -1, topK: 10 })

    expect(results[0].score).toBeGreaterThanOrEqual(results[1]?.score ?? -Infinity)
    expect(results[0].filepath).toBe('src/a.ts')
  })

  it('filters out results below minScore', async () => {
    vi.mocked(getEmbedding).mockResolvedValue(vecA)

    // cosine(vecA, vecA) = 1, cosine(vecA, vecB) = 0, cosine(vecA, vecC) = -1
    const results = await searchCode(db, 'query', embeddingsConfig, { minScore: 0.5, topK: 10 })
    expect(results.every(r => r.score >= 0.5)).toBe(true)
    expect(results).toHaveLength(1)
  })

  it('respects topK limit', async () => {
    vi.mocked(getEmbedding).mockResolvedValue(vecA)

    const results = await searchCode(db, 'query', embeddingsConfig, { minScore: -1, topK: 2 })
    expect(results).toHaveLength(2)
  })

  it('returns empty array when no chunks pass minScore', async () => {
    vi.mocked(getEmbedding).mockResolvedValue([0, 0, 1])
    // All inserted chunks have embeddings with 0 in z-axis → score = 0
    const results = await searchCode(db, 'query', embeddingsConfig, { minScore: 0.5, topK: 10 })
    expect(results).toHaveLength(0)
  })

  it('includes filepath, startLine, endLine, content, score in each result', async () => {
    vi.mocked(getEmbedding).mockResolvedValue(vecA)
    const [r] = await searchCode(db, 'q', embeddingsConfig, { minScore: -1, topK: 1 })
    expect(r).toHaveProperty('filepath')
    expect(r).toHaveProperty('startLine')
    expect(r).toHaveProperty('endLine')
    expect(r).toHaveProperty('content')
    expect(r).toHaveProperty('score')
  })
})

// Verify cosineSimilarity still works (unchanged from import)
describe('cosineSimilarity (imported via search test)', () => {
  it('scores vecA vs vecA as 1', () => {
    expect(cosineSimilarity(vecA, vecA)).toBeCloseTo(1)
  })
})

// ---------------------------------------------------------------------------
// getSymbol
// ---------------------------------------------------------------------------

describe('getSymbol', () => {
  it('finds a chunk containing "class Foo"', () => {
    const results = getSymbol(db, 'Foo')
    expect(results.some(r => r.content.includes('class Foo'))).toBe(true)
  })

  it('finds a chunk containing "function bar"', () => {
    const results = getSymbol(db, 'bar')
    expect(results.some(r => r.content.includes('function bar'))).toBe(true)
  })

  it('returns empty array for a symbol that does not exist', () => {
    expect(getSymbol(db, 'NonExistentSymbol')).toHaveLength(0)
  })

  it('deduplicates results by filepath+startLine', () => {
    // Insert a chunk that matches multiple patterns (class + interface with same name)
    upsertChunks(db, [{
      id: 'dup',
      filepath: 'src/dup.ts',
      startLine: 1,
      endLine: 3,
      content: 'class Dup {} interface Dup {}',
      embedding: [0],
      updatedAt: 1,
    }])
    const results = getSymbol(db, 'Dup')
    const keys = results.map(r => `${r.filepath}:${r.startLine}`)
    const unique = new Set(keys)
    expect(keys.length).toBe(unique.size)
  })

  it('sets score to 1.0 for all symbol results', () => {
    const results = getSymbol(db, 'Foo')
    expect(results.every(r => r.score === 1.0)).toBe(true)
  })
})
