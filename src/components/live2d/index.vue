<template>
  <div class="live2d-container">
    <!-- 激活后加载遮罩 -->
    <div v-if="isActivationLoading" class="activation-loading-overlay">
      <div class="activation-loading-content">
        <div class="loading-icon">
          <img src="@/assets/ai-full-page-show.png" class="loading-image" alt="loading" />
        </div>
        <p class="loading-text">正在加载对话和人脸相关参数...</p>
      </div>
    </div>

    <!-- 数字人区域（始终显示） -->
    <div class="digital-human-section">
      <Live2DCanvas v-if="showLive2DCanvas" :loading="loading" :model-loaded="modelLoaded" :canvas-key="canvasKey"
        @model-loaded="handleModelLoaded" @loading-change="handleLoadingChange" />
    </div>

    <!-- 人脸识别状态显示（仅在设备就绪且摄像头启用时显示）  -->
    <FaceRecognitionStatus v-if="isDeviceReady && appConfigStore.isCameraEnabled"
      :is-detection-active="isDetectionActive" :is-session-active="userStore.isSessionActive"
      :recognition-status="userStore.recognitionStatus" />

    <!-- 右侧聊天面板（仅在设备就绪时显示） -->
    <RightChatPanel ref="chatPanelRef" :visible="showChat" :disabled="!modelLoaded"
      :auto-connect="true" :max-height="'60vh'" :theme="'auto'" :status-size="'md'" @sent="handleChatSent"
      @answering="handleChatAnswering" @answered="handleChatAnswered" @status-change="handleChatStatusChange"
      @error="handleChatError" />

    <div class="action-menu-container">
      <div class="action-menu-top">
        <NetworkSpeedIndicator />
        <ActionMenu :cameraDebugEnabled="cameraDebugEnabled" @toggle-camera-debug="toggleCameraDebug" />
        <UpdateIndicator />
      </div>
      <ExceptionStack v-if="exceptionEnabled" />
    </div>

    <!-- 右下角摄像头调试预览 -->
    <div v-if="cameraDebugEnabled && submittedFaceImage" class="camera-debug-preview">
      <img :src="submittedFaceImage" alt="face preview" />
    </div>

    <!-- 右下角日志面板 -->
    <LogPanel />

    <!-- 强制刷新弹窗 -->
    <ForceReloadDialog :visible="forceReloadDialogVisible" :countdown-seconds="5" @confirm="handleForceReloadConfirm"
      @cancel="handleForceReloadCancel" />

    <!-- 更新弹窗 -->
    <UpdateDialog :visible="isUpdateDialogVisible" @close="handleUpdateDialogClose" />

    <div v-if="customLabel" class="custom-label-display">{{ customLabel }}</div>

    <!-- 左下角版本显示 -->
    <div class="version-display">v{{ appVersion }}</div>

    <!-- 底部公告面板 -->
    <ContactInfoPanel />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import ExceptionStack from '@/components/common/ExceptionStack.vue'
import { useUserStore } from '@/stores/user'
import { useDeviceStore, DeviceBindingStatus } from '@/stores/device'
import { useConfigStore } from '@/stores/config'
import LogPanel from '@/components/common/LogPanel.vue'
import { useAppConfigStore } from '@/stores/appConfig'
import useDetection, { type CameraErrorInfo } from '@/hooks/detection'
import { FaceApi, DeviceApi, UserApi } from '@/server'
import { useRouter } from 'vue-router'
import Live2DCanvas from './Live2DCanvas.vue'
import FaceRecognitionStatus from './FaceRecognitionStatus.vue'
import RightChatPanel from '../chat/index.vue'
import ContactInfoPanel from '../chat/ContactInfoPanel.vue'
import { useLive2DStore } from '../../stores/live2d'
import useSpeech from '@/hooks/speech'
import { useChatStore } from '@/stores/chat'
import ActionMenu from './ActionMenu.vue'
import NetworkSpeedIndicator from '../common/NetworkSpeedIndicator.vue'
import ForceReloadDialog from '../common/ForceReloadDialog.vue'
import UpdateIndicator from './UpdateIndicator.vue'
import UpdateDialog from '../common/UpdateDialog.vue'
import { useExceptionStore } from '@/stores/exception'
import { useUpdateStore } from '@/stores/update'
import { useUpdate } from '@/hooks/update'
import { Capacitor } from '@capacitor/core'
import { LiveUpdate } from '@capawesome/capacitor-live-update'
import { generateGreeting } from '@/utils/greeting'
import { executeWorkflow } from '@/utils/workflow'

// Router
const router = useRouter()

// Store
const userStore = useUserStore()
const live2DStore = useLive2DStore()
const deviceStore = useDeviceStore()
const configStore = useConfigStore()
const appConfigStore = useAppConfigStore()
const speech = useSpeech({ autoInit: true })
const chatStore = useChatStore()
const exceptionStore = useExceptionStore()
const { forceReloadDialogVisible } = storeToRefs(exceptionStore)
const updateStore = useUpdateStore()
const { isUpdateDialogVisible, shouldAutoShow } = storeToRefs(updateStore)

// 初始化更新检测 hook（仅用于检测，不自动更新）
const { checkForUpdateOnly, getCurrentVersion } = useUpdate()

// 应用版本号（从 vite define 注入）
const appVersion = __APP_VERSION__
const customLabel = ref(localStorage.getItem('custom-label') || '')

const syncCustomLabel = (value?: string) => {
  customLabel.value = value ?? localStorage.getItem('custom-label') ?? ''
}

const handleCustomLabelChanged = (event: Event) => {
  syncCustomLabel((event as CustomEvent<string>).detail)
}

const handleCustomLabelStorage = (event: StorageEvent) => {
  if (event.key === 'custom-label') syncCustomLabel(event.newValue ?? '')
}

// 状态管理
const loading = ref(true)
const modelLoaded = ref(false)
const canvasKey = ref(0)
const showLive2DCanvas = ref(true) // 控制 Live2D 组件的显示/隐藏
const showChat = ref(false) // 初始不显示聊天面板
const isDetectionActive = ref(false)
const isActivationLoading = ref(false) // 激活后的加载状态
const isInitialized = ref(false) // 是否已初始化，防止重复初始化

// 组件引用
const chatPanelRef = ref<InstanceType<typeof RightChatPanel> | null>(null)
const exceptionEnabled = ref(false)


// 业务侧并发/节流控制
const detectionCallbacksInitialized = ref(false) // 回调只初始化一次
const lastRecognitionAt = ref(0)
const DEBUG_LOG = false
let sessionCycleTimer: ReturnType<typeof setInterval> | null = null
const isNoCameraMode = computed(() => !appConfigStore.isCameraEnabled)
let initPageWatcher: (() => void) | null = null // 存储 initPage 中的 watch 清理函数

// 重试配置（硬编码，不再从配置读取）
const RECOGNITION_COOLDOWN_MS = 4000
const RECOGNITION_TOTAL_TIMEOUT_MS = 30000 // 总重试超时时间：30秒
const MAX_RECOGNITION_RETRIES = 3
const RETRY_DELAY_MS = 800

