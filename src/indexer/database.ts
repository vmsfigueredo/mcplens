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

    CREATE TABLE IF NOT EXISTS dependencies (
      from_file   TEXT NOT NULL,
      to_file     TEXT NOT NULL,
      PRIMARY KEY (from_file, to_file)
    );

    CREATE INDEX IF NOT EXISTS idx_dep_from ON dependencies(from_file);
    CREATE INDEX IF NOT EXISTS idx_dep_to   ON dependencies(to_file);
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

export function upsertDependencies(db: Db, fromFile: string, toFiles: string[]): void {
  db.prepare('DELETE FROM dependencies WHERE from_file = ?').run(fromFile)
  if (toFiles.length === 0) return
  const stmt = db.prepare('INSERT OR IGNORE INTO dependencies (from_file, to_file) VALUES (?, ?)')
  db.exec('BEGIN')
  try {
    for (const toFile of toFiles) stmt.run(fromFile, toFile)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

export function deleteDependencies(db: Db, filepath: string): void {
  db.prepare('DELETE FROM dependencies WHERE from_file = ?').run(filepath)
}

export function getDependsOn(db: Db, filepath: string): string[] {
  const rows = db.prepare('SELECT to_file FROM dependencies WHERE from_file = ?').all(filepath) as any[]
  return rows.map(r => r.to_file)
}

export function getUsedBy(db: Db, filepath: string): string[] {
  const rows = db.prepare('SELECT from_file FROM dependencies WHERE to_file = ?').all(filepath) as any[]
  return rows.map(r => r.from_file)
}

export function dependenciesTableEmpty(db: Db): boolean {
  const row = db.prepare('SELECT COUNT(*) as c FROM dependencies').get() as any
  return row.c === 0
}
