import http from 'http'

export interface ActivityEvent {
  ts: number
  type: 'indexed' | 'removed' | 'startup'
  file: string
  chunks?: number
}

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

export function getIndexing(): boolean {
  return indexingInProgress
}

// Server-side event HTML — must stay in sync with eventHtmlStr in views/client.ts
export function eventHtml(e: ActivityEvent, _isNew: boolean = false): string {
  const t = new Date(e.ts).toLocaleTimeString()
  const chunks = e.chunks !== undefined ? `<span class="chunks">·${e.chunks} chunks</span>` : ''
  return `<div class="event"><span class="ts">${t}</span><span class="badge ${e.type}">${e.type}</span><span class="file">${e.file}${chunks}</span></div>`
}
