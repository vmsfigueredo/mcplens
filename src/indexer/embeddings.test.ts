import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cosineSimilarity, getEmbedding } from './embeddings.js'
import type { EmbeddingsConfig } from './embeddings.js'

// ---------------------------------------------------------------------------
// cosineSimilarity
// ---------------------------------------------------------------------------

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const v = [1, 2, 3]
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 10)
  })

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 10)
  })

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 10)
  })

  it('handles arbitrary length vectors', () => {
    const a = [0.1, 0.2, 0.3, 0.4, 0.5]
    const b = [0.5, 0.4, 0.3, 0.2, 0.1]
    const result = cosineSimilarity(a, b)
    expect(result).toBeGreaterThan(-1)
    expect(result).toBeLessThan(1)
  })
})

// ---------------------------------------------------------------------------
// getEmbedding — Ollama path
// ---------------------------------------------------------------------------

const ollamaConfig: EmbeddingsConfig = {
  provider: 'ollama',
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'nomic-embed-text',
}

const openaiConfig: EmbeddingsConfig = {
  provider: 'openai',
  openaiApiKey: 'sk-test',
  openaiModel: 'text-embedding-3-small',
}

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 })
}

function statusResponse(status: number): Response {
  return new Response('error', { status })
}

describe('getEmbedding — Ollama', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('returns the embedding array on success', async () => {
    const embedding = [0.1, 0.2, 0.3]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse({ embedding })))

    const promise = getEmbedding('hello', ollamaConfig)
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result).toEqual(embedding)
  })

  it('calls the correct Ollama endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue(okResponse({ embedding: [1] }))
    vi.stubGlobal('fetch', mockFetch)

    const promise = getEmbedding('test', ollamaConfig)
    await vi.runAllTimersAsync()
    await promise

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:11434/api/embeddings',
      expect.objectContaining({ method: 'POST' })
    )
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.model).toBe('nomic-embed-text')
    expect(body.prompt).toBe('test')
  })

  it('retries on 503 and resolves on eventual success', async () => {
    const embedding = [0.9]
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(statusResponse(503))
      .mockResolvedValueOnce(statusResponse(503))
      .mockResolvedValue(okResponse({ embedding }))
    vi.stubGlobal('fetch', mockFetch)

    const promise = getEmbedding('retry test', ollamaConfig)
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result).toEqual(embedding)
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it('throws after exhausting all retries', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(statusResponse(503)))

    await expect(
      Promise.all([getEmbedding('fail', ollamaConfig), vi.runAllTimersAsync()])
    ).rejects.toThrow(/Ollama embeddings failed/)
  })

  it('throws immediately on non-retryable 400', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(statusResponse(400)))

    await expect(
      Promise.all([getEmbedding('bad request', ollamaConfig), vi.runAllTimersAsync()])
    ).rejects.toThrow(/400/)
  })
})

// ---------------------------------------------------------------------------
// getEmbedding — OpenAI path
// ---------------------------------------------------------------------------

describe('getEmbedding — OpenAI', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('throws when openaiApiKey is missing', async () => {
    const cfg: EmbeddingsConfig = { provider: 'openai' }
    vi.stubGlobal('fetch', vi.fn())

    await expect(getEmbedding('test', cfg)).rejects.toThrow(/openaiApiKey/)
  })

  it('sends Authorization header and returns embedding', async () => {
    const embedding = [0.5, 0.6]
    const mockFetch = vi.fn().mockResolvedValue(okResponse({ data: [{ embedding }] }))
    vi.stubGlobal('fetch', mockFetch)

    const promise = getEmbedding('openai test', openaiConfig)
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result).toEqual(embedding)
    const [, init] = mockFetch.mock.calls[0]
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer sk-test')
  })
})
