import { execSync, exec } from 'child_process'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import readline from 'readline'
import { dashboardFallbackPort } from '../utils/port.js'

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans) }))
}

function readJson(p: string): any {
  if (!fs.existsSync(p)) return {}
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return {} }
}

function writeJson(p: string, data: any) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n')
}

// __dirname = dist/cli/ when compiled; two levels up reaches the package root
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const packageRoot = path.resolve(__dirname, '../..')
const projectRoot = process.cwd()
const command = process.argv[2]

const MCPLENS_MARKER = '<!-- mcplens-context-block -->'
const CONTEXT_BLOCK = `
${MCPLENS_MARKER}
## Context Search (mcplens)

**MANDATORY — follow these rules before touching any file:**

1. ALWAYS call \`search_code()\` first for any query, conceptual or exact.
   Examples: "how does authentication work", "where is the payment logic", "UserService"
2. Use \`get_symbol()\` only when \`search_code()\` returns no results for an exact name.
3. Reading files directly (without first searching) is NOT allowed.
   Only open a full file if both tools returned insufficient context.
4. Never browse the file tree to find things — use \`search_code()\` instead.

This rule exists to reduce token usage. Violating it defeats the purpose of mcplens.
`

function writeInstructionsFile(filePath: string, label: string) {
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf-8')
    if (content.includes(MCPLENS_MARKER)) {
      // Remove everything from the first marker to the end of the last mcplens block.
      // Each block ends with the sentinel line "This rule exists to reduce token usage."
      // Strip from the marker to that sentinel (inclusive), handling multiple occurrences.
      const SENTINEL = 'This rule exists to reduce token usage. Violating it defeats the purpose of mcplens.'
      const markerIdx = content.indexOf(MCPLENS_MARKER)
      // Find the last occurrence of the sentinel after the marker
      const lastSentinelEnd = content.lastIndexOf(SENTINEL)
      let stripped: string
      if (lastSentinelEnd !== -1 && lastSentinelEnd > markerIdx) {
        // Cut from just before the marker to the end of the last sentinel line
        const before = content.slice(0, markerIdx).trimEnd()
        const after = content.slice(lastSentinelEnd + SENTINEL.length)
        stripped = before + (after.startsWith('\n') ? after : '\n' + after)
      } else {
        // Fallback: just cut from marker to end
        stripped = content.slice(0, markerIdx).trimEnd()
      }
      fs.writeFileSync(filePath, stripped.trimEnd() + CONTEXT_BLOCK)
      console.log(`✅ Updated mcplens block in ${label}`)
    } else {
      fs.appendFileSync(filePath, CONTEXT_BLOCK)
      console.log(`✅ Appended context search instructions to ${label}`)
    }
  } else {
    fs.writeFileSync(filePath, CONTEXT_BLOCK.trimStart())
    console.log(`✅ Created ${label} with context search instructions`)
  }
}

