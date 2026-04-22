export function renderSearchTab(): string {
  return `
  <div id="tab-search" class="tab">
    <div class="search-wrap">
      <span class="icon">⌕</span>
      <input id="search-input" type="text" placeholder="how does authentication work?" autocomplete="off" />
      <button id="search-btn" onclick="runSearch()">search</button>
    </div>
    <div id="search-results"></div>
  </div>`
}
