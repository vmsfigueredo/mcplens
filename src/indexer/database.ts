// src/indexer/database.ts
// SQLite-based vector store using better-sqlite3.
// Stores chunks + embeddings as JSON blobs (no extra native deps).
// For larger projects, swap to sqlite-vec or lancedb later.

import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

export interface ChunkRow {
  id: string
  filepath: string
  startLine: number
  endLine: number
  content: string
  embedding: number[]
  updatedAt: number
}

export function openDatabase(projectRoot: string): Database.Database {
  const dir = path.join(projectRoot, '.claude-context')
  fs.mkdirSync(dir, { recursive: true })

  const db = new Database(path.join(dir, 'index.db'))
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      id          TEXT PRIMARY KEY,
      filepath    TEXT NOT NULL,
      start_line  INTEGER NOT NULL,
      end_line    INTEGER NOT NULL,
      content     TEXT NOT NULL,
      embedding   TEXT NOT NULL,   -- JSON array of floats
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

export function upsertChunks(db: Database.Database, rows: ChunkRow[]): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO chunks (id, filepath, start_line, end_line, content, embedding, updated_at)
    VALUES (@id, @filepath, @startLine, @endLine, @content, @embedding, @updatedAt)
  `)

  const insertMany = db.transaction((items: ChunkRow[]) => {
    for (const row of items) {
      stmt.run({ ...row, embedding: JSON.stringify(row.embedding) })
    }
  })

  insertMany(rows)
}

export function deleteChunksByFile(db: Database.Database, filepath: string): void {
  db.prepare('DELETE FROM chunks WHERE filepath = ?').run(filepath)
}

export function getAllChunks(db: Database.Database): ChunkRow[] {
  const rows = db.prepare('SELECT * FROM chunks').all() as any[]
  return rows.map(r => ({
    ...r,
    startLine: r.start_line,
    endLine: r.end_line,
    updatedAt: r.updated_at,
    embedding: JSON.parse(r.embedding),
  }))
}

export function getFileHash(db: Database.Database, filepath: string): string | null {
  const row = db.prepare('SELECT hash FROM file_hashes WHERE filepath = ?').get(filepath) as any
  return row?.hash ?? null
}

export function setFileHash(db: Database.Database, filepath: string, hash: string): void {
  db.prepare(`
    INSERT OR REPLACE INTO file_hashes (filepath, hash, indexed_at)
    VALUES (?, ?, ?)
  `).run(filepath, hash, Date.now())
}

export function deleteFileHash(db: Database.Database, filepath: string): void {
  db.prepare('DELETE FROM file_hashes WHERE filepath = ?').run(filepath)
}

export function getAllFileHashes(db: Database.Database): Record<string, string> {
  const rows = db.prepare('SELECT filepath, hash FROM file_hashes').all() as any[]
  return Object.fromEntries(rows.map(r => [r.filepath, r.hash]))
}
