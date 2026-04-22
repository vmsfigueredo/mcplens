import type { Db } from '../indexer/database.js'
import { readLockfile } from '../utils/lockfile.js'

let _indexingInProgress = false

export function getIndexingState(): boolean {
  return _indexingInProgress
}

export function setIndexingState(value: boolean): void {
  _indexingInProgress = value
}

export function getStats(db: Db, projectRoot?: string, indexing?: boolean) {
  const files = (db.prepare('SELECT COUNT(DISTINCT filepath) as c FROM chunks').get() as any).c as number
  const chunks = (db.prepare('SELECT COUNT(*) as c FROM chunks').get() as any).c as number
  const pageCount = (db.prepare('PRAGMA page_count').get() as any).page_count as number
  const pageSize = (db.prepare('PRAGMA page_size').get() as any).page_size as number
  const dbSize = pageCount * pageSize
  const lastIndexed = (db.prepare('SELECT MAX(indexed_at) as t FROM file_hashes').get() as any).t as number | null
  const sessions = projectRoot ? (readLockfile(projectRoot)?.sessions ?? 1) : 1
  return { files, chunks, dbSize, lastIndexed, indexing: indexing ?? false, sessions }
}

export function getFiles(db: Db) {
  return db.prepare(`
    SELECT f.filepath, f.indexed_at, COUNT(c.id) as chunk_count
    FROM file_hashes f
    LEFT JOIN chunks c ON c.filepath = f.filepath
    GROUP BY f.filepath
    ORDER BY f.indexed_at DESC
  `).all() as { filepath: string; indexed_at: number; chunk_count: number }[]
}

export function getChunksByFile(db: Db, filepath: string) {
  return db.prepare(
    'SELECT id, start_line, end_line, content FROM chunks WHERE filepath = ? ORDER BY start_line ASC'
  ).all(filepath) as { id: string; start_line: number; end_line: number; content: string }[]
}
