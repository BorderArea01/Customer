#!/usr/bin/env node
import { readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

function runCommand(command, args, options) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function getPluginDirectories(rootDir) {
  const pluginsDir = join(rootDir, 'plugins')
  let entries = []
  try {
    entries = readdirSync(pluginsDir, { withFileTypes: true })
  } catch {
    return []
  }
  return entries.filter((entry) => entry.isDirectory()).map((entry) => join(pluginsDir, entry.name))
}

function hasPackageJson(dir) {
  return existsSync(join(dir, 'package.json'))
}

function detectPackageManager() {
  return {
    name: 'npm',
    installCmd: 'npm',
    installArgs: ['install', '--no-package-lock'],
    buildCmd: 'npm',
    buildArgs: ['run', 'build'],
  }
}

const action = process.argv[2] || 'install'
const rootDir = process.cwd()
const pluginDirs = getPluginDirectories(rootDir)
const pm = detectPackageManager()

for (const dir of pluginDirs) {
  if (!hasPackageJson(dir)) continue

  if (action === 'install') {
    runCommand(pm.installCmd, pm.installArgs, { cwd: dir })
  } else if (action === 'build') {
    // Always install to ensure local CLI tools like `docgen` are present
    runCommand(pm.installCmd, pm.installArgs, { cwd: dir })
    runCommand(pm.buildCmd, pm.buildArgs, { cwd: dir })
  } else if (action === 'build:fresh') {
    // Fresh build with cache clearing
    runCommand(pm.installCmd, pm.installArgs, { cwd: dir })
    runCommand(pm.buildCmd, ['run', 'build:fresh'], { cwd: dir })
  } else {
    console.error(`Unknown action: ${action}. Use 'install', 'build', or 'build:fresh'.`)
    process.exit(1)
  }
}

process.exit(0)
