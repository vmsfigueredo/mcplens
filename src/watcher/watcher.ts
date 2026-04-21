// src/watcher/watcher.ts
// Watches the project for file changes and triggers incremental re-indexing.

import chokidar from 'chokidar'
import path from 'path'
import Database from 'better-sqlite3'
import { indexFile, removeFile, IndexerConfig } from '../indexer/indexer.js'
import { ActivityEvent } from '../dashboard/dashboard.js'

const DEBOUNCE_MS = 300

export interface WatcherConfig extends IndexerConfig {
  onActivity?: (event: ActivityEvent) => void
}

export function startWatcher(
  db: Database.Database,
  config: WatcherConfig
): () => void {
  const timers = new Map<string, NodeJS.Timeout>()

  const watcher = chokidar.watch(config.projectRoot, {
    ignored: [
      '**/node_modules/**',
      '**/.git/**',
      '**/vendor/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/.claude-context/**',
      '**/.idea/**',
      '**/.vscode/**',
      '**/*.iml',
    ],
    ignoreInitial: true,
    persistent: true,
  })

  const handleChange = (filepath: string) => {
    // Debounce rapid saves (e.g. formatters)
    if (timers.has(filepath)) clearTimeout(timers.get(filepath)!)

    const timer = setTimeout(async () => {
      timers.delete(filepath)
      try {
        await indexFile(db, filepath, config.projectRoot, config)
        const rel = path.relative(config.projectRoot, filepath)
        process.stderr.write(`[cco] re-indexed: ${rel}\n`)
        config.onActivity?.({ ts: Date.now(), type: 'indexed', file: rel })
      } catch (err) {
        process.stderr.write(`[cco] error indexing ${filepath}: ${err}\n`)
      }
    }, DEBOUNCE_MS)

    timers.set(filepath, timer)
  }

  const handleRemove = async (filepath: string) => {
    await removeFile(db, filepath, config.projectRoot)
    const rel = path.relative(config.projectRoot, filepath)
    process.stderr.write(`[cco] removed from index: ${rel}\n`)
    config.onActivity?.({ ts: Date.now(), type: 'removed', file: rel })
  }

  watcher.on('change', handleChange)
  watcher.on('add', handleChange)
  watcher.on('unlink', handleRemove)

  return () => {
    watcher.close()
    for (const timer of timers.values()) clearTimeout(timer)
  }
}
