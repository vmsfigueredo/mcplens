// src/mcp/server.ts
// MCP server entry point.
// Claude Code spawns this process via stdio transport.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import path from 'path'
import { openDatabase, getAllChunks, getDependsOn, getUsedBy, dependenciesTableEmpty, upsertDependencies, getAllFileHashes } from '../indexer/database.js'
import { indexProject } from '../indexer/indexer.js'
import { extractDependencies } from '../indexer/dependency-extractor.js'
import { detectLanguage } from '../indexer/ast-chunker.js'
import { searchCode, getSymbol } from '../search/search.js'
import { buildBM25Index, BM25Cache } from '../search/bm25.js'
import { startWatcher } from '../watcher/watcher.js'
import { loadConfig } from '../config/config.js'
import { startDashboard, emitActivity, setIndexing, recordSearch, DashboardHandle } from '../dashboard/index.js'
import { dashboardFallbackPort } from '../utils/port.js'
import {
  readLockfile, writeLockfile, deleteLockfile,
  isPidAlive, probeHost, postSession, postSearch, getSymbolHttp, getRelatedHttp, getStatsHttp,
} from '../utils/lockfile.js'
import fs from 'fs'

// Project root is passed as --project flag or defaults to cwd
const args = process.argv.slice(2)
const projectFlag = args.indexOf('--project')
const projectRoot = path.resolve(
  projectFlag !== -1 ? args[projectFlag + 1] : process.cwd()
)
const noDashboard = args.includes('--no-dashboard')

// Grace period before host shuts down after last client disconnects (ms)
const SHUTDOWN_GRACE_MS = 30_000

function detectLanguageLoose(filepath: string): string {
  if (filepath.endsWith('.svelte')) return 'svelte'
  return detectLanguage(filepath) ?? ''
}

function formatRelated(
  filepath: string,
  dependsOn: string[],
  usedBy: string[],
  dependsOn2: string[],
  usedBy2: string[]
): string {
  const lines: string[] = [`## ${filepath}`, '']
  lines.push(`**Depends on (${dependsOn.length} files):**`)
  if (dependsOn.length === 0) lines.push('  _(none)_')
  else dependsOn.forEach(f => lines.push(`  - ${f}`))
  if (dependsOn2.length > 0) {
    lines.push(`\n**Also depends on via 2 hops (${dependsOn2.length} files):**`)
    dependsOn2.forEach(f => lines.push(`  - ${f}`))
  }
  lines.push('')
  lines.push(`**Used by (${usedBy.length} files):**`)
  if (usedBy.length === 0) lines.push('  _(none)_')
  else usedBy.forEach(f => lines.push(`  - ${f}`))
  if (usedBy2.length > 0) {
    lines.push(`\n**Also used by via 2 hops (${usedBy2.length} files):**`)
    usedBy2.forEach(f => lines.push(`  - ${f}`))
  }
  return lines.join('\n')
}
// Client heartbeat interval (ms)
const HEARTBEAT_INTERVAL_MS = 10_000

async function detectExistingHost(): Promise<number | null> {
  if (noDashboard) return null
  const lock = readLockfile(projectRoot)
  if (!lock) return null

  if (!isPidAlive(lock.pid)) {
    process.stderr.write(`[mcplens] stale lockfile (pid ${lock.pid} dead), taking over\n`)
    deleteLockfile(projectRoot)
    return null
  }

  const alive = await probeHost(lock.port, projectRoot)
  if (!alive) {
    process.stderr.write(`[mcplens] stale lockfile (dashboard not responding), taking over\n`)
    deleteLockfile(projectRoot)
    return null
  }

  return lock.port
}

