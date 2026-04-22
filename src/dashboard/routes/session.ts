import http from 'http'
import { readBody } from '../utils.js'
import { readLockfile, writeLockfile } from '../../utils/lockfile.js'

export async function handleSession(req: http.IncomingMessage, res: http.ServerResponse, projectRoot: string): Promise<void> {
  const body = await readBody(req)
  const { action } = JSON.parse(body) as { action: 'register' | 'release' | 'heartbeat' }
  handleSessionAction(projectRoot, action)
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end('{"ok":true}')
}

function handleSessionAction(projectRoot: string, action: 'register' | 'release' | 'heartbeat'): void {
  const lock = readLockfile(projectRoot)
  if (!lock) return

  if (action === 'register') {
    lock.sessions = Math.max(1, lock.sessions + 1)
    lock.lastHeartbeat = Date.now()
  } else if (action === 'release') {
    lock.sessions = Math.max(0, lock.sessions - 1)
  } else if (action === 'heartbeat') {
    lock.lastHeartbeat = Date.now()
  }

  writeLockfile(projectRoot, lock)
}
