import { describe, it, expect } from 'vitest'
import { buildBM25Index, scoreBM25, BM25Cache } from './bm25.js'

const corpus = [
  { id: 'a', content: 'function foo handles authentication logic' },
  { id: 'b', content: 'class UserService manages user accounts and authentication' },
  { id: 'c', content: 'const PI = 3.14' },
]

// ---------------------------------------------------------------------------
// buildBM25Index
// ---------------------------------------------------------------------------

describe('buildBM25Index', () => {
  it('sets totalDocs correctly', () => {
    const index = buildBM25Index(corpus)
    expect(index.totalDocs).toBe(3)
  })

  it('computes avgDocLength', () => {
    const index = buildBM25Index(corpus)
    expect(index.avgDocLength).toBeGreaterThan(0)
  })

  it('accumulates docFreq for shared terms', () => {
    const index = buildBM25Index(corpus)
    // "authentication" appears in docs a and b
    expect(index.docFreq.get('authentication')).toBe(2)
  })

  it('records correct term frequency per doc', () => {
    const index = buildBM25Index([
      { id: 'x', content: 'foo foo bar' },
    ])
    const doc = index.docs.find(d => d.id === 'x')!
    expect(doc.termFreq.get('foo')).toBe(2)
    expect(doc.termFreq.get('bar')).toBe(1)
  })

  it('handles empty corpus', () => {
    const index = buildBM25Index([])
    expect(index.totalDocs).toBe(0)
    expect(index.docs).toHaveLength(0)
  })

  it('accepts custom k1 and b params', () => {
    const index = buildBM25Index(corpus, { k1: 2.0, b: 0.5 })
    expect(index.k1).toBe(2.0)
    expect(index.b).toBe(0.5)
  })
})

// ---------------------------------------------------------------------------
// scoreBM25
// ---------------------------------------------------------------------------

describe('scoreBM25', () => {
  it('returns empty map when query has no matching terms', () => {
    const index = buildBM25Index(corpus)
    const scores = scoreBM25('xyz_nonexistent_term', index)
    expect(scores.size).toBe(0)
  })

  it('returns empty map for empty query', () => {
    const index = buildBM25Index(corpus)
    expect(scoreBM25('', index).size).toBe(0)
  })

  it('returns empty map for empty index', () => {
    const index = buildBM25Index([])
    expect(scoreBM25('foo', index).size).toBe(0)
  })

  it('doc with exact term outranks doc without it', () => {
    const index = buildBM25Index(corpus)
    const scores = scoreBM25('authentication', index)
    // docs a and b contain "authentication", doc c does not
    expect(scores.has('c')).toBe(false)
    expect(scores.has('a')).toBe(true)
    expect(scores.has('b')).toBe(true)
  })

  it('top result is normalized to 1.0', () => {
    const index = buildBM25Index(corpus)
    const scores = scoreBM25('function', index)
    const max = Math.max(...scores.values())
    expect(max).toBeCloseTo(1.0)
  })

  it('all scores are between 0 and 1 (inclusive)', () => {
    const index = buildBM25Index(corpus)
    const scores = scoreBM25('authentication user', index)
    for (const score of scores.values()) {
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(1)
    }
  })

  it('length normalization: short doc with term outranks long doc with same tf', () => {
    const short = { id: 'short', content: 'authentication' }           // 1 token
    const long = {
      id: 'long',
      content: Array(50).fill('word').join(' ') + ' authentication',   // 51 tokens
    }
    const index = buildBM25Index([short, long])
    const scores = scoreBM25('authentication', index)
    const shortScore = scores.get('short') ?? 0
    const longScore = scores.get('long') ?? 0
    expect(shortScore).toBeGreaterThan(longScore)
  })

  it('tokenizer is case-insensitive', () => {
    const index = buildBM25Index([{ id: 'a', content: 'Foo Bar' }])
    const scores = scoreBM25('foo', index)
    expect(scores.has('a')).toBe(true)
  })

  it('tokenizer splits on punctuation', () => {
    // "Foo.bar" should tokenize as ["foo", "bar"]
    const index = buildBM25Index([{ id: 'a', content: 'Foo.bar' }])
    const scores = scoreBM25('bar', index)
    expect(scores.has('a')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// BM25Cache
// ---------------------------------------------------------------------------

describe('BM25Cache', () => {
  it('starts empty', () => {
    const cache = new BM25Cache()
    expect(cache.has()).toBe(false)
    expect(cache.get()).toBeNull()
  })

  it('set then get round-trips the index', () => {
    const cache = new BM25Cache()
    const index = buildBM25Index(corpus)
    cache.set(index)
    expect(cache.has()).toBe(true)
    expect(cache.get()).toBe(index)
  })

  it('invalidate clears the index', () => {
    const cache = new BM25Cache()
    cache.set(buildBM25Index(corpus))
    cache.invalidate()
    expect(cache.has()).toBe(false)
    expect(cache.get()).toBeNull()
  })
})
