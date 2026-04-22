# mcplens

> Semantic codebase search for AI coding assistants — 70-85% token reduction, 100% local, zero cloud dependency.

AI coding assistants like Claude Code, Cursor, and Codex are powerful — but they have a fundamental problem: when you ask a question, they read files by guessing which ones are
relevant based on path and filename heuristics. On a medium-sized project, a single query can consume 10,000–20,000 tokens of context just loading files that may not even be
relevant.

`claude-context-optimizer` solves this by giving your AI assistant **semantic search** over your codebase. Instead of reading files blindly, it calls
`search_code("how does payment work?")` and gets back only the 5 most relevant code chunks — indexed locally using embeddings, stored in SQLite, zero data leaving your machine.

---

## How it works

When you open your AI assistant in a project:

1. The MCP server starts automatically (spawned via stdio by the assistant)
2. It compares file hashes against the last index and **re-indexes only what changed** (delta indexing)
3. A file watcher keeps the index in sync as you code
4. Your assistant now has access to 3 semantic search tools instead of reading raw files

```
You ask: "how does the Asaas webhook work?"

Without cco:                          With cco:
  Read AsaasWebhookController.php       search_code("asaas webhook")
  Read AsaasWebhookService.php          → returns 5 relevant chunks
  Read PaymentService.php               → ~800 tokens total
  Read BillingModule.php
  Read ...8 more files
  → ~15,000 tokens total
```

### Under the hood

