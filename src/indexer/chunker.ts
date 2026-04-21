import { chunkByAST, detectLanguage } from './ast-chunker.js'

export interface Chunk {
  content: string
  startLine: number
  endLine: number
}

export interface ChunkerConfig {
  chunkLines?: number    // lines per chunk (default: 60)
  overlapLines?: number  // overlap between chunks (default: 15)
  minChunkChars?: number // skip chunks smaller than this (default: 20)
}

export function chunkBySlidingWindow(content: string, config: ChunkerConfig = {}): Chunk[] {
  const chunkLines = config.chunkLines ?? 60
  const overlapLines = config.overlapLines ?? 15
  const minChunkChars = config.minChunkChars ?? 20

  const lines = content.split('\n')
  const chunks: Chunk[] = []
  const step = chunkLines - overlapLines

  for (let start = 0; start < lines.length; start += step) {
    const end = Math.min(start + chunkLines, lines.length)
    const chunkContent = lines.slice(start, end).join('\n').trim()

    if (chunkContent.length >= minChunkChars) {
      chunks.push({
        content: chunkContent,
        startLine: start + 1,  // 1-indexed
        endLine: end,
      })
    }

    if (end >= lines.length) break
  }

  return chunks
}

export function chunkFile(
  content: string,
  filepath: string,
  config: ChunkerConfig = {}
): Chunk[] {
  if (detectLanguage(filepath)) {
    return chunkByAST(content, filepath, config)
  }
  return chunkBySlidingWindow(content, config)
}
