// src/mcp/server.ts
// MCP server entry point.
// Claude Code spawns this process via stdio transport.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import path from 'path'
import { openDatabase } from '../indexer/database.js'
import { indexProject } from '../indexer/indexer.js'
import { searchCode, getSymbol } from '../search/search.js'
import { startWatcher } from '../watcher/watcher.js'
import { loadConfig } from '../config/config.js'
import { startDashboard, emitActivity, setIndexing } from '../dashboard/dashboard.js'
import { dashboardFallbackPort } from '../utils/port.js'
import fs from 'fs'

// Project root is passed as --project flag or defaults to cwd
const args = process.argv.slice(2)
const projectFlag = args.indexOf('--project')
const projectRoot = path.resolve(
  projectFlag !== -1 ? args[projectFlag + 1] : process.cwd()
)
const noDashboard = args.includes('--no-dashboard')

async function main() {
  process.stderr.write(`[cco] starting for project: ${projectRoot}\n`)

  const config = loadConfig(projectRoot)
  const db = openDatabase(projectRoot)

  // Start dashboard early so it's available during indexing.
  // Prefers port 3333; falls back to a project-hashed port if 3333 is taken.
  if (!noDashboard) {
    const fallback = dashboardFallbackPort(projectRoot)
    const portFile = `${projectRoot}/.claude-context/dashboard.port`
    startDashboard(db, projectRoot, config.embeddings, config.search ?? {}, 3333, fallback, (boundPort) => {
      process.stderr.write(`[cco] dashboard: http://localhost:${boundPort}\n`)
      fs.writeFileSync(portFile, String(boundPort))
    })
  }

  // Create MCP server
  const server = new McpServer({
    name: 'claude-context-optimizer',
    version: '0.1.0',
  })

  // Tool 1: Semantic search
  server.tool(
    'search_code',
    'Search the codebase semantically. Use this before reading files to find the most relevant code for the current task.',
    {
      query: z.string().describe('Natural language description of what you are looking for'),
      top_k: z.number().optional().describe('Number of results to return (default: 5)'),
    },
    async ({ query, top_k }) => {
      const results = await searchCode(db, query, config.embeddings, {
        topK: top_k ?? config.search?.topK,
        minScore: config.search?.minScore,
      })

      if (results.length === 0) {
        return {
          content: [{ type: 'text', text: 'No relevant code found for this query.' }],
        }
      }

      const text = results
        .map((r, i) =>
          `[${i + 1}] ${r.filepath} (lines ${r.startLine}-${r.endLine}) — score: ${r.score.toFixed(3)}\n` +
          `\`\`\`\n${r.content}\n\`\`\``
        )
        .join('\n\n')

      return { content: [{ type: 'text', text }] }
    }
  )

  // Tool 2: Symbol lookup
  server.tool(
    'get_symbol',
    'Find the definition of a class, function, interface, or method by its exact name.',
    {
      name: z.string().describe('Exact name of the symbol (e.g. AsaasWebhookService, handlePayment)'),
    },
    async ({ name }) => {
      const results = getSymbol(db, name)

      if (results.length === 0) {
        return {
          content: [{ type: 'text', text: `Symbol "${name}" not found in index.` }],
        }
      }

      const text = results
        .map(r =>
          `${r.filepath} (lines ${r.startLine}-${r.endLine})\n` +
          `\`\`\`\n${r.content}\n\`\`\``
        )
        .join('\n\n')

      return { content: [{ type: 'text', text }] }
    }
  )

  // Tool 3: Index status
  server.tool(
    'index_status',
    'Shows how many files and chunks are currently indexed.',
    {},
    async () => {
      const files = (db.prepare('SELECT COUNT(DISTINCT filepath) as c FROM chunks').get() as any).c
      const chunks = (db.prepare('SELECT COUNT(*) as c FROM chunks').get() as any).c
      return {
        content: [{
          type: 'text',
          text: `Index status: ${files} files, ${chunks} chunks indexed in ${projectRoot}`,
        }],
      }
    }
  )

  // Connect via stdio immediately so Claude Code doesn't time out waiting
  const transport = new StdioServerTransport()
  await server.connect(transport)
  process.stderr.write(`[cco] MCP server ready\n`)

  // Run indexing and watcher in the background after MCP is connected
  setImmediate(async () => {
    process.stderr.write(`[cco] checking for changes...\n`)
    setIndexing(true)
    try {
      const { indexed, skipped, removed, failed } = await indexProject(db, {
        projectRoot,
        embeddings: config.embeddings,
        extensions: config.extensions,
        ignore: config.ignore,
        onProgress: (current, total, file) => {
          process.stderr.write(`[cco] indexing ${current}/${total}: ${file}\n`)
        },
      })
      process.stderr.write(`[cco] done. indexed=${indexed} skipped=${skipped} removed=${removed} failed=${failed}\n`)
      if (failed > 0) {
        process.stderr.write(`[cco] WARNING: ${failed} file(s) failed to index — see errors above. Will retry on next startup.\n`)
      }
      emitActivity({ ts: Date.now(), type: 'startup', file: `indexed=${indexed} skipped=${skipped} removed=${removed} failed=${failed}` })
    } catch (err) {
      process.stderr.write(`[cco] indexing failed, continuing without index: ${err}\n`)
      emitActivity({ ts: Date.now(), type: 'startup', file: 'indexing failed' })
    } finally {
      setIndexing(false)
    }

    startWatcher(db, {
      projectRoot,
      embeddings: config.embeddings,
      extensions: config.extensions,
      ignore: config.ignore,
      onActivity: emitActivity,
    })
  })
}

main().catch(err => {
  process.stderr.write(`[cco] fatal: ${err}\n`)
  process.exit(1)
})
