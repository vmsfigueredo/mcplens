// src/dashboard/dashboard.ts
// HTTP dashboard served on :3333 while the MCP server is running.
// Stack: native Node http + SSE for live activity. Zero extra dependencies.

import http from 'http'
import Database from 'better-sqlite3'


export interface ActivityEvent {
  ts: number
  type: 'indexed' | 'removed' | 'startup'
  file: string
  chunks?: number
}

const activityLog: ActivityEvent[] = []
const sseClients = new Set<http.ServerResponse>()

export function emitActivity(event: ActivityEvent) {
  activityLog.unshift(event)
  if (activityLog.length > 200) activityLog.pop()

  const data = `data: ${JSON.stringify(event)}\n\n`
  for (const res of sseClients) {
    res.write(data)
  }
}

function getStats(db: Database.Database) {
  const files = (db.prepare('SELECT COUNT(DISTINCT filepath) as c FROM chunks').get() as any).c as number
  const chunks = (db.prepare('SELECT COUNT(*) as c FROM chunks').get() as any).c as number
  const dbSize = (db.prepare('SELECT page_count * page_size as s FROM pragma_page_count(), pragma_page_size()').get() as any).s as number
  const lastIndexed = (db.prepare('SELECT MAX(indexed_at) as t FROM file_hashes').get() as any).t as number | null
  return { files, chunks, dbSize, lastIndexed }
}

function getFiles(db: Database.Database) {
  return db.prepare(`
    SELECT f.filepath, f.indexed_at, COUNT(c.id) as chunk_count
    FROM file_hashes f
    LEFT JOIN chunks c ON c.filepath = f.filepath
    GROUP BY f.filepath
    ORDER BY f.indexed_at DESC
  `).all() as { filepath: string; indexed_at: number; chunk_count: number }[]
}