// 用户活动监听和防抖
const CLICK_DEBOUNCE_MS = 5000 // 5秒防抖，避免频繁重置
let clickDebounceTimer: ReturnType<typeof setTimeout> | null = null
const lastActivityTime = ref(Date.now())

// 提交识别所用的人脸图片（展示请求所用的那张）
const submittedFaceImage = ref<string | null>(null)
const cameraDebugEnabled = ref(false)

// 关门工作流计时器
let closeDoorTimer: ReturnType<typeof setTimeout> | null = null

// 强制刷新弹窗状态由异常模块托管


// 计算属性：设备是否就绪（已激活且已绑定）
const isDeviceReady = computed(() => {
  return deviceStore.isActivated && deviceStore.isBound
})


// 人脸检测实例（延迟初始化，等待配置加载完成）
let detectionInstance: ReturnType<typeof useDetection> | null = null
const detectionInitialized = ref(false)

// 初始化人脸检测（在配置加载完成后调用）
const initDetection = () => {
  if (detectionInitialized.value || detectionInstance) {
    return
  }
  
  try {
    console.log('🔧 [Live2D] 开始初始化人脸检测...')
    detectionInstance = useDetection({
      showVideo: {
        enable: false,
        width: 640,
        height: 480,
        x: 0,
        y: 0
      },
      onCameraError: handleCameraError,
      onCameraReady: handleCameraReady
    })
    detectionInitialized.value = true
    console.log('✅ [Live2D] 人脸检测初始化成功')
  } catch (error) {
    console.error('❌ [Live2D] 人脸检测初始化失败:', error)
    throw error
  }
}

// 获取检测实例的方法（延迟初始化）
const getDetectionInstance = () => {
  if (!detectionInstance) {
    initDetection()
  }
  return detectionInstance!
}

// 延迟解构检测方法
const onActive = (callback: (faces: any[], persons: any[]) => void) => {
  if (detectionInstance) {
    detectionInstance.onActive(callback)
  }
}
const onInactive = (callback: (faces: any[], persons: any[]) => void) => {
  if (detectionInstance) {
    detectionInstance.onInactive(callback)
  }
}
const onInit = (callback: () => void) => {
  if (detectionInstance) {
    detectionInstance.onInit(callback)
  }
}
const detectCurrentFrame = async () => {
  if (detectionInstance) {
    return await detectionInstance.detectCurrentFrame()
  }
  return { faces: [], persons: [] }
}
const ensureDetectionStartedCore = async () => {
  if (!detectionInstance) {
    initDetection()
  }
  if (detectionInstance) {
    await detectionInstance.ensureStarted()
  }
}
const ensureDetectionStoppedCore = async () => {
  if (detectionInstance) {
    await detectionInstance.ensureStopped()
  }
}
const detectionRunning = computed(() => {
  if (!detectionInstance) {
    return false
  }
  return detectionInstance.isRunning.value
})

function handleCameraReady() {
  // 异常清除已在 hook 内部处理，这里只处理 UI 状态
  if (!userStore.isRecognizing) {
    userStore.setRecognitionStatus('等待识别...')
  }
}

function handleCameraError(info: CameraErrorInfo) {
  // 异常上报已在 hook 内部处理，这里只处理 UI 状态
  userStore.setRecognitionStatus(info.message)
}

onMounted(() => {
  syncCustomLabel()
  window.addEventListener('custom-label-changed', handleCustomLabelChanged)
  window.addEventListener('storage', handleCustomLabelStorage)

  // 添加全局错误监听
  window.addEventListener('unhandledrejection', (event) => {
    console.error('❌ [Global] 未处理的Promise异常:', event.reason)
    console.error('❌ [Global] 异常详情:', JSON.stringify({
      reason: event.reason,
      promise: event.promise,
      type: event.type
    }, null, 2))
  })

  window.addEventListener('error', (event) => {
    console.error('❌ [Global] 全局错误:', event.error)
    console.error('❌ [Global] 错误详情:', JSON.stringify({
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error
    }, null, 2))
  })


  // 页面初始化时直接进行初始化
  console.log('🚀 [Live2D] onMounted 开始，准备调用 initPage()')
  console.log('📦 [Live2D] 当前 deviceStore.deviceConfig:', deviceStore.deviceConfig)
  initPage().then(() => {
    console.log('✅ [Live2D] initPage() 执行完成')
  }).catch((error) => {
    console.error('❌ [Live2D] initPage() 执行失败:', error)
  })


  // 监听窗口大小变化
  window.addEventListener('resize', handleResize)

  // 监听数字员工绑定/解绑事件
  window.addEventListener('digital-worker-bound', handleDigitalWorkerBound)
  window.addEventListener('digital-worker-unbound', handleDigitalWorkerUnbound)

  // 监听设备解绑状态，自动跳转到绑定页面
  watch(() => deviceStore.isBound, (isBound) => {
    if (!isBound && deviceStore.isActivated) {
      console.log('🔀 [Live2D] 设备已解绑，跳转到绑定页面')
      window.location.href = '/binding-wait'
    }
  })

  // 确保绑定轮询已启动，用于监听绑定状态变化
  const ensureBindingPollingStarted = () => {
    if (!deviceStore.isPollingBinding) {
      console.log('🔗 [Live2D] 启动绑定状态轮询...')
      try {
        deviceStore.startBindingPolling()
        console.log('✅ [Live2D] 绑定状态轮询已启动')
      } catch (error) {
        console.error('❌ [Live2D] 启动绑定状态轮询失败:', error)
      }
    } else {
      console.log('✅ [Live2D] 绑定状态轮询已在进行中')
    }
  }

  // 确保绑定状态轮询已启动
  ensureBindingPollingStarted()

  // 无摄像头模式：添加屏幕点击监听器
  if (isNoCameraMode.value) {
    console.log('👆 [NoCameraMode] 添加屏幕点击监听器')
    document.addEventListener('click', handleScreenClick, true)
    document.addEventListener('touchstart', handleScreenClick, true)
    document.addEventListener('keydown', handleScreenClick, true)
  }

  // 启动版本更新检测定时器
  updateStore.startCheckTimer(performUpdateCheck)

})

onBeforeUnmount(() => {
  // 移除事件监听
  window.removeEventListener('custom-label-changed', handleCustomLabelChanged)
  window.removeEventListener('storage', handleCustomLabelStorage)
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('digital-worker-bound', handleDigitalWorkerBound)
  window.removeEventListener('digital-worker-unbound', handleDigitalWorkerUnbound)

  // 清理屏幕点击监听器
  document.removeEventListener('click', handleScreenClick, true)
  document.removeEventListener('touchstart', handleScreenClick, true)
  document.removeEventListener('keydown', handleScreenClick, true)

  // 清理防抖定时器
  if (clickDebounceTimer) {
    clearTimeout(clickDebounceTimer)
    clickDebounceTimer = null
  }

  // 清理 initPage 中的 watch 监听器
  if (initPageWatcher) {
    initPageWatcher()
    initPageWatcher = null
  }

  // 停止会话循环定时器
  stopSessionCycleTimer()

  // 停止人脸检测
  ensureDetectionStopped().catch(() => { })

  // 清理Live2D资源
  live2DStore.destroy()

  // 停止版本更新检测定时器
  updateStore.stopCheckTimer()
})

