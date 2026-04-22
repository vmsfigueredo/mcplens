import { describe, it, expect } from 'vitest'
import { detectLanguage, chunkByAST } from './ast-chunker.js'

// ---------------------------------------------------------------------------
// detectLanguage
// ---------------------------------------------------------------------------

describe('detectLanguage', () => {
  const supported: Array<[string, string]> = [
    ['/project/src/foo.ts', 'typescript'],
    ['/project/src/foo.tsx', 'tsx'],
    ['/project/src/foo.js', 'javascript'],
    ['/project/src/foo.jsx', 'javascript'],
    ['/project/src/foo.mjs', 'javascript'],
    ['/project/src/foo.cjs', 'javascript'],
    ['/project/src/Foo.php', 'php'],
    ['/project/src/foo.blade.php', 'php'],
    ['/project/src/script.py', 'python'],
  ]

  for (const [filepath, expected] of supported) {
    it(`returns '${expected}' for ${filepath}`, () => {
      expect(detectLanguage(filepath)).toBe(expected)
    })
  }

  const unsupported = [
    '/project/src/index.svelte',
    '/project/src/main.go',
    '/project/src/lib.rs',
    '/project/README.md',
    '/project/styles.css',
    '/project/data.json',
    '/project/query.sql',
  ]

  for (const filepath of unsupported) {
    it(`returns null for ${filepath}`, () => {
      expect(detectLanguage(filepath)).toBeNull()
    })
  }
})

// ---------------------------------------------------------------------------
// chunkByAST
// ---------------------------------------------------------------------------

describe('chunkByAST', () => {
  it('returns chunks for a simple TypeScript file with two functions', () => {
    const content = `
function foo() {
  return 1
}

function bar() {
  return 2
}
`.trim()
    const chunks = chunkByAST(content, 'file.ts')
    expect(chunks.length).toBeGreaterThanOrEqual(2)
    const contents = chunks.map(c => c.content)
    expect(contents.some(c => c.includes('foo'))).toBe(true)
    expect(contents.some(c => c.includes('bar'))).toBe(true)
  })

  it('returns chunks sorted by startLine', () => {
    const content = `
function alpha() { return 1 }
function beta() { return 2 }
function gamma() { return 3 }
`.trim()
    const chunks = chunkByAST(content, 'file.ts')
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].startLine).toBeGreaterThanOrEqual(chunks[i - 1].startLine)
    }
  })

  it('falls back to sliding window for unsupported extension', () => {
    const content = Array.from({ length: 5 }, (_, i) => `line ${i}`).join('\n')
    const chunks = chunkByAST(content, 'file.go')
    expect(chunks.length).toBeGreaterThan(0)
  })

  it('captures Python function definitions', () => {
    const content = `
def greet(name):
    return f"hello {name}"

def add(a, b):
    return a + b
`.trim()
    const chunks = chunkByAST(content, 'script.py')
    expect(chunks.length).toBeGreaterThanOrEqual(1)
    const contents = chunks.map(c => c.content)
    expect(contents.some(c => c.includes('def '))).toBe(true)
  })

  it('handles a file with only comments by returning non-empty result', () => {
    const content = `
// This is a comment
// Another comment
// No code here
`.trim()
    // Should not throw; falls back to sliding window
    const chunks = chunkByAST(content, 'comments.ts')
    // sliding window returns one chunk for this short content
    expect(chunks.length).toBeGreaterThanOrEqual(1)
  })

  it('handles an empty file without throwing', () => {
    const chunks = chunkByAST('', 'file.ts')
    expect(Array.isArray(chunks)).toBe(true)
  })
})
