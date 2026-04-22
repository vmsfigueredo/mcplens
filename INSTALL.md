# Installation Guide

## Option A — npm (recommended for JS/TS developers)

### Prerequisites

* **Node.js 20+** — [nodejs.org](https://nodejs.org/)
* **Ollama** — [ollama.ai](https://ollama.ai/)

#### Installing Ollama

**macOS:**

```bash
brew install ollama
```

**Linux:**

```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

**Windows:** Download the installer from [ollama.ai](https://ollama.ai/)

---

### Step 1 — Install the package

```bash
npm install -g @vmsfigueredo/mcplens
```

### Step 2 — Start Ollama and pull the embedding model

```bash
# Start Ollama (if not already running)
ollama serve

# Pull the embedding model (~270MB, one-time download)
ollama pull nomic-embed-text:latest
```

> If you see `Error: listen tcp 127.0.0.1:11434: bind: address already in use`, Ollama is already running. Skip `ollama serve` and go straight to `ollama pull`.

### Step 3 — Initialize in your project

```bash
cd your-project
mcplens init
```

The `init` command will:

1. Create `.claude-context/config.json` with default settings
2. Add `.claude-context/` to `.gitignore`
3. Ask which AI assistant(s) you use and register the MCP server in the right config file
4. Update your `CLAUDE.md` (or equivalent) with context search instructions

### Step 4 — Open your AI assistant

Open Claude Code, Cursor, Windsurf, or Trae in your project. The MCP server starts automatically and indexes your codebase on first run.

To verify it's connected, run `/mcp` inside Claude Code — you should see `context-optimizer · ✔ connected`.

---

## Option B — Docker (zero dependencies beyond Docker)

Coming soon. Will bundle Node, Ollama, and the embedding model in a single `docker compose up`.

---

## Verifying the installation

Once your assistant is open, test the tools directly:

```
use the search_code tool to find "how authentication works"
```

```
use the get_symbol tool to find "UserService"
```

```
use the index_status tool
```

If `index_status` returns file and chunk counts, everything is working.

---

## Dashboard

The dashboard runs at `http://localhost:3000` while the MCP server is active (i.e., while your AI assistant is open).

It shows:

* Files and chunks indexed
* Live re-indexing activity
* A search playground to test queries and inspect scores

> **Multiple projects open at the same time?** Each project gets a unique port derived from its path, so they never conflict. The actual port is logged on startup: `[cco] dashboard: http://localhost:XXXX`

---

## Configuration

Edit `.claude-context/config.json` in your project root:

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
  "ignore": []
}
```

### Options


| Key                       | Default                     | Description                         |
| ------------------------- | --------------------------- | ----------------------------------- |
| `embeddings.provider`     | `"ollama"`                  | `"ollama"`or`"openai"`              |
| `embeddings.ollamaModel`  | `"nomic-embed-text:latest"` | Any Ollama embedding model          |
| `embeddings.openaiApiKey` | —                          | Required if provider is`"openai"`   |
| `search.topK`             | `5`                         | Number of chunks returned per query |
| `search.minScore`         | `0.3`                       | Minimum similarity threshold (0–1) |
| `ignore`                  | `[]`                        | Additional glob patterns to exclude |

### Using OpenAI embeddings

If you prefer cloud embeddings (faster on large projects, but your code leaves your machine):

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

## Client-specific setup

### Claude Code

Registered automatically by `init` in `~/.claude.json`:

```json
{
  "projects": {
    "/your/project": {
      "mcpServers": {
        "context-optimizer": {
          "command": "node",
          "args": ["/path/to/cco/dist/mcp/server.js", "--project", "/your/project"]
        }
      }
    }
  }
}
```

### Cursor

Registered automatically by `init` in `.cursor/mcp.json` at your project root:

```json
{
  "mcpServers": {
    "context-optimizer": {
      "command": "node",
      "args": ["/path/to/cco/dist/mcp/server.js", "--project", "."]
    }
  }
}
```

### Windsurf

Registered automatically by `init` in `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "context-optimizer": {
      "command": "node",
      "args": ["/path/to/cco/dist/mcp/server.js", "--project", "."]
    }
  }
}
```

### Trae

Registered automatically by `init` in `.vscode/settings.json`:

```json
{
  "trae.mcp.servers": {
    "context-optimizer": {
      "command": "node",
      "args": ["/path/to/cco/dist/mcp/server.js", "--project", "."]
    }
  }
}
```

> ⚠️ Trae is developed by ByteDance and may collect telemetry data. Consider this before using it with sensitive codebases.

### PHPStorm (AI Assistant)

PHPStorm requires manual registration via the GUI:

```
Settings → Tools → AI Assistant → Model Context Protocol (MCP)
Click "+" and add:
  Name:    context-optimizer
  Command: node
  Args:    /path/to/cco/dist/mcp/server.js --project /your/project
```

---

## CLAUDE.md instructions

Add this to your project's `CLAUDE.md` to ensure the assistant uses the tools correctly:

```markdown
## Context Search
Always use MCP tools before reading files:
- search_code() — for conceptual or natural language queries
- get_symbol() — for exact class/function/method lookups
Only read full files if both tools return insufficient context.
```

---

## Troubleshooting

### `context-optimizer · ✘ failed` in `/mcp`

The MCP server crashed on startup. Run it manually to see the error:

```bash
node /path/to/cco/dist/mcp/server.js --project /your/project
```

### `Ollama embeddings failed: 500 Internal Server Error`

1. Check Ollama is running: `curl http://localhost:11434/api/tags`
2. Check the model is pulled: `ollama list`
3. Make sure the model name matches exactly — use `nomic-embed-text:latest` not `nomic-embed-text`

### `lines undefined-undefined` in search results

Rebuild the project after any TypeScript changes:

```bash
npm run build
```

Then delete the existing index and reindex:

```bash
rm your-project/.claude-context/index.db
```

The index will be rebuilt on next startup.

### The assistant is reading files instead of using search\_code

Add the context search instructions to your `CLAUDE.md` (see above). Without explicit instructions, the assistant may default to reading files directly.

---

## Local development

```bash
# Clone
git clone https://github.com/vmsfigueredo/mcplens
cd mcplens

# Install dependencies
npm install

# Build
npm run build

# Test in a project
cd /your/test-project
node /path/to/mcplens/bin/cli.js init
```
