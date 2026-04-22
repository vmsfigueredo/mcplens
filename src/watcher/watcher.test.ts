import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import fs from 'fs'
import os from 'os'
import path from 'path'

// ---------------------------------------------------------------------------
// Mock chokidar before importing watcher
// ---------------------------------------------------------------------------

const watcherEmitter = new EventEmitter()
const chokidarCloseSpy = vi.fn()

vi.mock('chokidar', () => ({
  default: {
    watch: vi.fn(() => ({
      on: (event: string, handler: (...args: unknown[]) => void) => {
        watcherEmitter.on(event, handler)
        return { on: vi.fn(), close: chokidarCloseSpy }
      },
      close: chokidarCloseSpy,
    })),
  },
}))

vi.mock('../indexer/indexer.js', () => ({
  indexFile: vi.fn().mockResolvedValue(undefined),
  removeFile: vi.fn().mockResolvedValue(undefined),
}))

// Dashboard ActivityEvent type is just { ts, type, file } — the import in
// watcher.ts only uses it as a type, so the module itself doesn't need to resolve
// at runtime in this test. We stub it via moduleNameMapper or a light mock.
vi.mock('../dashboard/index.js', () => ({}))

import { startWatcher } from './watcher.js'
import { indexFile, removeFile } from '../indexer/indexer.js'
import { openDatabase } from '../indexer/database.js'
import type Database from 'better-sqlite3'
import type { WatcherConfig } from './watcher.js'

const DEBOUNCE_MS = 300

let tmpDir: string
let db: Database.Database

function makeConfig(overrides: Partial<WatcherConfig> = {}): WatcherConfig {
  return {
    projectRoot: tmpDir,
    embeddings: { provider: 'ollama' },
    ...overrides,
  }
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcplens-watcher-'))
  db = openDatabase(tmpDir)
  watcherEmitter.removeAllListeners()
  vi.mocked(indexFile).mockClear()
  vi.mocked(removeFile).mockClear()
  chokidarCloseSpy.mockClear()
  vi.useFakeTimers()
})

afterEach(() => {
  db.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('startWatcher', () => {
  it('calls indexFile when a "change" event fires after debounce', async () => {
    startWatcher(db, makeConfig())

    const filepath = path.join(tmpDir, 'src/foo.ts')
    watcherEmitter.emit('change', filepath)
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 10)

    expect(vi.mocked(indexFile)).toHaveBeenCalledWith(db, filepath, tmpDir, expect.any(Object))
  })

  it('calls indexFile when an "add" event fires after debounce', async () => {
    startWatcher(db, makeConfig())

    const filepath = path.join(tmpDir, 'src/new.ts')
    watcherEmitter.emit('add', filepath)
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 10)

    expect(vi.mocked(indexFile)).toHaveBeenCalledWith(db, filepath, tmpDir, expect.any(Object))
  })

  it('calls removeFile when an "unlink" event fires', async () => {
    startWatcher(db, makeConfig())

    const filepath = path.join(tmpDir, 'src/old.ts')
    watcherEmitter.emit('unlink', filepath)
    await vi.advanceTimersByTimeAsync(10)

    expect(vi.mocked(removeFile)).toHaveBeenCalledWith(db, filepath, tmpDir)
  })

  it('debounces rapid change events, calling indexFile only once', async () => {
    startWatcher(db, makeConfig())

    const filepath = path.join(tmpDir, 'src/rapid.ts')
    watcherEmitter.emit('change', filepath)
    watcherEmitter.emit('change', filepath)
    watcherEmitter.emit('change', filepath)
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 10)

    expect(vi.mocked(indexFile)).toHaveBeenCalledTimes(1)
  })

  it('invokes onActivity after a change is indexed', async () => {
    const onActivity = vi.fn()
    startWatcher(db, makeConfig({ onActivity }))

    const filepath = path.join(tmpDir, 'src/foo.ts')
    watcherEmitter.emit('change', filepath)
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 10)

    expect(onActivity).toHaveBeenCalledWith(expect.objectContaining({ type: 'indexed' }))
  })

  it('invokes onActivity after a file is removed', async () => {
    const onActivity = vi.fn()
    startWatcher(db, makeConfig({ onActivity }))

    const filepath = path.join(tmpDir, 'src/bye.ts')
    watcherEmitter.emit('unlink', filepath)
    await vi.advanceTimersByTimeAsync(10)

    expect(onActivity).toHaveBeenCalledWith(expect.objectContaining({ type: 'removed' }))
  })

  it('returns a cleanup function that clears pending timers', async () => {
    const stop = startWatcher(db, makeConfig())

    const filepath = path.join(tmpDir, 'src/pending.ts')
    watcherEmitter.emit('change', filepath)
    stop()
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 10)

    // indexFile should not have been called since timer was cleared
    expect(vi.mocked(indexFile)).not.toHaveBeenCalled()
  })

  it('invokes onIndexChanged after a file change is indexed', async () => {
    const onIndexChanged = vi.fn()
    startWatcher(db, makeConfig({ onIndexChanged }))

    const filepath = path.join(tmpDir, 'src/foo.ts')
    watcherEmitter.emit('change', filepath)
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 10)

    expect(onIndexChanged).toHaveBeenCalledTimes(1)
  })

  it('invokes onIndexChanged after a file is removed', async () => {
    const onIndexChanged = vi.fn()
    startWatcher(db, makeConfig({ onIndexChanged }))

    const filepath = path.join(tmpDir, 'src/gone.ts')
    watcherEmitter.emit('unlink', filepath)
    await vi.advanceTimersByTimeAsync(10)

    expect(onIndexChanged).toHaveBeenCalledTimes(1)
  })

  it('invokes onIndexChanged after an add event', async () => {
    const onIndexChanged = vi.fn()
    startWatcher(db, makeConfig({ onIndexChanged }))

    const filepath = path.join(tmpDir, 'src/newfile.ts')
    watcherEmitter.emit('add', filepath)
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 10)

    expect(onIndexChanged).toHaveBeenCalledTimes(1)
  })
})
