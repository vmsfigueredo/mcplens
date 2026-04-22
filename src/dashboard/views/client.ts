export function getClientScript(): string {
  return `
function switchTab(id, btn) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'))
  document.getElementById('tab-' + id).classList.add('active')
  btn.classList.add('active')
  if (id === 'files') _filesInit()
}

// ── FILES PAGINATION ───────────────────────────────────
const FILES_PER_PAGE = 50
let _filesPage = 0
let _filesFiltered = []

function _filesInit() {
  _filesFiltered = window.__files || []
  _filesPage = 0
  _filesRender()
}

function filesFilterChange() {
  const q = document.getElementById('file-filter').value.toLowerCase()
  _filesFiltered = (window.__files || []).filter(f => !q || f.p.toLowerCase().includes(q))
  _filesPage = 0
  _filesRender()
}

function _filesRender() {
  const tbody = document.getElementById('files-tbody')
  const pagination = document.getElementById('files-pagination')
  const total = _filesFiltered.length
  const totalPages = Math.max(1, Math.ceil(total / FILES_PER_PAGE))
  if (_filesPage >= totalPages) _filesPage = totalPages - 1

  const start = _filesPage * FILES_PER_PAGE
  const slice = _filesFiltered.slice(start, start + FILES_PER_PAGE)

  tbody.innerHTML = slice.map(f =>
    \`<tr class="file-row" data-path="\${escHtml(f.p.toLowerCase())}">
      <td class="filepath">\${escHtml(f.p)}</td>
      <td class="chunks-cell">\${f.c}</td>
      <td class="date-cell">\${escHtml(f.t)}</td>
    </tr>\`
  ).join('')

  document.getElementById('file-count').textContent = total + ' files'

  if (totalPages <= 1) {
    pagination.innerHTML = ''
    return
  }

  const showing = \`<span class="page-info">showing \${start + 1}–\${Math.min(start + FILES_PER_PAGE, total)} of \${total}</span>\`
  const prev = _filesPage > 0
    ? \`<button class="page-btn" onclick="_filesGo(\${_filesPage - 1})">← prev</button>\`
    : \`<button class="page-btn" disabled>← prev</button>\`
  const next = _filesPage < totalPages - 1
    ? \`<button class="page-btn" onclick="_filesGo(\${_filesPage + 1})">next →</button>\`
    : \`<button class="page-btn" disabled>next →</button>\`
  const pages = Array.from({ length: totalPages }, (_, i) => {
    const active = i === _filesPage ? ' active' : ''
    return \`<button class="page-btn page-num\${active}" onclick="_filesGo(\${i})">\${i + 1}</button>\`
  }).join('')

  pagination.innerHTML = \`\${prev}\${pages}\${next}\${showing}\`
}

function _filesGo(page) {
  _filesPage = page
  _filesRender()
  document.getElementById('tab-files').querySelector('.table-wrap').scrollTop = 0
}

// SSE
const feed = document.getElementById('activity-feed')
const feedOverview = document.getElementById('activity-feed-overview')
const searchesFeed = document.getElementById('searches-feed')
const es = new EventSource('/events')

es.onmessage = (e) => {
  const ev = JSON.parse(e.data)
  if (ev.type === '__indexing__') {
    document.getElementById('indexing-badge').classList.toggle('visible', ev.value)
    return
  }

  const isSearchEvent = ev.type === 'search' || ev.type === 'symbol'

  if (isSearchEvent) {
    const placeholder = searchesFeed.querySelector('.empty-state')
    if (placeholder) placeholder.remove()
    const div = document.createElement('div')
    div.innerHTML = eventHtmlStr(ev, true)
    searchesFeed.insertBefore(div.firstElementChild, searchesFeed.firstChild)
    return
  }

  const placeholder = feed.querySelector('.empty-state')
  if (placeholder) placeholder.remove()
  const placeholderOv = feedOverview.querySelector('.empty-state')
  if (placeholderOv) placeholderOv.remove()

  const div = document.createElement('div')
  div.innerHTML = eventHtmlStr(ev, true)
  const node = div.firstElementChild
  feed.insertBefore(node, feed.firstChild)

  const div2 = document.createElement('div')
  div2.innerHTML = eventHtmlStr(ev, true)
  feedOverview.insertBefore(div2.firstElementChild, feedOverview.firstChild)
  const ovRows = feedOverview.querySelectorAll('.event')
  if (ovRows.length > 20) ovRows[ovRows.length - 1].remove()

  fetch('/api/stats').then(r => r.json()).then(s => {
    document.getElementById('stat-files').textContent = s.files
    document.getElementById('stat-chunks').textContent = s.chunks
    document.getElementById('stat-size-val').innerHTML = (s.dbSize / 1024 / 1024).toFixed(1) + '<span class="unit">MB</span>'
    if (s.lastIndexed) document.getElementById('stat-last').textContent = new Date(s.lastIndexed).toLocaleString()
    document.getElementById('stat-sessions').textContent = s.sessions
    document.getElementById('indexing-badge').classList.toggle('visible', !!s.indexing)
  })
}

es.onerror = () => {
  const dot = document.getElementById('live-dot')
  const txt = document.getElementById('live-text')
  dot.className = 'pulse-dot dead'
  txt.textContent = 'offline'
  txt.style.color = 'var(--red)'
}

// Keep in sync with eventHtml() in events.ts
function eventHtmlStr(ev, isNew) {
  const t = new Date(ev.ts).toLocaleTimeString()
  const cls = isNew ? 'event event-new' : 'event'
  if (ev.type === 'search' || ev.type === 'symbol') {
    const latency = \`<span class="latency">\${ev.latencyMs}ms</span>\`
    const session = \`<span class="session-chip">\${escHtml(ev.sessionId)}</span>\`
    const count = \`<span class="result-count">\${ev.results} result\${ev.results !== 1 ? 's' : ''}</span>\`
    return \`<div class="\${cls}"><span class="ts">\${t}</span><span class="badge \${ev.type}">\${ev.type}</span>\${session}<span class="query">\${escHtml(ev.query)}</span>\${count}\${latency}</div>\`
  }
  const chunksHtml = ev.chunks !== undefined
    ? \`<span class="chunks">·\${ev.chunks} chunks</span>\`
    : ''
  return \`<div class="\${cls}"><span class="ts">\${t}</span><span class="badge \${ev.type}">\${ev.type}</span><span class="file">\${escHtml(ev.file)}\${chunksHtml}</span></div>\`
}

async function runSearch() {
  const q = document.getElementById('search-input').value.trim()
  if (!q) return
  const btn = document.getElementById('search-btn')
  btn.textContent = '…'
  btn.disabled = true
  try {
    const res = await fetch('/api/search?q=' + encodeURIComponent(q))
    const results = await res.json()
    const container = document.getElementById('search-results')
    if (!results.length) {
      container.innerHTML = '<div class="empty-state"><span class="empty-icon">◌</span><span>No results found for that query.</span><button class="empty-action" onclick="document.getElementById(\\'search-input\\').focus()">Try another query</button></div>'
      return
    }
    container.innerHTML = results.map((r, i) => {
      const scoreW = Math.round(r.score * 100)
      return \`<div class="result-card" style="animation-delay:\${i * 0.05}s">
        <div class="result-header">
          <div>
            <span class="path">\${escHtml(r.filepath)}</span>
            <span class="lines">:\${r.startLine}–\${r.endLine}</span>
          </div>
          <div class="result-score">
            <div class="score-bar"><div class="score-fill" style="width:\${scoreW}%"></div></div>
            \${r.score.toFixed(3)}
          </div>
        </div>
        <pre>\${escHtml(r.content)}</pre>
      </div>\`
    }).join('')
  } finally {
    btn.textContent = 'search'
    btn.disabled = false
  }
}

document.getElementById('search-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') runSearch()
})

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

// ── CHUNKS MODAL ───────────────────────────────────────

const chunksModal = document.getElementById('chunks-modal')
const chunksTitle = document.getElementById('chunks-title')
const chunksBody = document.getElementById('chunks-body')
const chunksCloseBtn = document.getElementById('chunks-close')

async function openChunksModal(path) {
  chunksTitle.textContent = path
  chunksBody.innerHTML = '<div class="modal-loading">loading chunks…</div>'
  chunksModal.removeAttribute('hidden')
  chunksCloseBtn.focus()

  try {
    const res = await fetch('/api/files/chunks?path=' + encodeURIComponent(path))
    if (!res.ok) { chunksBody.innerHTML = '<div class="modal-error">Failed to load chunks.</div>'; return }
    const chunks = await res.json()
    if (!chunks.length) {
      chunksBody.innerHTML = '<div class="empty-state"><span class="empty-icon">◌</span><span>No chunks found for this file.</span></div>'
      return
    }
    chunksBody.innerHTML = ''
    for (const chunk of chunks) {
      const item = document.createElement('div')
      item.className = 'chunk-item'

      const header = document.createElement('div')
      header.className = 'chunk-header'

      const range = document.createElement('div')
      range.className = 'chunk-range'
      range.textContent = \`Lines \${chunk.start_line}–\${chunk.end_line}\`

      const copyBtn = document.createElement('button')
      copyBtn.className = 'chunk-copy-btn'
      copyBtn.textContent = 'copy'
      copyBtn.onclick = () => {
        const filename = path.split('/').pop()
        const prefixed = chunk.content.split('\\n').map(l => \`> \${l}\`).join('\\n')
        const text = \`\${filename}\\nlines \${chunk.start_line}-\${chunk.end_line}\\n\${prefixed}\`
        navigator.clipboard.writeText(text).then(() => {
          copyBtn.textContent = 'copied!'
          setTimeout(() => { copyBtn.textContent = 'copy' }, 1500)
        }).catch(() => {
          copyBtn.textContent = 'error'
          setTimeout(() => { copyBtn.textContent = 'copy' }, 1500)
        })
      }

      header.appendChild(range)
      header.appendChild(copyBtn)

      const code = document.createElement('pre')
      code.className = 'chunk-code'
      code.textContent = chunk.content  // textContent avoids XSS on raw source
      item.appendChild(header)
      item.appendChild(code)
      chunksBody.appendChild(item)
    }
  } catch {
    chunksBody.innerHTML = '<div class="modal-error">Error loading chunks.</div>'
  }
}

function closeChunksModal() {
  chunksModal.setAttribute('hidden', '')
  chunksBody.innerHTML = ''
}

document.addEventListener('click', e => {
  const target = e.target
  if (target.closest('[data-close]')) { closeChunksModal(); return }
  const row = target.closest('.file-row')
  if (row) openChunksModal(row.dataset.path)
})

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !chunksModal.hasAttribute('hidden')) closeChunksModal()
})
`
}
