#!/usr/bin/env node
import { rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

function safeRm(targetPath) {
  if (existsSync(targetPath)) {
    rmSync(targetPath, { recursive: true, force: true })
  }
}

function run(command, args, options) {
  const res = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  })
  if (res.status !== 0) process.exit(res.status ?? 1)
}

const root = process.cwd()

// 1) Remove dist and node_modules in root
safeRm(join(root, 'dist'))
safeRm(join(root, 'node_modules'))

// 2) Gradle clean in android
const androidDir = join(root, 'android')
const isWindows = process.platform === 'win32'
const gradleCmd = isWindows ? 'gradlew.bat' : './gradlew'
run(gradleCmd, ['clean'], { cwd: androidDir })

// 3) Reinstall root deps
run('npm', ['install'], { cwd: root })
