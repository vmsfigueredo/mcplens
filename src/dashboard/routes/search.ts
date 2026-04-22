import http from 'http'
import Database from 'better-sqlite3'
import { readBody } from '../utils.js'

export async function handleSearchGet(req: http.IncomingMessage, res: http.ServerResponse, db: Database.Database, url: URL, embeddingsConfig: any, searchConfig: any): Promise<void> {
  const query = url.searchParams.get('q') ?? ''
  if (!query) { res.writeHead(400); res.end('[]'); return }
  try {
    const { searchCode } = await import('../../search/search.js')
    const results = await searchCode(db, query, embeddingsConfig, searchConfig)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(results))
  } catch (err) {
    res.writeHead(500)
    res.end(JSON.stringify({ error: String(err) }))
  }
}

export async function handleSearchPost(req: http.IncomingMessage, res: http.ServerResponse, db: Database.Database, embeddingsConfig: any): Promise<void> {
  const body = await readBody(req)
  const { query, topK, minScore } = JSON.parse(body) as { query: string; topK?: number; minScore?: number }
  if (!query) { res.writeHead(400); res.end('[]'); return }
  try {
    const { searchCode } = await import('../../search/search.js')
    const results = await searchCode(db, query, embeddingsConfig, { topK, minScore })
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(results))
  } catch (err) {
    res.writeHead(500)
    res.end(JSON.stringify({ error: String(err) }))
  }
}
