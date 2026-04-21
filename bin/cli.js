#!/usr/bin/env node
import { fileURLToPath } from 'url'
import path from 'path'
import { createRequire } from 'module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const entryPoint = path.resolve(__dirname, '../dist/cli/cli.js')

// Dynamic import so errors surface cleanly
await import(entryPoint)
