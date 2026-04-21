// src/indexer/indexer.ts
// Orchestrates full indexing and delta re-indexing.

import crypto from 'crypto'
import path from 'path'
import fs from 'fs'
import { glob } from 'glob'
import Database from 'better-sqlite3'
import { chunkFile } from './chunker.js'
import { getEmbedding, EmbeddingsConfig } from './embeddings.js'
import {
  upsertChunks,
  deleteChunksByFile,
  getFileHash,
  setFileHash,
  deleteFileHash,
  getAllFileHashes,
  ChunkRow,
} from './database.js'

// File extensions to index
const DEFAULT_EXTENSIONS = [
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'php', 'blade.php',
  'svelte', 'vue',
  'py', 'rb', 'go', 'rs',
  'css', 'scss',
  'json', 'yaml', 'yml', 'env.example',
  'md', 'mdx',
  'sql',
]

// Directories always ignored
const DEFAULT_IGNORE = [
  '**/node_modules/**',
  '**/.git/**',
  '**/vendor/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/.claude-context/**',
  '**/storage/logs/**',
  '**/bootstrap/cache/**',
]

export interface IndexerConfig {
  projectRoot: string
  extensions?: string[]
  ignore?: string[]
  embeddings: EmbeddingsConfig
  onProgress?: (current: number, total: number, file: string) => void
}

function hashFile(content: string): string {
  return crypto.createHash('sha1').update(content).digest('hex')
}

function chunkId(filepath: string, startLine: number): string {
  return crypto.createHash('md5').update(`${filepath}:${startLine}`).digest('hex')
}

export async function indexFile(
  db: Database.Database,
  filepath: string,
  projectRoot: string,
  config: IndexerConfig
): Promise<void> {
  const content = fs.readFileSync(filepath, 'utf-8')
  const hash = hashFile(content)
  const relPath = path.relative(projectRoot, filepath)

  const existingHash = getFileHash(db, relPath)
  if (existingHash === hash) return // nothing changed

  // Remove old chunks for this file
  deleteChunksByFile(db, relPath)

  // Chunk the file
  const chunks = chunkFile(content, filepath)

  // Generate embeddings for each chunk
  const rows: ChunkRow[] = []
  for (const chunk of chunks) {
    const embedding = await getEmbedding(chunk.content, config.embeddings)
    rows.push({
      id: chunkId(relPath, chunk.startLine),
      filepath: relPath,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      content: chunk.content,
      embedding,
      updatedAt: Date.now(),
    })
  }

  upsertChunks(db, rows)
  setFileHash(db, relPath, hash)
}

export async function removeFile(
  db: Database.Database,
  filepath: string,
  projectRoot: string
): Promise<void> {
  const relPath = path.relative(projectRoot, filepath)
  deleteChunksByFile(db, relPath)
  deleteFileHash(db, relPath)
}

export async function indexProject(
  db: Database.Database,
  config: IndexerConfig
): Promise<{ indexed: number; skipped: number; removed: number }> {
  const extensions = config.extensions ?? DEFAULT_EXTENSIONS
  const ignore = [...DEFAULT_IGNORE, ...(config.ignore ?? [])]

  // Find all indexable files
  const pattern = `**/*.{${extensions.join(',')}}`
  const files = await glob(pattern, {
    cwd: config.projectRoot,
    ignore,
    absolute: true,
    nodir: true,
  })

  // Find files that were removed since last index
  const knownHashes = getAllFileHashes(db)
  const relativeFiles = new Set(files.map(f => path.relative(config.projectRoot, f)))
  let removed = 0
  for (const knownFile of Object.keys(knownHashes)) {
    if (!relativeFiles.has(knownFile)) {
      deleteChunksByFile(db, knownFile)
      deleteFileHash(db, knownFile)
      removed++
    }
  }

  // Index new/changed files
  let indexed = 0
  let skipped = 0
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const relPath = path.relative(config.projectRoot, file)
    config.onProgress?.(i + 1, files.length, relPath)

    const content = fs.readFileSync(file, 'utf-8')
    const hash = hashFile(content)
    const existingHash = getFileHash(db, relPath)

    if (existingHash === hash) {
      skipped++
      continue
    }

    await indexFile(db, file, config.projectRoot, config)
    indexed++
  }

  return { indexed, skipped, removed }
}