async function runAsClient(hostPort: number) {
  process.stderr.write(`[mcplens] reusing existing instance at port ${hostPort}\n`)

  const sessionId = `${path.basename(projectRoot)}#${process.pid.toString(36).slice(-4)}`

  await postSession(hostPort, 'register')

  // Heartbeat to keep host alive
  const heartbeatTimer = setInterval(async () => {
    await postSession(hostPort, 'heartbeat')
  }, HEARTBEAT_INTERVAL_MS)
  heartbeatTimer.unref()

  const config = loadConfig(projectRoot)

  const server = new McpServer({ name: 'mcplens', version: '0.1.0' })

  server.tool(
    'search_code',
    'Search the codebase using hybrid semantic + keyword search. Use for both conceptual queries and exact symbol names.',
    {
      query: z.string().describe('Natural language description of what you are looking for'),
      top_k: z.number().optional().describe('Number of results to return (default: 5)'),
    },
    async ({ query, top_k }) => {
      try {
        const results = await postSearch(hostPort, query, top_k ?? config.search?.topK, config.search?.minScore, sessionId) as any[]
        if (results.length === 0) {
          return { content: [{ type: 'text' as const, text: 'No relevant code found for this query.' }] }
        }
        const text = results
          .map((r: any, i: number) =>
            `[${i + 1}] ${r.filepath} (lines ${r.startLine}-${r.endLine}) — score: ${r.score.toFixed(3)}\n` +
            `\`\`\`\n${r.content}\n\`\`\``
          )
          .join('\n\n')
        return { content: [{ type: 'text' as const, text }] }
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Search error: ${err}` }] }
      }
    }
  )

  server.tool(
    'get_symbol',
    'Find the definition of a class, function, interface, or method by its exact name.',
    { name: z.string().describe('Exact name of the symbol (e.g. AsaasWebhookService, handlePayment)') },
    async ({ name }) => {
      try {
        const results = await getSymbolHttp(hostPort, name, sessionId) as any[]
        if (results.length === 0) {
          return { content: [{ type: 'text' as const, text: `Symbol "${name}" not found in index.` }] }
        }
        const text = results
          .map((r: any) => `${r.filepath} (lines ${r.startLine}-${r.endLine})\n\`\`\`\n${r.content}\n\`\`\``)
          .join('\n\n')
        return { content: [{ type: 'text' as const, text }] }
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Symbol lookup error: ${err}` }] }
      }
    }
  )

  server.tool(
    'get_related',
    'Get files related to a given file — what it imports (depends_on) and what imports it (used_by). Useful for understanding blast radius before refactoring.',
    {
      filepath: z.string().describe('File path relative to project root (e.g. src/services/PaymentService.ts)'),
      depth: z.number().optional().describe('Dependency hops to follow (default: 1, max: 2)'),
    },
    async ({ filepath, depth = 1 }) => {
      try {
        const d = Math.max(1, Math.min(2, depth))
        const data = await getRelatedHttp(hostPort, filepath, d, sessionId) as any
        if (!data.dependsOn && !data.usedBy) {
          return { content: [{ type: 'text' as const, text: `No dependency data found for ${filepath}. Make sure the file is indexed.` }] }
        }
        return { content: [{ type: 'text' as const, text: formatRelated(filepath, data.dependsOn ?? [], data.usedBy ?? [], [], []) }] }
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `get_related error: ${err}` }] }
      }
    }
  )

  server.tool('index_status', 'Shows how many files and chunks are currently indexed.', {}, async () => {
    try {
      const stats = await getStatsHttp(hostPort) as any
      return {
        content: [{
          type: 'text' as const,
          text: `Index status: ${stats.files} files, ${stats.chunks} chunks indexed in ${projectRoot}`,
        }],
      }
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Stats error: ${err}` }] }
    }
  })

  const release = async () => {
    clearInterval(heartbeatTimer)
    await postSession(hostPort, 'release')
  }

  process.on('SIGINT', async () => { await release(); process.exit(0) })
  process.on('SIGTERM', async () => { await release(); process.exit(0) })
  process.stdin.on('end', async () => { await release(); process.exit(0) })

  const transport = new StdioServerTransport()
  await server.connect(transport)
  process.stderr.write(`[mcplens] MCP client ready (host port ${hostPort})\n`)
}

