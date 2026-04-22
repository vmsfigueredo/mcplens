import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  openDatabase,
  upsertChunks,
  getAllChunks,
  deleteChunksByFile,
  getFileHash,
  setFileHash,
  deleteFileHash,
  getAllFileHashes,
} from './database.js'
import type { ChunkRow, Db } from './database.js'

let tmpDir: string
let db: Db

function makeRow(overrides: Partial<ChunkRow> = {}): ChunkRow {
  return {
    id: 'id-1',
    filepath: 'src/foo.ts',
    startLine: 1,
    endLine: 10,
    content: 'function foo() {}',
    embedding: [0.1, 0.2, 0.3],
    updatedAt: 1000,
    ...overrides,
  }
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcplens-test-'))
  db = openDatabase(tmpDir)
})

afterEach(() => {
  db.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// openDatabase
// ---------------------------------------------------------------------------

describe('openDatabase', () => {
  it('creates the .mcplens directory and index.db', () => {
    expect(fs.existsSync(path.join(tmpDir, '.mcplens', 'index.db'))).toBe(true)
  })

  it('creates the chunks table', () => {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='chunks'").get()
    expect(row).toBeTruthy()
  })

  it('creates the file_hashes table', () => {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='file_hashes'").get()
    expect(row).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// chunks CRUD
// ---------------------------------------------------------------------------

describe('upsertChunks / getAllChunks', () => {
  it('round-trips a chunk including the embedding array', () => {
    upsertChunks(db, [makeRow()])
    const chunks = getAllChunks(db)
    expect(chunks).toHaveLength(1)
    expect(chunks[0].embedding).toEqual([0.1, 0.2, 0.3])
    expect(chunks[0].startLine).toBe(1)
    expect(chunks[0].endLine).toBe(10)
    expect(chunks[0].content).toBe('function foo() {}')
  })

  it('replaces a chunk with the same id on upsert', () => {
    upsertChunks(db, [makeRow({ content: 'original' })])
    upsertChunks(db, [makeRow({ content: 'updated' })])
    const chunks = getAllChunks(db)
    expect(chunks).toHaveLength(1)
    expect(chunks[0].content).toBe('updated')
  })

  it('stores multiple chunks', () => {
    upsertChunks(db, [
      makeRow({ id: 'a', filepath: 'src/a.ts', startLine: 1 }),
      makeRow({ id: 'b', filepath: 'src/b.ts', startLine: 5 }),
    ])
    expect(getAllChunks(db)).toHaveLength(2)
  })
})

describe('deleteChunksByFile', () => {
  it('removes only chunks matching the given filepath', () => {
    upsertChunks(db, [
      makeRow({ id: 'a', filepath: 'src/a.ts' }),
      makeRow({ id: 'b', filepath: 'src/b.ts' }),
    ])
    deleteChunksByFile(db, 'src/a.ts')
    const chunks = getAllChunks(db)
    expect(chunks).toHaveLength(1)
    expect(chunks[0].filepath).toBe('src/b.ts')
  })

  it('does nothing when filepath has no matching chunks', () => {
    upsertChunks(db, [makeRow()])
    deleteChunksByFile(db, 'nonexistent.ts')
    expect(getAllChunks(db)).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// file_hashes CRUD
// ---------------------------------------------------------------------------

describe('setFileHash / getFileHash', () => {
  it('stores and retrieves a hash', () => {
    setFileHash(db, 'src/foo.ts', 'abc123')
    expect(getFileHash(db, 'src/foo.ts')).toBe('abc123')
  })

  it('returns null for an unknown filepath', () => {
    expect(getFileHash(db, 'missing.ts')).toBeNull()
  })

  it('replaces an existing hash on upsert', () => {
    setFileHash(db, 'src/foo.ts', 'old')
    setFileHash(db, 'src/foo.ts', 'new')
    expect(getFileHash(db, 'src/foo.ts')).toBe('new')
  })
})

describe('deleteFileHash', () => {
  it('removes the hash entry', () => {
    setFileHash(db, 'src/foo.ts', 'abc')
    deleteFileHash(db, 'src/foo.ts')
    expect(getFileHash(db, 'src/foo.ts')).toBeNull()
  })

  it('does not throw when deleting a nonexistent entry', () => {
    expect(() => deleteFileHash(db, 'nope.ts')).not.toThrow()
  })
})

describe('getAllFileHashes', () => {
  it('returns all hashes as a filepath → hash map', () => {
    setFileHash(db, 'src/a.ts', 'hash-a')
    setFileHash(db, 'src/b.ts', 'hash-b')
    const hashes = getAllFileHashes(db)
    expect(hashes['src/a.ts']).toBe('hash-a')
    expect(hashes['src/b.ts']).toBe('hash-b')
  })

  it('returns an empty object when no hashes are stored', () => {
    expect(getAllFileHashes(db)).toEqual({})
  })
})

