import { describe, it, expect, vi, afterEach } from 'vitest'
import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'
import {
  readLockfile,
  writeLockfile,
  deleteLockfile,
  isPidAlive,
  probeHost,
  postSession,
  postSearch,
  getSymbolHttp,
  getStatsHttp,
} from './lockfile.js'
import type { LockfileData } from './lockfile.js'

let tmpDir: string

function setup() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcplens-lock-'))
  fs.mkdirSync(path.join(tmpDir, '.mcplens'))
  return tmpDir
}

function teardown() {
  fs.rmSync(tmpDir, { recursive: true, force: true })
}

afterEach(teardown)

const sampleData: LockfileData = {
  pid: 12345,
  port: 3333,
  projectRoot: '/home/user/project',
  startedAt: 1000,
  sessions: 0,
  lastHeartbeat: 1000,
}

// ---------------------------------------------------------------------------
// readLockfile / writeLockfile / deleteLockfile
// ---------------------------------------------------------------------------

describe('writeLockfile / readLockfile', () => {
  it('round-trips lockfile data', () => {
    setup()
    writeLockfile(tmpDir, sampleData)
    const result = readLockfile(tmpDir)
    expect(result).toEqual(sampleData)
  })

  it('returns null when no lockfile exists', () => {
    setup()
    expect(readLockfile(tmpDir)).toBeNull()
  })

  it('overwrites an existing lockfile', () => {
    setup()
    writeLockfile(tmpDir, sampleData)
    writeLockfile(tmpDir, { ...sampleData, sessions: 3 })
    expect(readLockfile(tmpDir)?.sessions).toBe(3)
  })
})

describe('deleteLockfile', () => {
  it('removes the lockfile', () => {
    setup()
    writeLockfile(tmpDir, sampleData)
    deleteLockfile(tmpDir)
    expect(readLockfile(tmpDir)).toBeNull()
  })

  it('does not throw when the lockfile does not exist', () => {
    setup()
    expect(() => deleteLockfile(tmpDir)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// isPidAlive
// ---------------------------------------------------------------------------

describe('isPidAlive', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns true when process.kill(pid, 0) succeeds', () => {
    vi.spyOn(process, 'kill').mockImplementation(() => true as never)
    expect(isPidAlive(99999)).toBe(true)
  })

  it('returns false when process.kill throws', () => {
    vi.spyOn(process, 'kill').mockImplementation(() => { throw Object.assign(new Error('no process'), { code: 'ESRCH' }) })
    expect(isPidAlive(99999)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// HTTP helpers — tested against a real local server
// ---------------------------------------------------------------------------

function startServer(handler: http.RequestListener): Promise<{ server: http.Server; port: number }> {
  return new Promise(resolve => {
    const server = http.createServer(handler)
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port
      resolve({ server, port })
    })
  })
}

function stopServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()))
}

describe('probeHost', () => {
  it('returns true when /api/whoami responds with matching projectRoot', async () => {
    const projectRoot = '/home/user/project'
    const { server, port } = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ projectRoot }))
    })
    try {
      expect(await probeHost(port, projectRoot)).toBe(true)
    } finally {
      await stopServer(server)
    }
  })

  it('returns false when projectRoot does not match', async () => {
    const { server, port } = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ projectRoot: '/other/path' }))
    })
    try {
      expect(await probeHost(port, '/home/user/project')).toBe(false)
    } finally {
      await stopServer(server)
    }
  })

  it('returns false when the server returns invalid JSON', async () => {
    const { server, port } = await startServer((_req, res) => {
      res.writeHead(200)
      res.end('not json')
    })
    try {
      expect(await probeHost(port, '/any')).toBe(false)
    } finally {
      await stopServer(server)
    }
  })

  it('returns false when nothing is listening on the port', async () => {
    // Port 1 is reserved and will refuse connections on any OS
    expect(await probeHost(1, '/any')).toBe(false)
  })
})

describe('postSession', () => {
  it('sends POST /api/session with the given action', async () => {
    let receivedBody = ''
    const { server, port } = await startServer((req, res) => {
      let body = ''
      req.on('data', d => { body += d })
      req.on('end', () => { receivedBody = body; res.writeHead(200); res.end() })
    })
    try {
      await postSession(port, 'register')
      expect(JSON.parse(receivedBody)).toEqual({ action: 'register' })
    } finally {
      await stopServer(server)
    }
  })

  it('resolves even when the server errors', async () => {
    const { server, port } = await startServer((_req, res) => {
      res.writeHead(500); res.end()
    })
    try {
      await expect(postSession(port, 'heartbeat')).resolves.toBeUndefined()
    } finally {
      await stopServer(server)
    }
  })

  it('resolves when nothing is listening on the port', async () => {
    await expect(postSession(1, 'release')).resolves.toBeUndefined()
  })
})

describe('postSearch', () => {
  it('sends POST /api/search and returns parsed JSON', async () => {
    const response = [{ filepath: 'src/foo.ts', score: 0.9 }]
    let receivedBody = ''
    const { server, port } = await startServer((req, res) => {
      let body = ''
      req.on('data', d => { body += d })
      req.on('end', () => {
        receivedBody = body
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(response))
      })
    })
    try {
      const result = await postSearch(port, 'how does auth work', 5, 0.3)
      expect(result).toEqual(response)
      const body = JSON.parse(receivedBody)
      expect(body.query).toBe('how does auth work')
      expect(body.topK).toBe(5)
      expect(body.minScore).toBe(0.3)
    } finally {
      await stopServer(server)
    }
  })

  it('rejects when nothing is listening on the port', async () => {
    await expect(postSearch(1, 'query')).rejects.toThrow()
  })
})

describe('getSymbolHttp', () => {
  it('sends GET /api/symbol?name=... and returns parsed JSON', async () => {
    const response = [{ filepath: 'src/foo.ts', startLine: 1 }]
    let receivedUrl = ''
    const { server, port } = await startServer((req, res) => {
      receivedUrl = req.url ?? ''
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(response))
    })
    try {
      const result = await getSymbolHttp(port, 'MyClass')
      expect(result).toEqual(response)
      expect(receivedUrl).toContain('name=MyClass')
    } finally {
      await stopServer(server)
    }
  })

  it('rejects when nothing is listening on the port', async () => {
    await expect(getSymbolHttp(1, 'Foo')).rejects.toThrow()
  })
})

describe('getStatsHttp', () => {
  it('sends GET /api/stats and returns parsed JSON', async () => {
    const response = { chunks: 42, files: 7 }
    const { server, port } = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(response))
    })
    try {
      expect(await getStatsHttp(port)).toEqual(response)
    } finally {
      await stopServer(server)
    }
  })

  it('rejects when nothing is listening on the port', async () => {
    await expect(getStatsHttp(1)).rejects.toThrow()
  })
})