* **Embeddings:**[Ollama](https://ollama.ai/) with `nomic-embed-text` (768-dim) — 100% local, free, no API key
* **Vector store:** SQLite with cosine similarity computed in-process — no extra infrastructure
* **Chunking:** AST-aware via `tree-sitter` (splits by function/class) with sliding window fallback
* **Transport:** MCP stdio — the assistant spawns the process and communicates via pipe
* **Persistence:** Index lives in `.claude-context/index.db` and survives between sessions

---

## Compatibility

`claude-context-optimizer` works with **any MCP-compatible AI coding assistant**. MCP (Model Context Protocol) is an open standard — the same server works across all clients
without modification.

| Assistant      | Status | Config location                       |
|----------------|--------|---------------------------------------|
| Claude Code    | ✅      | `~/.claude.json`                      |
| Cursor         | ✅      | `.cursor/mcp.json`                    |
| Windsurf       | ✅      | `~/.codeium/windsurf/mcp_config.json` |
| Trae           | ✅      | `.vscode/settings.json`               |
| Codex          | ✅      | MCP config (preview)                  |
| Any MCP client | ✅      | Follows MCP stdio spec                |

The `init` command detects which assistants you use and registers the server automatically in the right place.

---

## Token savings

The index lives locally. The assistant fetches only what's relevant. The numbers speak for themselves:

| Project size | Without cco         | With cco            | Savings   |
|--------------|---------------------|---------------------|-----------|
| \~200 files  | \~5k tokens/query   | \~1.2k tokens/query | **\~75%** |
| \~1000 files | \~10k tokens/query  | \~1.5k tokens/query | **\~85%** |
| \~5000 files | \~20k+ tokens/query | \~2k tokens/query   | **\~90%** |

These are context tokens — the portion you control. Savings scale with project size because larger projects trigger more heuristic file reads by default.

---

## Tools exposed

| Tool                 | When to use                                                                      |
|----------------------|----------------------------------------------------------------------------------|
| `search_code(query)` | Conceptual queries:*"how does billing work"*,*"where is authentication handled"* |
| `get_symbol(name)`   | Exact lookups:*"find PaymentService"*,*"where is handleWebhook defined"*         |
| `index_status`       | Debug: how many files and chunks are currently indexed                           |

Add this to your project's `CLAUDE.md` (or equivalent) to guide the assistant:

```markdown
## Context Search

Always use MCP tools before reading files:

- search_code() — for conceptual or natural language queries
- get_symbol() — for exact class/function/method lookups
  Only read full files if both tools return insufficient context.
```

---

## Installation options

### Option A — npm (requires Ollama)

Zero overhead. Best for developers who already have Ollama installed.

```bash
npm install -g @vmsfigueredo/mcplens
ollama pull nomic-embed-text:latest
cd your-project && mcplens init
```

See [INSTALL.md](INSTALL.md) for full setup instructions.

### Option B — Docker

> **Not available yet.** Docker distribution (bundling Node + Ollama + model) is planned but not implemented. Track progress in the [Roadmap](#roadmap).

---

## Configuration

`.claude-context/config.json` is created automatically by `init`. Edit it to customize behavior:

```json
{
  "embeddings": {
    "provider": "ollama",
    "ollamaUrl": "http://localhost:11434",
    "ollamaModel": "nomic-embed-text:latest"
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

To use OpenAI embeddings instead:

```json
{
  "embeddings": {
    "provider": "openai",
    "openaiApiKey": "sk-...",
    "openaiModel": "text-embedding-3-small"
  }
}
```

---

## What gets indexed

**Included by default:**`.ts .tsx .js .jsx .mjs .php .svelte .vue .py .rb .go .rs .css .scss .json .yaml .yml .md .sql`

**Ignored by default:**`node_modules`, `.git`, `vendor`, `dist`, `build`, `.next`, `.claude-context`

The `.claude-context/` directory is automatically added to `.gitignore`.

### Index size reference

| Project | Files        | Approx size |
|---------|--------------|-------------|
| Small   | \~200 files  | \~15 MB     |
| Medium  | \~1000 files | \~70 MB     |
| Large   | \~5000 files | \~350 MB    |

---

## Dashboard

A lightweight web dashboard is available at `http://localhost:3000` while the server is running:

* **Overview** — files indexed, chunks, index size, Ollama status
* **Activity** — live feed of re-indexing events
* **Search** — test queries manually and see scores (useful for calibrating `minScore`)
* **Files** — full list of indexed files with chunk counts

The dashboard runs on port `3333` by default. If that port is already taken (e.g. two projects open simultaneously), the port is automatically calculated from the project name. To
open:

```bash
mcplens dashboard
```

To disable: add `--no-dashboard` to the server args in your MCP config.

---

## Privacy

Everything runs on your machine:

* Embeddings are generated locally via Ollama — your code never leaves
* The index is stored in `.claude-context/index.db` in your project
* No telemetry, no analytics, no accounts

> ⚠️ If you use the OpenAI embeddings option, chunks are sent to OpenAI's API.

---

## Why not just use existing tools?

| Tool                         | Language    | Fully local?                     | Install friction                     |
|------------------------------|-------------|----------------------------------|--------------------------------------|
| `claude-context`(Zilliz)     | TypeScript  | ❌ requires Zilliz Cloud + OpenAI | Medium                               |
| `claude-context-local`       | Python      | ✅                                | High (torch, FAISS, pipx)            |
| `cocoindex-code`             | Python      | ✅                                | Medium (pipx, sentence-transformers) |
| `codegraph`                  | Rust        | ✅                                | High (must compile Rust)             |
| **@vmsfigueredo/mcplens**    | **Node.js** | **✅**                            | **Low (`npm install -g`)**           |

The goal is to be the **most accessible option for JS/TS developers** — not the most feature-complete. If you already have Node.js, you're one command away.

---

## Roadmap

* [X]  AST-based chunking via tree-sitter
* [X]  Delta indexing by file hash
* [X]  Real-time file watcher
* [X]  Dashboard
* [X]  Multi-client init (Claude Code, Cursor, Windsurf, Trae)
* [X]  Hybrid search (BM25 + semantic)
* [ ]  Docker option with bundled Ollama
* [ ]  Contextual retrieval (LLM-generated chunk summaries)
* [ ]  Token usage analytics via Claude Code hooks

---

## Contributing

PRs welcome. See [INSTALL.md](INSTALL.md) for local development setup.

## Built with

This project was built using Claude Code — which is exactly why it exists.

## License

MIT
