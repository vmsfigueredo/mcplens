import http from 'http'
import type { Db } from '../../indexer/database.js'
import { getFiles, getChunksByFile } from '../queries.js'

export function handleFiles(req: http.IncomingMessage, res: http.ServerResponse, db: Db): void {
  const files = getFiles(db)
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(files))
}

export function handleFileChunks(req: http.IncomingMessage, res: http.ServerResponse, db: Db, url: URL): void {
  const filepath = url.searchParams.get('path')
  if (!filepath) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'missing path param' }))
    return
  }
  const chunks = getChunksByFile(db, filepath).map(c => ({
    ...c,
    content: c.content.length > 4000 ? c.content.slice(0, 4000) + '\n…' : c.content,
  }))
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(chunks))
}
