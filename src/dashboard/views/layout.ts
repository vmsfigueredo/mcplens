import type { Db } from '../../indexer/database.js'
import { getStyles } from './styles.js'
import { getClientScript } from './client.js'
import { renderOverviewTab } from './overview.js'
import { renderActivityTab } from './activity.js'
import { renderSearchTab } from './search.js'
import { renderSearchesTab } from './searches.js'
import { renderFilesTab } from './files.js'
import { getStats, getFiles } from '../queries.js'
import { activityLog, getIndexing } from '../events.js'

export function renderPage(db: Db, projectRoot: string): string {
  const stats = getStats(db, projectRoot, getIndexing())
  const files = getFiles(db)

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>mcplens / ${projectRoot.split('/').pop()}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&family=IBM+Plex+Sans:wght@300;400;500&display=swap" rel="stylesheet">
<style>${getStyles()}</style>
</head>
<body>

<header>
  <div class="header-brand">
    <span class="brand-prefix">mcplens</span>
  </div>
  <div class="header-sep"></div>
  <span class="header-path">${projectRoot}</span>
  <div class="header-right">
    <div id="indexing-badge" class="indexing-badge${stats.indexing ? ' visible' : ''}">
      <div class="spinner"></div>indexing
    </div>
    <div id="live-indicator">
      <div class="pulse-dot" id="live-dot"></div>
      <span id="live-text">live</span>
    </div>
  </div>
</header>

<nav>
  <button class="active" onclick="switchTab('overview', this)">overview</button>
  <button onclick="switchTab('activity', this)">activity</button>
  <button onclick="switchTab('searches', this)">searches</button>
  <button onclick="switchTab('search', this)">search</button>
  <button onclick="switchTab('files', this)">files</button>
</nav>

<main>
  ${renderOverviewTab(stats, activityLog)}
  ${renderActivityTab(activityLog)}
  ${renderSearchesTab(activityLog)}
  ${renderSearchTab()}
  ${renderFilesTab(files)}
</main>

<script>${getClientScript()}</script>
</body>
</html>`
}
