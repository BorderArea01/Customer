<template>
  <div class="right-chat-panel">
    <div class="panel-container">
      <!-- 状态指示器 -->
      <ChatStatusIndicator :status="currentStatus" :reconnect-text="reconnectText" class="status-indicator" />

      <!-- 语音识别文字显示区域 -->
      <VoiceTextDisplay 
        :listening="listening" 
        :final-display-text="finalDisplayText" 
        :is-pressing="isPressing"
        :recognition-failed="recognitionFailed"
        :is-recognizing="isRecognizing"
      />

      <!-- 回答展示区域 -->
      <AnswerDisplay 
        :answer="answer" 
        :is-loading="isLoading" 
        :has-error="hasError" 
        :error-text="errorText"
        :processing-content="processingContent"
        :asr-notice-text="asrNoticeText"
      />

      <VoiceControlButton
        :is-press-disabled="isPressDisabled"
        :is-loading="isLoading"
        :listening="listening"
        :is-cancel-zone="isCancelZone"
        :is-pressing="isPressing"
        :is-connected="isConnected"
        :listen-state-connected="listenState.isConnected"
        :employee-status-text="deviceStore.employeeStatusText"
        :is-employee-running="deviceStore.isEmployeeRunning"
        @press-start="handlePressStart"
        @press-move="handlePressMove"
        @press-end="handlePressEnd"
        @press-cancel="handlePressCancel"
        @button-click="handleButtonClick"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick, reactive, toRefs } from 'vue'
import { useUserStore } from '../../stores/user'
import { useDeviceStore } from '../../stores/device'
import { useConfigStore } from '../../stores/config'
import { useAppConfigStore } from '../../stores/appConfig'
import { useLive2DStore } from '../../stores/live2d'
import { useChatStore } from '../../stores/chat'
import { useListen } from '../../hooks/listen'
import useSpeech from '../../hooks/speech'
import type { MqttMessage } from '@/types/mqtt'
import { useExceptionStore } from '@/stores/exception'
import { registerMqttReconnect, registerVoiceReconnect } from '@/utils/reconnectRegistry'

// 组件导入
import ChatStatusIndicator from './ChatStatusIndicator.vue'
import VoiceControlButton from './VoiceControlButton.vue'
import VoiceTextDisplay from './VoiceTextDisplay.vue'
import AnswerDisplay from './AnswerDisplay.vue'

// Props 定义
const props = defineProps({
  visible: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  autoConnect: { type: Boolean, default: true },
  maxHeight: { type: String, default: '50vh' },
})

// Emits 定义
const emit = defineEmits(['sent', 'answering', 'answered', 'status-change', 'error'])

// Store 实例
const userStore = useUserStore()
const deviceStore = useDeviceStore()
const configStore = useConfigStore()
const appConfigStore = useAppConfigStore()
const live2DStore = useLive2DStore()
const chatStore = useChatStore()
const exceptionStore = useExceptionStore()

  // 核心状态 - 使用 reactive 统一管理
  const chatState = reactive({
    // 消息状态
    answer: '',
    answerCompleted: false,
    isLoading: false,
    hasError: false,
    errorText: '',
    ignoreIncoming: false,
    processingContent: '',  // 新增：处理内容状态
    
    // 语音状态
    listening: false,
    finalDisplayText: '',
    asrNoticeText: '',
    recognitionFailed: false,  // 识别失败状态（所有降级处理都为空）
    isRecognizing: false,  // 正在识别中状态（用于过渡）
    
    // 按钮状态
    isPressing: false,
    isCancelZone: false,
    isCancelling: false,
    isButtonClickProcessing: false
})

// 解构状态以便在模板中使用
const {
  answer, answerCompleted, isLoading, hasError, errorText, ignoreIncoming, processingContent,
  listening, finalDisplayText, recognitionFailed, isRecognizing,
  isPressing, isCancelZone, isCancelling, isButtonClickProcessing, asrNoticeText
} = toRefs(chatState)

// 定时器引用
const sendTimeout = ref<ReturnType<typeof setTimeout> | null>(null)
const endTimeout = ref<ReturnType<typeof setTimeout> | null>(null) // 用于检测10秒内是否有is_end

