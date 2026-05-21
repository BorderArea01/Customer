import { ref, onMounted, onUnmounted } from 'vue'
import { CapacitorHttp } from '@capacitor/core'
import { useAppConfigStore } from '@/stores/appConfig'
import type { UseSpeech, UseSpeechOptions } from './funasrSpeech'
import type { QueueStatus, SpeechOptions } from 'capacitor-speech'
import { cleanMarkdown } from './textNormalizer'

/**
 * 清理文本中的 Markdown 和特殊字符（参考 Python 客户端的 clean_text）
 */
const cleanText = (text: string): string => {
  if (!text) return text
  // 只做Markdown清理（不能用normalizeForTTS，数字空格会破坏神经TTS模型的自然语言理解）
  text = cleanMarkdown(text)
  // 替换换行符
  text = text.replace(/\n/g, ' ').replace(/\r/g, '')
  // 移除不可见特殊字符，保留中英文、数字和常见标点
  text = text.replace(/[^\w\s\u4e00-\u9fa5，。！？、；：""''（）《》,.!?\-—]/g, '')
  return text.trim()
}

/**
 * 分句逻辑：在标点处截断，降低首句延迟
 */
const splitAtPunctuation = (buffer: string): { sentence: string; remaining: string } | null => {
  const punctuations = '。！？.!?，,；;：:'
  for (let i = 0; i < buffer.length; i++) {
    if (punctuations.includes(buffer[i])) {
      const sentence = buffer.slice(0, i + 1)
      const remaining = buffer.slice(i + 1)
      if (sentence.trim().length > 1) {
        return { sentence, remaining }
      }
    }
  }
  // 缓冲区过长时强制截断
  if (buffer.length > 50) {
    return { sentence: buffer, remaining: '' }
  }
  return null
}

interface VoiceboxConfig {
  url: string
  profileIndex: number
  ttsParams: {
    language: string
    seed: number
    model_size: string
    engine: string
    max_chunk_chars: number
    crossfade_ms: number
    normalize: boolean
    effects_chain: any[]
  }
}

