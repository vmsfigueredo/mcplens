import http from 'http'
import type { Db } from '../../indexer/database.js'
import { getDependsOn, getUsedBy } from '../../indexer/database.js'
import { recordSearch } from '../events.js'

export async function handleRelated(req: http.IncomingMessage, res: http.ServerResponse, db: Db, url: URL): Promise<void> {
  const filepath = url.searchParams.get('filepath') ?? ''
  if (!filepath) { res.writeHead(400); res.end('{}'); return }
  const sessionId = (req.headers['x-mcplens-session'] as string | undefined) ?? 'unknown'
  const t0 = Date.now()
  const dependsOn = getDependsOn(db, filepath)
  const usedBy = getUsedBy(db, filepath)
  const total = dependsOn.length + usedBy.length
  recordSearch({ type: 'related', query: filepath, results: total, latencyMs: Date.now() - t0, sessionId })
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ dependsOn, usedBy }))
}
