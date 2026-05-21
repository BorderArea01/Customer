import { ref, onMounted, onUnmounted } from 'vue'
import { Device } from '@capacitor/device'
import { LzwcSpeechEnhanced as LzwcSpeech } from 'capacitor-speech'
import type {
  SpeechOptions,
  QueueStatus,
  PluginListenerHandle,
} from 'capacitor-speech'
import { useAppConfigStore } from '@/stores/appConfig'
import { normalizeForTTS } from './textNormalizer'

export interface UseSpeechOptions {
  defaultVoice?: string
  defaultLanguage?: string
  defaultSpeed?: number
  defaultPitch?: number
  defaultVolume?: number
  autoInit?: boolean
  useDeviceId?: boolean
}

export interface UseSpeech {
  // 状态
  initStatus: ReturnType<typeof ref<string>>
  isInitialized: ReturnType<typeof ref<boolean>>
  isSpeaking: ReturnType<typeof ref<boolean>>
  errorMessage: ReturnType<typeof ref<string>>

  // 参数（业务可直接双向绑定）
  voice: ReturnType<typeof ref<string>>
  language: ReturnType<typeof ref<string>>
  speed: ReturnType<typeof ref<number>>
  pitch: ReturnType<typeof ref<number>>
  volume: ReturnType<typeof ref<number>>

  // 队列状态
  queueStatus: ReturnType<typeof ref<QueueStatus>>

  // 生命周期
  initialize: (params?: { deviceId?: string; xunfeiAppId?: string; xunfeiApiKey?: string; xunfeiApiSecret?: string }) => Promise<boolean>
  dispose: () => Promise<void>

  // 语音控制
  speak: (textOrOptions: string | SpeechOptions) => Promise<boolean>
  stop: () => Promise<boolean>

  // 队列控制
  addToQueue: (textOrOptions: string | SpeechOptions) => Promise<boolean>
  addBatchToQueue: (lines: string[] | string) => Promise<number>
  startQueue: () => Promise<boolean>
  stopQueue: () => Promise<boolean>
  clearQueue: () => Promise<boolean>
  forceCleanup: () => Promise<boolean>
  refreshQueueStatus: () => Promise<void>

  // 事件订阅（可选）
  onStart: (cb: () => void) => void
  onEnd: (cb: () => void) => void
  onError: (cb: (message: string) => void) => void
  onQueueStart: (cb: (totalItems: number) => void) => void
  onQueueEnd: (cb: (completed: boolean, interrupted: boolean) => void) => void
  onQueueItemStart: (cb: (item: { id: string; text: string }, index: number) => void) => void

  // 流式TTS（为兼容旧统一接口与业务使用场景提供）
  processStreamingText: (fragment: string, isEnd?: boolean) => Promise<void>
  addIncrementalText: (text: string) => void
}

const buildOptions = (base: SpeechOptions | string, defaults: {
  voice: string
  language: string
  speed: number
  pitch: number
  volume: number
}): SpeechOptions => {
  if (typeof base === 'string') {
    return {
      text: normalizeForTTS(base),
      voice: defaults.voice,
      language: defaults.language,
      speed: defaults.speed,
      pitch: defaults.pitch,
      volume: defaults.volume,
    }
  }
  return {
    text: normalizeForTTS(base.text),
    voice: base.voice ?? defaults.voice,
    language: base.language ?? defaults.language,
    speed: base.speed ?? defaults.speed,
    pitch: base.pitch ?? defaults.pitch,
    volume: base.volume ?? defaults.volume,
  }
}

