import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { openDatabase, upsertChunks } from '../indexer/database.js'
import { cosineSimilarity } from '../indexer/embeddings.js'
import { searchCode, getSymbol } from './search.js'
import { buildBM25Index } from './bm25.js'
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
// searchCode — hybrid path
// ---------------------------------------------------------------------------

describe('searchCode — hybrid', () => {
  it('hybridAlpha=0 with no bm25Index produces identical ordering to pure semantic', async () => {
    vi.mocked(getEmbedding).mockResolvedValue(vecA)

    const pure = await searchCode(db, 'query', embeddingsConfig, { minScore: -1, topK: 10 })
    const hybrid = await searchCode(db, 'query', embeddingsConfig, { minScore: -1, topK: 10, hybridAlpha: 0 })

    expect(hybrid.map(r => r.filepath)).toEqual(pure.map(r => r.filepath))
    expect(hybrid.map(r => r.score)).toEqual(pure.map(r => r.score))
  })

  it('hybridAlpha=0 with a supplied BM25 index still uses pure semantic (fast path)', async () => {
    vi.mocked(getEmbedding).mockResolvedValue(vecA)

    const bm25Index = buildBM25Index(chunks.map(c => ({ id: c.id, content: c.content })))
    const pure = await searchCode(db, 'query', embeddingsConfig, { minScore: -1, topK: 10 })
    const hybrid = await searchCode(db, 'query', embeddingsConfig, { minScore: -1, topK: 10, hybridAlpha: 0 }, bm25Index)

    expect(hybrid.map(r => r.filepath)).toEqual(pure.map(r => r.filepath))
  })

  it('hybridAlpha=1 ranks by BM25 alone — exact keyword match wins', async () => {
    // Give all chunks zero cosine similarity so semantic can't influence ordering.
    vi.mocked(getEmbedding).mockResolvedValue([0, 0, 1])

    // "baz" appears only in chunk c's content ("const baz = 1").
    const bm25Index = buildBM25Index(chunks.map(c => ({ id: c.id, content: c.content })))
    const results = await searchCode(
      db, 'baz', embeddingsConfig,
      { minScore: -1, topK: 10, hybridAlpha: 1 },
      bm25Index
    )

    expect(results[0].filepath).toBe('src/c.ts')
  })

  it('hybridAlpha=0.3 blended: chunk scoring on both beats chunk scoring on only one', async () => {
    // Insert two extra chunks:
    //   'd' — high cosine, zero BM25 (no keyword)
    //   'e' — mid cosine, has keyword
    const vecD = [0.9, 0.1, 0]
    const vecE = [0.6, 0.4, 0]
    upsertChunks(db, [
      { id: 'd', filepath: 'src/d.ts', startLine: 1, endLine: 2, content: 'no matching keywords here', embedding: vecD, updatedAt: 1 },
      { id: 'e', filepath: 'src/e.ts', startLine: 1, endLine: 2, content: 'target keyword match', embedding: vecE, updatedAt: 1 },
    ])

    // Query embedding close to vecD so chunk d wins on cosine.
    vi.mocked(getEmbedding).mockResolvedValue([1, 0, 0])

    const allChunks = [
      ...chunks,
      { id: 'd', content: 'no matching keywords here' },
      { id: 'e', content: 'target keyword match' },
    ]
    const bm25Index = buildBM25Index(allChunks)

    // Query contains the keyword "target" which is only in chunk e.
    const results = await searchCode(
      db, 'target', embeddingsConfig,
      { minScore: -1, topK: 10, hybridAlpha: 0.3 },
      bm25Index
    )

    const eResult = results.find(r => r.filepath === 'src/e.ts')
    const dResult = results.find(r => r.filepath === 'src/d.ts')
    // e has keyword advantage; d has cosine advantage but zero BM25.
    // With alpha=0.3, e's blended score should exceed d's.
    expect(eResult).toBeDefined()
    expect(dResult).toBeDefined()
    expect(eResult!.score).toBeGreaterThan(dResult!.score)
  })

  it('minScore filters the blended score in hybrid mode', async () => {
    vi.mocked(getEmbedding).mockResolvedValue([0, 0, 1]) // all cosine scores ~0
    const bm25Index = buildBM25Index(chunks.map(c => ({ id: c.id, content: c.content })))

    // All chunks get near-zero blended score; a high minScore should exclude them.
    const results = await searchCode(
      db, 'nomatch', embeddingsConfig,
      { minScore: 0.9, topK: 10, hybridAlpha: 0.3 },
      bm25Index
    )
    expect(results).toHaveLength(0)
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
