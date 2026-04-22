import path from 'path'
import fs from 'fs'

const EXTENSIONS_TO_TRY = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.svelte', '.php', '.py']

function isFile(p: string): boolean {
  try { return fs.statSync(p).isFile() } catch { return false }
}

function resolveLocalPath(rawImport: string, fileDir: string, projectRoot: string): string | null {
  const abs = path.resolve(fileDir, rawImport)

  // TypeScript ESM imports use .js extension but source files are .ts/.tsx
  // Swap .js → .ts and .js → .tsx before trying the exact path
  const candidates: string[] = [abs]
  if (abs.endsWith('.js')) {
    candidates.push(abs.slice(0, -3) + '.ts')
    candidates.push(abs.slice(0, -3) + '.tsx')
  } else if (abs.endsWith('.jsx')) {
    candidates.push(abs.slice(0, -4) + '.tsx')
  }

  for (const c of candidates) {
    if (isFile(c)) return path.relative(projectRoot, c).split(path.sep).join('/')
  }

  // Try appending extensions (for imports without any extension)
  for (const ext of EXTENSIONS_TO_TRY) {
    const candidate = abs + ext
    if (isFile(candidate)) {
      return path.relative(projectRoot, candidate).split(path.sep).join('/')
    }
  }
  // Try as directory with index file
  for (const ext of EXTENSIONS_TO_TRY) {
    const candidate = path.join(abs, `index${ext}`)
    if (isFile(candidate)) {
      return path.relative(projectRoot, candidate).split(path.sep).join('/')
    }
  }
  return null
}

function extractJsFamily(content: string, fileDir: string, projectRoot: string): string[] {
  const results: string[] = []
  // static import/export ... from '...'
  const fromRe = /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g
  // bare import '...'
  const bareRe = /import\s+['"]([^'"]+)['"]/g
  // dynamic import('...')
  const dynRe = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  // require('...')
  const reqRe = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g

  for (const re of [fromRe, bareRe, dynRe, reqRe]) {
    let m: RegExpExecArray | null
    while ((m = re.exec(content)) !== null) {
      const p = m[1]
      if (p.startsWith('.') || p.startsWith('/')) {
        const resolved = resolveLocalPath(p, fileDir, projectRoot)
        if (resolved) results.push(resolved)
      }
    }
  }
  return results
}

function extractPhp(content: string, fileDir: string, projectRoot: string): string[] {
  const results: string[] = []

  // use App\Foo\Bar; — PSR-4 heuristic: lowercase first segment, keep rest
  const useRe = /^use\s+([\w\\]+)\s*;/gm
  let m: RegExpExecArray | null
  while ((m = useRe.exec(content)) !== null) {
    const fqn = m[1]
    const parts = fqn.split('\\')
    if (parts.length < 2) continue
    // lowercase first segment (e.g. App → app)
    parts[0] = parts[0].toLowerCase()
    const rel = parts.join('/') + '.php'
    const abs = path.resolve(projectRoot, rel)
    if (isFile(abs)) {
      results.push(rel)
      continue
    }
    // Also try original casing
    const relOrig = fqn.split('\\').join('/') + '.php'
    const absOrig = path.resolve(projectRoot, relOrig)
    if (isFile(absOrig)) results.push(relOrig)
  }

  // require/include with or without parens, with optional __DIR__ prefix
  // e.g. require_once __DIR__ . '/path'  or  require('/path')
  const requireRe = /(?:require|include)(?:_once)?\s*\(?\s*(?:__DIR__\s*\.\s*)?['"]([^'"]+)['"]\s*\)?/g
  while ((m = requireRe.exec(content)) !== null) {
    const raw = m[1]
    // Make the path relative-style: strip leading slash (means relative to file dir)
    const p = raw.startsWith('/') ? '.' + raw : (raw.startsWith('.') ? raw : `./${raw}`)
    const resolved = resolveLocalPath(p, fileDir, projectRoot)
    if (resolved) results.push(resolved)
  }

  return results
}

function extractPython(content: string, fileDir: string, projectRoot: string): string[] {
  const results: string[] = []
  // from .module import X  or  from ..module import X
  const re = /^from\s+(\.+)([\w.]*)\s+import\s+/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    const dots = m[1].length // number of dots = levels up
    const modPath = m[2] // e.g. "utils" or "sub.module"
    // In Python, a single dot means same package (fileDir), two dots means parent, etc.
    let base = fileDir
    for (let i = 1; i < dots; i++) base = path.dirname(base)
    const modSegments = modPath ? modPath.split('.') : []
    const candidateAbs = modSegments.length > 0 ? path.join(base, ...modSegments) : base
    const resolved = resolveLocalPath(path.relative(fileDir, candidateAbs), fileDir, projectRoot)
    if (resolved) results.push(resolved)
  }
  return results
}

export function extractDependencies(
  content: string,
  filepath: string,
  projectRoot: string,
  language: string
): string[] {
  try {
    const fileDir = path.resolve(projectRoot, path.dirname(filepath))
    let raw: string[] = []

    if (language === 'typescript' || language === 'tsx' || language === 'javascript' || language === 'svelte') {
      raw = extractJsFamily(content, fileDir, projectRoot)
    } else if (language === 'php') {
      raw = extractPhp(content, fileDir, projectRoot)
    } else if (language === 'python') {
      raw = extractPython(content, fileDir, projectRoot)
    }

    // Dedupe and exclude self
    return Array.from(new Set(raw)).filter(f => f !== filepath)
  } catch (err) {
    process.stderr.write(`[mcplens] dep extract failed for ${filepath}: ${err instanceof Error ? err.message : err}\n`)
    return []
  }
}
