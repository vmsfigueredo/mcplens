import http from 'http'
import type { Db } from '../../indexer/database.js'
import { readBody } from '../utils.js'
import { recordSearch } from '../events.js'

export async function handleSearchGet(req: http.IncomingMessage, res: http.ServerResponse, db: Db, url: URL, embeddingsConfig: any, searchConfig: any): Promise<void> {
  const query = url.searchParams.get('q') ?? ''
  if (!query) { res.writeHead(400); res.end('[]'); return }
  const sessionId = (req.headers['x-mcplens-session'] as string | undefined) ?? 'unknown'
  try {
    const { searchCode } = await import('../../search/search.js')
    const t0 = Date.now()
    const results = await searchCode(db, query, embeddingsConfig, searchConfig)
    recordSearch({ type: 'search', query, results: results.length, latencyMs: Date.now() - t0, sessionId })
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(results))
  } catch (err) {
    res.writeHead(500)
    res.end(JSON.stringify({ error: String(err) }))
  }
}

export async function handleSearchPost(req: http.IncomingMessage, res: http.ServerResponse, db: Db, embeddingsConfig: any): Promise<void> {
  const body = await readBody(req)
  const { query, topK, minScore } = JSON.parse(body) as { query: string; topK?: number; minScore?: number }
  if (!query) { res.writeHead(400); res.end('[]'); return }
  const sessionId = (req.headers['x-mcplens-session'] as string | undefined) ?? 'unknown'
  try {
    const { searchCode } = await import('../../search/search.js')
    const t0 = Date.now()
    const results = await searchCode(db, query, embeddingsConfig, { topK, minScore })
    recordSearch({ type: 'search', query, results: results.length, latencyMs: Date.now() - t0, sessionId })
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(results))
  } catch (err) {
    res.writeHead(500)
    res.end(JSON.stringify({ error: String(err) }))
  }
}
