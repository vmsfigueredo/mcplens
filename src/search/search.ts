// src/search/search.ts
// Semantic search over indexed chunks.
// Fetches all embeddings from SQLite and does cosine similarity in-process.
// For very large projects (50k+ chunks), consider sqlite-vec for ANN.

import type { Db } from '../indexer/database.js'
import {getEmbedding, cosineSimilarity, EmbeddingsConfig} from '../indexer/embeddings.js'
import {getAllChunks} from '../indexer/database.js'
import { BM25Index, scoreBM25 } from './bm25.js'

export interface SearchResult {
    filepath: string
    startLine: number
    endLine: number
    content: string
    score: number
}

export interface SearchConfig {
    topK?: number        // number of results (default: 5)
    minScore?: number    // minimum similarity score (default: 0.3)
    hybridAlpha?: number // 0 = pure semantic, 1 = pure BM25 (default from config: 0.3)
}

function fileTypeBoost(filepath: string): number {
    return /\.(test|spec)\.[jt]s$/.test(filepath) ? 0.6 : 1.0
}

export async function searchCode(
    db: Db,
    query: string,
    embeddingsConfig: EmbeddingsConfig,
    config: SearchConfig = {},
    bm25Index: BM25Index | null = null
): Promise<SearchResult[]> {
    const topK = config.topK ?? 5
    const minScore = config.minScore ?? 0.3
    const hybridAlpha = config.hybridAlpha ?? 0

    // Embed the query
    const queryEmbedding = await getEmbedding(query, embeddingsConfig)

    // Load all chunks and compute similarity
    // (acceptable for up to ~20k chunks; ~50ms on modern hardware)
    const chunks = getAllChunks(db)

    // Fast path: pure semantic search — identical behavior to pre-hybrid code.
    if (hybridAlpha === 0 || !bm25Index) {
        return chunks
            .map(chunk => ({
                filepath: chunk.filepath,
                startLine: chunk.startLine,
                endLine: chunk.endLine,
                content: chunk.content,
                score: cosineSimilarity(queryEmbedding, chunk.embedding) * fileTypeBoost(chunk.filepath),
            }))
            .filter(r => r.score >= minScore)
            .sort((a, b) => b.score - a.score)
            .slice(0, topK)
    }

    // Hybrid path: weighted average of BM25 and cosine scores.
    const bm25Scores = scoreBM25(query, bm25Index)

    return chunks
        .map(chunk => {
            const semantic = cosineSimilarity(queryEmbedding, chunk.embedding)
            const bm25 = bm25Scores.get(chunk.id) ?? 0
            const score = (hybridAlpha * bm25 + (1 - hybridAlpha) * semantic) * fileTypeBoost(chunk.filepath)
            return {
                filepath: chunk.filepath,
                startLine: chunk.startLine,
                endLine: chunk.endLine,
                content: chunk.content,
                score,
            }
        })
        .filter(r => r.score >= minScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
}

export function getSymbol(
    db: Db,
    symbolName: string
): SearchResult[] {
    // Exact text search for class/function/method definitions
    // Works well for PHP, TS, Python patterns
    const patterns = [
        `class ${symbolName}`,
        `function ${symbolName}`,
        `interface ${symbolName}`,
        `trait ${symbolName}`,
        `enum ${symbolName}`,
        `const ${symbolName}`,
        `def ${symbolName}`,
    ]

    const results: SearchResult[] = []

    for (const pattern of patterns) {
        const rows = db.prepare(`
            SELECT filepath, start_line, end_line, content
            FROM chunks
            WHERE content LIKE ? LIMIT 3
        `).all(`%${pattern}%`) as any[]

        for (const row of rows) {
            results.push({
                filepath: row.filepath,
                startLine: row.start_line,
                endLine: row.end_line,
                content: row.content,
                score: 1.0,
            })
        }
    }

    // Deduplicate by filepath+startLine
    const seen = new Set<string>()
    return results.filter(r => {
        const key = `${r.filepath}:${r.startLine}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
    })
}