// 计算属性
const isRecognized = computed(() => 
  !!userStore.currentVisitor?.userId?.trim()
)

const isNoCameraMode = computed(() => !appConfigStore.isCameraEnabled)

const isConnected = computed(() => 
  deviceStore.isBound && deviceStore.isEmployeeRunning
)

const isPressDisabled = computed(() => {
  if (props.disabled) return true
  
  // 摄像头模式下，没有用户信息时禁用按住说话
  if (appConfigStore.isCameraEnabled && !isRecognized.value) {
    return true
  }
  
  const blockingKeys = ['agent-offline', 'mqtt-offline', 'camera-error', 'microphone-error', 'asr-offline']
  return exceptionStore.list.some(e =>
    (!!e.dedupeKey && blockingKeys.includes(e.dedupeKey)) && (e.severity === 'high' || e.severity === 'critical')
  )
})

const getReadableMqttError = () => {
  const raw = chatStore.mqttError?.message?.trim()
  if (!raw) return 'MQTT 连接未建立，请检查当前网络和消息服务器地址'
  if (raw.includes('timeout')) return 'MQTT 连接超时，请检查当前网络是否能访问消息服务器'
  if (raw.includes('未连接')) return 'MQTT 当前未连接，请稍后重试或去调试页执行重连'
  if (raw.includes('host') || raw.includes('主机')) return 'MQTT 地址不可用，请检查设备下发的 MQTT 地址'
  return raw
}

const setChatError = (message: string) => {
  isLoading.value = false
  hasError.value = true
  errorText.value = message
  answer.value = ''
}

const resetChatError = () => {
  hasError.value = false
  errorText.value = ''
}

const buildSendBlockReason = () => {
  if (props.disabled) return '当前聊天面板不可用，请稍后再试'
  if (appConfigStore.isCameraEnabled && !isRecognized.value) return '当前未识别到用户，请先识别成功后再发送消息'
  if (!deviceStore.isBound) return '设备尚未完成绑定，暂时不能发送消息'
  if (deviceStore.employeeInfo?.employeeId && deviceStore.employeeInfo?.serverStatus === undefined) {
    return '正在获取数字员工状态，请稍后再试'
  }
  if (!deviceStore.isEmployeeRunning) {
    return `数字员工当前状态为“${deviceStore.employeeStatusText}”，暂时不能发送消息`
  }
  if (!chatStore.mqttIsConnected) return getReadableMqttError()
  return ''
}

const ensureMqttReady = async () => {
  if (chatStore.mqttIsConnected) return true
  try {
    await chatStore.connectMqtt()
    return chatStore.mqttIsConnected
  } catch {
    return false
  }
}

// 监听数字员工运行状态，联动异常
watch(() => deviceStore.isEmployeeRunning, (running) => {
  try {
    // 只有在员工信息存在且已绑定时才判断状态
    // 如果 serverStatus 为 undefined，说明还在初始化中，不报告异常
    const hasEmployeeInfo = deviceStore.isBound && deviceStore.employeeInfo?.employeeId
    const hasStatus = deviceStore.employeeInfo?.serverStatus !== undefined
    
    if (!hasEmployeeInfo || !hasStatus) {
      // 还在初始化中，不报告异常
      return
    }
    
    if (running) {
      exceptionStore.resolveByKey('agent-offline')
    } else {
      exceptionStore.report({
        severity: 'high',
        title: '数字员工离线',
        detail: '尚未建立连接，相关能力不可用',
        source: 'Agent',
        code: 'AGENT_OFFLINE',
        dedupeKey: 'agent-offline'
      })
    }
  } catch (_) {}
}, { immediate: true })

// 语音识别配置
const getListenConfig = () => {
  // 使用配置中的语音识别URL
  if (appConfigStore.speechRecognitionUrl) {
    return {
      serverUrl: appConfigStore.speechRecognitionUrl,
      autoInit: false
    }
  }
  
  return { autoInit: false }
}

// 语音识别 - 基本功能
const {
  state: listenState,
  startListening,
  stopListening,
  onResult,
  initialize: initListen,
  reconnect: reconnectVoice
} = useListen(getListenConfig())

