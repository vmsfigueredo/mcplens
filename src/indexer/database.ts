import { DatabaseSync } from 'node:sqlite'
import path from 'path'
import fs from 'fs'

export type Db = DatabaseSync

export interface ChunkRow {
  id: string
  filepath: string
  startLine: number
  endLine: number
  content: string
  embedding: number[]
  updatedAt: number
}

export function openDatabase(projectRoot: string): Db {
  const dir = path.join(projectRoot, '.mcplens')
  fs.mkdirSync(dir, { recursive: true })

  const db = new DatabaseSync(path.join(dir, 'index.db'))
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA synchronous = NORMAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      id          TEXT PRIMARY KEY,
      filepath    TEXT NOT NULL,
      start_line  INTEGER NOT NULL,
      end_line    INTEGER NOT NULL,
      content     TEXT NOT NULL,
      embedding   TEXT NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chunks_filepath ON chunks(filepath);

    CREATE TABLE IF NOT EXISTS file_hashes (
      filepath    TEXT PRIMARY KEY,
      hash        TEXT NOT NULL,
      indexed_at  INTEGER NOT NULL
    );

  `)

  return db
}

export function upsertChunks(db: Db, rows: ChunkRow[]): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO chunks (id, filepath, start_line, end_line, content, embedding, updated_at)
    VALUES (@id, @filepath, @startLine, @endLine, @content, @embedding, @updatedAt)
  `)

  db.exec('BEGIN')
  try {
    for (const row of rows) {
      stmt.run({ ...row, embedding: JSON.stringify(row.embedding) })
    }
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

export function deleteChunksByFile(db: Db, filepath: string): void {
  db.prepare('DELETE FROM chunks WHERE filepath = ?').run(filepath)
}

export function getAllChunks(db: Db): ChunkRow[] {
  const rows = db.prepare('SELECT * FROM chunks').all() as any[]
  return rows.map(r => ({
    ...r,
    startLine: r.start_line,
    endLine: r.end_line,
    updatedAt: r.updated_at,
    embedding: JSON.parse(r.embedding),
  }))
}

export function getFileHash(db: Db, filepath: string): string | null {
  const row = db.prepare('SELECT hash FROM file_hashes WHERE filepath = ?').get(filepath) as any
  return row?.hash ?? null
}

export function setFileHash(db: Db, filepath: string, hash: string): void {
  db.prepare(`
    INSERT OR REPLACE INTO file_hashes (filepath, hash, indexed_at)
    VALUES (?, ?, ?)
  `).run(filepath, hash, Date.now())
}

export function deleteFileHash(db: Db, filepath: string): void {
  db.prepare('DELETE FROM file_hashes WHERE filepath = ?').run(filepath)
}

export function getAllFileHashes(db: Db): Record<string, string> {
  const rows = db.prepare('SELECT filepath, hash FROM file_hashes').all() as any[]
  return Object.fromEntries(rows.map(r => [r.filepath, r.hash]))
}

