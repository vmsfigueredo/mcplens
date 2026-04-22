import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { openDatabase, getAllChunks, getFileHash, getAllFileHashes } from './database.js'
import { indexFile, removeFile, indexProject } from './indexer.js'
import type { Db } from './database.js'
import type { IndexerConfig } from './indexer.js'

vi.mock('./embeddings.js', () => ({
  getEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
}))

let tmpDir: string
let db: Db

const embeddingsConfig = { provider: 'ollama' as const }

function makeConfig(overrides: Partial<IndexerConfig> = {}): IndexerConfig {
  return {
    projectRoot: tmpDir,
    embeddings: embeddingsConfig,
    ...overrides,
  }
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcplens-indexer-'))
  db = openDatabase(tmpDir)
})

afterEach(() => {
  db.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

function writeFile(name: string, content: string): string {
  const fullPath = path.join(tmpDir, name)
  fs.mkdirSync(path.dirname(fullPath), { recursive: true })
  fs.writeFileSync(fullPath, content, 'utf-8')
  return fullPath
}

// ---------------------------------------------------------------------------
// indexFile
// ---------------------------------------------------------------------------

describe('indexFile', () => {
  it('indexes a new file, creating chunks and a file hash', async () => {
    const file = writeFile('src/hello.ts', 'function hello() { return "hi" }')
    await indexFile(db, file, tmpDir, makeConfig())

    const chunks = getAllChunks(db)
    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks[0].filepath).toBe('src/hello.ts')

    const hash = getFileHash(db, 'src/hello.ts')
    expect(hash).toBeTruthy()
  })

  it('is a no-op when file content is unchanged', async () => {
    const { getEmbedding } = await import('./embeddings.js')
    const mockEmbed = vi.mocked(getEmbedding)

    const file = writeFile('src/stable.ts', 'const x = 1')
    await indexFile(db, file, tmpDir, makeConfig())
    const callsAfterFirst = mockEmbed.mock.calls.length

    // Index again — content unchanged, so no new embedding calls
    await indexFile(db, file, tmpDir, makeConfig())
    expect(mockEmbed.mock.calls.length).toBe(callsAfterFirst)
  })

  it('replaces chunks when file content changes', async () => {
    const file = writeFile('src/change.ts', 'const a = 1')
    await indexFile(db, file, tmpDir, makeConfig())
    const firstHash = getFileHash(db, 'src/change.ts')

    fs.writeFileSync(file, 'const a = 2', 'utf-8')
    await indexFile(db, file, tmpDir, makeConfig())
    const secondHash = getFileHash(db, 'src/change.ts')

    expect(secondHash).not.toBe(firstHash)
    const chunks = getAllChunks(db)
    expect(chunks.every(c => c.content.includes('const a = 2'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// removeFile
// ---------------------------------------------------------------------------

describe('removeFile', () => {
  it('deletes chunks and file hash for the given file', async () => {
    const file = writeFile('src/remove-me.ts', 'function bye() {}')
    await indexFile(db, file, tmpDir, makeConfig())

    await removeFile(db, file, tmpDir)

    expect(getAllChunks(db)).toHaveLength(0)
    expect(getFileHash(db, 'src/remove-me.ts')).toBeNull()
  })

  it('does not throw when file was never indexed', async () => {
    const file = writeFile('src/never-indexed.ts', 'const x = 1')
    await expect(removeFile(db, file, tmpDir)).resolves.not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// indexProject
// ---------------------------------------------------------------------------

describe('indexProject', () => {
  it('indexes matching files and returns correct counts', async () => {
    writeFile('src/a.ts', 'function a() {}')
    writeFile('src/b.ts', 'function b() {}')

    const result = await indexProject(db, makeConfig({ extensions: ['ts', 'js'] }))

    expect(result.indexed).toBe(2)
    expect(result.skipped).toBe(0)
    expect(result.failed).toBe(0)
  })

  it('skips files already indexed with unchanged content on second run', async () => {
    writeFile('src/stable.ts', 'const x = 1')
    await indexProject(db, makeConfig({ extensions: ['ts', 'js'] }))

    const second = await indexProject(db, makeConfig({ extensions: ['ts', 'js'] }))
    expect(second.skipped).toBe(1)
    expect(second.indexed).toBe(0)
  })

  it('respects the ignore option', async () => {
    writeFile('src/app.ts', 'const app = 1')
    writeFile('fixtures/test.ts', 'const test = 1')

    const result = await indexProject(db, makeConfig({
      extensions: ['ts', 'js'],
      ignore: ['**/fixtures/**'],
    }))

    expect(result.indexed).toBe(1)
    const hashes = getAllFileHashes(db)
    expect(Object.keys(hashes).every(f => !f.includes('fixtures'))).toBe(true)
  })

  it('removes stale file records when a file no longer exists', async () => {
    const file = writeFile('src/gone.ts', 'const gone = true')
    await indexProject(db, makeConfig({ extensions: ['ts', 'js'] }))
    expect(getFileHash(db, 'src/gone.ts')).toBeTruthy()

    fs.unlinkSync(file)
    const result = await indexProject(db, makeConfig({ extensions: ['ts', 'js'] }))
    expect(result.removed).toBe(1)
    expect(getFileHash(db, 'src/gone.ts')).toBeNull()
  })

  it('calls onProgress for each file', async () => {
    writeFile('src/x.ts', 'const x = 1')
    writeFile('src/y.ts', 'const y = 2')

    const calls: [number, number, string][] = []
    await indexProject(db, makeConfig({
      extensions: ['ts', 'js'],
      onProgress: (cur, tot, file) => calls.push([cur, tot, file]),
    }))

    expect(calls).toHaveLength(2)
    expect(calls[0][0]).toBe(1)
    expect(calls[1][0]).toBe(2)
  })
})