// 注册 MQTT 和语音重连函数到共享注册表
registerMqttReconnect(async () => {
  chatStore.disconnectMqtt()
  chatStore.reloadMqttConfig()
  await chatStore.connectMqtt()
})

registerVoiceReconnect(async () => {
  await reconnectVoice()
})

// 语音合成与Live2D集成（直接使用 useSpeech 并在组件内联事件与逻辑）
const {
  initialize: initSpeech,
  speak,
  addToQueue,
  startQueue,
  clearQueue,
  forceCleanup,
  stop: stopSpeech,
  speed: currentSpeed,
  volume: currentVolume,
  onStart,
  onEnd,
  processStreamingText,
  isInitialized: ttsInitialized,
  initStatus: ttsInitStatus,
  errorMessage: ttsError
} = useSpeech({ autoInit: false })

// Live2D 联动
const getSafeSpeed = () => Number(currentSpeed?.value || 50)
const getSafeVolume = () => Number(currentVolume?.value || 50)

// 清除结束超时定时器
const clearEndTimeout = () => {
  if (endTimeout.value) {
    clearTimeout(endTimeout.value)
    endTimeout.value = null
  }
}

// 启动10秒结束超时检测
const startEndTimeout = () => {
  clearEndTimeout()
  endTimeout.value = setTimeout(() => {
    // 10秒内没有收到is_end，主动结束
    if (isLoading.value && answer.value) {
      console.warn('⚠️ [Chat] 10秒内未收到is_end，主动结束消息')
      isLoading.value = false
      answerCompleted.value = true
      chatStore.endRound('completed')
      emit('answered', answer.value)

      // 重置按钮状态
      isCancelZone.value = false
      isPressing.value = false

      processStreamingText('', true)
    }
    endTimeout.value = null
  }, 10000) // 10秒超时
}

// 执行结束逻辑的统一函数
const executeEndLogic = () => {
  isLoading.value = false
  answerCompleted.value = true
  resetChatError()
  chatStore.endRound('completed')
  emit('answered', answer.value)

  // 重置按钮状态
  isCancelZone.value = false
  isPressing.value = false

  processStreamingText('', true)
  
  // 清除结束超时定时器
  clearEndTimeout()
}

