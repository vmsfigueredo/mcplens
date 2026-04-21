import { createRequire } from 'module'
import { Chunk, ChunkerConfig, chunkBySlidingWindow } from './chunker.js'

const require = createRequire(import.meta.url)

// Native tree-sitter binding — synchronous, no WASM, no init() call needed
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TreeSitter = require('tree-sitter') as typeof import('tree-sitter')

// --- Language registry ---

type LangKey = 'typescript' | 'tsx' | 'javascript' | 'php' | 'python'

const EXT_TO_LANG: Record<string, LangKey> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  php: 'php',
  py: 'python',
}

// Node types that define a top-level chunk boundary per language
const CHUNK_NODES: Record<LangKey, Set<string>> = {
  typescript: new Set([
    'function_declaration',
    'method_definition',
    'class_declaration',
    'interface_declaration',
    'type_alias_declaration',
    'enum_declaration',
    'abstract_class_declaration',
  ]),
  tsx: new Set([
    'function_declaration',
    'method_definition',
    'class_declaration',
    'interface_declaration',
    'type_alias_declaration',
    'enum_declaration',
    'abstract_class_declaration',
    'jsx_element',
    'jsx_self_closing_element',
  ]),
  javascript: new Set([
    'function_declaration',
    'method_definition',
    'class_declaration',
  ]),
  php: new Set([
    'function_definition',
    'method_declaration',
    'class_declaration',
    'trait_declaration',
    'interface_declaration',
    'enum_declaration',
  ]),
  python: new Set([
    'function_definition',
    'class_definition',
    'decorated_definition',
  ]),
}

// Parent node types whose direct children we promote as chunks
// (handles: export const foo = () => {} and export default function)
const EXPORT_PARENTS = new Set([
  'export_statement',
  'lexical_declaration',
  'variable_declaration',
])

// --- Language loading (lazy, cached) ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const languageCache = new Map<LangKey, any>()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadLanguage(lang: LangKey): any {
  const cached = languageCache.get(lang)
  if (cached) return cached

  let language: unknown
  if (lang === 'typescript') {
    language = require('tree-sitter-typescript').typescript
  } else if (lang === 'tsx') {
    language = require('tree-sitter-typescript').tsx
  } else if (lang === 'javascript') {
    language = require('tree-sitter-javascript')
  } else if (lang === 'php') {
    language = require('tree-sitter-php').php
  } else {
    language = require(`tree-sitter-${lang}`)
  }

  languageCache.set(lang, language)
  return language
}

// --- AST walking ---

interface ChunkCandidate {
  startIndex: number
  endIndex: number
  startLine: number
  endLine: number
}

function collectChunkNodes(
  tree: import('tree-sitter').Tree,
  chunkNodeTypes: Set<string>
): ChunkCandidate[] {
  const candidates: ChunkCandidate[] = []
  const cursor = tree.walk()

  // Advance past current node to the next unvisited node (skip its subtree)
  function skipAndAdvance(): boolean {
    // Try next sibling first, then bubble up
    while (!cursor.gotoNextSibling()) {
      if (!cursor.gotoParent()) return false // reached root
    }
    return true
  }

  let reachedRoot = false
  while (!reachedRoot) {
    const type = cursor.nodeType

    if (chunkNodeTypes.has(type)) {
      candidates.push({
        startIndex: cursor.startIndex,
        endIndex: cursor.endIndex,
        startLine: cursor.startPosition.row + 1,
        endLine: cursor.endPosition.row + 1,
      })
      // Skip the matched node's subtree entirely
      if (!skipAndAdvance()) reachedRoot = true
      continue
    }

    // For JS/TS: promote arrow functions / function expressions that are
    // direct children of an export/const/let/var declaration
    if (type === 'arrow_function' || type === 'function_expression') {
      const parent = cursor.currentNode.parent
      if (parent && EXPORT_PARENTS.has(parent.type)) {
        candidates.push({
          startIndex: parent.startIndex,
          endIndex: parent.endIndex,
          startLine: parent.startPosition.row + 1,
          endLine: parent.endPosition.row + 1,
        })
        if (!skipAndAdvance()) reachedRoot = true
        continue
      }
    }

    // Descend into this node; if no children, advance past it
    if (!cursor.gotoFirstChild()) {
      if (!skipAndAdvance()) reachedRoot = true
    }
  }

  return candidates
}

// --- Orphan gap handling ---

function orphanChunks(
  content: string,
  candidates: ChunkCandidate[],
  config: ChunkerConfig
): Chunk[] {
  const lines = content.split('\n')
  const minChunkChars = config.minChunkChars ?? 20
  const sorted = [...candidates].sort((a, b) => a.startLine - b.startLine)

  const orphanRanges: Array<{ startLine: number; endLine: number }> = []
  let cursor = 1

  for (const c of sorted) {
    if (c.startLine > cursor) {
      orphanRanges.push({ startLine: cursor, endLine: c.startLine - 1 })
    }
    cursor = c.endLine + 1
  }

  if (cursor <= lines.length) {
    orphanRanges.push({ startLine: cursor, endLine: lines.length })
  }

  const result: Chunk[] = []
  for (const range of orphanRanges) {
    const rangeContent = lines.slice(range.startLine - 1, range.endLine).join('\n').trim()
    if (rangeContent.length < minChunkChars) continue

    const sub = chunkBySlidingWindow(rangeContent, config)
    for (const chunk of sub) {
      result.push({
        content: chunk.content,
        startLine: range.startLine + chunk.startLine - 1,
        endLine: range.startLine + chunk.endLine - 1,
      })
    }
  }

  return result
}

// --- Public entry point ---

export function detectLanguage(filepath: string): LangKey | null {
  const filename = filepath.split('/').pop() ?? ''
  if (filename.endsWith('.blade.php')) return 'php'
  const ext = filename.split('.').pop() ?? ''
  return EXT_TO_LANG[ext] ?? null
}

export function chunkByAST(
  content: string,
  filepath: string,
  config: ChunkerConfig = {}
): Chunk[] {
  const lang = detectLanguage(filepath)
  if (!lang) return chunkBySlidingWindow(content, config)

  try {
    const language = loadLanguage(lang)
    const parser = new TreeSitter()
    parser.setLanguage(language)
    const tree = parser.parse(content)

    const chunkNodeTypes = CHUNK_NODES[lang]
    const candidates = collectChunkNodes(tree, chunkNodeTypes)

    if (candidates.length === 0) {
      return chunkBySlidingWindow(content, config)
    }

    const minChunkChars = config.minChunkChars ?? 20
    const astChunks: Chunk[] = candidates
      .filter(c => content.slice(c.startIndex, c.endIndex).trim().length >= minChunkChars)
      .map(c => ({
        content: content.slice(c.startIndex, c.endIndex).trim(),
        startLine: c.startLine,
        endLine: c.endLine,
      }))

    const gaps = orphanChunks(content, candidates, config)

    return [...astChunks, ...gaps].sort((a, b) => a.startLine - b.startLine)
  } catch {
    return chunkBySlidingWindow(content, config)
  }
}
