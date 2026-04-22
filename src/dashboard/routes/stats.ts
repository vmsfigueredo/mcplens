import http from 'http'
import type { Db } from '../../indexer/database.js'
import { getStats } from '../queries.js'
import { getIndexing } from '../events.js'

export function handleStats(req: http.IncomingMessage, res: http.ServerResponse, db: Db, projectRoot: string): void {
  const stats = getStats(db, projectRoot, getIndexing())
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(stats))
}

export function handleWhoami(req: http.IncomingMessage, res: http.ServerResponse, projectRoot: string, serverStartedAt: number): void {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ projectRoot, pid: process.pid, startedAt: serverStartedAt }))
}