async function runAsHost() {
  process.stderr.write(`[mcplens] starting for project: ${projectRoot}\n`)

  const config = loadConfig(projectRoot)
  const db = openDatabase(projectRoot)

  let dashboardHandle: DashboardHandle | null = null
  let hostPort: number | null = null
  let shutdownTimer: ReturnType<typeof setTimeout> | null = null

  // Start dashboard early so it's available during indexing.
  if (!noDashboard) {
    const fallback = dashboardFallbackPort(projectRoot)
    const portFile = `${projectRoot}/.mcplens/dashboard.port`
    dashboardHandle = startDashboard(db, projectRoot, config.embeddings, config.search ?? {}, 3333, fallback, (boundPort) => {
      hostPort = boundPort
      process.stderr.write(`[mcplens] dashboard: http://localhost:${boundPort}\n`)
      fs.writeFileSync(portFile, String(boundPort))
      writeLockfile(projectRoot, {
        pid: process.pid,
        port: boundPort,
        projectRoot,
        startedAt: Date.now(),
        sessions: 1,
        lastHeartbeat: Date.now(),
      })
    })
  }

  const beginShutdown = async () => {
    process.stderr.write(`[mcplens] shutting down\n`)
    deleteLockfile(projectRoot)
    if (dashboardHandle) await dashboardHandle.shutdown()
    try { db.close() } catch { /* ignore */ }
    process.exit(0)
  }

  const releaseSession = async () => {
    if (noDashboard || hostPort === null) {
      await beginShutdown()
      return
    }
    const lock = readLockfile(projectRoot)
    const remaining = lock ? Math.max(0, lock.sessions - 1) : 0
    if (lock) {
      writeLockfile(projectRoot, { ...lock, sessions: remaining })
    }
    if (remaining === 0) {
      process.stderr.write(`[mcplens] no remaining sessions, shutting down in ${SHUTDOWN_GRACE_MS / 1000}s\n`)
      shutdownTimer = setTimeout(async () => {
        // Re-check in case a client reconnected during grace period
        const latestLock = readLockfile(projectRoot)
        if (!latestLock || latestLock.sessions === 0) {
          await beginShutdown()
        }
      }, SHUTDOWN_GRACE_MS)
      // Don't block Node exit on this timer
      if (shutdownTimer.unref) shutdownTimer.unref()
    } else {
      process.stderr.write(`[mcplens] ${remaining} session(s) remaining, staying alive\n`)
    }
  }

  // GC sweep for stale client heartbeats (protects against kill -9 on clients)
  if (!noDashboard) {
    const gcInterval = setInterval(() => {
      const lock = readLockfile(projectRoot)
      if (!lock || lock.pid !== process.pid) { clearInterval(gcInterval); return }
      const staleMs = 45_000
      if (Date.now() - lock.lastHeartbeat > staleMs && lock.sessions > 1) {
        process.stderr.write(`[mcplens] GC: stale client detected, decrementing session count\n`)
        writeLockfile(projectRoot, { ...lock, sessions: lock.sessions - 1 })
      }
    }, 15_000)
    gcInterval.unref()
  }

  process.on('SIGINT', async () => { await releaseSession() })
  process.on('SIGTERM', async () => { await releaseSession() })
  process.stdin.on('end', async () => { await releaseSession() })

  // Synchronous safety net: if the process exits for any reason without going
  // through beginShutdown(), close the HTTP server so the port is freed.
  process.on('exit', () => {
    deleteLockfile(projectRoot)
    if (dashboardHandle) {
      try { dashboardHandle.server.closeAllConnections() } catch { /* ignore */ }
      try { dashboardHandle.server.close() } catch { /* ignore */ }
    }
  })

  const bm25Cache = new BM25Cache()

  function rebuildBM25(): void {
    const chunks = getAllChunks(db).map(c => ({ id: c.id, content: c.content }))
    bm25Cache.set(buildBM25Index(chunks))
  }

  // Create MCP server
  const server = new McpServer({ name: 'mcplens', version: '0.1.0' })

  const hostSessionId = `host#${process.pid.toString(36).slice(-4)}`

  server.tool(
    'search_code',
    'Search the codebase using hybrid semantic + keyword search. Use for both conceptual queries and exact symbol names.',
    {
      query: z.string().describe('Natural language description of what you are looking for'),
      top_k: z.number().optional().describe('Number of results to return (default: 5)'),
    },
    async ({ query, top_k }) => {
      const t0 = Date.now()
      const results = await searchCode(db, query, config.embeddings, {
        topK: top_k ?? config.search?.topK,
        minScore: config.search?.minScore,
        hybridAlpha: config.search?.hybridAlpha,
      }, bm25Cache.get())
      recordSearch({ type: 'search', query, results: results.length, latencyMs: Date.now() - t0, sessionId: hostSessionId })
      if (results.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No relevant code found for this query.' }] }
      }
      const text = results
        .map((r, i) =>
          `[${i + 1}] ${r.filepath} (lines ${r.startLine}-${r.endLine}) — score: ${r.score.toFixed(3)}\n` +
          `\`\`\`\n${r.content}\n\`\`\``
        )
        .join('\n\n')
      return { content: [{ type: 'text' as const, text }] }
    }
  )

  server.tool(
    'get_symbol',
    'Find the definition of a class, function, interface, or method by its exact name.',
    { name: z.string().describe('Exact name of the symbol (e.g. AsaasWebhookService, handlePayment)') },
    async ({ name }) => {
      const t0 = Date.now()
      const results = getSymbol(db, name)
      recordSearch({ type: 'symbol', query: name, results: results.length, latencyMs: Date.now() - t0, sessionId: hostSessionId })
      if (results.length === 0) {
        return { content: [{ type: 'text' as const, text: `Symbol "${name}" not found in index.` }] }
      }
      const text = results
        .map(r => `${r.filepath} (lines ${r.startLine}-${r.endLine})\n\`\`\`\n${r.content}\n\`\`\``)
        .join('\n\n')
      return { content: [{ type: 'text' as const, text }] }
    }
  )

  server.tool(
    'get_related',
    'Get files related to a given file — what it imports (depends_on) and what imports it (used_by). Useful for understanding blast radius before refactoring.',
    {
      filepath: z.string().describe('File path relative to project root (e.g. src/services/PaymentService.ts)'),
      depth: z.number().optional().describe('Dependency hops to follow (default: 1, max: 2)'),
    },
    async ({ filepath, depth = 1 }) => {
      const d = Math.max(1, Math.min(2, depth))
      const dependsOn = getDependsOn(db, filepath)
      const usedBy = getUsedBy(db, filepath)
      if (dependsOn.length === 0 && usedBy.length === 0) {
        return { content: [{ type: 'text' as const, text: `No dependency data found for ${filepath}. Make sure the file is indexed.` }] }
      }
      const dependsOn2 = d === 2
        ? Array.from(new Set(dependsOn.flatMap(f => getDependsOn(db, f)).filter(f => f !== filepath && !dependsOn.includes(f))))
        : []
      const usedBy2 = d === 2
        ? Array.from(new Set(usedBy.flatMap(f => getUsedBy(db, f)).filter(f => f !== filepath && !usedBy.includes(f))))
        : []
      return { content: [{ type: 'text' as const, text: formatRelated(filepath, dependsOn, usedBy, dependsOn2, usedBy2) }] }
    }
  )

  server.tool('index_status', 'Shows how many files and chunks are currently indexed.', {}, async () => {
    const files = (db.prepare('SELECT COUNT(DISTINCT filepath) as c FROM chunks').get() as any).c
    const chunks = (db.prepare('SELECT COUNT(*) as c FROM chunks').get() as any).c
    return {
      content: [{
        type: 'text' as const,
        text: `Index status: ${files} files, ${chunks} chunks indexed in ${projectRoot}`,
      }],
    }
  })

  // Connect via stdio immediately so Claude Code doesn't time out waiting
  const transport = new StdioServerTransport()
  await server.connect(transport)
  process.stderr.write(`[mcplens] MCP server ready\n`)

  // Run indexing and watcher in the background after MCP is connected
  setImmediate(async () => {
    process.stderr.write(`[mcplens] checking for changes...\n`)
    setIndexing(true)
    try {
      const { indexed, skipped, removed, failed } = await indexProject(db, {
        projectRoot,
        embeddings: config.embeddings,
        extensions: config.extensions,
        ignore: config.ignore,
        onProgress: (current, total, file) => {
          process.stderr.write(`[mcplens] indexing ${current}/${total}: ${file}\n`)
        },
      })
      process.stderr.write(`[mcplens] done. indexed=${indexed} skipped=${skipped} removed=${removed} failed=${failed}\n`)
      if (failed > 0) {
        process.stderr.write(`[mcplens] WARNING: ${failed} file(s) failed to index — see errors above. Will retry on next startup.\n`)
      }
      emitActivity({ ts: Date.now(), type: 'startup', file: `indexed=${indexed} skipped=${skipped} removed=${removed} failed=${failed}` })
    } catch (err) {
      process.stderr.write(`[mcplens] indexing failed, continuing without index: ${err}\n`)
      emitActivity({ ts: Date.now(), type: 'startup', file: 'indexing failed' })
    } finally {
      setIndexing(false)
    }

    // One-time dep-graph backfill for existing indexes that predate this feature.
    if (dependenciesTableEmpty(db)) {
      process.stderr.write(`[mcplens] backfilling dependency graph...\n`)
      const hashes = getAllFileHashes(db)
      for (const relPath of Object.keys(hashes)) {
        try {
          const abs = path.join(projectRoot, relPath)
          const content = fs.readFileSync(abs, 'utf-8')
          const lang = detectLanguageLoose(relPath)
          const deps = extractDependencies(content, relPath, projectRoot, lang)
          upsertDependencies(db, relPath, deps)
        } catch (e) {
          process.stderr.write(`[mcplens] dep backfill failed for ${relPath}: ${e}\n`)
        }
      }
      process.stderr.write(`[mcplens] dependency graph backfill complete\n`)
    }

    // Build BM25 index once after initial indexing completes.
    rebuildBM25()

    startWatcher(db, {
      projectRoot,
      embeddings: config.embeddings,
      extensions: config.extensions,
      ignore: config.ignore,
      onActivity: emitActivity,
      // Rebuild eagerly after each file change — watcher already debounces (300ms).
      onIndexChanged: rebuildBM25,
    })
  })
}

async function main() {
  const hostPort = await detectExistingHost()
  if (hostPort !== null) {
    await runAsClient(hostPort)
  } else {
    await runAsHost()
  }
}

main().catch(err => {
  process.stderr.write(`[mcplens] fatal: ${err}\n`)
  process.exit(1)
})