// 消息处理函数
const handleMessage = async (data: MqttMessage) => {
  if (!data) return

  // 用户验证
  const currentVisitorId = userStore.currentVisitor?.userId?.trim() || ''
  if (!currentVisitorId || data.user_id !== currentVisitorId) return

  // 注意：session_id 和 message_id 的验证现在由 MQTT 服务层的 ChatStore 过滤处理
  // 这里不再需要手动验证，因为消息已经通过了 ChatStore.shouldAcceptIncoming 过滤

  // 消息类型验证和处理
  if (data.type === "0") {
    // 处理文本消息
    // 忽略已取消的消息
    if (ignoreIncoming.value) {
      if (data?.is_end) {
        ignoreIncoming.value = false
        clearEndTimeout()
      }
      return
    }

    // 统一处理文本内容（无论是否结束，都先处理内容）
    const content = data.content || data.text || data.message || data.data
    if (content !== undefined && content !== null) {
      const text = String(content)

      // 过滤特殊标签
      if (text.includes('<think>') || text.includes('</think>')) {
        // 如果是结束消息，需要执行结束逻辑
        if (data?.is_end) {
          executeEndLogic()
        }
        return
      }

      const cleanText = text.replace(/<\/?think>/g, '').trim()
      if (cleanText) {
        // 累积答案（正常消息和异常消息都统一处理）
        resetChatError()
        answer.value += cleanText
        emit('answering', answer.value)

        // 如果收到内容且还没有启动结束超时检测，启动10秒超时
        if (!endTimeout.value && isLoading.value) {
          startEndTimeout()
        }

        // 处理TTS
        // 先移除HTML标签
        // let plain = text.replace(/<[^>]*>/g, '')
        // // 移除Markdown图片语法：![alt text](url) 或 ![alt text](url "title")
        // plain = plain.replace(/!\[([^\]]*)\]\([^\)]+\)/g, '')
        const plain = text
        if (plain) {
          // 检查TTS是否已初始化
          if (!ttsInitialized.value) {
            try {
              const provider = localStorage.getItem('tts-provider') || 'xunfei'
              // Voicebox不需要讯飞凭据，直接初始化
              if (provider === 'voicebox') {
                await initSpeech()
              } else {
                // 讯飞需要凭据
                const credentials = appConfigStore.speechBroadcast?.apiCredentials
                if (!credentials || !credentials.appId || !credentials.apiKey || !credentials.apiSecret) {
                  console.warn('⚠️ [语音] 初始化失败：配置中缺少讯飞凭据')
                  return
                }
                await initSpeech({
                  xunfeiAppId: credentials.appId,
                  xunfeiApiKey: credentials.apiKey,
                  xunfeiApiSecret: credentials.apiSecret,
                })
              }
            } catch (initError) {
              console.error('❌ [语音] 初始化异常:', initError)
              return
            }
          }
          
          try {
            await processStreamingText(plain, false)
          } catch (error) {
            // 尝试直接调用speak作为备用方案
            try {
              await speak(plain)
            } catch (speakError) {
              // 静默处理错误
            }
          }
        }
      }
    }

    // 统一处理结束逻辑（正常消息和异常消息都统一处理）
    if (data?.is_end) {
      executeEndLogic()
      return
    }
  } else if (data.type === "1" || data.type === "2") {
    // 处理工具调用和提示消息
    // 注意：工具调用和提示消息的结束不应结束轮次，只有 type="0" 的结束才是真正的轮次结束
    if (data?.is_end) {
      // 工具调用结束，清空处理内容，但不结束轮次
      processingContent.value = '' // 清空处理内容
    } else {
      // 更新处理内容
      const content = data.content || data.text || ''
      if (content) {
        processingContent.value = String(content).trim()
        // 如果收到 type="2" 的消息（执行流程），确保显示 loading 状态
        // 这对于"用户进入"等场景很重要，因为这些消息可能不是通过 handleSendQuestion 发送的
        if (!isLoading.value) {
          isLoading.value = true
        }
      }
    }
    return
  } else {
    // 其他类型暂时不做处理
    return
  }
}

// 发送问题
const handleSendQuestion = async (questionText: string) => {
  if (!questionText.trim() || isLoading.value) return
  if (appConfigStore.isCameraEnabled && !isRecognized.value) {
    setChatError(buildSendBlockReason())
    return
  }
  if (!deviceStore.isBound || !deviceStore.isEmployeeRunning) {
    setChatError(buildSendBlockReason())
    return
  }

  const mqttReady = await ensureMqttReady()
  if (!mqttReady) {
    setChatError(buildSendBlockReason())
    return
  }

  try {
    // 确保有活跃会话
    if (!chatStore.inSession) {
      chatStore.startSession()
    }

    // 开始新轮次
    const roundStarted = chatStore.startRound()
    if (!roundStarted) {
      console.error('❌ [Chat] 无法开始新轮次')
      return
    }

    // 重置状态
    ignoreIncoming.value = false
    isLoading.value = true
    answer.value = ''
    answerCompleted.value = false
    resetChatError()
    processingContent.value = '' // 清空处理内容
    asrNoticeText.value = '' // 清除 ASR 未听清提示

    // 清空TTS
    clearQueue()
    
    // 清除之前的结束超时定时器
    clearEndTimeout()

    // 构建消息（session_id 和 message_id 将由 MQTT 服务自动注入）
    const messageData: any = {}

    if (userStore.currentVisitor) {
      messageData.user_id = userStore.currentVisitor.userId
    }

    await sendMessage(questionText, messageData)

    emit('sent', {
      question: questionText,
      sessionId: chatStore.currentSessionId,
      messageId: chatStore.currentMessageId
    })

    // 设置超时
    if (sendTimeout.value) clearTimeout(sendTimeout.value)
    sendTimeout.value = setTimeout(() => {
      if (isLoading.value && !answer.value) {
        setChatError('消息发送后长时间没有收到响应，请检查当前网络、MQTT 连接和数字员工状态')
        answer.value = '响应超时，请重试'
        answerCompleted.value = true
        chatStore.endRound('timeout')
        emit('error', new Error('响应超时'))
      }
    }, chatStore.config.timeoutMs)

  } catch (error) {
    setChatError(buildSendBlockReason() || ((error as Error)?.message || '消息发送失败，请稍后重试'))
    chatStore.endRound('interrupted')
    emit('error', error)
    console.error('[Chat] 发送失败，请重试')
  }
}