// 防止重复跳转的标志
let isNavigating = false

// 页面初始化：获取配置并初始化
const initPage = async () => {
  console.log('🎯 [Live2D] initPage() 函数被调用')
  
  // 防止重复调用
  if (isNavigating) {
    console.log('⚠️ [Live2D] 正在导航中，跳过重复调用')
    return
  }
  
  try {
    isActivationLoading.value = true
    
    // 检查设备是否已激活
    if (!deviceStore.deviceConfig?.serverId) {
      console.log('🔀 [Live2D] 没有设备数据，跳转到设备上报界面')
      isNavigating = true
      router.push('/device-activation')
      return
    }

    // 再次获取设备信息（获取最新的数字员工ID和终端配置）
    console.log('🔧 [Live2D] 开始获取设备配置...')
    console.log('📡 [Live2D] 准备请求接口，serverId:', deviceStore.deviceConfig.serverId)
    const deviceInfo = await DeviceApi.getDeviceInfo(deviceStore.deviceConfig.serverId)
    console.log('📥 [Live2D] 接口返回的设备信息:', deviceInfo)
    
    // 检查是否有设备数据
    if (!deviceInfo) {
      console.log('🔀 [Live2D] 获取设备信息失败，跳转到设备上报界面')
      isNavigating = true
      router.push('/device-activation')
      return
    }

    // 解析 deviceParams（可能是 JSON 字符串）
    let parsedDeviceParams: any = null
    if (deviceInfo.deviceParams) {
      if (typeof deviceInfo.deviceParams === 'string') {
        try {
          parsedDeviceParams = JSON.parse(deviceInfo.deviceParams)
          console.log('✅ [Live2D] 成功解析 deviceParams JSON 字符串')
        } catch (error) {
          console.error('❌ [Live2D] 解析 deviceParams JSON 失败:', error)
          console.log('🔀 [Live2D] deviceParams 解析失败，跳转到绑定等待界面')
          isNavigating = true
          router.push('/binding-wait')
          return
        }
      } else {
        parsedDeviceParams = deviceInfo.deviceParams
      }
    }

    // 检查是否有 deviceId 和 deviceParams
    if (!deviceInfo.deviceId || !parsedDeviceParams) {
      console.log('🔀 [Live2D] 缺少 deviceId 或 deviceParams，跳转到绑定等待界面')
      isNavigating = true
      router.push('/binding-wait')
      return
    }

    // 检查是否有数字员工ID（配置和数字员工id缺一不可）
    if (!deviceInfo.employeeId) {
      console.log('🔀 [Live2D] 缺少数字员工ID，设备已激活但未绑定，跳转到绑定等待界面')
      isNavigating = true
      router.push('/binding-wait')
      return
    }

    // 使用终端配置初始化
    console.log('✅ [Live2D] deviceId、deviceParams 和 employeeId 都存在，开始应用配置...')
    const deviceParams = parsedDeviceParams

    // 1. 设置终端配置到 AppConfigStore（包含 employeeId）
    console.log('📦 [Live2D] 准备设置配置到 AppConfigStore')
    console.log('📦 [Live2D] deviceInfo.employeeId:', deviceInfo.employeeId)
    console.log('📦 [Live2D] deviceParams:', JSON.stringify(deviceParams, null, 2))
    
    // 将 employeeId 添加到配置的最外层
    const configWithEmployeeId = {
      ...deviceParams,
      employeeId: deviceInfo.employeeId || undefined
    }
    
    appConfigStore.setConfig(configWithEmployeeId as any)
    console.log('✅ [Live2D] 配置已设置到 AppConfigStore')
    console.log('📦 [Live2D] 设置后的 employeeId:', appConfigStore.employeeId)
    console.log('📦 [Live2D] 设置后的 faceRecognition:', appConfigStore.faceRecognition)
    
    // 1.2. 检查配置中是否有静默登录凭据，如果有则执行静默登录
    if (deviceParams.silentLoginUsername && deviceParams.silentLoginPassword) {
      try {
        console.log('🔐 [Live2D] 检测到配置中的静默登录凭据，开始静默登录...')
        const userInfo = await UserApi.silentLogin({
          userName: deviceParams.silentLoginUsername,
          password: deviceParams.silentLoginPassword
        })

        // 将用户信息存储到store
        userStore.setSilentLoginUser({
          userId: userInfo.userId,
          nickName: userInfo.nickName || '用户',
          userType: userInfo.userType || '员工',
          receptionLocation: '大屏',
          passStatus: '1'
        })

        // 将静默登录凭据存储到configStore中
        configStore.setCredentials(
          deviceParams.silentLoginUsername,
          deviceParams.silentLoginPassword
        )

        console.log('✅ [Live2D] 静默登录成功:', userInfo)
        console.log('✅ [Live2D] 静默登录凭据已保存到配置中')
      } catch (error) {
        console.error('❌ [Live2D] 静默登录失败:', error)
        // 静默登录失败不影响初始化流程，只记录错误
        console.warn('⚠️ [Live2D] 静默登录失败，但将继续初始化流程')
      }
    } else {
      console.log('ℹ️ [Live2D] 配置中未包含静默登录凭据，跳过静默登录')
    }
    
    // 1.5. 初始化人脸检测（配置加载完成后）
    if (appConfigStore.isCameraEnabled) {
      try {
        initDetection()
      } catch (error) {
        console.error('❌ [Live2D] 初始化人脸检测失败:', error)
        // 如果摄像头未启用或配置缺失，继续执行其他初始化
      }
    }

    // 2. 更新员工信息（如果存在）
    if (deviceInfo.employeeId) {
      console.log('📝 [Live2D] 更新员工信息:', { employeeId: deviceInfo.employeeId, userId: deviceInfo.userId })
      deviceStore.setState.employeeInfo({
        employeeId: deviceInfo.employeeId,
        userId: deviceInfo.userId || '',
      })
    } else {
      console.log('⚠️ [Live2D] 设备信息中没有 employeeId')
    }
    
    // 设置绑定状态为已绑定（因为有 deviceId 和 deviceParams）
    console.log('📝 [Live2D] 设置绑定状态为 BOUND')
    deviceStore.setState.bindingStatus(DeviceBindingStatus.BOUND)

    console.log('✅ [Live2D] 配置应用成功，开始初始化功能...')

    // 4. 启动员工状态监控（如果已绑定且有 employeeId）
    console.log('📋 [Live2D] 检查启动员工状态监控的条件:')
    console.log('   - isBound:', deviceStore.isBound)
    console.log('   - employeeInfo:', deviceStore.employeeInfo)
    console.log('   - employeeId (from deviceStore):', deviceStore.employeeInfo?.employeeId)
    console.log('   - employeeId (from appConfigStore):', appConfigStore.employeeId)
    
    // 优先使用 deviceStore 中的 employeeId，如果没有则使用 appConfigStore 中的
    const employeeId = deviceStore.employeeInfo?.employeeId || appConfigStore.employeeId
    
    if (deviceStore.isBound && employeeId) {
      // 如果 deviceStore 中没有 employeeId，但 appConfigStore 中有，则更新 deviceStore
      if (!deviceStore.employeeInfo?.employeeId && appConfigStore.employeeId) {
        console.log('📝 [Live2D] 从 appConfigStore 同步 employeeId 到 deviceStore')
        deviceStore.setState.employeeInfo({
          employeeId: appConfigStore.employeeId,
          userId: deviceStore.employeeInfo?.userId || '',
        })
      }
      
      console.log('🚀 [Live2D] 启动员工状态监控, employeeId:', employeeId)
      deviceStore.startEmployeeStatusMonitoring()
    } else {
      console.warn('⚠️ [Live2D] 未启动员工状态监控，条件不满足')
      if (!deviceStore.isBound) {
        console.warn('   - 原因: 设备未绑定')
      }
      if (!employeeId) {
        console.warn('   - 原因: 没有 employeeId (deviceStore:', deviceStore.employeeInfo?.employeeId, ', appConfigStore:', appConfigStore.employeeId, ')')
      }
    }

    // 5. 初始化所有功能
    await initAllFeatures()

  } catch (error) {
    console.error('❌ [Live2D] 初始化失败:', error)
    
    // 检查是否是关键错误（设备未激活），只有关键错误才跳转
    // 其他错误（如摄像头错误）不应该导致跳转，避免死循环
    const errorMessage = error instanceof Error ? error.message : String(error)
    const isCriticalError = !deviceStore.deviceConfig?.serverId || 
                           errorMessage.includes('设备未激活') ||
                           errorMessage.includes('device not activated')
    
    if (isCriticalError && !isNavigating) {
      console.log('🔀 [Live2D] 检测到关键错误，跳转到相应页面')
      isNavigating = true
      if (!deviceStore.deviceConfig?.serverId) {
        router.push('/device-activation')
      } else {
        router.push('/binding-wait')
      }
    } else {
      // 非关键错误，记录但继续运行
      console.warn('⚠️ [Live2D] 非关键错误，继续运行:', errorMessage)
    }
  } finally {
    isActivationLoading.value = false
    exceptionEnabled.value = true
    // 延迟重置导航标志，避免立即重复跳转
    setTimeout(() => {
      isNavigating = false
    }, 1000)
  }
}

