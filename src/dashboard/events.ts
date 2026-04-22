import http from 'http'

export type ActivityEvent =
  | { ts: number; type: 'indexed' | 'removed' | 'startup'; file: string; chunks?: number }
  | { ts: number; type: 'search' | 'symbol'; query: string; results: number; latencyMs: number; sessionId: string }

export const activityLog: ActivityEvent[] = []
export const sseClients = new Set<http.ServerResponse>()
let indexingInProgress = false

export function setIndexing(value: boolean): void {
  indexingInProgress = value
  const data = `data: ${JSON.stringify({ type: '__indexing__', value })}\n\n`
  for (const res of sseClients) res.write(data)
}

export function emitActivity(event: ActivityEvent): void {
  activityLog.unshift(event)
  if (activityLog.length > 200) activityLog.pop()
  const data = `data: ${JSON.stringify(event)}\n\n`
  for (const res of sseClients) res.write(data)
}

export function recordSearch(opts: { type: 'search' | 'symbol'; query: string; results: number; latencyMs: number; sessionId: string }): void {
  emitActivity({ ts: Date.now(), ...opts })
}

export function getIndexing(): boolean {
  return indexingInProgress
}

// Server-side event HTML — must stay in sync with eventHtmlStr in views/client.ts
export function eventHtml(e: ActivityEvent, _isNew: boolean = false): string {
  const t = new Date(e.ts).toLocaleTimeString()
  if (e.type === 'search' || e.type === 'symbol') {
    const latency = `<span class="latency">${e.latencyMs}ms</span>`
    const session = `<span class="session-chip">${e.sessionId}</span>`
    const count = `<span class="result-count">${e.results} result${e.results !== 1 ? 's' : ''}</span>`
    return `<div class="event"><span class="ts">${t}</span><span class="badge ${e.type}">${e.type}</span>${session}<span class="query">${escHtml(e.query)}</span>${count}${latency}</div>`
  }
  const fe = e as { ts: number; type: string; file: string; chunks?: number }
  const chunks = fe.chunks !== undefined ? `<span class="chunks">·${fe.chunks} chunks</span>` : ''
  return `<div class="event"><span class="ts">${t}</span><span class="badge ${fe.type}">${fe.type}</span><span class="file">${fe.file}${chunks}</span></div>`
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
