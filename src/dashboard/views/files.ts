import { escHtml } from '../utils.js'

interface FileRow {
  filepath: string
  indexed_at: number
  chunk_count: number
}

export function renderFilesTab(files: FileRow[]): string {
  const rows = files.map(f => `<tr class="file-row" data-path="${escHtml(f.filepath.toLowerCase())}">
    <td class="filepath">${escHtml(f.filepath)}</td>
    <td class="chunks-cell">${f.chunk_count}</td>
    <td class="date-cell">${new Date(f.indexed_at).toLocaleString()}</td>
  </tr>`).join('')

  return `
  <div id="tab-files" class="tab">
    <div class="table-wrap">
      <div class="table-toolbar">
        <input class="table-filter" id="file-filter" type="text" placeholder="filter files…" oninput="filterFiles()" />
        <span class="table-count" id="file-count">${files.length} files</span>
      </div>
      <table>
        <thead><tr><th>File</th><th>Chunks</th><th>Indexed at</th></tr></thead>
        <tbody id="files-tbody">${rows}</tbody>
      </table>
    </div>

    <div id="chunks-modal" class="modal" hidden>
      <div class="modal-backdrop" data-close></div>
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="chunks-title">
        <header class="modal-header">
          <h2 id="chunks-title"></h2>
          <button id="chunks-close" class="modal-close" data-close aria-label="Close">×</button>
        </header>
        <div id="chunks-body" class="modal-body"></div>
      </div>
    </div>
  </div>`
}
