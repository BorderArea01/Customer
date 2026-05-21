import { reactive, onMounted, onUnmounted } from 'vue'
import { useExceptionStore } from '@/stores/exception'
import { useAppConfigStore } from '@/stores/appConfig'
import * as FunasrMod from 'capacitor-funasr'
import type { PluginListenerHandle } from '@capacitor/core'

// 兼容插件类型与导出不一致的情况
const LzwcFunasr: any = (FunasrMod as any).LzwcFunasr

// 本地类型定义，避免对外部声明依赖
export interface AudioDevice {
  id: string
  name: string
  type: 'microphone' | 'headset' | 'bluetooth' | 'default'
}

export interface RecognitionResult {
  text: string
  isFinal: boolean
  mode: string
  timestamp?: number
}

export interface ConnectionStatus {
  connected: boolean
  status: string
  message?: string
}

export interface ErrorEvent {
  error: string
  code?: number
  message?: string
}

export interface HistoryItem {
  id: string
  text: string
  timestamp: Date
  isFinal: boolean
}

export interface ListenState {
  isListening: boolean
  isConnected: boolean
  statusText: string
  statusClass: string
  partialText: string // 实时显示文本（来自 2pass-online）
  finalText: string // 最终发送文本（优先来自 2pass-offline，为空时回退到 onlineSnapshot）
  accumulatedText: string // 向后兼容字段，保持与 finalText 同步
  offlineAccumulatedText: string // 2pass-offline模式的累积缓冲区
  onlineSnapshot: string // 2pass-online模式的最新文本快照（用于回退）
  error: string | null
  audioDevices: AudioDevice[]
  selectedDevice: string
  history: HistoryItem[]
  hasPermissions: boolean
  permissionsText: string
  permissionsClass: string
}

export interface UseListenOptions {
  serverUrl?: string
  port?: number
  mode?: string
  chunkSize?: string
  chunkInterval?: number
  sampleRate?: number
  wavFormat?: string
  hotWords?: string
  autoInit?: boolean
}

// 常量配置
const DUPLICATE_THRESHOLD = 100 // 100ms内的相同结果视为重复
const HEARTBEAT_INTERVAL = 30000 // 30秒发送一次心跳
const DEVICE_MONITOR_INTERVAL = 30000 // 30秒检测一次设备状态
const RECONNECT_INTERVAL = 5000 // 固定重连间隔5秒（与MQTT统一）
const TEMP_WAIT_MS = 1200 // 停止监听等待时间

