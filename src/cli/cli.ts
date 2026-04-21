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

// __dirname = dist/cli/ when compiled; two levels up reaches the package root
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const packageRoot = path.resolve(__dirname, '../..')
const projectRoot = process.cwd()
const command = process.argv[2]

async function runInit() {
  console.log('🔧 Initializing claude-context-optimizer...\n')

  // 1. Create .claude-context/config.json
  const dir = path.join(projectRoot, '.claude-context')
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
    console.log('✅ Created .claude-context/config.json')
  } else {
    console.log('ℹ️  .claude-context/config.json already exists')
  }

  // 2. Create or update CLAUDE.md with context search instructions
  const claudeMdPath = path.join(projectRoot, 'CLAUDE.md')
  const contextBlock = `
## Context Search (claude-context-optimizer)
- Use search_code() for conceptual queries ("how does payment work")
- Use get_symbol() for exact lookups ("find PaymentService class")
- Only read full files if both tools return insufficient context
`
  if (fs.existsSync(claudeMdPath)) {
    const content = fs.readFileSync(claudeMdPath, 'utf-8')
    if (!content.includes('claude-context-optimizer')) {
      fs.appendFileSync(claudeMdPath, contextBlock)
      console.log('✅ Updated CLAUDE.md with context search instructions')
    } else {
      console.log('ℹ️  CLAUDE.md already has context search instructions')
    }
  } else {
    fs.writeFileSync(claudeMdPath, contextBlock.trimStart())
    console.log('✅ Created CLAUDE.md with context search instructions')
  }

  // 4. Add .claude-context to .gitignore
  const gitignorePath = path.join(projectRoot, '.gitignore')
  const entry = '.claude-context/'
  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf-8')
    if (!content.includes(entry)) {
      fs.appendFileSync(gitignorePath, `\n# claude-context-optimizer\n${entry}\n`)
      console.log('✅ Added .claude-context/ to .gitignore')
    }
  } else {
    fs.writeFileSync(gitignorePath, `# claude-context-optimizer\n${entry}\n`)
    console.log('✅ Created .gitignore with .claude-context/')
  }

  // 5. Register MCP server in ~/.claude.json
  const homePath = path.join(process.env.HOME || '~', '.claude.json')
  const serverPath = path.resolve(packageRoot, 'dist', 'mcp', 'server.js')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let claudeJson: any = {}
  if (fs.existsSync(homePath)) {
    try { claudeJson = JSON.parse(fs.readFileSync(homePath, 'utf-8')) }
    catch { claudeJson = {} }
  }

  if (!claudeJson.projects) claudeJson.projects = {}
  if (!claudeJson.projects[projectRoot]) claudeJson.projects[projectRoot] = {}
  if (!claudeJson.projects[projectRoot].mcpServers) claudeJson.projects[projectRoot].mcpServers = {}

  const dashboardAnswer = await ask('Enable dashboard? [Y/n] ')
  const enableDashboard = dashboardAnswer.trim().toLowerCase() !== 'n'

  const mcpArgs = [serverPath, '--project', projectRoot]
  if (!enableDashboard) mcpArgs.push('--no-dashboard')

  claudeJson.projects[projectRoot].mcpServers['context-optimizer'] = {
    command: 'node',
    args: mcpArgs,
  }

  fs.writeFileSync(homePath, JSON.stringify(claudeJson, null, 2) + '\n')
  console.log(`✅ Registered MCP server in ~/.claude.json for this project`)

  const dashboardNote = enableDashboard
    ? `🌐 Dashboard will be served at: http://localhost:3333 (falls back to ${dashboardFallbackPort(projectRoot)} if 3333 is busy)\n   Run: claude-context-optimizer dashboard`
    : `ℹ️  Dashboard disabled`

  console.log(`
🎉 Done! Next steps:
   1. Make sure Ollama is running:  ollama serve
   2. Pull the embedding model:     ollama pull nomic-embed-text:latest
   3. Open Claude Code in this project — indexing runs automatically on startup

📁 Index will be stored in: .claude-context/index.db
⚙️  Config at: .claude-context/config.json
${dashboardNote}
`)
}

if (command === 'init') {
  await runInit()
} else if (command === 'start') {
  // Direct start (for testing outside Claude Code)
  const serverPath = path.resolve(packageRoot, 'dist', 'mcp', 'server.js')
  execSync(`node ${serverPath} --project ${projectRoot}`, { stdio: 'inherit' })

} else if (command === 'dashboard') {
  const portFile = path.join(projectRoot, '.claude-context', 'dashboard.port')
  const port = fs.existsSync(portFile) ? Number(fs.readFileSync(portFile, 'utf-8').trim()) : 3333
  const url = `http://localhost:${port}`
  console.log(`Opening dashboard at ${url}`)
  const opener =
    process.platform === 'darwin' ? 'open' :
    process.platform === 'win32' ? 'start' : 'xdg-open'
  exec(`${opener} ${url}`)

} else {
  console.log(`
claude-context-optimizer — semantic codebase search for Claude Code

Usage:
  claude-context-optimizer init       Set up this project (run once)
  claude-context-optimizer start      Start the MCP server manually (for testing)
  claude-context-optimizer dashboard  Open the dashboard in your browser

GitHub: https://github.com/your-username/claude-context-optimizer
`)
}
