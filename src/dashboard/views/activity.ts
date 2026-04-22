import { ActivityEvent, eventHtml } from '../events.js'

export function renderActivityTab(log: ActivityEvent[]): string {
  const content = log.length === 0
    ? '<div class="empty-state"><span class="empty-icon">◌</span><span>Waiting for file activity…</span><span style="font-size:0.75rem">Edit a file in your project to see events here.</span></div>'
    : log.map(e => eventHtml(e, false)).join('')

  return `
  <div id="tab-activity" class="tab">
    <div class="section-label">file events</div>
    <div id="activity-feed">${content}</div>
  </div>`
}
