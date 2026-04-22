// src/utils/lockfile.ts
// Atomic lockfile helpers for single-instance-per-project coordination.

import fs from 'fs'
import path from 'path'
import http from 'http'

export interface LockfileData {
  pid: number
  port: number
  projectRoot: string
  startedAt: number
  sessions: number
  lastHeartbeat: number
}

function lockfilePath(projectRoot: string): string {
  return path.join(projectRoot, '.mcplens', 'instance.lock')
}

export function readLockfile(projectRoot: string): LockfileData | null {
  try {
    const raw = fs.readFileSync(lockfilePath(projectRoot), 'utf8')
    return JSON.parse(raw) as LockfileData
  } catch {
    return null
  }
}

export function writeLockfile(projectRoot: string, data: LockfileData): void {
  const file = lockfilePath(projectRoot)
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data))
  fs.renameSync(tmp, file)
}

export function deleteLockfile(projectRoot: string): void {
  try { fs.unlinkSync(lockfilePath(projectRoot)) } catch { /* already gone */ }
}

export function isPidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch { return false }
}

export function probeHost(port: number, projectRoot: string): Promise<boolean> {
  return new Promise(resolve => {
    const timeout = setTimeout(() => { req.destroy(); resolve(false) }, 1000)
    const req = http.get(`http://127.0.0.1:${port}/api/whoami`, res => {
      let body = ''
      res.on('data', (d: Buffer) => { body += d.toString() })
      res.on('end', () => {
        clearTimeout(timeout)
        try {
          const json = JSON.parse(body) as { projectRoot: string }
          resolve(json.projectRoot === projectRoot)
        } catch { resolve(false) }
      })
    })
    req.on('error', () => { clearTimeout(timeout); resolve(false) })
  })
}

export function postSession(port: number, action: 'register' | 'release' | 'heartbeat'): Promise<void> {
  return new Promise(resolve => {
    const body = JSON.stringify({ action })
    const opts: http.RequestOptions = {
      hostname: '127.0.0.1',
      port,
      path: '/api/session',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }
    const timeout = setTimeout(() => { req.destroy(); resolve() }, 1000)
    const req = http.request(opts, res => {
      res.resume()
      res.on('end', () => { clearTimeout(timeout); resolve() })
    })
    req.on('error', () => { clearTimeout(timeout); resolve() })
    req.end(body)
  })
}

export function postSearch(port: number, query: string, topK?: number, minScore?: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query, topK, minScore })
    const opts: http.RequestOptions = {
      hostname: '127.0.0.1',
      port,
      path: '/api/search',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }
    const timeout = setTimeout(() => { req.destroy(); reject(new Error('timeout')) }, 10000)
    const req = http.request(opts, res => {
      let out = ''
      res.on('data', (d: Buffer) => { out += d.toString() })
      res.on('end', () => { clearTimeout(timeout); resolve(JSON.parse(out)) })
    })
    req.on('error', (e) => { clearTimeout(timeout); reject(e) })
    req.end(body)
  })
}

export function getSymbolHttp(port: number, name: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { req.destroy(); reject(new Error('timeout')) }, 5000)
    const req = http.get(`http://127.0.0.1:${port}/api/symbol?name=${encodeURIComponent(name)}`, res => {
      let out = ''
      res.on('data', (d: Buffer) => { out += d.toString() })
      res.on('end', () => { clearTimeout(timeout); resolve(JSON.parse(out)) })
    })
    req.on('error', (e) => { clearTimeout(timeout); reject(e) })
  })
}

export function getStatsHttp(port: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { req.destroy(); reject(new Error('timeout')) }, 5000)
    const req = http.get(`http://127.0.0.1:${port}/api/stats`, res => {
      let out = ''
      res.on('data', (d: Buffer) => { out += d.toString() })
      res.on('end', () => { clearTimeout(timeout); resolve(JSON.parse(out)) })
    })
    req.on('error', (e) => { clearTimeout(timeout); reject(e) })
  })
}
