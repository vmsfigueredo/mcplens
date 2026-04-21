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

  const res = await fetch(`${url}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt: text }),
  })

  if (!res.ok) {
    throw new Error(
      `Ollama embeddings failed: ${res.status} ${res.statusText}\n` +
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

  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.openaiApiKey}`,
    },
    body: JSON.stringify({ model, input: text }),
  })

  if (!res.ok) throw new Error(`OpenAI embeddings failed: ${res.status}`)
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