async function runInit() {
  console.log('🔧 Initializing mcplens...\n')

  // 1. Create .mcplens/config.json
  const dir = path.join(projectRoot, '.mcplens')
  fs.mkdirSync(dir, { recursive: true })

  const configPath = path.join(dir, 'config.json')
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify({
      embeddings: {
        provider: 'ollama',
        ollamaUrl: 'http://localhost:11434',
        ollamaModel: 'nomic-embed-text:latest',
      },
      search: { topK: 5, minScore: 0.3 },
    }, null, 2) + '\n')
    console.log('✅ Created .mcplens/config.json')
  } else {
    console.log('ℹ️  .mcplens/config.json already exists')
  }

  // 2. Add .mcplens to .gitignore
  const gitignorePath = path.join(projectRoot, '.gitignore')
  const entry = '.mcplens/'
  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf-8')
    if (!content.includes(entry)) {
      fs.appendFileSync(gitignorePath, `\n# mcplens\n${entry}\n`)
      console.log('✅ Added .mcplens/ to .gitignore')
    }
  } else {
    fs.writeFileSync(gitignorePath, `# mcplens\n${entry}\n`)
    console.log('✅ Created .gitignore with .mcplens/')
  }

  // 4. Ask about dashboard
  const dashboardAnswer = await ask('Enable dashboard? [Y/n] ')
  const enableDashboard = dashboardAnswer.trim().toLowerCase() !== 'n'

  // 5. Ask which AI coding assistants to register
  const home = process.env.HOME || '~'
  console.log(`
Which AI coding assistants are you using? (comma-separated numbers, e.g. 1,2)
  1) Claude Code  (~/.claude.json)
  2) Cursor       (.cursor/mcp.json in project root)
  3) Windsurf     (~/.codeium/windsurf/mcp_config.json)`)
  const clientAnswer = await ask('> ')
  const selected = clientAnswer.trim() === ''
    ? new Set([1])
    : new Set(
        clientAnswer.split(/[,\s]+/)
          .map(s => parseInt(s, 10))
          .filter(n => n >= 1 && n <= 3)
      )
  if (selected.size === 0) selected.add(1)

  const serverPath = path.resolve(packageRoot, 'dist', 'mcp', 'server.js')
  const mcpArgs = [serverPath, '--project', projectRoot]
  if (!enableDashboard) mcpArgs.push('--no-dashboard')

  const mcpEntry = { command: 'node', args: mcpArgs }

  // Claude Code (~/.claude.json) — project-scoped
  if (selected.has(1)) {
    const claudePath = path.join(home, '.claude.json')
    const claudeJson = readJson(claudePath)
    if (!claudeJson.projects) claudeJson.projects = {}
    if (!claudeJson.projects[projectRoot]) claudeJson.projects[projectRoot] = {}
    if (!claudeJson.projects[projectRoot].mcpServers) claudeJson.projects[projectRoot].mcpServers = {}
    claudeJson.projects[projectRoot].mcpServers['mcplens'] = mcpEntry
    writeJson(claudePath, claudeJson)
    console.log('✅ Registered in Claude Code')
    writeInstructionsFile(path.join(projectRoot, 'CLAUDE.md'), 'CLAUDE.md')
  }

  // Cursor (.cursor/mcp.json at project root) — flat mcpServers
  if (selected.has(2)) {
    const cursorPath = path.join(projectRoot, '.cursor', 'mcp.json')
    const cursorJson = readJson(cursorPath)
    if (!cursorJson.mcpServers) cursorJson.mcpServers = {}
    cursorJson.mcpServers['mcplens'] = mcpEntry
    writeJson(cursorPath, cursorJson)
    console.log('✅ Registered in Cursor')
    writeInstructionsFile(path.join(projectRoot, '.cursorrules'), '.cursorrules')
  }

  // Windsurf (~/.codeium/windsurf/mcp_config.json) — flat mcpServers
  if (selected.has(3)) {
    const windsurfPath = path.join(home, '.codeium', 'windsurf', 'mcp_config.json')
    const windsurfJson = readJson(windsurfPath)
    if (!windsurfJson.mcpServers) windsurfJson.mcpServers = {}
    windsurfJson.mcpServers['mcplens'] = mcpEntry
    writeJson(windsurfPath, windsurfJson)
    console.log('✅ Registered in Windsurf')
    writeInstructionsFile(path.join(projectRoot, '.windsurfrules'), '.windsurfrules')
  }

  const dashboardNote = enableDashboard
    ? `🌐 Dashboard will be served at: http://localhost:3333 (falls back to ${dashboardFallbackPort(projectRoot)} if 3333 is busy)\n   Run: mcplens dashboard`
    : `ℹ️  Dashboard disabled`

  console.log(`
🎉 Done! Next steps:
   1. Make sure Ollama is running:  ollama serve
   2. Pull the embedding model:     ollama pull nomic-embed-text:latest
   3. Open your AI coding assistant in this project — indexing runs automatically on startup

📁 Index will be stored in: .mcplens/index.db
⚙️  Config at: .mcplens/config.json
${dashboardNote}
`)
}

if (command === 'init') {
  await runInit()
} else if (command === 'start') {
  // Direct start (for testing outside an AI coding assistant)
  const serverPath = path.resolve(packageRoot, 'dist', 'mcp', 'server.js')
  execSync(`node ${serverPath} --project ${projectRoot}`, { stdio: 'inherit' })

} else if (command === 'dashboard') {
  const portFile = path.join(projectRoot, '.mcplens', 'dashboard.port')
  const port = fs.existsSync(portFile) ? Number(fs.readFileSync(portFile, 'utf-8').trim()) : 3333
  const url = `http://localhost:${port}`
  console.log(`Opening dashboard at ${url}`)
  const opener =
    process.platform === 'darwin' ? 'open' :
    process.platform === 'win32' ? 'start' : 'xdg-open'
  exec(`${opener} ${url}`)

} else {
  console.log(`
mcplens — semantic codebase search for Claude Code, Cursor, and Windsurf

Usage:
  mcplens init       Set up this project (run once)
  mcplens start      Start the MCP server manually (for testing)
  mcplens dashboard  Open the dashboard in your browser

GitHub: https://github.com/your-username/mcplens
`)
}
