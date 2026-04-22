import { describe, it, expect } from 'vitest'
import { chunkBySlidingWindow, chunkFile } from './chunker.js'

// ---------------------------------------------------------------------------
// chunkBySlidingWindow
// ---------------------------------------------------------------------------

describe('chunkBySlidingWindow', () => {
  it('returns empty array for empty content', () => {
    expect(chunkBySlidingWindow('')).toEqual([])
  })

  it('returns a single chunk when content fits within chunkLines', () => {
    const content = 'line1\nline2\nline3'
    const chunks = chunkBySlidingWindow(content, { chunkLines: 10, overlapLines: 2, minChunkChars: 5 })
    expect(chunks).toHaveLength(1)
    expect(chunks[0].startLine).toBe(1)
    expect(chunks[0].endLine).toBe(3)
  })

  it('produces overlapping chunks with correct line numbers', () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line${i + 1}`)
    const content = lines.join('\n')
    const chunks = chunkBySlidingWindow(content, { chunkLines: 10, overlapLines: 3 })

    // step = 10 - 3 = 7
    // chunk 0: lines 1-10, chunk 1: lines 8-17, chunk 2: lines 15-20
    expect(chunks[0].startLine).toBe(1)
    expect(chunks[0].endLine).toBe(10)
    expect(chunks[1].startLine).toBe(8)
    expect(chunks[1].endLine).toBe(17)
  })

  it('endLine is clamped to actual file length', () => {
    const lines = Array.from({ length: 12 }, (_, i) => `l${i}`)
    const content = lines.join('\n')
    const chunks = chunkBySlidingWindow(content, { chunkLines: 10, overlapLines: 2 })
    const last = chunks[chunks.length - 1]
    expect(last.endLine).toBeLessThanOrEqual(12)
  })

  it('skips chunks below minChunkChars', () => {
    // Two very short "lines" that together are tiny
    const content = 'a\nb'
    const chunks = chunkBySlidingWindow(content, { minChunkChars: 100 })
    expect(chunks).toHaveLength(0)
  })

  it('uses 1-indexed startLine', () => {
    const content = 'first\nsecond\nthird'
    const chunks = chunkBySlidingWindow(content, { minChunkChars: 5 })
    expect(chunks[0].startLine).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// chunkFile
// ---------------------------------------------------------------------------

describe('chunkFile', () => {
  it('uses sliding window for non-AST extensions', () => {
    const content = Array.from({ length: 5 }, (_, i) => `line ${i}`).join('\n')
    const chunks = chunkFile(content, 'README.md')
    expect(chunks.length).toBeGreaterThan(0)
    // All chunks from sliding window have integer line numbers
    for (const c of chunks) {
      expect(typeof c.startLine).toBe('number')
    }
  })

  it('produces chunks for a TypeScript file via AST path', () => {
    const content = `
function foo() {
  return 1
}

function bar() {
  return 2
}
`.trim()
    const chunks = chunkFile(content, 'example.ts')
    expect(chunks.length).toBeGreaterThanOrEqual(1)
  })
})
