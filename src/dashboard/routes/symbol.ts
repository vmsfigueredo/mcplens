import http from 'http'
import Database from 'better-sqlite3'
import { recordSearch } from '../events.js'

export async function handleSymbol(req: http.IncomingMessage, res: http.ServerResponse, db: Database.Database, url: URL): Promise<void> {
  const name = url.searchParams.get('name') ?? ''
  if (!name) { res.writeHead(400); res.end('[]'); return }
  const sessionId = (req.headers['x-mcplens-session'] as string | undefined) ?? 'unknown'
  const { getSymbol } = await import('../../search/search.js')
  const t0 = Date.now()
  const results = getSymbol(db, name)
  recordSearch({ type: 'symbol', query: name, results: results.length, latencyMs: Date.now() - t0, sessionId })
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(results))
}