// 取消当前会话
const cancelCurrentRound = async () => {
  if (isCancelling.value) return

  isCancelling.value = true

  try {
    // 停止语音播报
  try { stopSpeech() } catch (_) { }
  try { clearQueue() } catch (_) { }
  try { live2DStore.stopMouth() } catch (_) { }

    // 清理超时
  if (sendTimeout.value) {
    clearTimeout(sendTimeout.value)
    sendTimeout.value = null
  }
  clearEndTimeout()

    // 设置忽略标志
    ignoreIncoming.value = true

    // 结束当前轮次
    chatStore.endRound('interrupted')

    // 重置状态
    isLoading.value = false
    answerCompleted.value = true
    answer.value = ''
    finalDisplayText.value = ''
    isCancelZone.value = false
    isPressing.value = false

    await nextTick()

  } finally {
    isCancelling.value = false
  }
}

// 语音识别相关
let offResult: (() => void) | null = null
let pressStartY = 0
const CANCEL_THRESHOLD_PX = 60
let gestureDebounceTimer: ReturnType<typeof setTimeout> | null = null

// 全局事件监听器
const globalListeners = {
  mousemove: (e: MouseEvent) => handlePressMove(e),
  mouseup: async () => await handlePressEnd(),
  touchmove: (e: TouchEvent) => handlePressMove(e),
  touchend: async () => await handlePressEnd(),
  touchcancel: async () => await handlePressCancel()
}

const addGlobalListeners = () => {
  Object.entries(globalListeners).forEach(([event, handler]) => {
    window.addEventListener(event, handler as any, { passive: true })
  })
}

const removeGlobalListeners = () => {
  Object.entries(globalListeners).forEach(([event, handler]) => {
    window.removeEventListener(event, handler as any)
  })
}

const getEventY = (e: TouchEvent | MouseEvent): number => {
  const te = e as TouchEvent
  if (te.touches?.length) return te.touches[0].clientY
  if ((te as any).changedTouches?.length) return (te as any).changedTouches[0].clientY
  return (e as MouseEvent).clientY
}

const handlePressMove = (e: TouchEvent | MouseEvent) => {
  if (!listening.value) return

  if (gestureDebounceTimer) {
    clearTimeout(gestureDebounceTimer)
  }

  gestureDebounceTimer = setTimeout(() => {
    const currentY = getEventY(e)
    const deltaY = pressStartY - currentY
    isCancelZone.value = deltaY > CANCEL_THRESHOLD_PX
  }, 16)
}

const handlePressStart = async (e: TouchEvent | MouseEvent) => {
  if (isPressDisabled.value || listening.value) return
  
  // 停止当前播报 - 使用强制清理确保完全停止
  console.log('🛑 [VoiceControl] 开始新的语音识别，强制清理TTS状态')
  try { 
    await forceCleanup() 
    console.log('🛑 [VoiceControl] TTS强制清理完成')
  } catch (_) { }
  try { live2DStore.stopMouth() } catch (_) { }
  
  if (isLoading.value) return
  
  try {
    isPressing.value = true
    addGlobalListeners()
    pressStartY = getEventY(e)
    isCancelZone.value = false
    listening.value = true
    finalDisplayText.value = ''
    recognitionFailed.value = false
    isRecognizing.value = false

    // 注册语音识别结果监听 - 实时显示 partialText（来自 2pass-online）
    offResult?.()
    offResult = onResult((evt) => {
      if (!listening.value) return

      // 如果有文本内容，说明识别中
      if (evt.text || listenState.partialText || listenState.finalText) {
        isRecognizing.value = true
      }

      // 实时显示：使用 partialText（来自 2pass-online）
      finalDisplayText.value = listenState.partialText || ''
      
      // 如果是最终结果，也更新最终显示文本
      if (evt.isFinal) {
        finalDisplayText.value = listenState.finalText || listenState.partialText || ''
        isRecognizing.value = false
      }
    })

    await startListening()
  } catch (error) {
    listening.value = false
    isRecognizing.value = false
  }
}

