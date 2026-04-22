import http from 'http'
import type { Db } from '../indexer/database.js'
import { handlePage } from './routes/page.js'
import { handleStats, handleWhoami } from './routes/stats.js'
import { handleFiles, handleFileChunks } from './routes/files.js'
import { handleSearchGet, handleSearchPost } from './routes/search.js'
import { handleSymbol } from './routes/symbol.js'
import { handleRelated } from './routes/related.js'
import { handleSession } from './routes/session.js'
import { handleEvents } from './routes/events.js'
import { sseClients } from './events.js'

export interface DashboardHandle {
  server: http.Server
  shutdown: () => Promise<void>
}

const serverStartedAt = Date.now()

export function startDashboard(
  db: Db,
  projectRoot: string,
  embeddingsConfig: any,
  searchConfig: any,
  port: number,
  fallbackPort?: number,
  onListening?: (port: number) => void,
): DashboardHandle {
  let boundPort = port

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://localhost:${boundPort}`)
      const { pathname, method } = { pathname: url.pathname, method: req.method }

      if (pathname === '/events') return handleEvents(req, res)
      if (pathname === '/api/whoami') return handleWhoami(req, res, projectRoot, serverStartedAt)
      if (pathname === '/api/stats') return handleStats(req, res, db, projectRoot)
      if (pathname === '/api/files/chunks') return handleFileChunks(req, res, db, url)
      if (pathname === '/api/files') return handleFiles(req, res, db)
      if (pathname === '/api/search' && method === 'GET') return await handleSearchGet(req, res, db, url, embeddingsConfig, searchConfig)
      if (pathname === '/api/search' && method === 'POST') return await handleSearchPost(req, res, db, embeddingsConfig)
      if (pathname === '/api/symbol') return await handleSymbol(req, res, db, url)
      if (pathname === '/api/related') return await handleRelated(req, res, db, url)
      if (pathname === '/api/session' && method === 'POST') return await handleSession(req, res, projectRoot)

      handlePage(req, res, db, projectRoot)
    } catch (err) {
      if (!res.headersSent) res.writeHead(500)
      res.end(`Internal error: ${err}`)
    }
  })

  server.on('error', (e: NodeJS.ErrnoException) => {
    if (e.code === 'EADDRINUSE' && fallbackPort !== undefined && port !== fallbackPort) {
      boundPort = fallbackPort
      server.listen(fallbackPort, '127.0.0.1')
    } else {
      process.stderr.write(`[mcplens] dashboard error: ${e.message}\n`)
    }
  })

  server.on('listening', () => {
    const addr = server.address() as { port: number }
    boundPort = addr.port
    onListening?.(addr.port)
  })

  server.listen(port, '127.0.0.1')

  const shutdown = (): Promise<void> => new Promise(resolve => {
    for (const client of sseClients) {
      try { client.end() } catch { /* ignore */ }
    }
    sseClients.clear()
    server.closeAllConnections()
    server.close(() => resolve())
  })

  return { server, shutdown }
}