// 初始化所有功能（在配置已设置后调用）
const initAllFeatures = async () => {
  // 防止重复初始化
  if (isInitialized.value) {
    console.log('ℹ️ [initAllFeatures] 已初始化，跳过重复初始化')
    return
  }

  try {
    isInitialized.value = true // 标记为已初始化

    console.log('🚀 [initAllFeatures] 开始初始化所有功能...')

    // 只有在配置启用摄像头时才启动人脸检测
    if (appConfigStore.isCameraEnabled) {
      try {
        await ensureDetectionStarted()
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.error('❌ [initAllFeatures] 摄像头启动失败:', errorMessage)
        
        // 上报异常，不降级
        exceptionStore.report({
          severity: 'high',
          title: '摄像头启动失败',
          detail: `配置要求摄像头模式，但摄像头启动失败: ${errorMessage}`,
          source: '人脸检测',
          code: 'CAMERA_START_FAILED',
          dedupeKey: 'camera-start-failed'
        })
        
        // 抛出错误，不降级
        throw error
      }
    } else {
      exceptionStore.resolveByKey('camera-error')
      exceptionStore.resolveByKey('camera-start-failed')
      // 无摄像头模式：等待MQTT连接后启动会话管理
      await initNoCameraModeSession()
    }

    if (isDeviceReady.value) {
      showChat.value = true
    }

    console.log('✅ [initAllFeatures] 功能初始化完成')
  } catch (error) {
    console.error('❌ [initAllFeatures] 功能初始化失败:', error)
    // 即使初始化失败，也不重置 isInitialized，避免死循环
    // 只记录错误，让应用继续运行
  }
}

// 初始化无摄像头模式的会话管理
const initNoCameraModeSession = async () => {
  if (!isNoCameraMode.value) return

  // 等待MQTT连接
  let waitCount = 0
  const maxWaitCount = 50 // 最多等待5秒
  while (!chatStore.mqttIsConnected && waitCount < maxWaitCount) {
    await new Promise(resolve => setTimeout(resolve, 100))
    waitCount++
  }

  if (!chatStore.mqttIsConnected) {
    console.warn('⚠️ [initNoCameraModeSession] MQTT连接超时，会话管理可能无法正常工作')
    return
  }

  // 检查是否有静默登录用户
  if (userStore.currentVisitor && userStore.currentVisitor.userId) {
    // 清理旧的会话状态（避免持久化存储恢复旧值）
    if (chatStore.currentSessionId || chatStore.currentMessageId) {
      console.log('🧹 [initNoCameraModeSession] 清理旧的会话状态')
      chatStore.endSession()
    }
    
    // 立即开启第一次会话
    await startSessionForNoCameraMode()

    // 启动定时循环
    startSessionCycleTimer()
  } else {
    console.warn('⚠️ [initNoCameraModeSession] 无静默登录用户，跳过会话管理')
  }
}

// 因 serverIp 变更而触发的强制重置与重初始化
const resetAndReinitForServerChange = async () => {
  try {
    isActivationLoading.value = true
    // 1) 停止检测，清理会话
    await ensureDetectionStopped()
    // 2) 销毁 Live2D 相关资源
    try { live2DStore.destroy() } catch (e) { console.warn('⚠️ [ServerChange] destroy 警告:', e) }
    // 3) 重置本页关键状态
    loading.value = true
    modelLoaded.value = false
    showChat.value = false
    isInitialized.value = false // 重置初始化标志，允许重新初始化
    // 4) 强制重建 Canvas，确保资源重新加载
    canvasKey.value += 1
    // 5) 通知聊天面板按需重连
    if (chatPanelRef.value && (chatPanelRef.value as any).reinitializeMqtt) {
      try { (chatPanelRef.value as any).reinitializeMqtt() } catch (e) { console.warn('⚠️ [ServerChange] 重新初始化MQTT失败:', e) }
    }
    // 6) 重新初始化
    await initAllFeatures()
  } catch (e) {
    console.error('❌ [ServerChange] 重置/初始化失败:', e)
  } finally {
    isActivationLoading.value = false
  }
}

// 监听 serverIp 变化
watch(() => configStore.serverIp, async (newIp, oldIp) => {
  if (!oldIp || newIp === oldIp) return
  await resetAndReinitForServerChange()
})

