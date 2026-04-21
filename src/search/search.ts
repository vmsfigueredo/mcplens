// src/search/search.ts
// Semantic search over indexed chunks.
// Fetches all embeddings from SQLite and does cosine similarity in-process.
// For very large projects (50k+ chunks), consider sqlite-vec for ANN.

import Database from 'better-sqlite3'
import {getEmbedding, cosineSimilarity, EmbeddingsConfig} from '../indexer/embeddings.js'
import {getAllChunks} from '../indexer/database.js'

export interface SearchResult {
    filepath: string
    startLine: number
    endLine: number
    content: string
    score: number
}

export interface SearchConfig {
    topK?: number       // number of results (default: 5)
    minScore?: number   // minimum similarity score (default: 0.3)
}

export async function searchCode(
    db: Database.Database,
    query: string,
    embeddingsConfig: EmbeddingsConfig,
    config: SearchConfig = {}
): Promise<SearchResult[]> {
    const topK = config.topK ?? 5
    const minScore = config.minScore ?? 0.3

    // Embed the query
    const queryEmbedding = await getEmbedding(query, embeddingsConfig)

    // Load all chunks and compute similarity
    // (acceptable for up to ~20k chunks; ~50ms on modern hardware)
    const chunks = getAllChunks(db)

    const scored = chunks
        .map(chunk => ({
            filepath: chunk.filepath,
            startLine: chunk.startLine,
            endLine: chunk.endLine,
            content: chunk.content,
            score: cosineSimilarity(queryEmbedding, chunk.embedding),
        }))
        .filter(r => r.score >= minScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)

    return scored
}

export function getSymbol(
    db: Database.Database,
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