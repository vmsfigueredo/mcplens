// src/indexer/embeddings.ts
// Abstraction over embedding providers.
// Default: Ollama (local, free). Optional: OpenAI.

export interface EmbeddingsConfig {
  provider: 'ollama' | 'openai'
  ollamaUrl?: string       // default: http://localhost:11434
  ollamaModel?: string     // default: nomic-embed-text
  openaiApiKey?: string
  openaiModel?: string     // default: text-embedding-3-small
}

const EMBED_TIMEOUT_MS    = 30_000
const EMBED_MAX_RETRIES   = 3
const EMBED_BASE_DELAY_MS = 500
const EMBED_MAX_DELAY_MS  = 8_000
const RETRYABLE_STATUS    = new Set([408, 425, 429, 500, 502, 503, 504, 522, 524])
const RETRYABLE_NET_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'UND_ERR_SOCKET'])

async function fetchWithRetry(url: string, init: RequestInit, label: string): Promise<Response> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= EMBED_MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(EMBED_TIMEOUT_MS) })
      if (res.ok) return res

      if (RETRYABLE_STATUS.has(res.status) && attempt < EMBED_MAX_RETRIES) {
        await res.text().catch(() => '')
        lastErr = new Error(`${label}: HTTP ${res.status} ${res.statusText}`)
      } else {
        const body = await res.text().catch(() => '')
        throw new Error(`${label}: HTTP ${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 200)}` : ''}`)
      }
    } catch (err) {
      if (err instanceof Error && (
        err.name === 'AbortError' ||
        err.name === 'TimeoutError' ||
        RETRYABLE_NET_CODES.has((err as NodeJS.ErrnoException).code ?? '') ||
        RETRYABLE_NET_CODES.has((err.cause as NodeJS.ErrnoException)?.code ?? '')
      )) {
        lastErr = err
        if (attempt >= EMBED_MAX_RETRIES) break
      } else {
        throw err
      }
    }

    const delay = Math.min(EMBED_MAX_DELAY_MS, EMBED_BASE_DELAY_MS * 2 ** attempt) + Math.random() * 250
    await new Promise(r => setTimeout(r, delay))
  }
  throw lastErr
}

export async function getEmbedding(
  text: string,
  config: EmbeddingsConfig
): Promise<number[]> {
  if (config.provider === 'openai') {
    return getOpenAIEmbedding(text, config)
  }
  return getOllamaEmbedding(text, config)
}

async function getOllamaEmbedding(
  text: string,
  config: EmbeddingsConfig
): Promise<number[]> {
  const url = config.ollamaUrl ?? 'http://localhost:11434'
  const model = config.ollamaModel ?? 'nomic-embed-text:latest'

  let res: Response
  try {
    res = await fetchWithRetry(`${url}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: text }),
    }, 'Ollama embeddings')
  } catch (err) {
    throw new Error(
      `Ollama embeddings failed after ${EMBED_MAX_RETRIES + 1} attempts: ${err instanceof Error ? err.message : err}\n` +
      `Make sure Ollama is running: ollama serve\n` +
      `And the model is pulled: ollama pull ${model}`
    )
  }

  const data = await res.json() as { embedding: number[] }
  return data.embedding
}

async function getOpenAIEmbedding(
  text: string,
  config: EmbeddingsConfig
): Promise<number[]> {
  if (!config.openaiApiKey) throw new Error('openaiApiKey is required')
  const model = config.openaiModel ?? 'text-embedding-3-small'

  const res = await fetchWithRetry('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.openaiApiKey}`,
    },
    body: JSON.stringify({ model, input: text }),
  }, 'OpenAI embeddings')

  const data = await res.json() as { data: [{ embedding: number[] }] }
  return data.data[0].embedding
}

// Cosine similarity between two vectors
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}
