import http from 'http'
import Database from 'better-sqlite3'
import { renderPage } from '../views/layout.js'

export function handlePage(req: http.IncomingMessage, res: http.ServerResponse, db: Database.Database, projectRoot: string): void {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(renderPage(db, projectRoot))
}
