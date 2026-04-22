// src/search/bm25.ts
// Pure-TypeScript BM25 implementation (no external dependencies).
// The index is built in-memory once per server instance, not per query.

const DEFAULT_K1 = 1.5
const DEFAULT_B = 0.75

export interface BM25Index {
  docs: { id: string; termFreq: Map<string, number>; length: number }[]
  docFreq: Map<string, number>
  avgDocLength: number
  totalDocs: number
  k1: number
  b: number
}

function splitCamelCase(token: string): string[] {
  // Split on transitions: lowercase→uppercase or sequence of uppercase→lowercase
  const parts = token.split(/(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/)
  if (parts.length <= 1) return [token.toLowerCase()]
  return [...parts.map(p => p.toLowerCase()), token.toLowerCase()]
}

function tokenize(text: string): string[] {
  const raw = text.split(/[^a-zA-Z0-9_]+/).filter(Boolean)
  const result: string[] = []
  for (const token of raw) {
    for (const t of splitCamelCase(token)) {
      result.push(t)
    }
  }
  return result
}

export function buildBM25Index(
  chunks: { id: string; content: string }[],
  opts: { k1?: number; b?: number } = {}
): BM25Index {
  const k1 = opts.k1 ?? DEFAULT_K1
  const b = opts.b ?? DEFAULT_B
  const docFreq = new Map<string, number>()
  let totalLength = 0

  const docs = chunks.map(chunk => {
    const tokens = tokenize(chunk.content)
    totalLength += tokens.length

    const termFreq = new Map<string, number>()
    for (const token of tokens) {
      termFreq.set(token, (termFreq.get(token) ?? 0) + 1)
    }

    for (const term of termFreq.keys()) {
      docFreq.set(term, (docFreq.get(term) ?? 0) + 1)
    }

    return { id: chunk.id, termFreq, length: tokens.length }
  })

  const totalDocs = docs.length
  const avgDocLength = totalDocs === 0 ? 1 : totalLength / totalDocs

  return { docs, docFreq, avgDocLength, totalDocs, k1, b }
}

// Returns chunk id -> score normalized to [0, 1] by dividing by the max.
// Chunks with zero score are omitted.
export function scoreBM25(query: string, index: BM25Index): Map<string, number> {
  const { docs, docFreq, avgDocLength, totalDocs, k1, b } = index
  const queryTerms = tokenize(query)

  if (queryTerms.length === 0 || totalDocs === 0) return new Map()

  const raw = new Map<string, number>()
  let maxScore = 0

  for (const doc of docs) {
    let score = 0

    for (const term of queryTerms) {
      const df = docFreq.get(term) ?? 0
      if (df === 0) continue

      const tf = doc.termFreq.get(term) ?? 0
      if (tf === 0) continue

      // Lucene-style non-negative idf
      const idf = Math.log((totalDocs - df + 0.5) / (df + 0.5) + 1)
      const numerator = tf * (k1 + 1)
      const denominator = tf + k1 * (1 - b + b * (doc.length / avgDocLength))
      score += idf * (numerator / denominator)
    }

    if (score > 0) {
      raw.set(doc.id, score)
      if (score > maxScore) maxScore = score
    }
  }

  if (maxScore === 0) return new Map()

  const normalized = new Map<string, number>()
  for (const [id, score] of raw) {
    normalized.set(id, score / maxScore)
  }
  return normalized
}

// Cache wrapper owned by the MCP server instance.
export class BM25Cache {
  private index: BM25Index | null = null

  get(): BM25Index | null { return this.index }
  set(index: BM25Index): void { this.index = index }
  invalidate(): void { this.index = null }
  has(): boolean { return this.index !== null }
}
