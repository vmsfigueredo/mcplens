# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A local MCP server that gives Claude Code semantic search over any codebase. Instead of reading files heuristically, Claude Code calls `search_code("how does X work?")` and gets
back only the most relevant chunks, reducing token usage ~75–90%.

## Commands

```bash
# Build TypeScript → dist/
npm run build

# Run MCP server directly (for testing outside Claude Code)
npm run start

# Dev mode with auto-restart on dist/ changes
npm run dev

# Initialize in a target project (run from that project's directory)
mcplens init

# Start MCP server manually against a project
mcplens start
```

The project has no test suite yet. TypeScript strict mode is enforced — `tsc` with no errors is the correctness check.

## Source layout

The compiled output lives in `dist/` (mirrors `src/`). The current source files are scaffolded flat at root but `tsconfig.json` expects them under `src/`:

```
src/
  mcp/server.ts        ← MCP server entry; spawned by Claude Code via stdio
  indexer/
    embeddings.ts      ← Ollama / OpenAI embedding abstraction + cosine similarity
    chunker.ts         ← Sliding-window chunker (60 lines, 15-line overlap)
    database.ts        ← SQLite schema + CRUD (chunks table + file_hashes table)
    indexer.ts         ← Delta indexing: hash-compare, chunk, embed, upsert
  search/search.ts     ← Semantic search (in-process cosine scan) + symbol lookup
  watcher/watcher.ts   ← chokidar watcher → re-indexes changed files live
  config/config.ts     ← Loads .mcplens/config.json with defaults
bin/cli.js             ← CLI entry (init | start); writes ~/.claude.json
```

## Architecture flow

1. **`init`** writes `.mcplens/config.json`, adds `.mcplens/` to `.gitignore`, and registers the MCP server in the chosen AI coding assistant configs.
2. **On AI coding assistant startup**, the MCP server (`server.ts`) is spawned via stdio, loads config, opens SQLite at `.mcplens/index.db`, runs delta indexing (skips files with
   matching SHA-1 hash), and starts the chokidar watcher.
3. **Embeddings** are fetched per chunk via Ollama (default: `nomic-embed-text`) or OpenAI. Stored as JSON float arrays in SQLite — no native vector extensions required.
4. **`search_code`** embeds the query, loads all chunks from SQLite, scores by cosine similarity in-process, filters by `minScore` (default 0.3), returns top K (default 5).
5. **`get_symbol`** does SQL `LIKE` pattern matching against known declaration keywords (class, function, interface, trait, enum, const, def).

## Known limitations / planned work

- **Chunker** uses AST-based chunking for TS, TSX, JS, PHP, Python (via native `tree-sitter` + grammar packages). Svelte, Go, Rust, Ruby, Vue, YAML, SQL, JSON, CSS, MD fall back to
  the sliding-window chunker.
- **Search** loads all embeddings into memory on every query — acceptable up to ~20k chunks. For larger projects, the comment in `search.ts` points to `sqlite-vec` as the upgrade
  path.
- **Dashboard** is live at `http://localhost:3333` while the MCP server runs (Overview / Activity / Search / Files tabs, SSE for real-time updates).
- **Docker** distribution (bundling Node + Ollama + model) is planned but not implemented.

## Configuration

Target project's `.mcplens/config.json`:

```json
{
  "embeddings": {
    "provider": "ollama",
    "ollamaUrl": "http://localhost:11434",
    "ollamaModel": "nomic-embed-text"
  },
  "search": {
    "topK": 5,
    "minScore": 0.3
  },
  "ignore": [
    "**/tests/fixtures/**"
  ]
}
```

Switch to OpenAI by changing `provider` to `"openai"` and adding `"openaiApiKey"`.

<!-- mcplens-context-block -->
## Context Search (mcplens)

**MANDATORY — follow these rules before touching any file:**

1. ALWAYS call `search_code()` first for any query, conceptual or exact.
   Examples: "how does authentication work", "where is the payment logic", "UserService"
2. Use `get_symbol()` only when `search_code()` returns no results for an exact name.
3. Reading files directly (without first searching) is NOT allowed.
   Only open a full file if both tools returned insufficient context.
4. Never browse the file tree to find things — use `search_code()` instead.

This rule exists to reduce token usage. Violating it defeats the purpose of mcplens.