// 监听 Live2D 模型配置变化（包括模型路径和配置）
let isConfigChanging = false // 防止重复触发
watch(
  () => [appConfigStore.live2dModelPath, appConfigStore.live2dModelConfig] as const,
  async (newValues, oldValues) => {
    // 防止重复触发
    if (isConfigChanging) {
      console.log('⏳ [Watch] 配置变化处理中，跳过重复触发')
      return
    }
    
    // 检查是否正在初始化或加载中，如果是，等待完成后再处理
    if (live2DStore.loading) {
      console.log('⏳ [Watch] Live2D正在初始化中，等待完成后再处理配置变化')
      // 等待初始化完成（最多等待5秒）
      let waitCount = 0
      const maxWaitCount = 50
      while (live2DStore.loading && waitCount < maxWaitCount) {
        await new Promise(resolve => setTimeout(resolve, 100))
        waitCount++
      }
      if (waitCount >= maxWaitCount) {
        console.warn('⚠️ [Watch] 等待初始化完成超时，强制处理配置变化')
      }
    }
    
    // 安全处理参数
    const [newPath, newConfig] = newValues || []
    const [oldPath, oldConfig] = oldValues || [undefined, undefined]
    
    // 如果模型路径或配置发生变化，重新初始化
    const pathChanged = newPath !== oldPath
    const configChanged = !oldConfig || JSON.stringify(newConfig) !== JSON.stringify(oldConfig)
    
    if (!pathChanged && !configChanged) return

    isConfigChanging = true
    
    console.log('🔄 [Watch] Live2D配置或模型路径变化，准备重新初始化', {
      newPath,
      oldPath,
      pathChanged,
      configChanged
    })

    // 重新初始化Live2D
    try {
      loading.value = true
      modelLoaded.value = false
      
      // 先取消正在进行的初始化（如果有）
      try {
        live2DStore.cancelInit()
        // 等待一小段时间让取消操作完成
        await new Promise(resolve => setTimeout(resolve, 50))
      } catch (error) {
        console.warn('⚠️ [Watch] 取消初始化时出现警告:', error)
      }
      
      // 先隐藏组件，触发旧组件卸载
      showLive2DCanvas.value = false
      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))
      await nextTick()
      
      // 先销毁旧实例（同步操作，确保立即完成）
      try {
        live2DStore.destroy()
        // 等待销毁完成（PIXI 应用的销毁可能需要一些时间）
        await new Promise(resolve => setTimeout(resolve, 150))
      } catch (error) {
        console.warn('⚠️ [Watch] 销毁旧实例时出现警告:', error)
      }
      
      // 等待旧组件完全卸载（多次 nextTick 确保组件卸载完成）
      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 200))
      await nextTick()
      
      // 验证旧组件已完全卸载（通过检查DOM中是否还有canvas元素）
      let unloadRetryCount = 0
      const maxUnloadRetries = 10
      while (unloadRetryCount < maxUnloadRetries) {
        const canvasElements = document.querySelectorAll('#live2d-canvas')
        if (canvasElements.length === 0) {
          break
        }
        console.log(`⏳ [Watch] 等待旧组件卸载... (${unloadRetryCount + 1}/${maxUnloadRetries}), 剩余canvas数量: ${canvasElements.length}`)
        await new Promise(resolve => setTimeout(resolve, 100))
        await nextTick()
        unloadRetryCount++
      }
      
      if (unloadRetryCount >= maxUnloadRetries) {
        console.warn('⚠️ [Watch] 等待旧组件卸载超时，但继续执行')
      }
      
      // 等待配置完全更新（确保 appConfigStore 中的配置已经更新）
      await new Promise(resolve => setTimeout(resolve, 50))
      await nextTick()
      
      // 现在更新 canvasKey，然后显示组件
      const oldCanvasKey = canvasKey.value
      canvasKey.value += 1
      const newCanvasKey = canvasKey.value
      
      console.log('🔄 [Watch] Canvas Key已更新，准备显示新组件', {
        oldCanvasKey,
        newCanvasKey
      })
      
      // 显示组件，触发新组件挂载
      showLive2DCanvas.value = true
      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))
      await nextTick()
      
      // 验证新组件已挂载（通过检查DOM中是否有canvas元素）
      let retryCount = 0
      const maxRetries = 10
      while (retryCount < maxRetries) {
        const canvasElement = document.querySelector('#live2d-canvas')
        if (canvasElement) {
          break
        }
        console.log(`⏳ [Watch] 等待新组件挂载... (${retryCount + 1}/${maxRetries})`)
        await new Promise(resolve => setTimeout(resolve, 100))
        await nextTick()
        retryCount++
      }
      
      if (retryCount >= maxRetries) {
        console.warn('⚠️ [Watch] 等待新组件挂载超时')
      }
      
      console.log('✅ [Watch] Live2D配置变化处理完成，Canvas已重新渲染，新组件应该已经挂载', {
        oldCanvasKey,
        newCanvasKey
      })
    } catch (error) {
      console.error('❌ [Watch] Live2D配置变化处理失败:', error)
      loading.value = false
      // 如果出现错误，确保清理状态
      try {
        live2DStore.destroy()
      } catch (destroyError) {
        console.warn('⚠️ [Watch] 清理失败:', destroyError)
      }
    } finally {
      // 延迟重置标志，确保后续变化能正常处理
      setTimeout(() => {
        isConfigChanging = false
      }, 500)
    }
  },
  { deep: true }
)

// 事件处理
const handleModelLoaded = (data: { expressions: any[], motions: any }) => {
  modelLoaded.value = true  // 设置模型加载完成状态
}

const handleLoadingChange = (isLoading: boolean) => {
  loading.value = isLoading

  // 如果加载完成，确保模型加载状态为true
  if (!isLoading && !modelLoaded.value) {
    modelLoaded.value = true
  }
}

// 聊天相关事件处理
const handleChatSent = (data: any) => {
  if (modelLoaded.value) {
    live2DStore.triggerEventMotion('chat_sent')
  }
}

const handleChatAnswering = (answer: any) => {
  // 可以在这里触发数字人的思考动作
  // 不再触发动作，避免TTS播放时频繁触发
}

const handleChatAnswered = (finalAnswer: any) => {
  // 可以在这里触发数字人的完成动作
  // 不再触发动作，避免TTS播放时频繁触发
}

const handleChatStatusChange = (status: any) => {
  // 可以在这里显示连接状态
}

const handleChatError = (error: any) => {
  console.error('聊天发生错误:', error)
}