export function useListen(options: UseListenOptions = {}) {
  // 状态管理
  const state = reactive<ListenState>({
    isListening: false,
    isConnected: false,
    statusText: '未初始化',
    statusClass: 'inactive',
    partialText: '',
    finalText: '',
    accumulatedText: '',
    offlineAccumulatedText: '',
    onlineSnapshot: '',
    error: null,
    audioDevices: [],
    selectedDevice: '',
    history: [],
    hasPermissions: false,
    permissionsText: '未知',
    permissionsClass: 'permission-unknown'
  })

  // 获取配置中的 FunASR URL
  const appConfigStore = useAppConfigStore()

  // 配置选项
  const config = reactive({
    serverUrl: appConfigStore.speechRecognition?.url || '',
    mode: options.mode || '2pass',
    chunkSize: options.chunkSize || '5,10,5',
    chunkInterval: options.chunkInterval || 10,
    sampleRate: options.sampleRate || 16000,
    wavFormat: options.wavFormat || 'PCM',
    hotWords: options.hotWords || '阿里巴巴 20\n灵泽万川 20\n夜雨飘零 20'
  })

  // 事件回调集合
  const resultCallbacks: Array<(result: RecognitionResult) => void> = []
  const connectionCallbacks: Array<(status: ConnectionStatus) => void> = []
  const errorCallbacks: Array<(event: ErrorEvent) => void> = []
  const reconnectFailedCallbacks: Array<() => void> = []

  // 插件监听句柄
  let listenerHandles: PluginListenerHandle[] = []

  // 防重复处理机制
  let lastProcessedResult: { text: string; timestamp: number } | null = null

  // 当前识别模式（用于处理最后一条消息没有 mode 字段的情况）
  let currentRecognitionMode: string = ''

  // 定时器管理
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  // 自动重连相关变量
  let reconnectAttempts = 0
  let isReconnecting = false
  let isManualDisconnect = false

  // 工具函数：安全调用异常存储
  const safeExceptionCall = <T>(fn: () => T): T | undefined => {
    try {
      return fn()
    } catch {
      return undefined
    }
  }

  // 工具函数：报告异常
  const reportException = (params: {
    severity: 'high' | 'medium' | 'low'
    title: string
    detail: string
    source: string
    code: string
    dedupeKey: string
  }) => {
    safeExceptionCall(() => {
      useExceptionStore().report(params)
    })
  }

  // 工具函数：解决异常
  const resolveException = (key: string) => {
    safeExceptionCall(() => {
      useExceptionStore().resolveByKey(key)
    })
  }

  // 工具函数：更新状态
  const updateStatus = (text: string, className: string, error: string | null = null) => {
    state.statusText = text
    state.statusClass = className
    if (error !== undefined) {
      state.error = error
    }
  }

  // 工具函数：重置识别状态
  const resetRecognitionState = () => {
    state.finalText = ''
    state.accumulatedText = ''
    state.partialText = ''
    state.offlineAccumulatedText = ''
    state.onlineSnapshot = ''
    lastProcessedResult = null
    currentRecognitionMode = ''
  }

  // 工具函数：创建订阅函数（统一回调管理）
  const createSubscription = <T>(callbacks: Array<(data: T) => void>) => {
    return (cb: (data: T) => void): (() => void) => {
      callbacks.push(cb)
      return () => {
        const idx = callbacks.indexOf(cb)
        if (idx >= 0) callbacks.splice(idx, 1)
      }
    }
  }

  // 工具函数：安全执行回调
  const safeInvokeCallbacks = <T>(callbacks: Array<(data: T) => void>, data: T) => {
    callbacks.forEach(cb => {
      try {
        cb(data)
      } catch (err) {
        console.error('回调执行异常:', err)
      }
    })
  }

  // 定时器管理：统一启动/停止模式
  const createTimer = (
    name: string,
    interval: number,
    callback: () => void | Promise<void>
  ) => {
    let timer: ReturnType<typeof setInterval> | null = null

    return {
      start: () => {
        if (timer) return
        console.log(`⏰ [${name}] 启动定时器，间隔: ${interval}ms`)
        timer = setInterval(async () => {
          try {
            await callback()
          } catch (error) {
            console.error(`❌ [${name}] 定时器执行异常:`, error)
          }
        }, interval)
      },
      stop: () => {
        if (timer) {
          clearInterval(timer)
          timer = null
          console.log(`⏰ [${name}] 定时器已停止`)
        }
      }
    }
  }

  // 心跳定时器
  const heartbeat = createTimer('Heartbeat', HEARTBEAT_INTERVAL, async () => {
    if (!state.isConnected) {
      heartbeat.stop()
      return
    }
    try {
      const result = await (LzwcFunasr as any).sendHeartbeat()
      if (result?.success) {
        console.log('💓 [WebSocket] 心跳发送成功')
      } else {
        console.warn('⚠️ [WebSocket] 心跳发送失败:', result?.message)
      }
    } catch (error) {
      console.error('❌ [WebSocket] 心跳发送异常:', error)
    }
  })

  // 设备监控定时器：只检测当前设备是否可用
  const deviceMonitor = createTimer('DeviceMonitor', DEVICE_MONITOR_INTERVAL, async () => {
    if (!state.isConnected || !state.selectedDevice) return

    try {
      const result = await LzwcFunasr.getAudioDevices()
      const devices = result.devices || []
      const deviceExists = devices.some((d: AudioDevice) => d.id === state.selectedDevice)

      if (!deviceExists) {
        // 当前设备不可用，上报异常
        reportException({
          severity: 'high',
          title: '麦克风异常',
          detail: '当前选中的麦克风设备已离线',
          source: 'Audio',
          code: 'MIC_DEVICE_OFFLINE',
          dedupeKey: 'microphone-error'
        })
      } else {
        // 设备正常，清除异常
        resolveException('microphone-error')
      }
    } catch (error) {
      console.error('❌ [AudioDevice] 设备检测失败:', error)
    }
  })

  // 启动所有后台服务
  const startBackgroundServices = () => {
    heartbeat.start()
    deviceMonitor.start()
  }

  // 停止所有后台服务
  const stopBackgroundServices = () => {
    heartbeat.stop()
    deviceMonitor.stop()
  }

  // 处理识别结果（根据模式）
  const handleRecognitionResult = (text: string, isFinal: boolean, mode: string) => {
    // 更新当前识别模式（如果 mode 不为空）
    if (mode) {
      currentRecognitionMode = mode
    } else if (!currentRecognitionMode && mode === '') {
      // 如果 mode 为空且当前模式也为空，尝试从状态推断
      // 如果 offlineAccumulatedText 有值，说明之前是 2pass-offline 模式
      if (state.offlineAccumulatedText) {
        currentRecognitionMode = '2pass-offline'
      } else if (state.onlineSnapshot) {
        currentRecognitionMode = '2pass-online'
      }
    }

    // 使用当前模式（如果传入的 mode 为空）
    const effectiveMode = mode || currentRecognitionMode

    // 处理空文本的最终结果（优先处理，避免累积文本被清空）
    if (isFinal && !text) {
      if (effectiveMode === '2pass-offline') {
        // 优先使用 offlineAccumulatedText（2pass-offline 的累积结果）
        const offlineResult = state.offlineAccumulatedText.trim()
        if (offlineResult) {
          state.finalText = offlineResult
          state.accumulatedText = offlineResult
        } else {
          // 如果 offlineAccumulatedText 为空，回退到 onlineSnapshot
          const fallbackText = state.onlineSnapshot.trim()
          state.finalText = fallbackText || ''
          state.accumulatedText = fallbackText || ''
        }
      } else if (effectiveMode === '2pass-online') {
        // 2pass-online 模式，使用 onlineSnapshot
        const onlineResult = state.onlineSnapshot.trim()
        state.finalText = onlineResult || ''
        state.accumulatedText = onlineResult || ''
      } else {
        // 其他模式，清空结果
        state.finalText = ''
        state.accumulatedText = ''
      }

      // 清空所有临时状态
      state.partialText = ''
      state.offlineAccumulatedText = ''
      state.onlineSnapshot = ''
      currentRecognitionMode = ''

      // 添加历史记录（如果有最终文本）
      if (state.finalText) {
        state.history.push({
          id: `rec_${Date.now()}`,
          text: state.finalText,
          timestamp: new Date(),
          isFinal: true
        })
      }
      return
    }

    // 正常处理非空文本或非最终结果
    if (effectiveMode === '2pass-online') {
      if (isFinal) {
        state.partialText = ''
        state.onlineSnapshot = text
      } else {
        state.partialText = (state.partialText || '') + text
        state.onlineSnapshot = state.partialText
      }
    } else if (effectiveMode === '2pass-offline') {
      if (isFinal) {
        // 拼接累积文本和当前文本
        const finalResult = (state.offlineAccumulatedText + text).trim()
        if (finalResult) {
          state.finalText = finalResult
          state.accumulatedText = finalResult
        } else {
          // 如果最终结果为空，回退到 onlineSnapshot
          const fallbackText = state.onlineSnapshot.trim()
          state.finalText = fallbackText
          state.accumulatedText = fallbackText
        }
        // 清空临时状态
        state.partialText = ''
        state.offlineAccumulatedText = ''
        state.onlineSnapshot = ''
        currentRecognitionMode = ''
      } else {
        // 非最终结果，累积到 offlineAccumulatedText
        state.offlineAccumulatedText += text
      }
    } else {
      // 向后兼容模式
      if (isFinal) {
        state.finalText = text
        state.accumulatedText = text
        state.partialText = ''
        state.onlineSnapshot = text
        currentRecognitionMode = ''
      } else {
        state.accumulatedText += text
        state.partialText = state.accumulatedText
        state.onlineSnapshot = state.accumulatedText
      }
    }

    // 添加历史记录
    if (isFinal && state.finalText) {
      state.history.push({
        id: `rec_${Date.now()}`,
        text: state.finalText,
        timestamp: new Date(),
        isFinal: true
      })
    }
  }

  // 处理连接成功
  const handleConnectionSuccess = () => {
    updateStatus('已连接', 'success', null)
    state.isConnected = true
    resolveException('asr-offline')

    reconnectAttempts = 0
    isReconnecting = false
    isManualDisconnect = false
    stopReconnect()

    startBackgroundServices()
    console.log('✅ [WebSocket] 连接状态: 已连接')
  }

  // 处理连接断开
  const handleConnectionLost = (status?: string) => {
    updateStatus('连接断开', 'error')
    state.isConnected = false
    stopBackgroundServices()

    // 重连达到阈值后才弹出异常提示
    if (reconnectAttempts >= 10 && status) {
      reportException({
        severity: 'high',
        title: '语音识别服务掉线',
        detail: status,
        source: 'ASR',
        code: 'ASR_OFFLINE',
        dedupeKey: 'asr-offline'
      })
    }

    console.log('❌ [WebSocket] 连接状态: 已断开')

    if (!isManualDisconnect) {
      attemptReconnect()
    }
  }

  // 处理错误
  const handleError = (errorMessage: string) => {
    updateStatus('错误', 'error', errorMessage)
    state.isConnected = false
    stopBackgroundServices()

    // 重连达到阈值后才弹出异常提示
    if (reconnectAttempts >= 10) {
      reportException({
        severity: 'high',
        title: '语音识别服务异常',
        detail: errorMessage,
        source: 'ASR',
        code: 'ASR_ERROR',
        dedupeKey: 'asr-offline'
      })
    }

    if (!isManualDisconnect) {
      attemptReconnect()
    }
  }

  // 初始化插件
  const initialize = async () => {
    try {
      // 检查权限
      try {
        if (navigator.permissions) {
          const status = await navigator.permissions.query({ name: 'microphone' as PermissionName })
          state.hasPermissions = status.state === 'granted'
          state.permissionsText = status.state === 'granted' ? '已授权' : (status.state === 'denied' ? '已拒绝' : '未知')
          state.permissionsClass = status.state === 'granted' ? 'permission-granted' : (status.state === 'denied' ? 'permission-denied' : 'permission-unknown')

          status.onchange = () => {
            state.hasPermissions = status.state === 'granted'
            state.permissionsText = status.state === 'granted' ? '已授权' : (status.state === 'denied' ? '已拒绝' : '未知')
            state.permissionsClass = status.state === 'granted' ? 'permission-granted' : (status.state === 'denied' ? 'permission-denied' : 'permission-unknown')
          }
        } else {
          state.hasPermissions = true
          state.permissionsText = '未知'
          state.permissionsClass = 'permission-unknown'
        }
      } catch {
        console.warn('Permission check failed')
        state.hasPermissions = true
      }

      console.log('🚀 [WebSocket] 开始初始化语音识别服务...')
      updateStatus('初始化中...', 'warning', null)

      // 重置状态
      isManualDisconnect = false
      isReconnecting = false

      await LzwcFunasr.initialize(config)
      updateStatus('连接中...', 'warning')

      // 等待 WebSocket 连接建立（最多等待 5 秒）
      // 这一步是为了确保原生插件已完成握手，避免立即调用 startListening 导致 "WebSocket not connected" 错误
      let waitAttempts = 0
      const maxWaitAttempts = 10
      while (waitAttempts < maxWaitAttempts) {
        try {
          const status = await LzwcFunasr.getConnectionStatus()
          if (status.connected) {
            console.log('✅ [WebSocket] 初始化后连接已就绪')
            break
          }
        } catch {
          // 忽略检查状态的错误，继续等待
        }
        await new Promise(resolve => setTimeout(resolve, 500))
        waitAttempts++
        if (waitAttempts === maxWaitAttempts) {
          console.warn('⚠️ [WebSocket] 初始化后连接等待超时，尝试继续执行...')
        }
      }

      await connectWebSocket()
      await setupListeners()

      // 检查连接状态并启动服务
      const status = await checkConnectionStatus()
      if (status.connected) {
        console.log('💓 [WebSocket] 检测到连接已建立，启动后台服务')
        startBackgroundServices()
      }

      updateStatus('就绪', 'success')
      console.log('✅ [WebSocket] 语音识别服务初始化完成')
      resolveException('asr-offline')
    } catch (error) {
      const message = error instanceof Error ? error.message : '连接失败'
      updateStatus('连接失败', 'error', message)
      console.error('❌ [WebSocket] 初始化失败:', message, error)
      // 达到阈值后才弹出异常提示
      if (reconnectAttempts >= 10) {
        reportException({
          severity: 'high',
          title: '语音识别服务掉线',
          detail: message,
          source: 'ASR',
          code: 'ASR_OFFLINE',
          dedupeKey: 'asr-offline'
        })
      }
      // 初始化失败也需要触发自动重连，否则重连链会断开
      if (!isManualDisconnect) {
        attemptReconnect()
      }
    }
  }

  // WebSocket连接建立
  const connectWebSocket = async (isReconnect: boolean = false) => {
    try {
      console.log('🔗 [WebSocket] 开始建立连接...', { serverUrl: config.serverUrl, isReconnect })

      if (isReconnect) {
        try {
          await LzwcFunasr.disconnect()
          await new Promise(resolve => setTimeout(resolve, 500))
        } catch (error) {
          console.warn('⚠️ [WebSocket] 清理旧连接时出现警告:', error)
        }
      }

      await LzwcFunasr.startListening()
      await new Promise(resolve => setTimeout(resolve, isReconnect ? 3000 : 2000))

      try {
        await LzwcFunasr.stopListening()
      } catch (error) {
        console.warn('⚠️ [WebSocket] 停止监听时出现警告:', error)
      }

      await new Promise(resolve => setTimeout(resolve, isReconnect ? 1000 : 500))

      // 检查连接状态（重连时增加重试）
      let status = await checkConnectionStatus()
      let retryCount = 0
      const maxRetries = isReconnect ? 3 : 1

      while (!status.connected && retryCount < maxRetries) {
        retryCount++
        console.log(`🔄 [WebSocket] 连接状态检查失败，500ms 后重试 (${retryCount}/${maxRetries})...`)
        await new Promise(resolve => setTimeout(resolve, 500))
        status = await checkConnectionStatus()
      }

      if (!status.connected) {
        throw new Error('连接建立后状态验证失败')
      }

      console.log('✅ [WebSocket] 连接建立成功')
      resolveException('asr-offline')
    } catch (error) {
      const message = error instanceof Error ? error.message : '连接失败'
      updateStatus('连接失败', 'error', message)
      console.error('❌ [WebSocket] 建立连接失败:', message, error)
      // 达到阈值后才弹出异常提示
      if (reconnectAttempts >= 10) {
        reportException({
          severity: 'high',
          title: '语音识别服务掉线',
          detail: message,
          source: 'ASR',
          code: 'ASR_OFFLINE',
          dedupeKey: 'asr-offline'
        })
      }
      throw error
    }
  }

  // 注册事件监听
  const setupListeners = async () => {
    try {
      await removeListeners()

      const handles = await Promise.all([
        (LzwcFunasr as any).addListener('recognitionResult', (event: any) => {
          try {
            const text = event.text || event.Text || ''
            const isFinal = event.isFinal || event.is_final || event.IsFinal || false
            let mode = event.mode || event.Mode || ''

            // 如果 mode 为空，使用保存的当前模式
            if (!mode && currentRecognitionMode) {
              mode = currentRecognitionMode
            }

            // 更新当前识别模式（如果 mode 不为空）
            if (mode) {
              currentRecognitionMode = mode
            }

            const timestamp = Date.now()

            // 防重复处理
            if (lastProcessedResult &&
              lastProcessedResult.text === text &&
              (timestamp - lastProcessedResult.timestamp) < DUPLICATE_THRESHOLD) {
              return
            }

            lastProcessedResult = { text, timestamp }

            if (text) {
              handleRecognitionResult(text, isFinal, mode)
            } else if (isFinal) {
              handleRecognitionResult('', isFinal, mode)
            }

            // 触发外部回调（使用有效的 mode）
            safeInvokeCallbacks(resultCallbacks, {
              text: text || '',
              isFinal,
              mode: mode || currentRecognitionMode || '',
              timestamp
            })
          } catch (err) {
            console.error('处理识别结果事件失败:', err)
          }
        }),
        (LzwcFunasr as any).addListener('connectionStatusChanged', (event: ConnectionStatus) => {
          console.log('🔄 [WebSocket] 连接状态变化:', event)
          state.isConnected = !!event.connected

          if (event.connected) {
            handleConnectionSuccess()
          } else {
            handleConnectionLost(event.status)
          }

          safeInvokeCallbacks(connectionCallbacks, event)
        }),
        (LzwcFunasr as any).addListener('error', (event: ErrorEvent) => {
          console.error('❌ [WebSocket] 发生错误:', event)
          const errorMessage = event?.message || event?.error || '未知错误'
          handleError(errorMessage)
          safeInvokeCallbacks(errorCallbacks, event)
        })
      ])
      listenerHandles = handles
    } catch (err) {
      console.error('设置 FunASR 事件监听失败:', err)
    }
  }

  // 卸载事件监听
  const removeListeners = async () => {
    try {
      await Promise.all(listenerHandles.map(h => h.remove?.()))
    } catch {
      // 忽略
    } finally {
      listenerHandles = []
    }
  }

  // 停止自动重连
  const stopReconnect = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    isReconnecting = false
    reconnectAttempts = 0
  }

  // 自动重连函数（固定间隔，完全重新初始化，无限重连）
  const attemptReconnect = async () => {
    if (isReconnecting) {
      return
    }

    if (isManualDisconnect) {
      console.log('ℹ️ [WebSocket] 手动断开连接，跳过自动重连')
      return
    }

    isReconnecting = true
    reconnectAttempts++

    const delay = RECONNECT_INTERVAL // 固定5秒间隔，与MQTT统一

    console.log(`🔄 [WebSocket] 准备自动重连 (第 ${reconnectAttempts} 次)，${delay}ms 后重试...`)
    updateStatus(`重连中 (第${reconnectAttempts}次)...`, 'warning')

    reconnectTimer = setTimeout(async () => {
      try {
        console.log(`🔄 [WebSocket] 开始第 ${reconnectAttempts} 次重连尝试（完全重新初始化）...`)
        // 使用完全重新初始化，与手动重连一致，避免原生插件状态异常
        stopBackgroundServices()
        await removeListeners()
        try {
          await LzwcFunasr.disconnect()
        } catch {
          // 忽略旧连接清理错误
        }
        resetRecognitionState()
        await initialize()
        // 成功连接后才清零计数器
        reconnectAttempts = 0
        isReconnecting = false
        console.log('✅ [WebSocket] 自动重连成功')
      } catch (error) {
        console.error(`❌ [WebSocket] 第 ${reconnectAttempts} 次重连失败:`, error)
        isReconnecting = false
        attemptReconnect()
      }
    }, delay)
  }

  // 检查连接状态
  const checkConnectionStatus = async () => {
    try {
      const result = await LzwcFunasr.getConnectionStatus()
      state.isConnected = result.connected
      updateStatus(
        result.connected ? '已连接' : '连接断开',
        result.connected ? 'success' : 'error'
      )
      return result
    } catch (error) {
      console.error('检查连接状态失败:', error)
      state.isConnected = false
      return { connected: false, status: 'error' }
    }
  }

  // 断开连接
  const disconnect = async () => {
    try {
      console.log('🔌 [WebSocket] 开始断开连接...')
      isManualDisconnect = true
      stopBackgroundServices()
      stopReconnect()
      await LzwcFunasr.disconnect()
      state.isConnected = false
      state.isListening = false
      updateStatus('已断开连接', 'inactive', null)
      console.log('✅ [WebSocket] 连接已断开')
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      updateStatus('断开失败', 'error', message)
      console.error('❌ [WebSocket] 断开连接失败:', error)
    }
  }

  // 加载音频设备
  const loadAudioDevices = async () => {
    try {
      const result = await LzwcFunasr.getAudioDevices()
      const devices = result.devices || []
      state.audioDevices = devices

      // 选择默认设备
      if (devices.length > 0 && !state.selectedDevice) {
        state.selectedDevice = devices[0].id
      }

      // 检查设备状态
      if (devices.length === 0) {
        reportException({
          severity: 'high',
          title: '麦克风异常',
          detail: '未检测到可用麦克风设备',
          source: 'Audio',
          code: 'MIC_NOT_FOUND',
          dedupeKey: 'microphone-error'
        })
      } else {
        resolveException('microphone-error')
      }
    } catch (error) {
      console.error('❌ [AudioDevice] 加载音频设备失败:', error)
      state.audioDevices = []
      reportException({
        severity: 'high',
        title: '麦克风异常',
        detail: '获取音频设备列表失败',
        source: 'Audio',
        code: 'MIC_DEVICE_ERROR',
        dedupeKey: 'microphone-error'
      })
    }
  }

  // 选择音频设备
  const selectAudioDevice = async (deviceId: string) => {
    try {
      await LzwcFunasr.selectAudioDevice({ deviceId })
      state.selectedDevice = deviceId
    } catch (error) {
      console.error('选择音频设备失败:', error)
    }
  }

  // 开始监听
  const startListening = async () => {
    try {
      if (!state.isConnected) {
        updateStatus('启动失败', 'error', '请先确保连接已建立')
        return
      }

      // 启动前检测音频设备状态
      await loadAudioDevices()
      if (state.audioDevices.length === 0) {
        updateStatus('启动失败', 'error', '未检测到可用麦克风设备，无法开始监听')
        console.error('❌ [AudioDevice] 开始监听失败：无可用设备')
        return
      }

      // 检查选中的设备是否可用
      if (state.selectedDevice && !state.audioDevices.find((d: AudioDevice) => d.id === state.selectedDevice)) {
        updateStatus('启动失败', 'error', '当前选中的麦克风设备不可用')
        console.error('❌ [AudioDevice] 开始监听失败：选中的设备不可用')
        return
      }

      updateStatus('启动中...', 'warning', null)
      state.isListening = true
      resetRecognitionState()

      await LzwcFunasr.startListening()
      updateStatus('正在监听...', 'active')
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      updateStatus('启动失败', 'error', `开始识别失败: ${message}`)
      state.isListening = false
      console.error('❌ [AudioDevice] 开始识别失败:', error)
    }
  }

  // 停止监听
  const stopListening = async () => {
    try {
      console.log('🛑 [WebSocket] 开始停止监听...')
      updateStatus('停止中...', 'warning')

      let settled = false
      let receivedFinalResult = false
      const tempListener = (evt: RecognitionResult) => {
        if (evt?.isFinal && !settled) {
          settled = true
          receivedFinalResult = true
        }
      }
      const offTemp = createSubscription(resultCallbacks)(tempListener)

      const result = await LzwcFunasr.stopListening()

      if (result?.text) {
        settled = true
        receivedFinalResult = true
        const finalText = result.text.trim()
        state.finalText = finalText
        state.accumulatedText = finalText
        state.partialText = ''
        state.offlineAccumulatedText = ''
        state.onlineSnapshot = ''
      }

      if (!settled) {
        await new Promise(resolve => setTimeout(resolve, TEMP_WAIT_MS))
      }

      // 如果没有收到最终结果，使用回退机制
      if (!receivedFinalResult && !state.finalText) {
        // 优先使用 offline 累积文本（2pass-offline 模式）
        const offlineText = state.offlineAccumulatedText.trim()
        if (offlineText) {
          state.finalText = offlineText
          state.accumulatedText = offlineText
          console.log('⚠️ [WebSocket] 未收到最终结果，使用 offline 累积文本作为回退')
        } else {
          // 其次使用 online 快照（2pass-online 模式）
          const onlineText = state.onlineSnapshot.trim()
          if (onlineText) {
            state.finalText = onlineText
            state.accumulatedText = onlineText
            console.log('⚠️ [WebSocket] 未收到最终结果，使用 online 快照作为回退')
          } else {
            // 最后使用实时文本（partialText）
            const partialText = state.partialText.trim()
            if (partialText) {
              state.finalText = partialText
              state.accumulatedText = partialText
              console.log('⚠️ [WebSocket] 未收到最终结果，使用实时文本作为回退')
            } else {
              console.warn('⚠️ [WebSocket] 未收到最终结果，且无可用回退文本')
            }
          }
        }

        // 清理临时状态
        state.partialText = ''
        state.offlineAccumulatedText = ''
        state.onlineSnapshot = ''

        // 如果有回退文本，添加到历史记录
        if (state.finalText) {
          state.history.push({
            id: `rec_${Date.now()}`,
            text: state.finalText,
            timestamp: new Date(),
            isFinal: true
          })
        }
      }

      offTemp()
      state.isListening = false
      updateStatus('已停止', 'inactive')
      console.log('✅ [WebSocket] 监听已停止')
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      updateStatus('停止失败', 'error', `停止识别失败: ${message}`)
      state.isListening = false
      console.error('❌ [WebSocket] 停止识别失败:', error)
    }
  }

  // 销毁插件
  const destroy = async () => {
    try {
      console.log('🗑️ [WebSocket] 开始销毁插件...')
      isManualDisconnect = true
      stopBackgroundServices()
      stopReconnect()
      await removeListeners()
      await LzwcFunasr.disconnect()

      // 清空回调
      resultCallbacks.length = 0
      connectionCallbacks.length = 0
      errorCallbacks.length = 0
      reconnectFailedCallbacks.length = 0

      console.log('✅ [WebSocket] 插件销毁完成')
    } catch (error) {
      console.error('❌ [WebSocket] 销毁插件失败:', error)
    }
  }

  // 清除历史记录
  const clearHistory = () => {
    state.history = []
  }

  // 格式化时间
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  // 组件挂载时初始化
  onMounted(() => {
    if (options.autoInit !== false) {
      initialize()
    }
  })

  // 组件卸载时清理
  // 重新连接（手动触发）
  const reconnect = async () => {
    isManualDisconnect = false
    stopReconnect()
    stopBackgroundServices()
    await removeListeners()
    try {
      await LzwcFunasr.disconnect()
    } catch {
      // 忽略旧连接清理错误
    }
    resetRecognitionState()
    reconnectAttempts = 0
    isReconnecting = false
    resolveException('asr-offline')
    await initialize()
  }

  // 获取重连次数
  const getReconnectAttempts = () => reconnectAttempts

  onUnmounted(() => {
    destroy()
  })

  return {
    state,
    config,
    initialize,
    checkConnectionStatus,
    disconnect,
    reconnect,
    getReconnectAttempts,
    loadAudioDevices,
    selectAudioDevice,
    startListening,
    stopListening,
    clearHistory,
    formatTime,
    canInitialize: () => true,
    onResult: createSubscription(resultCallbacks),
    onConnectionChange: createSubscription(connectionCallbacks),
    onError: createSubscription(errorCallbacks),
    onReconnectFailed: createSubscription(reconnectFailedCallbacks)
  }
}
