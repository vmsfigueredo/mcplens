import { describe, it, expect, beforeEach } from 'vitest'
import { activityLog, emitActivity, recordSearch, eventHtml } from './events.js'

// Reset shared module state before each test
beforeEach(() => {
  activityLog.splice(0, activityLog.length)
})

// ---------------------------------------------------------------------------
// emitActivity
// ---------------------------------------------------------------------------

describe('emitActivity', () => {
  it('prepends event to activityLog', () => {
    emitActivity({ ts: 1, type: 'startup', file: 'a' })
    emitActivity({ ts: 2, type: 'startup', file: 'b' })
    expect(activityLog[0].ts).toBe(2)
    expect(activityLog[1].ts).toBe(1)
  })

  it('caps log at 200 entries', () => {
    for (let i = 0; i < 205; i++) {
      emitActivity({ ts: i, type: 'indexed', file: `f${i}` })
    }
    expect(activityLog.length).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// recordSearch
// ---------------------------------------------------------------------------

describe('recordSearch', () => {
  it('adds a search event to activityLog', () => {
    recordSearch({ type: 'search', query: 'how does auth work', results: 3, latencyMs: 42, sessionId: 'proj#abc1' })
    expect(activityLog).toHaveLength(1)
    const e = activityLog[0]
    expect(e.type).toBe('search')
    if (e.type === 'search') {
      expect(e.query).toBe('how does auth work')
      expect(e.results).toBe(3)
      expect(e.latencyMs).toBe(42)
      expect(e.sessionId).toBe('proj#abc1')
    }
  })

  it('adds a symbol event to activityLog', () => {
    recordSearch({ type: 'symbol', query: 'PaymentService', results: 1, latencyMs: 5, sessionId: 'host#1b2c' })
    expect(activityLog[0].type).toBe('symbol')
  })

  it('assigns a ts close to Date.now()', () => {
    const before = Date.now()
    recordSearch({ type: 'search', query: 'q', results: 0, latencyMs: 1, sessionId: 'x' })
    const after = Date.now()
    const e = activityLog[0]
    expect(e.ts).toBeGreaterThanOrEqual(before)
    expect(e.ts).toBeLessThanOrEqual(after)
  })

  it('prepends so most recent call is first', () => {
    recordSearch({ type: 'search', query: 'first', results: 0, latencyMs: 1, sessionId: 'x' })
    recordSearch({ type: 'search', query: 'second', results: 0, latencyMs: 1, sessionId: 'x' })
    const e = activityLog[0]
    if (e.type === 'search') expect(e.query).toBe('second')
  })
})

// ---------------------------------------------------------------------------
// eventHtml — search / symbol variants
// ---------------------------------------------------------------------------

describe('eventHtml — search event', () => {
  it('renders query text', () => {
    const e = { ts: Date.now(), type: 'search' as const, query: 'find auth logic', results: 2, latencyMs: 88, sessionId: 'proj#1a2b' }
    const html = eventHtml(e)
    expect(html).toContain('find auth logic')
  })

  it('renders session chip', () => {
    const e = { ts: Date.now(), type: 'search' as const, query: 'q', results: 0, latencyMs: 1, sessionId: 'myproj#zzz9' }
    expect(eventHtml(e)).toContain('myproj#zzz9')
  })

  it('renders result count', () => {
    const e = { ts: Date.now(), type: 'search' as const, query: 'q', results: 5, latencyMs: 10, sessionId: 'x' }
    expect(eventHtml(e)).toContain('5 results')
  })

  it('uses singular "result" when count is 1', () => {
    const e = { ts: Date.now(), type: 'search' as const, query: 'q', results: 1, latencyMs: 10, sessionId: 'x' }
    const html = eventHtml(e)
    expect(html).toContain('1 result')
    expect(html).not.toContain('1 results')
  })

  it('renders latency', () => {
    const e = { ts: Date.now(), type: 'symbol' as const, query: 'Foo', results: 1, latencyMs: 33, sessionId: 'x' }
    expect(eventHtml(e)).toContain('33ms')
  })

  it('HTML-escapes query text', () => {
    const e = { ts: Date.now(), type: 'search' as const, query: '<script>alert(1)</script>', results: 0, latencyMs: 1, sessionId: 'x' }
    const html = eventHtml(e)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

// ---------------------------------------------------------------------------
// eventHtml — file event variants (regression: must still work)
// ---------------------------------------------------------------------------

describe('eventHtml — file events', () => {
  it('renders indexed event with filepath', () => {
    const e = { ts: Date.now(), type: 'indexed' as const, file: 'src/foo.ts', chunks: 4 }
    const html = eventHtml(e)
    expect(html).toContain('src/foo.ts')
    expect(html).toContain('4 chunks')
  })

  it('renders removed event', () => {
    const e = { ts: Date.now(), type: 'removed' as const, file: 'src/bar.ts' }
    expect(eventHtml(e)).toContain('src/bar.ts')
  })

  it('renders startup event', () => {
    const e = { ts: Date.now(), type: 'startup' as const, file: 'indexed=10 skipped=2 removed=0 failed=0' }
    expect(eventHtml(e)).toContain('indexed=10')
  })
})
