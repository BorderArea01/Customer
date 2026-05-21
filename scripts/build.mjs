#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

// 解析命令行参数
const args = process.argv.slice(2)
const isClean = args.includes('--clean')
const isDebug = args.includes('--debug')
const skipPlugins = args.includes('--no-plugins')
const customVersionCode = args.find((arg) => arg.startsWith('--version-code='))?.split('=')[1]

// 项目根目录
const rootDir = process.cwd()
const packageJsonPath = join(rootDir, 'package.json')
const androidBuildGradlePath = join(rootDir, 'android/app/build.gradle')

// 工具函数
function runCommand(command, args, options = {}) {
  console.log(`\n🚀 执行: ${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  })
  if (result.status !== 0) {
    console.error(`❌ 命令执行失败: ${command} ${args.join(' ')}`)
    process.exit(result.status ?? 1)
  }
  return result
}

function readPackageVersion() {
  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
    return packageJson.version
  } catch (error) {
    console.error('❌ 无法读取package.json版本信息:', error.message)
    process.exit(1)
  }
}

function generateVersionCode(version) {
  if (customVersionCode) {
    return parseInt(customVersionCode, 10)
  }

  // 将版本号转换为versionCode: "x.y.z" -> x*10000 + y*100 + z
  const parts = version.split('.').map(Number)
  if (parts.length >= 3) {
    return parts[0] * 10000 + parts[1] * 100 + parts[2]
  }
  return 1
}

function updateAndroidVersion(version, versionCode) {
  try {
    let buildGradleContent = readFileSync(androidBuildGradlePath, 'utf8')

    // 更新versionName
    buildGradleContent = buildGradleContent.replace(
      /versionName\s+["'][^"']*["']/,
      `versionName "${version}"`,
    )

    // 更新versionCode
    buildGradleContent = buildGradleContent.replace(
      /versionCode\s+\d+/,
      `versionCode ${versionCode}`,
    )

    writeFileSync(androidBuildGradlePath, buildGradleContent, 'utf8')
    console.log(`✅ Android版本已更新: versionName="${version}", versionCode=${versionCode}`)
  } catch (error) {
    console.error('❌ 更新Android版本失败:', error.message)
    process.exit(1)
  }
}

function cleanBuild() {
  console.log('\n🧹 清理构建缓存...')
  runCommand('npm', ['run', 'clean'], { cwd: rootDir })
}

function buildPlugins() {
  if (skipPlugins) {
    console.log('\n⏭️  跳过插件构建...')
    return
  }
  console.log('\n🔧 构建插件...')
  runCommand('npm', ['run', 'plugin:build'], { cwd: rootDir })
}

function buildFrontend() {
  console.log('\n📦 构建前端...')
  runCommand('npm', ['run', 'build-only'], { cwd: rootDir })
}

function syncCapacitor() {
  console.log('\n🔄 同步Capacitor...')
  runCommand('npx', ['cap', 'sync'], { cwd: rootDir })
}

function buildAndroid(buildType) {
  console.log(`\n🤖 构建Android ${buildType}版本...`)
  const androidDir = join(rootDir, 'android')

  if (process.platform === 'win32') {
    const task = buildType.toLowerCase() === 'debug' ? 'assembleDebug' : 'assembleRelease'
    const gradlePath = join(androidDir, 'gradlew.bat')
    // Windows需要用cmd.exe执行.bat文件
    runCommand('cmd', ['/c', gradlePath, task], { cwd: androidDir, shell: false })
  } else {
    const task = buildType.toLowerCase() === 'debug' ? 'assembleDebug' : 'assembleRelease'
    runCommand('./gradlew', [task], { cwd: androidDir })
  }
}

function showBuildInfo(version, versionCode, buildType) {
  console.log('\n' + '='.repeat(60))
  console.log('📋 构建信息')
  console.log('='.repeat(60))
  console.log(`版本号: ${version}`)
  console.log(`版本代码: ${versionCode}`)
  console.log(`构建类型: ${buildType}`)
  console.log(`构建时间: ${new Date().toLocaleString()}`)
  console.log('='.repeat(60))
}

function main() {
  console.log('🎯 开始Android应用打包流程...')

  // 1. 读取版本信息
  const version = readPackageVersion()
  const versionCode = generateVersionCode(version)

  console.log(`📖 当前版本: ${version} (versionCode: ${versionCode})`)

  // 2. 更新Android版本
  updateAndroidVersion(version, versionCode)

  // 3. 显示构建信息
  const buildType = isDebug ? 'Debug' : 'Release'
  showBuildInfo(version, versionCode, buildType)

  // 4. 清理构建缓存（可选）
  if (isClean) {
    cleanBuild()
  }

  // 5. 构建流程
  buildPlugins()
  buildFrontend()
  syncCapacitor()
  buildAndroid(buildType)

  console.log('\n🎉 构建完成!')
  console.log(`📱 APK文件位置: android/app/build/outputs/apk/${isDebug ? 'debug' : 'release'}/`)
}

// 执行主函数
main()
