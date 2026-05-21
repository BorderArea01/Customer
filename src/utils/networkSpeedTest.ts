/**
 * 网络连接测试工具 - 基于 Ping 的简化实现
 */


export interface NetworkSpeedResult {
  // 为兼容旧版组件保留以下两个字段，固定为 0
  downloadSpeed: number
  uploadSpeed: number
  // 新版基于 ping 的指标
  latency: number
  packetLoss: number
  status: 'testing' | 'completed' | 'error'
  error?: string
  timestamp: number
}

export interface NetworkSpeedConfig {
  timeout?: number
  pingCount?: number
  testServer: string  // 必填：测试服务器地址
  // 为兼容旧调用保留，实际不使用
  testFileSize?: number
}

const DEFAULT_CONFIG: Partial<NetworkSpeedConfig> = {
  timeout: 5000,
  pingCount: 3,
  testFileSize: 512 * 1024
}

/**
 * 执行 HTTP ping 测试
 * @param server 测试服务器地址
 * @param timeout 超时时间
 * @returns 延迟时间(ms)
 */
async function httpPing(server: string, timeout: number): Promise<number> {
  const startTime = performance.now()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)
  
  try {
    // 使用 HEAD 请求进行 ping 测试
    await fetch(server, {
      method: 'HEAD',
      signal: controller.signal,
      cache: 'no-cache'
    })
    
    return Math.round(performance.now() - startTime)
  } catch (error) {
    throw new Error(`Ping 失败: ${error instanceof Error ? error.message : '未知错误'}`)
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * 执行多次 ping 测试获取平均延迟和丢包率
 * @param server 测试服务器地址
 * @param count ping 次数
 * @param timeout 单次超时时间
 * @returns 平均延迟和丢包率
 */
async function multiPing(server: string, count: number, timeout: number): Promise<{
  avgLatency: number
  packetLoss: number
}> {
  const results: number[] = []
  let successCount = 0
  
  for (let i = 0; i < count; i++) {
    try {
      const latency = await httpPing(server, timeout)
      results.push(latency)
      successCount++
    } catch {
      // ping 失败，不计入结果
    }
  }
  
  const packetLoss = ((count - successCount) / count) * 100
  const avgLatency = results.length > 0 
    ? Math.round(results.reduce((sum, latency) => sum + latency, 0) / results.length)
    : 0
  
  return { avgLatency, packetLoss }
}

export async function testNetworkSpeed(config: NetworkSpeedConfig): Promise<NetworkSpeedResult> {
  if (!config.testServer) {
    throw new Error('testServer 参数是必需的，请提供测试服务器地址')
  }
  
  const finalConfig = { ...DEFAULT_CONFIG, ...config }
  
  try {
    const { avgLatency, packetLoss } = await multiPing(
      finalConfig.testServer, 
      finalConfig.pingCount || 3, 
      finalConfig.timeout || 5000
    )
    
    return {
      downloadSpeed: 0,
      uploadSpeed: 0,
      latency: avgLatency,
      packetLoss,
      status: 'completed',
      timestamp: Date.now()
    }
  } catch (error) {
    return {
      downloadSpeed: 0,
      uploadSpeed: 0,
      latency: 0,
      packetLoss: 100,
      status: 'error',
      error: error instanceof Error ? error.message : '网络测试失败',
      timestamp: Date.now()
    }
  }
}

export async function quickNetworkTest(server: string): Promise<{
  success: boolean
  latency: number
  message: string
}> {
  if (!server) {
    return {
      success: false,
      latency: 0,
      message: '服务器地址不能为空'
    }
  }
  
  try {
    const latency = await httpPing(server, 3000)
    return {
      success: true,
      latency,
      message: `网络连接正常，延迟: ${latency}ms`
    }
  } catch (error) {
    return {
      success: false,
      latency: 0,
      message: error instanceof Error ? error.message : '网络连接失败'
    }
  }
}

export function formatLatency(latency: number): string {
  return latency >= 1000 ? `${(latency / 1000).toFixed(1)}s` : `${latency}ms`
}

export function formatPacketLoss(packetLoss: number): string {
  return `${packetLoss.toFixed(1)}%`
}

// 兼容旧版：保留 formatNetworkSpeed 导出
export function formatNetworkSpeed(speed: number): string {
  if (speed >= 1000) return `${(speed / 1000).toFixed(1)}Gbps`
  if (speed >= 1) return `${speed.toFixed(1)}Mbps`
  return `${(speed * 1000).toFixed(0)}Kbps`
}

// 新版：基于延迟与丢包率
export function getNetworkQuality(latency: number, packetLoss: number): {
  level: 'excellent' | 'good' | 'fair' | 'poor'
  label: string
  color: string
} {
  // 基于延迟和丢包率评估网络质量
  if (latency < 50 && packetLoss < 5) {
    return { level: 'excellent', label: '优秀', color: '#10b981' }
  }
  if (latency < 100 && packetLoss < 10) {
    return { level: 'good', label: '良好', color: '#3b82f6' }
  }
  if (latency < 200 && packetLoss < 20) {
    return { level: 'fair', label: '一般', color: '#f59e0b' }
  }
  return { level: 'poor', label: '较差', color: '#ef4444' }
}

// 兼容旧签名包装：接受 (downloadSpeed, latency)
export function getNetworkQualityLegacy(downloadSpeed: number, latency: number) {
  // 将下载速度影响弱化，仅用延迟做判断以保持宽松
  return getNetworkQuality(latency, 0)
}

