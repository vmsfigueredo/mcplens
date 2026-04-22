import http from 'http'
import Database from 'better-sqlite3'

export async function handleSymbol(req: http.IncomingMessage, res: http.ServerResponse, db: Database.Database, url: URL): Promise<void> {
  const name = url.searchParams.get('name') ?? ''
  if (!name) { res.writeHead(400); res.end('[]'); return }
  const { getSymbol } = await import('../../search/search.js')
  const results = getSymbol(db, name)
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(results))
}
