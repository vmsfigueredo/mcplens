import { ActivityEvent, eventHtml } from '../events.js'

export function renderSearchesTab(log: ActivityEvent[]): string {
  const searchLog = log.filter(e => e.type === 'search' || e.type === 'symbol')
  const content = searchLog.length === 0
    ? '<div class="empty-state"><span class="empty-icon">◌</span><span>Waiting for Claude to call search_code or get_symbol…</span><span style="font-size:0.75rem">Searches will appear here in real time.</span></div>'
    : searchLog.map(e => eventHtml(e, false)).join('')

  return `
  <div id="tab-searches" class="tab">
    <div class="section-label">mcp search calls</div>
    <div id="searches-feed">${content}</div>
  </div>`
}
