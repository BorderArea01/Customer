import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import mqtt from 'mqtt'
import type { MqttStatus, MqttMessage, MqttConfig, MqttSendMessage } from '@/types/mqtt'
import { useAppConfigStore } from '@/stores/appConfig'
import { useDeviceStore } from '@/stores/device'
import { useLogStore } from './log'
import { useExceptionStore } from './exception'

// 会话状态类型
export type SessionState = 'idle' | 'active' | 'interrupted' | 'timeout'
export type RoundState = 'idle' | 'active' | 'completed' | 'interrupted' | 'timeout'

// 会话配置接口
export interface ChatConfig {
  timeoutMs: number
  enableStrictSessionCheck: boolean
  enableStrictMessageCheck: boolean
  enableAutoCleanup: boolean
}

// 消息载荷接口
export interface MessagePayload {
  session_id?: string
  message_id?: string
  [key: string]: any
}

// 会话信息接口
export interface SessionInfo {
  sessionId: string
  messageId: string | null
  state: SessionState
  roundState: RoundState
  lastActiveAt: number
  createdAt: number
}

// 事件回调类型
export type ChatEventCallback = (data: any) => void

// 内联聊天 MQTT 服务，仅供 ChatStore 使用
class MqttService {
  private client: any = null
  private isConnected = false
  private isConnecting = false
  private messageCallbacks = new Map<string, (data: MqttMessage) => void>()
  private statusCallbacks = new Map<string, (status: MqttStatus) => void>()
  private connectTimeout: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempts = 0

  // 心跳检测配置
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null
  private heartbeatPeriodMs = 30000 // 每30秒检查一次
  private lastPongAt = Date.now()
  private heartbeatTimeoutMs = 90000 // 超过90秒无PONG则认为连接死亡

  private config: MqttConfig = {
    host: '',
    username: '',
    password: '',
    userId: '',
    sendTopic: 'call_demp_soul/default',
    receiveTopic: 'soul2user'
  }

  constructor(customConfig?: Partial<MqttConfig>) {
    if (customConfig) {
      this.config = { ...this.config, ...customConfig }
    }
    this.loadConfigFromStore()
    if (!this.config.host) {
      setTimeout(() => this.loadConfigFromStore(), 100)
    }
  }

  private loadConfigFromStore() {
    try {
      const appConfigStore = useAppConfigStore()
      const deviceStore = useDeviceStore()

      let computedHost = ''

      // 使用配置中的 mqttUrl（从 deviceParams 获取）
      if (appConfigStore.mqttUrl) {
        computedHost = appConfigStore.mqttUrl
      }
      if (computedHost) this.config.host = computedHost

      // 使用配置中的 MQTT 用户名和密码
      const mqttConfig = appConfigStore.config.chatMqttBroker
      if (mqttConfig?.mqttUsername && mqttConfig?.mqttPassword) {
        this.config.username = mqttConfig.mqttUsername
        this.config.password = mqttConfig.mqttPassword
      }

      const employeeIdForTopic = deviceStore.employeeInfo?.employeeId
      if (employeeIdForTopic) this.config.sendTopic = `call_demp_soul/${employeeIdForTopic}`
    } catch (error) {
      console.error('❌ [MqttService] 从store加载MQTT配置失败:', error)
    }
  }

  updateConfig(newConfig: Partial<MqttConfig>) { this.config = { ...this.config, ...newConfig } }
  reloadConfigFromStore() { this.loadConfigFromStore() }