const endListenSafely = async () => {
  try {
    await stopListening()

    // 等待最终结果处理完成
    await new Promise(resolve => setTimeout(resolve, 500))
    
    offResult?.()
    offResult = null

    listening.value = false
    isRecognizing.value = false

    // 获取最终文本（优先使用 finalText，如果为空则使用 partialText）
    const textToSend = (listenState.finalText || listenState.partialText || '').trim()

    if (textToSend) {
      finalDisplayText.value = textToSend
      recognitionFailed.value = false
      await handleSendQuestion(textToSend)
    } else {
      // 所有降级处理都为空，标记为识别失败
      recognitionFailed.value = true
      finalDisplayText.value = ''
    }
  } catch (error) {
    console.error('语音识别结束失败:', error)
    recognitionFailed.value = true
    isRecognizing.value = false
    listening.value = false
  }
}

const cancelListeningWithoutSend = async () => {
  try { await stopListening() } catch (_) { }
  listening.value = false
  offResult?.()
  offResult = null
  
  if (gestureDebounceTimer) {
    clearTimeout(gestureDebounceTimer)
    gestureDebounceTimer = null
  }
  
  finalDisplayText.value = ''
  recognitionFailed.value = false
  isRecognizing.value = false
  await nextTick()
}

const handlePressEnd = async () => {
  if (isLoading.value || !listening.value) return
  
  const shouldCancel = isCancelZone.value
  removeGlobalListeners()

  if (shouldCancel) {
    await cancelListeningWithoutSend()
    isCancelZone.value = false
    isPressing.value = false
    return
  }

  try {
    await endListenSafely()
  } finally {
    isCancelZone.value = false
    isPressing.value = false
  }
}

const handlePressCancel = async () => {
  if (!listening.value) return
  isCancelZone.value = false
  isPressing.value = false
  removeGlobalListeners()
  await cancelListeningWithoutSend()
}

const handleButtonClick = async () => {
  if (isButtonClickProcessing.value || isCancelling.value) return
  
  if (isLoading.value) {
    isButtonClickProcessing.value = true
    try {
      await cancelCurrentRound()
    } catch (error) {
      console.error('取消会话失败:', error)
    } finally {
      setTimeout(() => {
        isButtonClickProcessing.value = false
      }, 500)
    }
  }
}

// MQTT 连接（来自 ChatStore）
const connect = async () => {
  await chatStore.connectMqtt()
}
const disconnect = () => {
  chatStore.disconnectMqtt()
}
const sendMessage = async (q: string, params: any) => {
  return await chatStore.sendMqttMessage(q, params)
}
chatStore.onMqttMessage(handleMessage)
chatStore.onMqttStatusChange((status) => emit('status-change', status))

// 计算属性
const currentStatus = computed(() => {
  if (isLoading.value && !answer.value) return 'loading'
  if (isLoading.value && answer.value) return 'typing'
  if (listening.value) return 'voice'
  if (chatStore.mqttConnectionStatus === 'error') return 'error'
  if (chatStore.mqttConnectionStatus === 'reconnecting') return 'reconnecting'
  return 'idle'
})

const reconnectText = computed(() => {
  if (chatStore.mqttConnectionStatus === 'reconnecting' && chatStore.mqttReconnectAttempts > 0) {
    return `已重连${chatStore.mqttReconnectAttempts}次，正在恢复中`
  }
  return ''
})

 

// Live2D 联动事件
onStart(() => {
  live2DStore.startMouthByTTS({ speed: getSafeSpeed(), volume: getSafeVolume() })
})

// 当 TTS 结束（单次播放模式）时，确保关闭嘴型
onEnd(() => {
  live2DStore.stopMouth()
  isCancelZone.value = false
  isPressing.value = false
})