const useVoiceboxSpeech = (options?: UseSpeechOptions): UseSpeech => {
  const appConfigStore = useAppConfigStore()
  const { autoInit = false } = options || {}

  // 状态
  const initStatus = ref('未初始化')
  const isInitialized = ref(false)
  const isSpeaking = ref(false)
  const errorMessage = ref('')

  // 参数（兼容接口，voicebox不使用这些）
  const voice = ref('voicebox')
  const language = ref('zh')
  const speed = ref(50)
  const pitch = ref(50)
  const volume = ref(50)

  // 队列状态
  const queueStatus = ref<QueueStatus>({
    isPlaying: false,
    currentIndex: -1,
    totalItems: 0,
    remainingItems: 0,
    currentItem: undefined,
  })

  // 事件回调
  let onStartCb: () => void = () => {}
  let onEndCb: () => void = () => {}
  let onErrorCb: (message: string) => void = () => {}
  let onQueueStartCb: (totalItems: number) => void = () => {}
  let onQueueEndCb: (completed: boolean, interrupted: boolean) => void = () => {}
  let onQueueItemStartCb: (item: { id: string; text: string }, index: number) => void = () => {}

  // 内部状态
  let profileId = 'default'
  let sessionId = 0
  let streamingBuffer = ''
  let speakQueue: string[] = []
  let isProcessingQueue = false

  // 从 localStorage 读取配置（与设置中心同步），带默认值
  const getConfig = (): VoiceboxConfig => {
    let url = 'http://192.168.2.236:17493'
    let profileIndex = 1
    let engine = 'qwen'
    let modelSize = '0.6B'

    try {
      const saved = localStorage.getItem('voicebox-tts-config')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.url) url = parsed.url
        if (parsed.profileIndex !== undefined) profileIndex = parsed.profileIndex
        if (parsed.engine) engine = parsed.engine
        if (parsed.modelSize) modelSize = parsed.modelSize
      }
    } catch (_) {}

    return {
      url,
      profileIndex,
      ttsParams: {
        language: 'zh',
        seed: 0,
        model_size: modelSize,
        engine,
        max_chunk_chars: 400,
        crossfade_ms: 120,
        normalize: true,
        effects_chain: [],
      },
    }
  }

  const fetchProfileId = async (config: VoiceboxConfig): Promise<string> => {
    try {
      const response = await CapacitorHttp.get({
        url: `${config.url.replace(/\/$/, '')}/profiles`,
        connectTimeout: 10000,
        readTimeout: 10000,
      })
      if (response.status === 200) {
        const profiles = response.data
        if (Array.isArray(profiles) && profiles.length > config.profileIndex) {
          return profiles[config.profileIndex]?.id || 'default'
        } else if (Array.isArray(profiles) && profiles.length > 0) {
          console.warn(`[Voicebox] profileIndex(${config.profileIndex})超出范围，使用第一个`)
          return profiles[0]?.id || 'default'
        }
      }
    } catch (e) {
      console.warn('[Voicebox] 获取Profile失败:', e)
    }
    return 'default'
  }

  // 当前播放的 audio 元素（仅降级方案使用）
  let currentAudio: HTMLAudioElement | null = null

  // 共享 AudioContext：避免每句创建/销毁的开销导致句间间隔不稳定
  let sharedCtx: AudioContext | null = null
  let sharedCtxSource: AudioBufferSourceNode | null = null

  const getSharedContext = (): AudioContext => {
    if (!sharedCtx || sharedCtx.state === 'closed') {
      sharedCtx = new AudioContext()
    }
    return sharedCtx
  }

  const resumeSharedContext = async (): Promise<void> => {
    const ctx = getSharedContext()
    if (ctx.state === 'suspended') {
      await ctx.resume()
    }
  }

  const closeSharedContext = () => {
    if (sharedCtxSource) {
      try { sharedCtxSource.stop() } catch (_) {}
      try { sharedCtxSource.disconnect() } catch (_) {}
      sharedCtxSource = null
    }
    if (sharedCtx && sharedCtx.state !== 'closed') {
      sharedCtx.close().catch(() => {})
    }
    sharedCtx = null
  }

  /**
   * 请求合成并播放（用于 speak() 接口的单次调用）
   */
  const speakText = async (text: string): Promise<boolean> => {
    console.log(`[Voicebox] speakText: "${text}"`)
    const audioData = await fetchAudio(text)
    if (!audioData) {
      console.warn('[Voicebox] speakText: fetchAudio返回空')
      return false
    }
    console.log(`[Voicebox] speakText: 获取到音频，开始播放`)
    return playAudioData(audioData)
  }

  // 预取缓存：text → Promise<ArrayBuffer|string>
  let prefetchCache = new Map<string, Promise<string | null>>()

  /**
   * 单次TTS请求，返回base64音频数据或null
   */
  const fetchAudioOnce = async (text: string): Promise<string | null> => {
    const config = getConfig()
    const url = `${config.url.replace(/\/$/, '')}/generate/stream`
    const payload = {
      profile_id: profileId,
      text,
      ...config.ttsParams,
    }

    // 优先使用 CapacitorHttp（原生层，绕过CORS）
    try {
      const response = await CapacitorHttp.post({
        url,
        headers: { 'Content-Type': 'application/json' },
        data: payload,
        responseType: 'blob',
        connectTimeout: 15000,
        readTimeout: 30000,
      })
      if (response.status === 200 && response.data && response.data.length > 100) {
        return response.data
      }
      console.warn(`[Voicebox] CapacitorHttp异常: status=${response.status}, dataLen=${response.data?.length || 0}`)
    } catch (e) {
      console.warn('[Voicebox] CapacitorHttp失败，尝试fetch降级:', e)
    }

    // 降级：原生fetch（部分Android WebView对blob响应支持更好）
    try {
      const fetchResp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!fetchResp.ok) {
        console.warn(`[Voicebox] fetch降级失败: status=${fetchResp.status}`)
        return null
      }
      const blob = await fetchResp.blob()
      if (blob.size < 100) {
        console.warn(`[Voicebox] fetch降级返回过小: ${blob.size} bytes`)
        return null
      }
      // blob → base64
      return new Promise((resolve) => {
        const reader = new FileReader()
        reader.onloadend = () => {
          const dataUrl = reader.result as string
          const base64 = dataUrl.split(',')[1] || dataUrl
          resolve(base64)
        }
        reader.onerror = () => resolve(null)
        reader.readAsDataURL(blob)
      })
    } catch (e) {
      console.error('[Voicebox] fetch降级也失败:', e)
      return null
    }
  }

  /**
   * 请求TTS合成（带重试），返回base64音频数据
   */
  const fetchAudio = async (text: string): Promise<string | null> => {
    const cleaned = cleanText(text)
    if (!cleaned) return null

    const config = getConfig()
    const url = `${config.url.replace(/\/$/, '')}/generate/stream`

    console.log(`[Voicebox] fetchAudio: "${cleaned.slice(0, 60)}..." → ${url}`)

    // 重试逻辑：最多3次，间隔递增
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        const delay = 500 * Math.pow(2, attempt - 1) // 500ms, 1000ms, 2000ms
        console.log(`[Voicebox] 重试 ${attempt + 1}/3, 等待${delay}ms...`)
        await new Promise(r => setTimeout(r, delay))
      }

      const data = await fetchAudioOnce(cleaned)
      if (data) {
        console.log(`[Voicebox] 成功获取音频: ${data.length} chars (attempt ${attempt + 1})`)
        return data
      }
    }

    console.error(`[Voicebox] 3次尝试均失败`)
    return null
  }

  /**
   * base64 → AudioBuffer（解码与创建 source 分离）
   */
  const decodeAudio = async (rawData: string, ctx: AudioContext): Promise<AudioBuffer | null> => {
    try {
      // 验证base64格式
      if (!/^[A-Za-z0-9+/=]+$/.test(rawData)) {
        console.warn('[Voicebox] decodeAudio: 无效的base64数据')
        return null
      }
      const binaryString = atob(rawData)
      const len = binaryString.length
      const bytes = new Uint8Array(len)
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      return await ctx.decodeAudioData(bytes.buffer.slice(0))
    } catch (e) {
      console.warn('[Voicebox] decodeAudio失败:', e)
      return null
    }
  }

  /**
   * 播放base64音频数据 — 复用共享 AudioContext，句间零间隙
   */
  const playAudioData = async (rawData: string): Promise<boolean> => {
    const currentSession = sessionId
    console.log(`[Voicebox] playAudioData: base64长度=${rawData.length}`)

    try {
      await resumeSharedContext()
      const ctx = getSharedContext()

      const audioBuffer = await decodeAudio(rawData, ctx)
      if (!audioBuffer || currentSession !== sessionId) return false

      return new Promise<boolean>((resolve) => {
        // 停掉上一个 source（如果还在播），避免重叠
        if (sharedCtxSource) {
          try { sharedCtxSource.stop() } catch (_) {}
          try { sharedCtxSource.disconnect() } catch (_) {}
        }

        const source = ctx.createBufferSource()
        source.buffer = audioBuffer
        source.connect(ctx.destination)
        sharedCtxSource = source

        isSpeaking.value = true
        onStartCb()

        source.onended = () => {
          if (sharedCtxSource === source) sharedCtxSource = null
          isSpeaking.value = false
          onEndCb()
          resolve(true)
        }

        source.start(0)
      })
    } catch (e) {
      console.warn('[Voicebox] AudioContext播放失败，降级Audio元素:', e)

      // 降级：Audio元素
      const dataUrl = `data:audio/wav;base64,${rawData}`
      return new Promise<boolean>((resolve) => {
        const audio = new Audio()
        currentAudio = audio

        audio.onplay = () => { isSpeaking.value = true; onStartCb() }
        audio.onended = () => { currentAudio = null; isSpeaking.value = false; onEndCb(); resolve(true) }
        audio.onerror = () => { currentAudio = null; isSpeaking.value = false; resolve(false) }

        audio.src = dataUrl
        audio.play().catch(() => { currentAudio = null; isSpeaking.value = false; resolve(false) })
      })
    }
  }

  /**
   * 处理句子队列 - 预取模式：播放当前句子时同时请求下一句
   */
  const processQueue = async () => {
    if (isProcessingQueue) return
    isProcessingQueue = true
    const mySession = sessionId

    while (speakQueue.length > 0 && sessionId === mySession) {
      const text = speakQueue.shift()!

      // 检查是否已有预取结果
      let audioPromise = prefetchCache.get(text)
      if (!audioPromise) {
        audioPromise = fetchAudio(text)
      }
      prefetchCache.delete(text)

      // 同时预取队列中的下一句
      if (speakQueue.length > 0) {
        const nextText = speakQueue[0]
        if (!prefetchCache.has(nextText)) {
          prefetchCache.set(nextText, fetchAudio(nextText))
        }
      }

      // 等待当前句子的音频数据
      const audioData = await audioPromise
      if (!audioData || sessionId !== mySession) break

      // 播放（队列保证顺序，句间无缝衔接）
      await playAudioData(audioData)
    }

    isProcessingQueue = false
    prefetchCache.clear()
  }

  // 短句合并缓冲：太短的句子先攒着，跟下一句合并再发TTS
  const MIN_SENTENCE_LENGTH = 6
  let mergeBuffer = ''

  const enqueueSentence = (text: string) => {
    if (text.trim().length <= 1) return

    // 如果上一次攒了短句，合并
    if (mergeBuffer) {
      text = mergeBuffer + text
      mergeBuffer = ''
    }

    // 如果当前句太短，先攒着不发
    if (text.trim().length < MIN_SENTENCE_LENGTH) {
      mergeBuffer = text
      return
    }

    speakQueue.push(text)

    // 如果队列还没开始处理，立即开始预取第一句
    if (!isProcessingQueue && !prefetchCache.has(text)) {
      prefetchCache.set(text, fetchAudio(text))
    }

    processQueue()
  }

  // 刷新合并缓冲（在isEnd时调用，确保残留短句也能发出）
  const flushMergeBuffer = () => {
    if (mergeBuffer) {
      const text = mergeBuffer
      mergeBuffer = ''
      if (text.trim().length > 1) {
        speakQueue.push(text)
        processQueue()
      }
    }
  }

  // === 公开接口 ===

  const initialize = async (): Promise<boolean> => {
    try {
      initStatus.value = '初始化中...'
      const config = getConfig()
      profileId = await fetchProfileId(config)
      console.log(`[Voicebox] Profile初始化为: ${profileId}，服务地址: ${config.url}`)
      isInitialized.value = true
      initStatus.value = '已初始化'
      return true
    } catch (error: any) {
      initStatus.value = '初始化失败'
      errorMessage.value = error.message || '初始化失败'
      console.error('[Voicebox] 初始化失败:', error)
      return false
    }
  }

  const dispose = async (): Promise<void> => {
    stopInternal()
  }

  const speak = async (textOrOptions: string | SpeechOptions): Promise<boolean> => {
    const text = typeof textOrOptions === 'string' ? textOrOptions : textOrOptions.text || ''
    if (!text.trim()) return true
    return speakText(text)
  }

  const stopInternal = () => {
    sessionId++
    speakQueue.length = 0
    streamingBuffer = ''
    mergeBuffer = ''
    isProcessingQueue = false
    prefetchCache.clear()
    closeSharedContext()
    if (currentAudio) {
      try {
        currentAudio.pause()
        currentAudio.currentTime = 0
      } catch (_) {}
      currentAudio = null
    }
    isSpeaking.value = false
  }

  const stop = async (): Promise<boolean> => {
    stopInternal()
    onEndCb()
    return true
  }

  const addToQueue = async (textOrOptions: string | SpeechOptions): Promise<boolean> => {
    const text = typeof textOrOptions === 'string' ? textOrOptions : textOrOptions.text || ''
    enqueueSentence(text)
    return true
  }

  const addBatchToQueue = async (lines: string[] | string): Promise<number> => {
    const arr = typeof lines === 'string' ? lines.split('\n') : lines
    arr.forEach(l => enqueueSentence(l))
    return arr.length
  }

  const startQueue = async (): Promise<boolean> => {
    processQueue()
    return true
  }

  const stopQueue = async (): Promise<boolean> => {
    stopInternal()
    return true
  }

  const clearQueue = async (): Promise<boolean> => {
    stopInternal()
    return true
  }

  const forceCleanup = async (): Promise<boolean> => {
    stopInternal()
    return true
  }

  const refreshQueueStatus = async (): Promise<void> => {
    queueStatus.value = {
      isPlaying: speakQueue.length > 0 || isSpeaking.value,
      currentIndex: 0,
      totalItems: speakQueue.length,
      remainingItems: speakQueue.length,
      currentItem: undefined,
    }
  }

  /**
   * 流式TTS：逐段接收文本，在标点处分句并立即合成
   */
  const processStreamingText = async (fragment: string, isEnd: boolean = false): Promise<void> => {
    try {
      if (fragment) {
        streamingBuffer += fragment
      }

      // 尝试在标点处分句
      let split = splitAtPunctuation(streamingBuffer)
      while (split) {
        enqueueSentence(split.sentence)
        streamingBuffer = split.remaining
        split = splitAtPunctuation(streamingBuffer)
      }

      // 结束时把剩余缓冲区也发出去
      if (isEnd) {
        const remaining = streamingBuffer.trim()
        streamingBuffer = ''
        if (remaining) {
          enqueueSentence(remaining)
        }
        flushMergeBuffer()
      }
    } catch (error) {
      console.error('[Voicebox] 处理流式文本失败:', error)
    }
  }

  const addIncrementalText = (text: string): void => {
    if (!text) return
    streamingBuffer += text
  }

  // 事件订阅
  const onStart = (cb: () => void) => { onStartCb = cb }
  const onEnd = (cb: () => void) => { onEndCb = cb }
  const onError = (cb: (message: string) => void) => { onErrorCb = cb }
  const onQueueStart = (cb: (totalItems: number) => void) => { onQueueStartCb = cb }
  const onQueueEnd = (cb: (completed: boolean, interrupted: boolean) => void) => { onQueueEndCb = cb }
  const onQueueItemStart = (cb: (item: { id: string; text: string }, index: number) => void) => { onQueueItemStartCb = cb }

  // 自动初始化
  onMounted(async () => {
    if (autoInit) {
      await new Promise(resolve => setTimeout(resolve, 500))
      await initialize()
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

export default useVoiceboxSpeech
