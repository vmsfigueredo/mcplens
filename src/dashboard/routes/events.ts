import http from 'http'
import { activityLog, sseClients } from '../events.js'

export function handleEvents(req: http.IncomingMessage, res: http.ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  })
  for (const event of [...activityLog].reverse()) {
    res.write(`data: ${JSON.stringify(event)}\n\n`)
  }
  res.write(': connected\n\n')
  sseClients.add(res)
  req.on('close', () => sseClients.delete(res))
}