const initializeDetectionCallbacks = () => {
  if (detectionCallbacksInitialized.value) return

  onActive(async (faces) => {
    isDetectionActive.value = true
    
    // 如果有正在等待执行的关门逻辑，取消它（说明用户在延迟期间又回来了）
    if (closeDoorTimer) {
      console.log('🚪 [Workflow] 用户重新进入，取消关门工作流')
      clearTimeout(closeDoorTimer)
      closeDoorTimer = null
    }

    // 并发锁与冷却
    const now = Date.now()
    const inCooldown = now - lastRecognitionAt.value < RECOGNITION_COOLDOWN_MS
    if (userStore.currentVisitor || userStore.isRecognizing || inCooldown) {
      if (DEBUG_LOG) console.log('🔍 [onActive] 跳过识别:', { hasVisitor: !!userStore.currentVisitor, isRecognizing: userStore.isRecognizing, inCooldown })
      return
    }
    await recognizeVisitor(faces)
  })

  onInactive(async () => {
    isDetectionActive.value = false

    // 立即保存当前用户的userid、session_id和message_id，避免在后续操作中被清空
    const currentUserId = userStore.currentVisitor?.userId
    const currentSessionId = userStore.currentSessionId
    let currentMessageId = chatStore.currentMessageId

    try {
      if (!chatStore.mqttIsConnected) await chatStore.connectMqtt()

      // 确保 chatStore 的 sessionId 与 userStore 同步，避免在创建 messageId 时因为 sessionId 不存在而失败
      if (currentSessionId && !chatStore.currentSessionId) {
        chatStore.startSession(currentSessionId)
      }

      // 若当前轮次已结束，尝试创建一个新的 messageId 以便和「用户进入」保持一致
      if (!currentMessageId && currentSessionId) {
        const started = chatStore.startRound()
        if (started) {
          currentMessageId = chatStore.currentMessageId
        } else {
          // 如果 startRound 失败（可能因为 sessionId 被清除），手动生成一个 messageId
          // 使用类似 chatStore.generateId 的格式，但这里我们直接生成
          currentMessageId = `message_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        }
      }

      // 只有当userid和session_id存在时才发送结束会话消息
      // 注意：即使 currentMessageId 可能为 null，也要发送，因为 attachIdsToPayload 已经修复，会优先使用 payload 中的值
      if (currentUserId && currentSessionId) {
        // await chatStore.sendMqttMessage('', { message_id: currentMessageId, type: "1", user_id: currentUserId, session_id: currentSessionId, sense: "用户离开" })
        console.log('🚪 [MQTT] 已注释掉用户离开消息，改为仅使用工作流')
      }

      // 调用关门工作流（延迟8秒，确保人员已进入）
      console.log('🚪 [Workflow] 准备执行关门工作流，延迟8秒...')
      if (closeDoorTimer) {
        clearTimeout(closeDoorTimer)
      }
      closeDoorTimer = setTimeout(() => {
        executeWorkflow('close')
        closeDoorTimer = null
      }, 8000)

      chatStore.endSession()
      userStore.endSession()
    } catch (e) {
      console.warn('⚠️ [MQTT] 结束会话消息发送失败:', e)
    }

    if (chatPanelRef.value) {
      try { (chatPanelRef.value as any).clear?.() } catch (_) { }
    }
  })

  onInit(() => {
    if (DEBUG_LOG) console.log('🔍 [onInit] 人脸检测初始化完成')
  })

  detectionCallbacksInitialized.value = true
}

// 确保检测启动（带并发/重复防护和权限重试机制）
const ensureDetectionStarted = async () => {
  initializeDetectionCallbacks()
  
  const MAX_RETRIES = 3 // 最大重试次数（总共尝试3次）
  const RETRY_DELAY = 2000 // 每次重试前等待2秒，给用户时间响应权限请求
  let attemptCount = 0
  
  while (attemptCount < MAX_RETRIES) {
    attemptCount++
    try {
      await ensureDetectionStartedCore()
      console.log(`✅ [Detection] 启动成功 (尝试 ${attemptCount}/${MAX_RETRIES})`)
      return // 成功则直接返回
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const isPermissionError = errorMessage.toLowerCase().includes('permission') || 
                                errorMessage.toLowerCase().includes('denied') ||
                                errorMessage.toLowerCase().includes('user denied')
      
      if (isPermissionError && attemptCount < MAX_RETRIES) {
        // 权限错误且还有重试机会，等待后重试
        console.log(`⏳ [Detection] 权限请求中，等待用户响应... (${attemptCount}/${MAX_RETRIES})`)
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY))
        continue // 继续重试
      } else {
        // 非权限错误，或已达到最大重试次数，抛出错误
        console.error(`❌ [Detection] 启动失败 (尝试 ${attemptCount}/${MAX_RETRIES}):`, error)
        throw error
      }
    }
  }
}

// 确保检测停止
const ensureDetectionStopped = async () => {
  if (!detectionRunning.value) return
  try {
    await ensureDetectionStoppedCore()
  } catch (e) {
    console.warn('⚠️ [Detection] 停止出现警告:', e)
  } finally {
    isDetectionActive.value = false
    userStore.endSession()
  }
}

// 从人脸列表中选择最优的人脸图片
const pickFaceImageFromFaces = (faces: any[]): string | null => {
  if (!faces || faces.length === 0) return null
  const sorted = [...faces].sort((a: any, b: any) => (b?.area || 0) - (a?.area || 0))
  const found = sorted.find((f: any) => !!f?.imageUrl)
  return found?.imageUrl || null
}

// 通过图片尝试识别一次
const attemptRecognizeByFaceImage = async (imageUrl: string) => {
  submittedFaceImage.value = imageUrl
  return await FaceApi.recognizeFace(imageUrl)
}

// 含重试的识别流程：首次使用 onActive 帧，失败则抓拍重试
const recognizeWithRetries = async (initialFaces: any[]) => {
  let attemptIndex = 0
  const startTime = Date.now()

  // 第一次：尝试使用 onActive 传入的人脸图
  const initialImageUrl = pickFaceImageFromFaces(initialFaces)
  if (initialImageUrl) {
    userStore.setRecognitionStatus('正在识别中...')
    const info = await attemptRecognizeByFaceImage(initialImageUrl)
    if (info && info.userId && info.userId.trim() !== '') return info
  }

  // 失败后：进行最多 MAX_RECOGNITION_RETRIES 次重新抓拍重试
  while (attemptIndex < MAX_RECOGNITION_RETRIES) {
    // 检查总超时时间
    const elapsedTime = Date.now() - startTime
    if (elapsedTime > RECOGNITION_TOTAL_TIMEOUT_MS) {
      console.warn(`⏰ [recognizeWithRetries] 总超时 (${RECOGNITION_TOTAL_TIMEOUT_MS}ms)，停止重试`)
      userStore.setRecognitionStatus('请稍后重试')
      return null
    }

    attemptIndex += 1
    userStore.setRecognitionStatus(`重新识别中，请正视摄像头区域 (${attemptIndex}/${MAX_RECOGNITION_RETRIES})...`)
    try {
      const { faces } = await detectCurrentFrame()
      const imageUrl = pickFaceImageFromFaces(faces)
      if (!imageUrl) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS))
        continue
      }
      const info = await attemptRecognizeByFaceImage(imageUrl)
      if (info && info.userId && info.userId.trim() !== '') return info
    } catch (e) {
      console.warn('⚠️ [recognizeWithRetries] 重试异常:', e)
    }
    await new Promise(r => setTimeout(r, RETRY_DELAY_MS))
  }

  return null
}

// 识别访客（失败自动重试抓拍）
const recognizeVisitor = async (faces: any[]) => {
  if (!faces || faces.length === 0) return
  if (userStore.isRecognizing) return

  // 检查是否有阻塞性异常，如果有则禁止人脸识别
  if (exceptionStore.hasBlocking) {
    console.warn('⚠️ [recognizeVisitor] 存在阻塞性异常，禁止人脸识别')
    userStore.setRecognitionStatus('系统异常，人脸识别不可用')
    return
  }

  userStore.setRecognizing(true)
  // 冷却时间戳只记录首次尝试的时间，避免重试期间阻塞外层事件
  lastRecognitionAt.value = Date.now()

  try {
    const visitorInfo = await recognizeWithRetries(faces)
    if (visitorInfo && visitorInfo.userId && visitorInfo.userId.trim() !== '') {
      userStore.setVisitor(visitorInfo)
      userStore.setRecognitionStatus(`欢迎，${visitorInfo.nickName || '用户'}！`)
      // 会话开始：直接发送MQTT通知
      try {
        if (!chatStore.mqttIsConnected) await chatStore.connectMqtt()
        const user_id = visitorInfo.userId
        const session_id = userStore.currentSessionId

        // 确保 chatStore 的 sessionId 同步
        if (session_id) {
          chatStore.startSession(session_id)
        }

        // 创建 messageId（开启轮次）
        const roundStarted = chatStore.startRound()
        if (!roundStarted) {
          console.warn('⚠️ [recognizeVisitor] 创建轮次失败，可能sessionId未设置')
        }

        // 发送MQTT开启会话消息（messageId会自动通过attachIdsToPayload附加）
        // await chatStore.sendMqttMessage('', { type: "0", user_id, session_id, sense: "用户进入" })
        console.log('🚪 [MQTT] 已注释掉用户进入消息，改为仅使用工作流')
        
        // 调用开门工作流
        executeWorkflow('open', { person_id: user_id })
        
        // 语音播报打招呼（仅在摄像头模式下）
        if (appConfigStore.isCameraEnabled) {
          try {
            // 判断是否为访客
            const isGuest = userStore.isGuest
            const userName = visitorInfo.nickName || '用户'
            
            // 生成打招呼内容
            const greetingText = generateGreeting(isGuest, userName)
            
            // 确保TTS已初始化
            if (!speech.isInitialized.value) {
              await speech.initialize()
            }
            
            // 语音播报打招呼
            await speech.speak(greetingText)
            console.log('✅ [recognizeVisitor] 打招呼已播报:', greetingText)
          } catch (greetingError) {
            console.warn('⚠️ [recognizeVisitor] 播报打招呼异常:', greetingError)
          }
        }
      } catch (e) {
        console.warn('⚠️ [recognizeVisitor] MQTT消息发送异常:', e)
      }
      if (!showChat.value) showChat.value = true
      if (modelLoaded.value) live2DStore.playRandomMotion()
    } else {
      userStore.setRecognitionStatus('识别失败，请稍后重试')
    }
  } catch (error) {
    console.error('❌ [recognizeVisitor] 识别异常:', error)
    userStore.setRecognitionStatus('识别失败，请稍后重试')
  } finally {
    userStore.setRecognizing(false)
  }
}

// 控制相关方法
const toggleChat = () => {
  showChat.value = !showChat.value
}

const toggleFaceRecognition = async () => {
  if (isDetectionActive.value || detectionRunning.value) {
    await ensureDetectionStopped()
    userStore.setRecognitionStatus('人脸识别已关闭')
  } else {
    try {
      await ensureDetectionStarted()
      userStore.setRecognitionStatus('等待识别...')
    } catch (error) {
      console.error('启动人脸识别失败:', error)
      userStore.setRecognitionStatus('启动失败')
    }
  }
}

// 摄像头调试开关（右下角显示 base64 预览）
const toggleCameraDebug = () => {
  cameraDebugEnabled.value = !cameraDebugEnabled.value
}

// 无摄像头模式：开启会话
const startSessionForNoCameraMode = async () => {
  if (!isNoCameraMode.value) return
  if (!chatStore.mqttIsConnected) {
    console.warn('[NoCameraMode] MQTT is disconnected, skip startSession')
    return
  }

  const currentUser = userStore.currentVisitor
  if (!currentUser || !currentUser.userId || currentUser.userId.trim() === '') {
    console.warn('[NoCameraMode] Missing current user, skip startSession')
    return
  }

  const currentSessionId = userStore.currentSessionId
  if (!currentSessionId) {
    console.warn('[NoCameraMode] Missing sessionId, skip startSession')
    return
  }

  try {
    console.log('[NoCameraMode] start session', currentUser.userId, currentSessionId)

    if (chatStore.currentSessionId && chatStore.currentSessionId !== currentSessionId) {
      console.log('[NoCameraMode] sessionId changed, clearing stale session')
      chatStore.endSession()
    }

    if (!chatStore.currentSessionId || chatStore.currentSessionId !== currentSessionId) {
      chatStore.startSession(currentSessionId)
      console.log('[NoCameraMode] synced sessionId to chatStore', currentSessionId)
    }

    await chatStore.sendMqttMessage('', { type: "1", user_id: currentUser.userId, session_id: currentSessionId, reply: false, sense: "\u7528\u6237\u8fdb\u5165" })
    console.log('[NoCameraMode] sent start-session MQTT message')

    if (!showChat.value) showChat.value = true
    if (modelLoaded.value) live2DStore.playRandomMotion()
  } catch (error) {
    console.error('[NoCameraMode] startSession failed:', error)
  }
}

// No-camera mode: end session
const endSessionForNoCameraMode = async () => {
  if (!isNoCameraMode.value) return
  if (!chatStore.mqttIsConnected) {
    console.warn('[NoCameraMode] MQTT is disconnected, skip endSession')
    return
  }

  const currentUser = userStore.currentVisitor
  const currentSessionId = userStore.currentSessionId
  if (!currentUser || !currentUser.userId || currentUser.userId.trim() === '' || !currentSessionId) {
    console.warn('[NoCameraMode] Missing user or sessionId, skip endSession')
    return
  }

  try {
    console.log('[NoCameraMode] end session', currentUser.userId, currentSessionId)

    if (currentSessionId && !chatStore.currentSessionId) {
      chatStore.startSession(currentSessionId)
    }

    await chatStore.sendMqttMessage('', { type: "1", user_id: currentUser.userId, session_id: currentSessionId, reply: false, sense: "\u7528\u6237\u79bb\u5f00" })
    console.log('[NoCameraMode] sent end-session MQTT message')

    if (chatPanelRef.value) {
      try { (chatPanelRef.value as any).clear?.() } catch (_) { }
    }

    chatStore.endSession()
  } catch (error) {
    console.error('[NoCameraMode] endSession failed:', error)
    chatStore.endSession()
  }
}

// No-camera mode: session cycle (restart after 3 seconds)
const sessionCycleForNoCameraMode = async () => {
  if (!isNoCameraMode.value) return

  console.log('🔄 [NoCameraMode] 执行会话循环...')

  // 先结束当前会话
  await endSessionForNoCameraMode()

  // 确保 chatStore 的会话状态已完全清理
  if (chatStore.currentSessionId || chatStore.currentMessageId) {
    console.log('🧹 [NoCameraMode] 清理残留的会话状态')
    chatStore.endSession()
  }

  // 等待3秒后开启新会话，并创建新的session_id
  setTimeout(async () => {
    // 重新设置静默登录用户，这会创建新的session_id
    const currentUser = userStore.currentVisitor
    if (currentUser) {
      userStore.setSilentLoginUser({
        userId: currentUser.userId,
        nickName: currentUser.nickName,
        userType: currentUser.userType,
        receptionLocation: currentUser.receptionLocation,
        passStatus: currentUser.passStatus
      })
      await startSessionForNoCameraMode()
    }
  }, 3000) // 等待3秒
}

// 启动无摄像头模式的定时会话循环
const startSessionCycleTimer = () => {
  if (!isNoCameraMode.value) return
  if (sessionCycleTimer) return // 已经启动了

  console.log(`⏰ [NoCameraMode] 启动会话循环定时器，无活动超时: 2小时`)

  // 设置2小时的超时定时器
  sessionCycleTimer = setTimeout(async () => {
    console.log('⏰ [NoCameraMode] 超过2小时无活动，执行会话重启')
    await sessionCycleForNoCameraMode()
    lastActivityTime.value = Date.now() // 重置活动时间
    // 重启定时器
    startSessionCycleTimer()
  }, 2 * 60 * 60 * 1000) // 2小时超时
}

// 停止无摄像头模式的定时会话循环
const stopSessionCycleTimer = () => {
  if (sessionCycleTimer) {
    console.log('⏹️ [NoCameraMode] 停止会话循环定时器')
    clearTimeout(sessionCycleTimer)
    sessionCycleTimer = null
  }
}

// 屏幕点击监听处理（带防抖）
const handleScreenClick = () => {
  if (!isNoCameraMode.value) return

  // 防抖处理
  if (clickDebounceTimer) {
    clearTimeout(clickDebounceTimer)
  }

  clickDebounceTimer = setTimeout(() => {
    console.log('🔄 [NoCameraMode] 检测到用户活动，重置会话定时器')
    lastActivityTime.value = Date.now()
    resetSessionTimer()
  }, CLICK_DEBOUNCE_MS)
}

// 重置会话定时器
const resetSessionTimer = () => {
  if (sessionCycleTimer) {
    clearTimeout(sessionCycleTimer)
    sessionCycleTimer = null
  }

  // 重新启动定时器
  startSessionCycleTimer()
}



// 处理数字员工绑定成功
const handleDigitalWorkerBound = async () => {
  console.log('🔗 [handleDigitalWorkerBound] 处理绑定：执行完整初始化流程...')
  try {
    // 如果设备已激活且已绑定，执行完整的初始化流程
    if (deviceStore.isActivated && deviceStore.isBound) {
      await initAllFeatures()
    } else {
      // 如果条件不满足，只启动检测（兼容处理）
      console.warn('⚠️ [handleDigitalWorkerBound] 设备状态不满足，仅启动检测')
      await ensureDetectionStarted()
      showChat.value = true
    }
  } catch (error) {
    console.error('❌ [handleDigitalWorkerBound] 失败:', error)
  }
}

// 处理数字员工解绑成功
const handleDigitalWorkerUnbound = async () => {
  console.log('🔗 [handleDigitalWorkerUnbound] 处理解绑：停止检测与聊天...')
  try {
    await ensureDetectionStopped()
    showChat.value = false
  } catch (error) {
    console.error('❌ [handleDigitalWorkerUnbound] 失败:', error)
  }
}

// 处理窗口大小变化
const handleResize = () => {
  live2DStore.handleResize()
}

// 强制刷新弹窗处理
const handleForceReloadConfirm = () => {
  // 确认重启，执行刷新
  window.location.reload()
}

const handleForceReloadCancel = () => {
  // 取消重启
  exceptionStore.hideForceReloadDialog()
}

// 更新弹窗关闭处理
const handleUpdateDialogClose = () => {
  updateStore.hideUpdateDialog()
}

// 版本检测逻辑
const performUpdateCheck = async () => {
  // 只在原生平台执行检测
  if (!Capacitor.isNativePlatform()) {
    console.log('ℹ️ [Update] 非原生平台，跳过更新检测')
    return
  }

  try {
    updateStore.setChecking(true)
    
    // 初始化 LiveUpdate
    await LiveUpdate.ready()
    
    // 获取当前版本
    const currentVersion = await getCurrentVersion()
    updateStore.setCurrentVersion(currentVersion)
    
    // 检查更新（仅检测，不执行更新）
    const updateInfo = await checkForUpdateOnly()
    
    if (updateInfo) {
      // 发现新版本
      console.log('🆕 [Update] 发现新版本:', updateInfo.version)
      updateStore.setUpdateInfo(updateInfo)
      
      // 如果应该自动弹出，则显示弹窗
      if (updateStore.shouldAutoShow) {
        console.log('🔔 [Update] 自动弹出更新弹窗')
        updateStore.showUpdateDialog()
      }
    } else {
      // 没有新版本，清除更新状态
      console.log('ℹ️ [Update] 当前已是最新版本')
      updateStore.setUpdateInfo(null)
    }
  } catch (error) {
    console.error('❌ [Update] 版本检测失败:', error)
  } finally {
    updateStore.setChecking(false)
  }
}

// 监听 shouldAutoShow 变化，自动弹出弹窗
watch(shouldAutoShow, (newVal) => {
  if (newVal && updateStore.hasUpdate) {
    console.log('🔔 [Update] 检测到应该自动弹出，显示更新弹窗')
    updateStore.showUpdateDialog()
  }
})
</script>

<style scoped>
.live2d-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: transparent;
}

.digital-human-section {
  background: var(--bg-layout);
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1000;
}

/* 激活后加载遮罩样式 */
.activation-loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(5px);
}

.activation-loading-content {
  text-align: center;
  color: white;
}

.loading-icon{
  margin-bottom: 1.5rem;
  display: flex;
  justify-content: center;
  align-items: center;
}

.loading-image {
  width: 4rem;
  height: 4rem;
  object-fit: contain;
}


.activation-loading-content .loading-text {
  font-size: 18px;
  font-weight: 500;
  margin: 0;
  color: white;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}

.camera-debug-preview {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 2000;
  border: 1px solid var(--border-color);
  background: var(--bg-elevated);
  box-shadow: var(--shadow-medium);
  border-radius: 10px;
  padding: 6px;
}

.camera-debug-preview img {
  display: block;
  max-width: 220px;
  max-height: 160px;
  border-radius: 6px;
}

.action-menu-container {
  position: fixed;
  top: 0.6rem;
  right: 0.6rem;
  z-index: 2000;
}

.action-menu-top {
  display: flex;
  justify-content: end;
  gap: 8px;
  margin-bottom: 8px;
}

.custom-label-display {
  position: fixed;
  left: 16px;
  top: 52px;
  z-index: 2000;
  max-width: 42vw;
  padding: 8px 18px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.2);
  color: rgba(255, 255, 255, 0.85);
  font-size: 18px;
  line-height: 1.3;
  word-break: break-word;
  pointer-events: none;
  user-select: none;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.version-display {
  position: fixed;
  left: 12px;
  bottom: 12px;
  z-index: 1000;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.3);
  opacity: 0.5;
  user-select: none;
  pointer-events: none;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}
</style>
