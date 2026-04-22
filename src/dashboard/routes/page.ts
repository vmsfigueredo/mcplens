import http from 'http'
import type { Db } from '../../indexer/database.js'
import { renderPage } from '../views/layout.js'

export function handlePage(req: http.IncomingMessage, res: http.ServerResponse, db: Db, projectRoot: string): void {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(renderPage(db, projectRoot))
}