  async connect(): Promise<any> {
    return new Promise((resolve, reject) => {
      if (this.isConnecting) {
        reject(new Error('连接正在进行中，请勿重复连接'))
        return
      }
      if (this.isConnected && this.client) {
        resolve(this.client)
        return
      }

      if (this.client) this.cleanupClient()

      this.isConnecting = true
      this.updateStatus('connecting')
      this.loadConfigFromStore()

      if (!this.config.host) {
        const errorMsg = 'MQTT 主机未配置，请先在设置中配置服务器与MQTT信息'
        console.error('❌ [MqttService]', errorMsg)
        this.isConnecting = false
        this.updateStatus('error')
        reject(new Error(errorMsg))
        return
      }

      const options = {
        clientId: `web_client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        username: this.config.username,
        password: this.config.password,
        connectTimeout: 10000,
        keepalive: 60,
        clean: true,
        reconnectPeriod: 5000,
        rejectUnauthorized: false,
        protocolId: 'MQTT',
        protocolVersion: 4,
      }

      this.connectTimeout = setTimeout(() => {
        this.updateStatus('timeout')
        setTimeout(() => {
          if (!this.isConnected) {
            const timeoutError = new Error('MQTT连接超时，请检查网络连接和服务器地址')
            console.error('❌ [MqttService]', timeoutError.message)
            reject(timeoutError)
          }
        }, 2000)
      }, 10000)

      try {
        this.client = mqtt.connect(this.config.host, options as any)

        this.client.on('connect', () => {
          if (this.connectTimeout) clearTimeout(this.connectTimeout)

          // 验证客户端实际连接状态
          if (!this.client || !this.client.connected) {
            const errorMsg = 'MQTT客户端连接状态异常'
            console.error('❌ [MqttService]', errorMsg)
            this.isConnected = false
            this.isConnecting = false
            this.updateStatus('error')
            reject(new Error(errorMsg))
            return
          }

          this.isConnected = true
          this.isConnecting = false
          this.reconnectAttempts = 0
          this.lastPongAt = Date.now()
          this.startHeartbeatMonitor()
          this.updateStatus('connected')
          this.client!.subscribe(this.config.receiveTopic, { qos: 0 }, (err: any) => {
            if (!err) {
              resolve(this.client!)
            } else {
              console.error('❌ [MqttService] 订阅失败:', err)
              this.isConnected = false
              this.updateStatus('error')
              reject(err)
            }
          })
        })

        this.client.on('message', (_topic: any, message: any) => {
          this.lastPongAt = Date.now()
          try {
            const data: MqttMessage = JSON.parse(message.toString())
            const chatStore = useChatStore()
            if (!chatStore.shouldAcceptIncoming(data)) return
            this.messageCallbacks.forEach((callback) => { try { callback(data) } catch (e) { console.error(e) } })
          } catch (error) {
            console.error('❌ [MqttService] 消息解析失败:', error)
          }
        })

        this.client.on('error', (error: any) => {
          console.error('❌ [MqttService] MQTT连接错误:', {
            message: error?.message || error,
            code: error?.code,
            errno: error?.errno,
            syscall: error?.syscall,
            address: error?.address,
            port: error?.port,
            host: this.config.host
          })
          if (this.connectTimeout) clearTimeout(this.connectTimeout)
          this.isConnected = false
          this.isConnecting = false
          this.updateStatus('error')
          reject(error)
        })

        this.client.on('close', () => {
          this.isConnected = false
          this.isConnecting = false
          this.stopHeartbeatMonitor()
          this.updateStatus('disconnected')
        })

        this.client.on('reconnect', () => {
          this.reconnectAttempts++
          this.updateStatus('reconnecting')
          console.warn(`⚠️ [MqttService] MQTT 正在重连 (第${this.reconnectAttempts}次)`)
        })

        this.client.on('offline', () => {
          this.isConnected = false
          this.stopHeartbeatMonitor()
          this.updateStatus('disconnected')
        })
      } catch (error) {
        console.error('❌ [MqttService] 创建MQTT客户端失败:', error)
        if (this.connectTimeout) clearTimeout(this.connectTimeout)
        this.isConnecting = false
        this.updateStatus('error')
        reject(error)
      }
    })
  }

  private startHeartbeatMonitor() {
    this.stopHeartbeatMonitor()
    console.log('💓 [MqttService] 启动心跳检测，周期:', this.heartbeatPeriodMs, 'ms，超时:', this.heartbeatTimeoutMs, 'ms')
    this.heartbeatInterval = setInterval(() => {
      const idleMs = Date.now() - this.lastPongAt
      if (idleMs > this.heartbeatTimeoutMs) {
        console.error(`❌ [MqttService] 心跳超时 (${idleMs}ms 无数据)，销毁连接触发重连`)
        this.stopHeartbeatMonitor()
        if (this.client) {
          this.isConnected = false
          this.isConnecting = false
          this.updateStatus('disconnected')
          // 销毁底层连接（不调用 end），让 mqtt.js 的 reconnectPeriod 触发自动重连
          try {
            if (this.client.stream) {
              this.client.stream.destroy()
            } else if (this.client._stream) {
              this.client._stream.destroy()
            } else {
              // 兜底：如果拿不到 stream，则移除旧客户端让下次 connect 时新建
              this.client.removeAllListeners()
              this.client.end(true)
              this.client = null
            }
          } catch { }
        }
      } else {
        const secs = Math.round(idleMs / 1000)
        console.log(`💓 [MqttService] 心跳检测正常，距上次数据 ${secs}s`)
      }
    }, this.heartbeatPeriodMs)
  }

  private stopHeartbeatMonitor() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }

  private cleanupClient() {
    this.stopHeartbeatMonitor()
    if (this.client) {
      try { this.client.removeAllListeners(); this.client.end(true) } catch { }
      this.client = null
    }
    this.isConnected = false
    this.isConnecting = false
  }

  disconnect() { this.cleanupClient(); this.updateStatus('disconnected') }

  async sendMessage(query: string, additionalParams = {}): Promise<any> {
    // 检查实际连接状态
    const actualConnected = this.getConnectionStatus()
    if (!actualConnected || !this.client) {
      throw new Error('MQTT 未连接')
    }

    const deviceStore = useDeviceStore()
    const chatStore = useChatStore()
    const employeeIdForMsg = deviceStore.employeeInfo?.employeeId || ''
    const message: MqttSendMessage = {
      query,
      type: '0',
      demp_id: employeeIdForMsg,
      device_id: deviceStore.deviceConfig?.deviceId || '',
      device_type: 'terminal',
      response_mode: 'streaming',
      permission_id: '',
      ...additionalParams
    }
    const messageWithIds = chatStore.attachIdsToPayload(message)

    return new Promise((resolve, reject) => {
      this.client.publish(this.config.sendTopic, JSON.stringify(messageWithIds), { qos: 0 }, (err: any) => {
        if (err) {
          console.error('❌ [MqttService] 消息发送失败:', err)
          reject(err)
        } else {
          resolve(messageWithIds)
        }
      })
    })
  }

  onMessage(id: string, callback: (data: MqttMessage) => void) { this.messageCallbacks.set(id, callback) }
  offMessage(id: string) { this.messageCallbacks.delete(id) }
  onStatusChange(id: string, callback: (status: MqttStatus) => void) { this.statusCallbacks.set(id, callback) }
  offStatusChange(id: string) { this.statusCallbacks.delete(id) }
  private updateStatus(status: MqttStatus) { this.statusCallbacks.forEach((cb) => { try { cb(status) } catch (e) { console.error(e) } }) }

  getConnectionStatus(): boolean {
    // 检查实际客户端状态，确保状态同步
    const actualConnected = this.isConnected && this.client && this.client.connected
    if (this.isConnected && !actualConnected) {
      this.isConnected = false
    }
    return actualConnected
  }
  getConnectingStatus(): boolean { return this.isConnecting }
  getConfig(): MqttConfig { return { ...this.config } }
  getConnectionInfo() {
    const actualConnected = this.isConnected && this.client && this.client.connected
    return {
      isConnected: actualConnected,
      isConnecting: this.isConnecting,
      isReconnecting: this.reconnectAttempts > 0,
      reconnectAttempts: this.reconnectAttempts,
      host: this.config.host,
      username: this.config.username,
      receiveTopic: this.config.receiveTopic,
      clientId: this.client?.options?.clientId,
      clientConnected: this.client?.connected
    }
  }
  async checkAndReconnect() {
    if (!this.getConnectionStatus() && !this.isConnecting) {
      await this.connect()
    }
  }
}

export const useChatStore = defineStore('chat', () => {
  // 状态
  const currentSessionId = ref<string | null>(null)
  const currentMessageId = ref<string | null>(null)
  const sessionState = ref<SessionState>('idle')
  const roundState = ref<RoundState>('idle')
  const lastActiveAt = ref<number>(0)
  const createdAt = ref<number>(0)

  // MQTT 状态
  const mqttIsConnected = ref(false)
  const mqttIsConnecting = ref(false)
  const mqttConnectionStatus = ref<MqttStatus>('disconnected')
  const mqttIsLoading = ref(false)
  const mqttError = ref<Error | null>(null)
  const mqttReconnectAttempts = ref(0)

  // 配置
  const config = ref<ChatConfig>({
    timeoutMs: 180000, // 3分钟超时
    enableStrictSessionCheck: true,
    enableStrictMessageCheck: true,
    enableAutoCleanup: true
  })

  // 事件回调
  const eventCallbacks = new Map<string, ChatEventCallback>()

  // 超时定时器
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null

  // 统一日志封装，避免重复 try/catch
  const safeLog = (message: string, detail?: Record<string, any>) => {
    try {
      useLogStore().append({
        source: 'APP',
        level: 'info',
        message,
        detail,
      })
    } catch { }
  }

  // 计算属性
  const inSession = computed(() => !!currentSessionId.value)
  const inRound = computed(() => !!currentMessageId.value)
  const isActive = computed(() => sessionState.value === 'active' && roundState.value === 'active')
  const sessionInfo = computed<SessionInfo | null>(() => {
    if (!currentSessionId.value) return null
    return {
      sessionId: currentSessionId.value,
      messageId: currentMessageId.value,
      state: sessionState.value,
      roundState: roundState.value,
      lastActiveAt: lastActiveAt.value,
      createdAt: createdAt.value
    }
  })

  // 生成唯一ID
  const generateId = (prefix: string = 'id'): string => {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  // 更新活动时间
  const touch = () => {
    lastActiveAt.value = Date.now()
  }

  // 清理超时定时器（避免与全局 clearTimeout 混淆）
  const clearTimeoutTimer = () => {
    if (timeoutTimer) {
      clearTimeout(timeoutTimer)
      timeoutTimer = null
    }
  }

  // 设置超时定时器（避免与全局 setTimeout 混淆）
  const startTimeoutTimer = () => {
    clearTimeoutTimer()
    timeoutTimer = globalThis.setTimeout(() => {
      endRound('timeout')
    }, config.value.timeoutMs)
  }

  // 触发事件
  const triggerEvent = (eventName: string, data: any) => {
    const callback = eventCallbacks.get(eventName)
    if (callback) {
      try {
        callback(data)
      } catch (error) {
        console.error(`❌ [ChatStore] 事件回调执行失败 [${eventName}]:`, error)
      }
    }
  }

  // 开始会话
  const startSession = (sessionId?: string) => {
    const newSessionId = sessionId || generateId('session')

    // 如果已有会话，先结束
    if (currentSessionId.value) {
      endSession()
    }

    currentSessionId.value = newSessionId
    currentMessageId.value = null
    sessionState.value = 'active'
    roundState.value = 'idle'
    lastActiveAt.value = Date.now()
    createdAt.value = Date.now()

    triggerEvent('sessionStarted', { sessionId: newSessionId })
    safeLog('开始新会话', { sessionId: newSessionId })
  }

  // 结束会话
  const endSession = () => {
    if (!currentSessionId.value) return

    const sessionId = currentSessionId.value
    const messageId = currentMessageId.value

    // 结束当前轮次
    if (currentMessageId.value) {
      endRound('interrupted')
    }

    // 清理状态
    currentSessionId.value = null
    currentMessageId.value = null
    sessionState.value = 'idle'
    roundState.value = 'idle'
    lastActiveAt.value = 0
    createdAt.value = 0

    clearTimeoutTimer()

    triggerEvent('sessionEnded', { sessionId, messageId })
    safeLog('会话已结束', { sessionId, messageId })
  }

  // 开始轮次
  const startRound = (messageId?: string) => {
    if (!currentSessionId.value) {
      return false
    }

    // 如果已有轮次，先结束
    if (currentMessageId.value) {
      endRound('interrupted')
    }

    const newMessageId = messageId || generateId('message')
    currentMessageId.value = newMessageId
    roundState.value = 'active'
    lastActiveAt.value = Date.now()

    triggerEvent('roundStarted', { sessionId: currentSessionId.value, messageId: newMessageId })

    // 设置超时
    startTimeoutTimer()

    safeLog('开始新轮次', { sessionId: currentSessionId.value, messageId: newMessageId })

    return true
  }

  // 结束轮次
  const endRound = (reason: 'completed' | 'interrupted' | 'timeout' = 'completed') => {
    if (!currentMessageId.value) return

    const sessionId = currentSessionId.value
    const messageId = currentMessageId.value

    // 更新状态
    switch (reason) {
      case 'completed':
        roundState.value = 'completed'
        break
      case 'timeout':
        roundState.value = 'timeout'
        break
      default:
        roundState.value = 'interrupted'
        break
    }

    // 清理轮次状态
    currentMessageId.value = null
    lastActiveAt.value = Date.now()

    clearTimeoutTimer()

    triggerEvent('roundEnded', { sessionId, messageId, reason })
    safeLog('轮次已结束', { sessionId, messageId, reason })
  }

  // 中断所有
  const interruptAll = () => {

    if (currentMessageId.value) {
      endRound('interrupted')
    }

    if (currentSessionId.value) {
      endSession()
    }

    triggerEvent('interrupted', {})
  }

  // 注入ID到载荷
  const attachIdsToPayload = <T extends Record<string, any>>(payload: T): T => {
    const result = { ...payload } as T & { session_id?: string; message_id?: string }

    // 优先使用 payload 中已有的值，只有在 payload 中没有这些值时才从 store 中读取
    // 这样可以确保在用户离开等场景中，即使 store 中的值被清除了，也能使用保存的值
    if (!result.session_id && currentSessionId.value) {
      result.session_id = currentSessionId.value
    }

    if (!result.message_id && currentMessageId.value) {
      result.message_id = currentMessageId.value
    }

    touch()
    return result as T
  }

  // 检查是否应该接受消息
  const shouldAcceptIncoming = (incoming: MessagePayload): boolean => {
    // 对于所有类型的消息，如果没有活跃轮次，拒绝所有消息
    if (!currentMessageId.value) {
      return false
    }

    // 检查 message_id 匹配
    if (config.value.enableStrictMessageCheck) {
      if (!incoming.message_id || incoming.message_id !== currentMessageId.value) return false
    }

    // 检查 session_id 匹配（可选）
    if (config.value.enableStrictSessionCheck && currentSessionId.value) {
      if (!incoming.session_id || incoming.session_id !== currentSessionId.value) return false
    }
    // 更新活动时间
    touch()
    return true
  }

  // 设置配置
  const setConfig = (newConfig: Partial<ChatConfig>) => {
    config.value = { ...config.value, ...newConfig }
  }

  // 设置超时时间
  const setTimeoutMs = (ms: number) => {
    config.value.timeoutMs = ms
  }

  // 注册事件回调
  const onEvent = (eventName: string, callback: ChatEventCallback) => {
    eventCallbacks.set(eventName, callback)
  }

  // 移除事件回调
  const offEvent = (eventName: string) => {
    eventCallbacks.delete(eventName)
  }

  // 清理所有状态
  const cleanup = () => {

    clearTimeoutTimer()
    eventCallbacks.clear()

    currentSessionId.value = null
    currentMessageId.value = null
    sessionState.value = 'idle'
    roundState.value = 'idle'
    lastActiveAt.value = 0
    createdAt.value = 0
  }

  // 获取状态摘要
  const getStatusSummary = () => {
    return {
      inSession: inSession.value,
      inRound: inRound.value,
      isActive: isActive.value,
      sessionId: currentSessionId.value,
      messageId: currentMessageId.value,
      sessionState: sessionState.value,
      roundState: roundState.value,
      lastActiveAt: lastActiveAt.value,
      createdAt: createdAt.value,
      config: config.value
    }
  }

  // =========================
  // MQTT（聊天）内聚到 ChatStore
  // =========================
  const mqttService = new MqttService()

  // 初始化时重置连接状态（因为持久化可能保留了旧状态，但实际连接已断开）
  mqttIsConnected.value = false
  mqttConnectionStatus.value = 'disconnected'

  const connectMqtt = async () => {
    // 防止重复连接
    if (mqttIsConnecting.value) {
      return
    }

    // 检查实际连接状态，确保状态同步
    const actualConnected = mqttService.getConnectionStatus()
    if (actualConnected && mqttIsConnected.value) {
      return
    }

    // 如果状态不同步，重置状态
    if (mqttIsConnected.value && !actualConnected) {
      mqttIsConnected.value = false
      mqttConnectionStatus.value = 'disconnected'
    }

    // 检查配置是否已加载
    const appConfigStore = useAppConfigStore()
    if (!appConfigStore.mqttUrl) {
      // 等待配置加载，最多等待3秒
      let waitCount = 0
      const maxWaitCount = 30 // 30次 * 100ms = 3秒
      while (!appConfigStore.mqttUrl && waitCount < maxWaitCount) {
        await new Promise(resolve => setTimeout(resolve, 100))
        waitCount++
      }

      if (!appConfigStore.mqttUrl) {
        const errorMsg = 'MQTT配置未加载，无法连接。请检查设备配置是否正确。'
        console.error('❌ [ChatStore]', errorMsg)
        mqttError.value = new Error(errorMsg)
        mqttConnectionStatus.value = 'error'
        throw new Error(errorMsg)
      }
    }

    try {
      mqttIsLoading.value = true
      mqttIsConnecting.value = true
      mqttError.value = null
      await mqttService.connect()

      // 验证实际连接状态
      const actualConnected = mqttService.getConnectionStatus()
      if (actualConnected) {
        mqttIsConnected.value = true
        mqttConnectionStatus.value = 'connected'
      } else {
        throw new Error('MQTT连接后状态验证失败')
      }
    } catch (err) {
      const error = err as Error
      console.error('❌ [ChatStore] MQTT连接失败:', error.message)
      mqttError.value = error
      mqttConnectionStatus.value = 'error'
      throw err
    } finally {
      mqttIsLoading.value = false
      mqttIsConnecting.value = false
    }
  }

  const disconnectMqtt = () => {
    mqttService.disconnect()
    mqttIsConnected.value = false
    mqttIsConnecting.value = false
    mqttConnectionStatus.value = 'disconnected'
  }

  const sendMqttMessage = async (query: string, additionalParams = {}) => {
    if (!mqttIsConnected.value) {
      throw new Error('MQTT未连接')
    }
    return await mqttService.sendMessage(query, additionalParams)
  }

  const onMqttMessage = (callback: (data: MqttMessage) => void) => {
    mqttService.onMessage('chatStore', callback)
  }

  const offMqttMessage = () => {
    mqttService.offMessage('chatStore')
  }

  const onMqttStatusChange = (callback: (status: MqttStatus) => void) => {
    mqttService.onStatusChange('chatStore', (status) => {
      mqttConnectionStatus.value = status
      if (status === 'connected') {
        mqttIsConnected.value = true
        mqttReconnectAttempts.value = 0
      }
      if (status === 'disconnected' || status === 'error' || status === 'closed') mqttIsConnected.value = false
      if (status === 'reconnecting') {
        mqttReconnectAttempts.value = mqttService.getConnectionInfo().reconnectAttempts
      }
      try {
        const exceptionStore = useExceptionStore()
        if (status === 'connected') {
          exceptionStore.resolveByKey('mqtt-offline')
        } else if (status === 'disconnected' || status === 'error' || status === 'timeout' || status === 'closed') {
          // 重连达到阈值后才弹出异常提示
          if (mqttReconnectAttempts.value >= 10) {
            exceptionStore.report({
              severity: 'high',
              title: 'MQTT 离线',
              detail: `状态: ${status}`,
              source: 'MQTT',
              code: 'MQTT_OFFLINE',
              dedupeKey: 'mqtt-offline'
            })
          }
        }
      } catch { }
      callback(status)
    })
  }

  const offMqttStatusChange = () => {
    mqttService.offStatusChange('chatStore')
  }

  const reloadMqttConfig = () => {
    mqttService.reloadConfigFromStore()
  }

  const getMqttConnectionInfo = () => {
    return mqttService.getConnectionInfo()
  }

  return {
    // 状态
    currentSessionId,
    currentMessageId,
    sessionState,
    roundState,
    lastActiveAt,
    createdAt,
    config,
    mqttIsConnected,
    mqttIsConnecting,
    mqttConnectionStatus,
    mqttIsLoading,
    mqttError,
    mqttReconnectAttempts,

    // 计算属性
    inSession,
    inRound,
    isActive,
    sessionInfo,

    // 方法
    startSession,
    endSession,
    startRound,
    endRound,
    interruptAll,
    attachIdsToPayload,
    shouldAcceptIncoming,
    setConfig,
    setTimeoutMs,
    onEvent,
    offEvent,
    touch,
    cleanup,
    getStatusSummary,

    // MQTT 方法
    connectMqtt,
    disconnectMqtt,
    sendMqttMessage,
    onMqttMessage,
    offMqttMessage,
    onMqttStatusChange,
    offMqttStatusChange,
    reloadMqttConfig,
    getMqttConnectionInfo
  }
}, {
  persist: true
})