// 重新初始化MQTT连接
const reinitializeMqtt = async () => {
  try {
    console.log('🔄 [Chat] 重新初始化MQTT连接...')
    disconnect()
    chatStore.reloadMqttConfig()
    
    // 等待连接完全断开后再重新连接
    setTimeout(async () => {
      if (deviceStore.isBound) {
        try {
          await connect()
          console.log('✅ [Chat] MQTT重新连接成功')
        } catch (error) {
          console.error('❌ [Chat] MQTT重新连接失败:', error)
        }
      }
    }, 200)  // 增加等待时间，确保旧连接完全清理
  } catch (error) {
    console.error('❌ [Chat] 重新初始化失败:', error)
  }
}

// 清理函数
const cleanup = () => {
  // 清理MQTT资源
  if (listening.value) {
    stopListening().catch(() => { })
  }
  
  try { stopSpeech() } catch (_) { }
  try { clearQueue() } catch (_) { }
  try { live2DStore.stopMouth() } catch (_) { }
  
  offResult?.()
  offResult = null

  // 清理定时器
  if (sendTimeout.value) {
    clearTimeout(sendTimeout.value)
    sendTimeout.value = null
  }
  
  clearEndTimeout()
  
  if (gestureDebounceTimer) {
    clearTimeout(gestureDebounceTimer)
    gestureDebounceTimer = null
  }

  // 重置状态
  Object.assign(chatState, {
    answer: '',
    answerCompleted: false,
    isLoading: false,
    hasError: false,
    errorText: '',
    ignoreIncoming: false,
    listening: false,
    finalDisplayText: '',
    isPressing: false,
    isCancelZone: false,
    isCancelling: false,
    isButtonClickProcessing: false
  })

  // 聊天组件状态已完全重置
}

//

// 生命周期
onMounted(async () => {
  if (deviceStore.isBound) {
    try {
      await connect()
    } catch (error) {
      console.error('❌ [Chat] MQTT初始连接失败:', (error as Error)?.message)
    }
  }
  
  if (deviceStore.canUseApp) {
    // 初始化语音识别
    initListen()
  }

  // canUseApp 可能在挂载后变为 true（等员工状态返回），需要监听
  watch(() => deviceStore.canUseApp, (canUse) => {
    if (canUse && !listenState.isConnected) {
      initListen()
    }
  })
  
  if (deviceStore.isBound) {
    deviceStore.startEmployeeStatusMonitoring()
  }
})

// 监听设备绑定状态，自动连接/断开MQTT
watch(() => deviceStore.isBound, async (isBound) => {
  if (isBound) {
    try {
      await connect()
      deviceStore.startEmployeeStatusMonitoring()
    } catch (error) {
      console.error('❌ [Chat] MQTT连接失败:', (error as Error)?.message)
    }
  } else {
    disconnect()
    deviceStore.stopEmployeeStatusMonitoring()
  }
}, { immediate: true })

// 移除无效的空监听器，避免额外的依赖追踪

watch(() => userStore.currentVisitor, (newVisitor, oldVisitor) => {
  if (oldVisitor && !newVisitor) {
    cleanup()
  }
}, { immediate: false })

onBeforeUnmount(() => {
  disconnect()
  deviceStore.stopEmployeeStatusMonitoring()
  
  chatStore.offMqttMessage()
  chatStore.offMqttStatusChange()
  
  // 结束当前会话
  chatStore.interruptAll()
  
  cleanup()
})

// 暴露方法
defineExpose({
  sendMessage: handleSendQuestion,
  clear: cleanup,
  reinitializeMqtt
})
</script>

<style scoped lang="css">
/* 主聊天面板容器 */
.right-chat-panel {
  position: fixed;
  right: 0;
  top: 20vh;
  width: 50vw;
  max-width: 50vw;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  pointer-events: none;
  z-index: 1001;
}

/* 面板内容容器 */
.panel-container {
  background: transparent;
  pointer-events: auto;
  width: 45vw;
  max-width: 45vw;
  margin: 0 1.25rem;
  padding-bottom: 2.5rem;
  border-radius: 1rem;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  position: relative;
}

/* 状态指示器定位 */
.status-indicator {
  position: absolute;
  top: -2rem;
  left: 50%;
  transform: translateX(-50%);
}

/* 连接状态（已移除旧 UI，逻辑迁移至异常堆叠） */

/* 面板进入动画 */
.right-chat-panel {
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}
</style>
