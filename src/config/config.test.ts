import { describe, it, expect, vi, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { loadConfig, writeDefaultConfig } from './config.js'

let tmpDir: string

function setup() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcplens-cfg-'))
  return tmpDir
}

function teardown() {
  fs.rmSync(tmpDir, { recursive: true, force: true })
}

afterEach(teardown)

// ---------------------------------------------------------------------------
// loadConfig
// ---------------------------------------------------------------------------

describe('loadConfig', () => {
  it('returns defaults when config file does not exist', () => {
    setup()
    const cfg = loadConfig(tmpDir)
    expect(cfg.embeddings.provider).toBe('ollama')
    expect(cfg.search?.topK).toBe(5)
    expect(cfg.search?.minScore).toBe(0.3)
  })

  it('merges user config over defaults', () => {
    setup()
    const dir = path.join(tmpDir, '.mcplens')
    fs.mkdirSync(dir)
    fs.writeFileSync(
      path.join(dir, 'config.json'),
      JSON.stringify({ ignore: ['**/fixtures/**'], search: { topK: 10 } })
    )
    const cfg = loadConfig(tmpDir)
    expect(cfg.ignore).toEqual(['**/fixtures/**'])
    expect(cfg.search?.topK).toBe(10)
    // defaults still present where not overridden
    expect(cfg.embeddings.provider).toBe('ollama')
  })

  it('returns defaults and writes to stderr on invalid JSON', () => {
    setup()
    const dir = path.join(tmpDir, '.mcplens')
    fs.mkdirSync(dir)
    fs.writeFileSync(path.join(dir, 'config.json'), '{ invalid json }')

    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const cfg = loadConfig(tmpDir)
    expect(cfg.embeddings.provider).toBe('ollama')
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('invalid config'))
    spy.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// writeDefaultConfig
// ---------------------------------------------------------------------------

describe('writeDefaultConfig', () => {
  it('creates the config file when it does not exist', () => {
    setup()
    writeDefaultConfig(tmpDir)
    const configPath = path.join(tmpDir, '.mcplens', 'config.json')
    expect(fs.existsSync(configPath)).toBe(true)
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    expect(raw.embeddings.provider).toBe('ollama')
  })

  it('does not overwrite an existing config file', () => {
    setup()
    const dir = path.join(tmpDir, '.mcplens')
    fs.mkdirSync(dir)
    const configPath = path.join(dir, 'config.json')
    fs.writeFileSync(configPath, JSON.stringify({ custom: true }))

    writeDefaultConfig(tmpDir)
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    expect(raw.custom).toBe(true)
  })
})
