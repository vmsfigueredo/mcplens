export function getStyles(): string {
  return `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0 }

:root {
  --bg: #0e0f0f;
  --surface: #141515;
  --surface2: #1a1b1b;
  --border: #252727;
  --border2: #2e3030;
  --text: #d4cfc9;
  --muted: #5a5955;
  --muted2: #7a7672;
  --accent: #a8c97f;
  --accent-dim: #6a8a4a;
  --accent-glow: rgba(168, 201, 127, 0.08);
  --amber: #c9a05a;
  --red: #c96060;
  --red-dim: #7a3030;
  --blue: #7fa8c9;
  --mono: 'IBM Plex Mono', 'Cascadia Code', monospace;
  --sans: 'IBM Plex Sans', system-ui, sans-serif;
}

html { font-size: 13px; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--mono);
  min-height: 100dvh;
}

/* Grain overlay */
body::before {
  content: '';
  position: fixed; inset: 0; pointer-events: none; z-index: 100;
  opacity: 0.025;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
  background-repeat: repeat;
  background-size: 128px;
}

/* ── HEADER ─────────────────────────────────────────── */
header {
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  padding: 0 28px;
  height: 52px;
  display: flex;
  align-items: center;
  gap: 0;
  position: sticky;
  top: 0;
  z-index: 50;
}

.header-brand {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-right: 24px;
}

.brand-prefix {
  font-size: 0.72rem;
  color: var(--muted);
  text-transform: uppercase;
}

.brand-name {
  font-size: 0.88rem;
  color: var(--accent);
  font-weight: 500;
}

.header-sep {
  width: 1px;
  height: 20px;
  background: var(--border);
  margin: 0 18px;
}

.header-path {
  font-size: 0.75rem;
  color: var(--muted2);
  font-family: var(--mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 420px;
  flex: 1;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-left: auto;
}

#live-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.72rem;
  color: var(--muted2);
}

.pulse-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--accent);
  animation: pulse-fade 2.4s ease-out infinite;
}

.pulse-dot.dead {
  background: var(--red);
  animation: none;
}

@keyframes pulse-fade {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.indexing-badge {
  display: none;
  align-items: center;
  gap: 7px;
  background: rgba(168,201,127,0.06);
  color: var(--accent);
  font-size: 0.72rem;
  padding: 4px 10px;
  border-radius: 3px;
  border: 1px solid rgba(168,201,127,0.18);
}
.indexing-badge.visible { display: flex; }

@keyframes spin { to { transform: rotate(360deg) } }
.spinner {
  width: 9px; height: 9px;
  border: 1.5px solid rgba(168,201,127,0.2);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
}

/* ── NAV ─────────────────────────────────────────────── */
nav {
  display: flex;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  padding: 0 28px;
  gap: 0;
}

nav button {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  padding: 11px 16px;
  font: inherit;
  font-size: 0.78rem;
  border-bottom: 2px solid transparent;
  transition: color 0.12s, border-color 0.12s;
  position: relative;
}

nav button:hover { color: var(--text); }
nav button.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}

/* ── MAIN ─────────────────────────────────────────────── */
main {
  padding: 28px;
  max-width: 1100px;
  animation: fade-up 0.35s ease both;
}

@keyframes fade-up {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}

.tab { display: none; }
.tab.active { display: block; }

/* ── STAT CARDS ───────────────────────────────────────── */
.cards {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 1px;
  background: var(--border);
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 28px;
}

@media (max-width: 900px) { .cards { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 600px) { .cards { grid-template-columns: repeat(2, 1fr); } }

.card {
  background: var(--surface);
  padding: 20px 22px;
  position: relative;
  transition: background 0.15s;
}

.card:hover { background: var(--surface2); }

.card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: var(--accent-dim);
  opacity: 0;
  transition: opacity 0.2s;
}

.card:hover::before { opacity: 1; }

.card .label {
  font-size: 0.68rem;
  color: var(--muted);
  text-transform: uppercase;
  margin-bottom: 10px;
  font-family: var(--sans);
  font-weight: 500;
}

.card .value {
  font-size: 1.9rem;
  color: var(--text);
  font-weight: 300;
  line-height: 1;
}

.card .value-sm {
  font-size: 1rem;
  color: var(--text);
  font-weight: 400;
  line-height: 1.3;
  margin-top: 2px;
}

.card .unit {
  font-size: 0.72rem;
  color: var(--muted2);
  margin-left: 4px;
  font-weight: 300;
}

/* ── SECTION HEADER ───────────────────────────────────── */
.section-label {
  font-size: 0.68rem;
  color: var(--muted);
  text-transform: uppercase;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-label::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border);
}

/* ── ACTIVITY FEED ────────────────────────────────────── */
#activity-feed {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  max-height: 560px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--border2) transparent;
}

.event {
  padding: 7px 16px;
  border-bottom: 1px solid var(--border);
  display: flex;
  gap: 12px;
  align-items: baseline;
  font-size: 0.78rem;
  transition: background 0.1s;
}

.event:last-child { border-bottom: none; }
.event:hover { background: var(--surface2); }
.event-new { position: relative; }
.event-new::after {
  content: '';
  position: absolute; inset: 0;
  background: rgba(168,201,127,0.08);
  animation: flash-in 0.4s ease both;
  pointer-events: none;
}

@keyframes flash-in {
  from { opacity: 1; }
  to   { opacity: 0; }
}

.event .ts {
  color: var(--muted);
  white-space: nowrap;
  flex-shrink: 0;
  font-size: 0.72rem;
}

.event .badge {
  padding: 2px 7px;
  border-radius: 2px;
  font-size: 0.66rem;
  flex-shrink: 0;
  text-transform: uppercase;
  font-family: var(--sans);
  font-weight: 500;
}

.badge.indexed  { background: rgba(168,201,127,0.1); color: var(--accent); }
.badge.removed  { background: rgba(201,96,96,0.12);  color: var(--red);    }
.badge.startup  { background: rgba(127,168,201,0.1); color: var(--blue);   }
.badge.search   { background: rgba(201,160,90,0.12); color: var(--amber);  }
.badge.symbol   { background: rgba(168,201,127,0.1); color: var(--accent); }

.event .file { color: var(--text); word-break: break-all; }
.event .chunks { color: var(--muted2); margin-left: 4px; }
.event .query { color: var(--text); font-family: var(--mono); font-size: 0.8rem; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.event .session-chip { font-size: 0.65rem; font-family: var(--sans); padding: 1px 5px; border-radius: 2px; background: var(--surface2); color: var(--muted2); border: 1px solid var(--border); flex-shrink: 0; }
.event .result-count { color: var(--muted2); font-size: 0.72rem; flex-shrink: 0; white-space: nowrap; }
.event .latency { color: var(--muted); font-size: 0.72rem; flex-shrink: 0; white-space: nowrap; }

/* ── SEARCH ───────────────────────────────────────────── */
.search-wrap {
  position: relative;
  margin-bottom: 20px;
}

.search-wrap .icon {
  position: absolute;
  left: 14px; top: 50%;
  transform: translateY(-50%);
  color: var(--muted);
  font-size: 0.9rem;
  pointer-events: none;
}

#search-input {
  width: 100%;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 11px 120px 11px 40px;
  color: var(--text);
  font: inherit;
  font-size: 0.85rem;
  transition: border-color 0.15s, box-shadow 0.15s;
}

#search-input::placeholder { color: var(--muted); }

#search-input:focus {
  outline: 2px solid var(--accent-dim);
  outline-offset: 1px;
  border-color: var(--accent-dim);
}

#search-btn {
  position: absolute;
  right: 6px; top: 50%;
  transform: translateY(-50%);
  background: rgba(168,201,127,0.12);
  color: var(--accent);
  border: 1px solid rgba(168,201,127,0.2);
  border-radius: 4px;
  padding: 6px 14px;
  cursor: pointer;
  font: inherit;
  font-size: 0.76rem;
  transition: background 0.15s, border-color 0.15s;
}

#search-btn:hover { background: rgba(168,201,127,0.2); border-color: rgba(168,201,127,0.35); }
#search-btn:disabled { opacity: 0.5; cursor: default; }

#search-results { display: flex; flex-direction: column; gap: 10px; }

.result-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 5px;
  overflow: hidden;
  animation: fade-up 0.2s ease both;
}

.result-header {
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--surface2);
}

.result-header .path { color: var(--accent); font-size: 0.78rem; }
.result-header .lines { color: var(--muted2); font-size: 0.72rem; margin-left: 8px; }
.result-score {
  font-size: 0.72rem;
  color: var(--amber);
  display: flex;
  align-items: center;
  gap: 5px;
}

.score-bar {
  width: 40px; height: 3px;
  background: var(--border2);
  border-radius: 2px;
  overflow: hidden;
}

.score-fill {
  height: 100%;
  background: var(--amber);
  border-radius: 2px;
}

.result-card pre {
  padding: 12px 14px;
  overflow-x: auto;
  font-size: 0.75rem;
  line-height: 1.6;
  color: var(--muted2);
  scrollbar-width: thin;
  scrollbar-color: var(--border2) transparent;
}

/* ── FILES TABLE ──────────────────────────────────────── */
.table-wrap {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}

.table-toolbar {
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 10px;
}

.table-filter {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 5px 10px;
  color: var(--text);
  font: inherit;
  font-size: 0.78rem;
  flex: 1;
  max-width: 300px;
}

.table-filter::placeholder { color: var(--muted); }
.table-filter:focus { outline: none; border-color: var(--accent-dim); }

.table-count {
  font-size: 0.72rem;
  color: var(--muted);
  margin-left: auto;
}

table { width: 100%; border-collapse: collapse; }

th {
  text-align: left;
  padding: 9px 16px;
  color: var(--muted);
  font-weight: 400;
  border-bottom: 1px solid var(--border);
  font-size: 0.72rem;
  text-transform: uppercase;
  background: var(--surface2);
  font-family: var(--sans);
}

td {
  padding: 7px 16px;
  border-bottom: 1px solid var(--border);
  font-size: 0.78rem;
}

tr:last-child td { border-bottom: none; }
tr.file-row { cursor: pointer; }
tr.file-row:hover td { background: var(--surface2); }

td.filepath { color: var(--accent); word-break: break-all; }
td.chunks-cell { color: var(--muted2); font-size: 0.75rem; }
td.date-cell { color: var(--muted); font-size: 0.72rem; }

/* ── EMPTY STATES ─────────────────────────────────────── */
.empty-state {
  padding: 48px 24px;
  text-align: center;
  color: var(--muted);
  font-size: 0.82rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.empty-icon {
  font-size: 1.6rem;
  opacity: 0.4;
}

.empty-action {
  background: none;
  border: 1px solid var(--border2);
  border-radius: 3px;
  color: var(--muted2);
  cursor: pointer;
  font: inherit;
  font-size: 0.78rem;
  padding: 5px 12px;
  margin-top: 4px;
  transition: border-color 0.15s, color 0.15s;
}

.empty-action:hover {
  border-color: var(--accent-dim);
  color: var(--accent);
}

/* ── CHUNKS MODAL ─────────────────────────────────────── */
.modal {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: 24px;
}

.modal[hidden] { display: none; }

.modal-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.72);
  cursor: pointer;
}

.modal-card {
  position: relative;
  background: var(--surface);
  border: 1px solid var(--border2);
  border-radius: 8px;
  width: 100%;
  max-width: 860px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
}

.modal-header {
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--surface2);
  flex-shrink: 0;
}

.modal-header h2 {
  font-size: 0.8rem;
  font-weight: 400;
  color: var(--accent);
  word-break: break-all;
  flex: 1;
}

.modal-close {
  background: none;
  border: 1px solid var(--border2);
  border-radius: 3px;
  color: var(--muted2);
  cursor: pointer;
  font: inherit;
  font-size: 1rem;
  line-height: 1;
  padding: 2px 8px;
  flex-shrink: 0;
  transition: border-color 0.12s, color 0.12s;
}

.modal-close:hover { border-color: var(--accent-dim); color: var(--accent); }

.modal-body {
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  scrollbar-width: thin;
  scrollbar-color: var(--border2) transparent;
}

.chunk-item {
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 5px;
  overflow: hidden;
}

.chunk-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  padding: 0 8px 0 0;
}

.chunk-range {
  padding: 5px 12px;
  font-size: 0.68rem;
  color: var(--muted2);
  font-family: var(--sans);
}

.chunk-copy-btn {
  font-size: 0.63rem;
  font-family: var(--mono);
  color: var(--muted2);
  background: none;
  border: 1px solid var(--border2);
  border-radius: 3px;
  padding: 2px 7px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}
.chunk-copy-btn:hover {
  color: var(--fg);
  border-color: var(--muted2);
}

.chunk-code {
  margin: 0;
  padding: 10px 12px;
  font-size: 0.73rem;
  line-height: 1.65;
  color: var(--muted2);
  overflow-x: auto;
  white-space: pre;
  scrollbar-width: thin;
  scrollbar-color: var(--border2) transparent;
}

.modal-loading {
  padding: 32px;
  text-align: center;
  color: var(--muted);
  font-size: 0.8rem;
}

.modal-error {
  padding: 20px;
  color: var(--red);
  font-size: 0.8rem;
  text-align: center;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
  }
}
`
}
