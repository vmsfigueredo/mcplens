import { ActivityEvent, eventHtml } from '../events.js'

interface OverviewStats {
  files: number
  chunks: number
  dbSize: number
  lastIndexed: number | null
  indexing: boolean
  sessions: number
}

export function renderOverviewTab(stats: OverviewStats, recentActivity: ActivityEvent[]): string {
  const mbSize = (stats.dbSize / 1024 / 1024).toFixed(1)
  const lastIndexedStr = stats.lastIndexed ? new Date(stats.lastIndexed).toLocaleString() : 'never'

  const activityHtml = recentActivity.length === 0
    ? '<div class="empty-state"><span class="empty-icon">◌</span><span>No activity yet</span><button class="empty-action" onclick="document.querySelector(\'nav button:nth-child(3)\').click()">Try a search query</button></div>'
    : recentActivity.slice(0, 20).map(e => eventHtml(e, false)).join('')

  return `
  <div id="tab-overview" class="tab active">
    <div class="cards">
      <div class="card">
        <div class="label">Files indexed</div>
        <div class="value" id="stat-files">${stats.files}</div>
      </div>
      <div class="card">
        <div class="label">Total chunks</div>
        <div class="value" id="stat-chunks">${stats.chunks}</div>
      </div>
      <div class="card">
        <div class="label">Index size</div>
        <div class="value" id="stat-size-val">${mbSize}<span class="unit">MB</span></div>
      </div>
      <div class="card">
        <div class="label">Last indexed</div>
        <div class="value-sm" id="stat-last">${lastIndexedStr}</div>
      </div>
      <div class="card">
        <div class="label">Claude sessions</div>
        <div class="value" id="stat-sessions">${stats.sessions}</div>
      </div>
    </div>

    <div class="section-label">recent activity</div>
    <div id="activity-feed-overview" style="background:var(--surface);border:1px solid var(--border);border-radius:6px;overflow:hidden;max-height:320px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--border2) transparent;">
      ${activityHtml}
    </div>
  </div>`
}