function html(db: Database.Database, projectRoot: string) {
  const stats = getStats(db)
  const mbSize = (stats.dbSize / 1024 / 1024).toFixed(1)
  const lastIndexedStr = stats.lastIndexed
    ? new Date(stats.lastIndexed).toLocaleString()
    : 'never'

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>claude-context-optimizer</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0 }
  :root {
    --bg: #0d1117; --surface: #161b22; --border: #30363d;
    --text: #e6edf3; --muted: #8b949e; --accent: #58a6ff;
    --green: #3fb950; --red: #f85149; --orange: #d29922;
    font-size: 14px;
  }
  body { background: var(--bg); color: var(--text); font-family: ui-monospace, 'Cascadia Code', monospace; }
  header { background: var(--surface); border-bottom: 1px solid var(--border); padding: 12px 24px; display: flex; align-items: center; gap: 16px; }
  header h1 { font-size: 1rem; color: var(--accent); }
  header span { color: var(--muted); font-size: 0.85rem; }
  nav { display: flex; gap: 0; border-bottom: 1px solid var(--border); background: var(--surface); padding: 0 24px; }
  nav button { background: none; border: none; color: var(--muted); cursor: pointer; padding: 10px 18px; font: inherit; border-bottom: 2px solid transparent; transition: color .15s; }
  nav button.active, nav button:hover { color: var(--text); }
  nav button.active { border-bottom-color: var(--accent); }
  main { padding: 24px; max-width: 1200px; }
  .tab { display: none; } .tab.active { display: block; }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px; }
  .card .label { color: var(--muted); font-size: 0.8rem; margin-bottom: 6px; }
  .card .value { font-size: 1.5rem; color: var(--text); }
  .card .sub { color: var(--muted); font-size: 0.75rem; margin-top: 4px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 6px; }
  .dot.green { background: var(--green); }
  #activity-feed { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 0; overflow: hidden; max-height: 520px; overflow-y: auto; }
  .event { padding: 8px 16px; border-bottom: 1px solid var(--border); display: flex; gap: 12px; align-items: baseline; font-size: 0.82rem; }
  .event:last-child { border-bottom: none; }
  .event .ts { color: var(--muted); white-space: nowrap; flex-shrink: 0; }
  .event .badge { padding: 1px 6px; border-radius: 4px; font-size: 0.7rem; flex-shrink: 0; }
  .badge.indexed { background: #1c3a2a; color: var(--green); }
  .badge.removed { background: #3a1c1c; color: var(--red); }
  .badge.startup { background: #1c2a3a; color: var(--accent); }
  .event .file { color: var(--text); word-break: break-all; }
  .search-box { display: flex; gap: 8px; margin-bottom: 16px; }
  .search-box input { flex: 1; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 8px 12px; color: var(--text); font: inherit; }
  .search-box input:focus { outline: none; border-color: var(--accent); }
  .search-box button { background: var(--accent); color: #000; border: none; border-radius: 6px; padding: 8px 16px; cursor: pointer; font: inherit; font-weight: 600; }
  #search-results { display: flex; flex-direction: column; gap: 12px; }
  .result-card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  .result-header { padding: 8px 14px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
  .result-header .path { color: var(--accent); font-size: 0.82rem; }
  .result-header .score { color: var(--orange); font-size: 0.78rem; }
  .result-card pre { padding: 12px 14px; overflow-x: auto; font-size: 0.78rem; line-height: 1.5; color: var(--muted); }
  table { width: 100%; border-collapse: collapse; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  th { text-align: left; padding: 10px 14px; color: var(--muted); font-weight: normal; border-bottom: 1px solid var(--border); font-size: 0.82rem; }
  td { padding: 8px 14px; border-bottom: 1px solid var(--border); font-size: 0.82rem; }
  tr:last-child td { border-bottom: none; }
  td.filepath { color: var(--accent); word-break: break-all; }
  #live-indicator { display: flex; align-items: center; color: var(--green); font-size: 0.78rem; margin-left: auto; }
</style>
</head>
<body>
<header>
  <h1>claude-context-optimizer</h1>
  <span>${projectRoot}</span>
  <span id="live-indicator" style="margin-left:auto"><span class="dot green"></span>live</span>
</header>
<nav>
  <button class="active" onclick="switchTab('overview', this)">Overview</button>
  <button onclick="switchTab('activity', this)">Activity</button>
  <button onclick="switchTab('search', this)">Search</button>
  <button onclick="switchTab('files', this)">Files</button>
</nav>
<main>

  <!-- OVERVIEW -->
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
        <div class="value" id="stat-size">${mbSize} MB</div>
      </div>
      <div class="card">
        <div class="label">Last indexed</div>
        <div class="value" style="font-size:0.95rem" id="stat-last">${lastIndexedStr}</div>
      </div>
    </div>
  </div>

  <!-- ACTIVITY -->
  <div id="tab-activity" class="tab">
    <div id="activity-feed">
      ${activityLog.length === 0
        ? '<div class="event"><span class="ts">—</span><span class="file" style="color:var(--muted)">Waiting for file activity...</span></div>'
        : activityLog.map(e => eventHtml(e)).join('')}
    </div>
  </div>

  <!-- SEARCH -->
  <div id="tab-search" class="tab">
    <div class="search-box">
      <input id="search-input" type="text" placeholder="how does authentication work?" />
      <button onclick="runSearch()">Search</button>
    </div>
    <div id="search-results"></div>
  </div>

  <!-- FILES -->
  <div id="tab-files" class="tab">
    <table>
      <thead><tr><th>File</th><th>Chunks</th><th>Indexed at</th></tr></thead>
      <tbody id="files-tbody">
        ${getFiles(db).map(f => `<tr>
          <td class="filepath">${f.filepath}</td>
          <td>${f.chunk_count}</td>
          <td style="color:var(--muted)">${new Date(f.indexed_at).toLocaleString()}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>

</main>
<script>
function switchTab(id, btn) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'))
  document.getElementById('tab-' + id).classList.add('active')
  btn.classList.add('active')
}

// SSE for live activity
const feed = document.getElementById('activity-feed')
const es = new EventSource('/events')
es.onmessage = (e) => {
  const ev = JSON.parse(e.data)
  const placeholder = feed.querySelector('.file[style]')
  if (placeholder) placeholder.closest('.event').remove()
  const div = document.createElement('div')
  div.className = 'event'
  div.innerHTML = eventHtml(ev)
  feed.insertBefore(div, feed.firstChild)
  // refresh stats on every event
  fetch('/api/stats').then(r => r.json()).then(s => {
    document.getElementById('stat-files').textContent = s.files
    document.getElementById('stat-chunks').textContent = s.chunks
    document.getElementById('stat-size').textContent = (s.dbSize / 1024 / 1024).toFixed(1) + ' MB'
    if (s.lastIndexed) document.getElementById('stat-last').textContent = new Date(s.lastIndexed).toLocaleString()
  })
}
es.onerror = () => {
  document.getElementById('live-indicator').innerHTML = '<span class="dot" style="background:var(--red)"></span>disconnected'
}

function eventHtml(ev) {
  const t = new Date(ev.ts).toLocaleTimeString()
  return \`<span class="ts">[\${t}]</span><span class="badge \${ev.type}">\${ev.type}</span><span class="file">\${ev.file}\${ev.chunks !== undefined ? ' <span style="color:var(--muted)">(\${ev.chunks} chunks)</span>' : ''}</span>\`
}

async function runSearch() {
  const q = document.getElementById('search-input').value.trim()
  if (!q) return
  const btn = document.querySelector('.search-box button')
  btn.textContent = '...'
  btn.disabled = true
  try {
    const res = await fetch('/api/search?q=' + encodeURIComponent(q))
    const results = await res.json()
    const container = document.getElementById('search-results')
    if (!results.length) { container.innerHTML = '<div style="color:var(--muted)">No results found.</div>'; return }
    container.innerHTML = results.map(r => \`
      <div class="result-card">
        <div class="result-header">
          <span class="path">\${r.filepath} :\${r.startLine}-\${r.endLine}</span>
          <span class="score">score: \${r.score.toFixed(3)}</span>
        </div>
        <pre>\${escHtml(r.content)}</pre>
      </div>
    \`).join('')
  } finally {
    btn.textContent = 'Search'
    btn.disabled = false
  }
}

document.getElementById('search-input').addEventListener('keydown', e => { if (e.key === 'Enter') runSearch() })

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}
</script>
</body>
</html>`
}

function eventHtml(e: ActivityEvent): string {
  const t = new Date(e.ts).toLocaleTimeString()
  const chunks = e.chunks !== undefined ? ` (${e.chunks} chunks)` : ''
  return `<div class="event"><span class="ts">[${t}]</span><span class="badge ${e.type}">${e.type}</span><span class="file">${e.file}${chunks}</span></div>`
}

export function startDashboard(db: Database.Database, projectRoot: string, embeddingsConfig: any, searchConfig: any, port: number) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`)

    if (url.pathname === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      })
      // Send existing log on connect
      for (const event of [...activityLog].reverse()) {
        res.write(`data: ${JSON.stringify(event)}\n\n`)
      }
      sseClients.add(res)
      req.on('close', () => sseClients.delete(res))
      return
    }

    if (url.pathname === '/api/stats') {
      const stats = getStats(db)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(stats))
      return
    }

    if (url.pathname === '/api/search') {
      const query = url.searchParams.get('q') ?? ''
      if (!query) { res.writeHead(400); res.end('[]'); return }
      try {
        const { searchCode } = await import('../search/search.js')
        const results = await searchCode(db, query, embeddingsConfig, searchConfig)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(results))
      } catch (err) {
        res.writeHead(500)
        res.end(JSON.stringify({ error: String(err) }))
      }
      return
    }

    if (url.pathname === '/api/files') {
      const files = getFiles(db)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(files))
      return
    }

    // Default: serve dashboard HTML
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html(db, projectRoot))
  })

  server.listen(port, '127.0.0.1')

  return server
}
