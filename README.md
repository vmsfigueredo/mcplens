# claude-context-optimizer

Local MCP server that gives Claude Code **semantic search** over your codebase.

Instead of Claude Code reading dozens of files by heuristic, it calls `search_code("how does payment work?")` and gets back only the 5 most relevant chunks — saving tokens and improving response quality.

## How it works

1. On startup, indexes your codebase using [Ollama](https://ollama.ai) embeddings (100% local, free)
2. Stores chunks + vectors in a local SQLite file (`.claude-context/index.db`)
3. On subsequent startups, only re-indexes files that changed (delta by hash)
4. Watches for file changes during your session and re-indexes in real time
5. Exposes 3 tools to Claude Code via MCP stdio transport
6. Serves a live dashboard at `http://localhost:3333`

## Tools exposed

| Tool | What it does |
|---|---|
| `search_code(query)` | Semantic search — finds the most relevant chunks for a natural language query |
| `get_symbol(name)` | Exact lookup of a class, function, or interface by name |
| `index_status` | Shows how many files/chunks are indexed |

## Requirements

- Node.js 20+
- [Ollama](https://ollama.ai) installed and running

## Setup

```bash
# 1. Install globally
npm install -g claude-context-optimizer

# 2. Pull the embedding model (one-time, ~270MB)
ollama pull nomic-embed-text

# 3. Initialize in your project — this configures everything automatically
cd your-project
claude-context-optimizer init

# 4. Open Claude Code — done.
```

**That's it.** `init` writes the config, updates `.gitignore`, and registers the MCP server in `~/.claude.json` so Claude Code picks it up automatically on the next startup. No manual JSON editing required.

When Claude Code opens, the MCP server starts in the background, indexes your codebase (or skips unchanged files), and begins watching for changes in real time.

## Dashboard

While Claude Code is running, the dashboard is available at:

```
http://localhost:3333
```

| Tab | What it shows |
|---|---|
| **Overview** | Files indexed, total chunks, index size on disk, last indexed time |
| **Activity** | Live feed of file re-index events via SSE (updates without refresh) |
| **Search** | Test semantic queries and see similarity scores — useful for tuning `minScore` and `topK` |
| **Files** | Full list of indexed files with chunk count and last indexed timestamp |

The dashboard runs on `:3333` to avoid conflicts with common dev servers (`:3000`, `:8080`, etc).

## Configuration

Edit `.claude-context/config.json` to customize:

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

### Using OpenAI instead of Ollama

```json
{
  "embeddings": {
    "provider": "openai",
    "openaiApiKey": "sk-...",
    "openaiModel": "text-embedding-3-small"
  }
}
```

## What gets indexed

By default: `.ts .tsx .js .jsx .php .svelte .vue .py .rb .go .rs .css .scss .json .yaml .md .sql`

Ignored by default: `node_modules`, `.git`, `vendor`, `dist`, `build`, `.next`

## Index size

| Project size | Approx index size |
|---|---|
| ~200 files | ~15 MB |
| ~1000 files | ~70 MB |
| ~5000 files | ~350 MB |

The `.claude-context/` directory is automatically added to `.gitignore`.

## License

MIT
