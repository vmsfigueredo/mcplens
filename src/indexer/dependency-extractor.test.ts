import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { extractDependencies } from './dependency-extractor.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcplens-dep-test-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function touch(rel: string): void {
  const abs = path.join(tmpDir, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, '')
}

// ---------------------------------------------------------------------------
// TypeScript / JavaScript
// ---------------------------------------------------------------------------

describe('extractDependencies — typescript', () => {
  it('resolves a relative import with explicit extension', () => {
    touch('src/utils.ts')
    const content = `import { foo } from './utils.ts'`
    const result = extractDependencies(content, 'src/index.ts', tmpDir, 'typescript')
    expect(result).toContain('src/utils.ts')
  })

  it('resolves a relative import without extension by trying .ts', () => {
    touch('src/utils.ts')
    const content = `import { foo } from './utils'`
    const result = extractDependencies(content, 'src/index.ts', tmpDir, 'typescript')
    expect(result).toContain('src/utils.ts')
  })

  it('resolves a parent-dir import', () => {
    touch('src/shared.ts')
    const content = `import something from '../shared'`
    const result = extractDependencies(content, 'src/sub/file.ts', tmpDir, 'typescript')
    expect(result).toContain('src/shared.ts')
  })

  it('resolves a directory index import', () => {
    touch('src/lib/index.ts')
    const content = `import lib from './lib'`
    const result = extractDependencies(content, 'src/index.ts', tmpDir, 'typescript')
    expect(result).toContain('src/lib/index.ts')
  })

  it('resolves dynamic import()', () => {
    touch('src/lazy.ts')
    const content = `const m = await import('./lazy')`
    const result = extractDependencies(content, 'src/index.ts', tmpDir, 'typescript')
    expect(result).toContain('src/lazy.ts')
  })

  it('resolves require()', () => {
    touch('src/cjs.js')
    const content = `const x = require('./cjs.js')`
    const result = extractDependencies(content, 'src/index.ts', tmpDir, 'typescript')
    expect(result).toContain('src/cjs.js')
  })

  it('ignores package (node_modules) imports', () => {
    const content = `import React from 'react'\nimport { z } from 'zod'`
    const result = extractDependencies(content, 'src/index.ts', tmpDir, 'typescript')
    expect(result).toHaveLength(0)
  })

  it('silently drops unresolvable local imports', () => {
    const content = `import x from './does-not-exist'`
    const result = extractDependencies(content, 'src/index.ts', tmpDir, 'typescript')
    expect(result).toHaveLength(0)
  })

  it('deduplicates results', () => {
    touch('src/utils.ts')
    const content = `import a from './utils'\nimport b from './utils.ts'`
    const result = extractDependencies(content, 'src/index.ts', tmpDir, 'typescript')
    expect(result.filter(f => f === 'src/utils.ts')).toHaveLength(1)
  })

  it('excludes self-references', () => {
    touch('src/index.ts')
    const content = `import x from './index'`
    const result = extractDependencies(content, 'src/index.ts', tmpDir, 'typescript')
    expect(result).not.toContain('src/index.ts')
  })
})

describe('extractDependencies — svelte', () => {
  it('resolves a Svelte component import', () => {
    touch('src/Button.svelte')
    const content = `import Button from './Button.svelte'`
    const result = extractDependencies(content, 'src/App.svelte', tmpDir, 'svelte')
    expect(result).toContain('src/Button.svelte')
  })

  it('resolves a ts util from a svelte file', () => {
    touch('src/utils.ts')
    const content = `import { helper } from './utils'`
    const result = extractDependencies(content, 'src/App.svelte', tmpDir, 'svelte')
    expect(result).toContain('src/utils.ts')
  })
})

// ---------------------------------------------------------------------------
// PHP
// ---------------------------------------------------------------------------

describe('extractDependencies — php', () => {
  it('resolves a use statement via PSR-4 heuristic (lowercase first segment)', () => {
    touch('app/Domain/Payments/PaymentService.php')
    const content = `use App\\Domain\\Payments\\PaymentService;`
    const result = extractDependencies(content, 'app/Http/Controller.php', tmpDir, 'php')
    expect(result).toContain('app/Domain/Payments/PaymentService.php')
  })

  it('resolves a require_once with __DIR__ concatenation', () => {
    touch('app/helpers.php')
    const content = `require_once __DIR__ . '/helpers.php'`
    const result = extractDependencies(content, 'app/bootstrap.php', tmpDir, 'php')
    expect(result).toContain('app/helpers.php')
  })

  it('ignores use statements whose path does not exist on disk', () => {
    const content = `use App\\NonExistent\\Service;`
    const result = extractDependencies(content, 'app/Foo.php', tmpDir, 'php')
    expect(result).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Python
// ---------------------------------------------------------------------------

describe('extractDependencies — python', () => {
  it('resolves a relative from-import (.module)', () => {
    touch('src/utils.py')
    const content = `from .utils import something`
    const result = extractDependencies(content, 'src/main.py', tmpDir, 'python')
    expect(result).toContain('src/utils.py')
  })

  it('resolves a two-dot relative from-import (..module)', () => {
    touch('src/shared.py')
    const content = `from ..shared import helper`
    const result = extractDependencies(content, 'src/sub/file.py', tmpDir, 'python')
    expect(result).toContain('src/shared.py')
  })

  it('ignores absolute (stdlib/package) imports', () => {
    const content = `import os\nimport sys\nfrom pathlib import Path`
    const result = extractDependencies(content, 'src/main.py', tmpDir, 'python')
    expect(result).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Error resilience
// ---------------------------------------------------------------------------

describe('extractDependencies — error resilience', () => {
  it('returns empty array for an unknown language', () => {
    const result = extractDependencies('anything', 'file.rb', tmpDir, 'ruby')
    expect(result).toEqual([])
  })
})