const useSpeech = (options?: UseSpeechOptions): UseSpeech => {
  // 从配置中读取默认值
  const appConfigStore = useAppConfigStore()
  const configBroadcast = appConfigStore.speechBroadcast

  const {
    defaultVoice = configBroadcast?.voice ?? 'xiaoyan',
    defaultLanguage = configBroadcast?.language ?? 'zh-CN',
    defaultSpeed = configBroadcast?.speed ?? 50,
    defaultPitch = configBroadcast?.pitch ?? 50,
    defaultVolume = configBroadcast?.volume ?? 50,
    autoInit = false,
    useDeviceId = true,
  } = options || {}

  // 基础状态
  const initStatus = ref('未初始化')
  const isInitialized = ref(false)
  const isSpeaking = ref(false)
  const errorMessage = ref('')

  // 可配置参数
  const voice = ref(defaultVoice)
  const language = ref(defaultLanguage)
  const speed = ref(defaultSpeed)
  const pitch = ref(defaultPitch)
  const volume = ref(defaultVolume)

  // 队列状态
  const queueStatus = ref<QueueStatus>({
    isPlaying: false,
    currentIndex: -1,
    totalItems: 0,
    remainingItems: 0,
    currentItem: undefined,
  })

  // 事件回调占位
  let onStartCb: () => void = () => { }
  let onEndCb: () => void = () => { }
  let onErrorCb: (message: string) => void = () => { }
  let onQueueStartCb: (totalItems: number) => void = () => { }
  let onQueueEndCb: (completed: boolean, interrupted: boolean) => void = () => { }
  let onQueueItemStartCb: (item: { id: string; text: string }, index: number) => void = () => { }

  // 监听器集合，便于统一移除
  let listenerHandles: PluginListenerHandle[] = []
  // 简单的流式文本缓冲（兼容旧API）
  let streamingBuffer = ''

  const clearError = () => { errorMessage.value = '' }

  const setupListeners = async () => {
    try {
      const handles = await Promise.all([
        LzwcSpeech.addListener('start', () => {
          isSpeaking.value = true
          onStartCb()
        }),
        LzwcSpeech.addListener('end', () => {
          isSpeaking.value = false
          onEndCb()
        }),
        LzwcSpeech.addListener('error', (event: { message?: string }) => {
          isSpeaking.value = false
          errorMessage.value = event?.message || '未知错误'
          onErrorCb(errorMessage.value)
        }),
        LzwcSpeech.addListener('queue_start', (event: { totalItems: number }) => {
          queueStatus.value.isPlaying = true
          queueStatus.value.totalItems = event.totalItems
          onQueueStartCb(event.totalItems)
        }),
        LzwcSpeech.addListener('queue_end', (event: { completed: boolean; interrupted: boolean }) => {
          queueStatus.value.isPlaying = false
          queueStatus.value.currentIndex = -1
          queueStatus.value.currentItem = undefined
          onQueueEndCb(event.completed, event.interrupted)
        }),
        LzwcSpeech.addListener('queue_item_start', (event: { item: { id: string; text: string }; index: number }) => {
          queueStatus.value.currentIndex = event.index
          queueStatus.value.currentItem = event.item
          onQueueItemStartCb(event.item, event.index)
        }),
      ])
      listenerHandles = handles
    } catch {
    }
  }

  const removeListeners = async () => {
    try {
      await Promise.all(listenerHandles.map(h => h.remove()))
    } catch {
      // 忽略移除异常
    } finally {
      listenerHandles = []
    }
  }

  const initialize = async (params?: { deviceId?: string; xunfeiAppId?: string; xunfeiApiKey?: string; xunfeiApiSecret?: string }): Promise<boolean> => {
    console.log('initialize', params)
    try {
      initStatus.value = '初始化中...'
      clearError()

      let id = params?.deviceId
      if (!id && useDeviceId) {
        try {
          const { identifier } = await Device.getId()
          id = identifier
        } catch {
          // 忽略获取 deviceId 失败
        }
      }

      // 如果传入了运行时凭据，优先设置（安卓原生会重建实例）
      if (params?.xunfeiAppId || params?.xunfeiApiKey || params?.xunfeiApiSecret) {
        try {
          await (LzwcSpeech as any).setCredentials?.({
            xunfeiAppId: params.xunfeiAppId,
            xunfeiApiKey: params.xunfeiApiKey,
            xunfeiApiSecret: params.xunfeiApiSecret,
          })
        } catch { }
      }

      // 尝试初始化，最多重试3次
      let retries = 3
      let lastError = null

      while (retries > 0) {
        try {
          const ret = await (LzwcSpeech as any).initialize({
            deviceId: id,
            xunfeiAppId: params?.xunfeiAppId,
            xunfeiApiKey: params?.xunfeiApiKey,
            xunfeiApiSecret: params?.xunfeiApiSecret,
          })

          if (ret?.success) {
            await setupListeners()
            isInitialized.value = true
            initStatus.value = '已初始化'
            return true
          } else {
            // 如果明确返回失败，抛出错误以触发重试
            throw new Error(ret?.message || 'SDK 初始化失败')
          }
        } catch (err: any) {
          lastError = err
          retries--
          if (retries > 0) {
            console.warn(`语音初始化失败，剩余重试次数: ${retries}，原因: ${err.message || err}`)
            // 等待 2 秒后重试
            await new Promise(resolve => setTimeout(resolve, 2000))
          }
        }
      }

      if (lastError) throw lastError
      throw new Error('SDK 初始化失败 (重试耗尽)')

    } catch (error) {
      initStatus.value = '初始化失败'
      errorMessage.value = error instanceof Error ? error.message : '初始化异常'
      console.error('语音初始化失败:', error)
      return false
    }
  }

  const dispose = async (): Promise<void> => {
    await removeListeners()
  }

  const speak = async (textOrOptions: string | SpeechOptions): Promise<boolean> => {
    try {
      clearError()
      const opts = buildOptions(textOrOptions, {
        voice: voice.value,
        language: language.value,
        speed: speed.value,
        pitch: pitch.value,
        volume: volume.value,
      })
      const res = await LzwcSpeech.speak(opts)
      if (!res.success && !res.user_stopped) {
        errorMessage.value = res.message || '朗读失败'
      }
      return Boolean(res.success)
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '朗读异常'
      console.error('朗读异常:', error)
      return false
    }
  }

  const stop = async (): Promise<boolean> => {
    try {
      const res = await LzwcSpeech.stop()
      isSpeaking.value = false
      return Boolean(res.success)
    } catch (error) {
      console.error('停止失败:', error)
      return false
    }
  }

  const addToQueue = async (textOrOptions: string | SpeechOptions): Promise<boolean> => {
    try {
      clearError()
      const opts = buildOptions(textOrOptions, {
        voice: voice.value,
        language: language.value,
        speed: speed.value,
        pitch: pitch.value,
        volume: volume.value,
      })
      const res = await LzwcSpeech.addToQueue(opts)
      if (!res.success) {
        errorMessage.value = res.message || '添加到队列失败'
      }
      await refreshQueueStatus()
      return Boolean(res.success)
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '添加到队列异常'
      console.error('添加到队列异常:', error)
      return false
    }
  }

  const addBatchToQueue = async (lines: string[] | string): Promise<number> => {
    try {
      clearError()
      const list = Array.isArray(lines)
        ? lines
        : lines.split('\n').map(s => s.trim()).filter(Boolean)
      if (!list.length) return 0
      await Promise.all(list.map(line => addToQueue(line)))
      await refreshQueueStatus()
      return list.length
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '批量添加异常'
      console.error('批量添加异常:', error)
      return 0
    }
  }

  const startQueue = async (): Promise<boolean> => {
    try {
      clearError()
      const res = await LzwcSpeech.startQueue()
      if (!res.success) errorMessage.value = res.message || '启动队列播放失败'
      return Boolean(res.success)
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '启动队列播放异常'
      console.error('启动队列播放异常:', error)
      return false
    }
  }

  const stopQueue = async (): Promise<boolean> => {
    try {
      const res = await LzwcSpeech.stopQueue()
      return Boolean(res.success)
    } catch (error) {
      console.error('停止队列播放失败:', error)
      return false
    }
  }

  const clearQueue = async (): Promise<boolean> => {
    try {
      const res = await LzwcSpeech.clearQueue()
      await refreshQueueStatus()
      return Boolean(res.success)
    } catch (error) {
      console.error('清空队列失败:', error)
      return false
    }
  }

  const forceCleanup = async (): Promise<boolean> => {
    try {
      try { await LzwcSpeech.stop() } catch { }
      try { await LzwcSpeech.stopQueue() } catch { }
      try { await LzwcSpeech.clearQueue() } catch { }

      isSpeaking.value = false
      queueStatus.value = {
        isPlaying: false,
        currentIndex: -1,
        totalItems: 0,
        remainingItems: 0,
        currentItem: undefined,
      }
      return true
    } catch (error) {
      console.error('强制清理失败:', error)
      return false
    }
  }

  const refreshQueueStatus = async (): Promise<void> => {
    try {
      const status = await LzwcSpeech.getQueueStatus()
      queueStatus.value = {
        ...queueStatus.value,
        ...status,
      }
    } catch (error) {
      console.error('获取队列状态失败:', error)
    }
  }

  // 流式TTS（兼容统一接口的最小实现）
  const processStreamingText = async (fragment: string, isEnd: boolean = false): Promise<void> => {
    try {
      if (fragment) {
        streamingBuffer += normalizeForTTS(fragment)
      }
      if (isEnd) {
        const textToSpeak = streamingBuffer.trim()
        streamingBuffer = ''
        if (textToSpeak) {
          await speak(textToSpeak)
        }
      }
    } catch (error) {
      console.error('处理流式文本失败:', error)
    }
  }

  const addIncrementalText = (text: string): void => {
    if (!text) return
    streamingBuffer += normalizeForTTS(text)
  }

  // 事件订阅 API
  const onStart = (cb: () => void) => { onStartCb = cb }
  const onEnd = (cb: () => void) => { onEndCb = cb }
  const onError = (cb: (message: string) => void) => { onErrorCb = cb }
  const onQueueStart = (cb: (totalItems: number) => void) => { onQueueStartCb = cb }
  const onQueueEnd = (cb: (completed: boolean, interrupted: boolean) => void) => { onQueueEndCb = cb }
  const onQueueItemStart = (cb: (item: { id: string; text: string }, index: number) => void) => { onQueueItemStartCb = cb }

  // 可选自动初始化
  onMounted(async () => {
    if (autoInit) {
      // 延迟一小段时间，确保原生环境和网络准备就绪
      await new Promise(resolve => setTimeout(resolve, 500))

      // 从配置中读取凭据
      const appConfigStore = useAppConfigStore()
      const credentials = appConfigStore.speechBroadcast?.apiCredentials

      // 检查是否有必要的凭据
      if (!credentials || !credentials.appId || !credentials.apiKey || !credentials.apiSecret) {
        console.warn('⚠️ [语音] 自动初始化跳过：配置中缺少讯飞凭据 (appId, apiKey, apiSecret)')
        initStatus.value = '未配置凭据'
        errorMessage.value = '配置中缺少讯飞语音服务的凭据'
        return
      }

      await initialize({
        xunfeiAppId: credentials.appId,
        xunfeiApiKey: credentials.apiKey,
        xunfeiApiSecret: credentials.apiSecret,
      })
    }
  })

  onUnmounted(async () => {
    await dispose()
  })

  return {
    initStatus,
    isInitialized,
    isSpeaking,
    errorMessage,
    voice,
    language,
    speed,
    pitch,
    volume,
    queueStatus,
    initialize,
    dispose,
    speak,
    stop,
    addToQueue,
    addBatchToQueue,
    startQueue,
    stopQueue,
    clearQueue,
    forceCleanup,
    refreshQueueStatus,
    onStart,
    onEnd,
    onError,
    onQueueStart,
    onQueueEnd,
    onQueueItemStart,
    processStreamingText,
    addIncrementalText,
  }
}

export default useSpeech


