// src/config/config.ts
// Loads and validates the project config from .mcplens/config.json

import fs from 'fs'
import path from 'path'
import { EmbeddingsConfig } from '../indexer/embeddings.js'

export interface ProjectConfig {
  embeddings: EmbeddingsConfig
  extensions?: string[]
  ignore?: string[]
  search?: {
    topK?: number
    minScore?: number
    hybridAlpha?: number  // 0 = pure semantic, 1 = pure BM25, default 0.3
  }
}

const DEFAULT_CONFIG: ProjectConfig = {
  embeddings: {
    provider: 'ollama',
    ollamaUrl: 'http://localhost:11434',
    ollamaModel: 'nomic-embed-text:latest',
  },
  search: {
    topK: 5,
    minScore: 0.3,
    hybridAlpha: 0.3,
  },
}

export function loadConfig(projectRoot: string): ProjectConfig {
  const configPath = path.join(projectRoot, '.mcplens', 'config.json')

  if (!fs.existsSync(configPath)) {
    return DEFAULT_CONFIG
  }

  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    return {
      ...DEFAULT_CONFIG,
      ...raw,
      search: { ...DEFAULT_CONFIG.search, ...raw.search },
    }
  } catch {
    process.stderr.write(`[mcplens] invalid config at ${configPath}, using defaults\n`)
    return DEFAULT_CONFIG
  }
}

export function writeDefaultConfig(projectRoot: string): void {
  const dir = path.join(projectRoot, '.mcplens')
  const configPath = path.join(dir, 'config.json')

  if (fs.existsSync(configPath)) return

  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n')
}
