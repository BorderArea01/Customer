
import { Capacitor } from '@capacitor/core'
import { CameraPreview } from '@capacitor-community/camera-preview'
import type { CameraPreviewOptions } from '@capacitor-community/camera-preview'
import { DetectionService, type FaceDetectionResult, type PersonDetectionResult } from './service'
import { ref, type Ref } from 'vue'
import { useExceptionStore } from '@/stores/exception'
import { useAppConfigStore } from '@/stores/appConfig'

const CAMERA_ERROR_KEY = 'camera-error'

export type CameraStatus = 'idle' | 'initializing' | 'ready' | 'error'

export interface CameraErrorInfo {
  code: 'CAMERA_NOT_FOUND' | 'CAMERA_PERMISSION_DENIED' | 'CAMERA_INIT_FAILED'
  message: string
  originalError?: unknown
}

interface useDetectionFunc {
  start: () => Promise<void>
  stop: () => Promise<void>
  onInit: (callback: () => void) => void
  onActive: (callback: Callback) => void
  onInactive: (callback: Callback) => void
  startCameraPreview: () => Promise<boolean>
  stopCameraPreview: () => Promise<void>
  capture: () => Promise<string>
  detectFrame: () => Promise<void>
  detectCurrentFrame: () => Promise<{ faces: FaceDetectionResult[], persons: PersonDetectionResult[] }>
  renderVideo: () => Function
  ensureStarted: () => Promise<void>
  ensureStopped: () => Promise<void>
  cameraStatus: Ref<CameraStatus>
  cameraError: Ref<CameraErrorInfo | null>
  isRunning: Ref<boolean>
}

interface showVideoOptions {
  enable: boolean
  width: number
  height: number
  x: number
  y: number
}

type Callback = (faces: FaceDetectionResult[], persons: PersonDetectionResult[]) => void

// 定时执行，接收函数，时间间隔
const useInterval = (func: () => Promise<void>, interval: number): Function => {
  const timer = setInterval(func, interval)
  return () => clearInterval(timer)
}

const useDetection = (options: {
  showVideo?: showVideoOptions,
  onCameraReady?: () => void,
  onCameraError?: (info: CameraErrorInfo) => void,
  onCameraStatusChange?: (status: CameraStatus, payload: { error: CameraErrorInfo | null }) => void,
}): useDetectionFunc => {
  const appConfigStore = useAppConfigStore()
  const faceRecognitionConfig = appConfigStore.faceRecognition
  
  if (!faceRecognitionConfig || !faceRecognitionConfig.detection) {
    throw new Error('人脸识别检测配置未找到，请在配置文件中设置 faceRecognition.detection')
  }
  
  const detectionConfig = faceRecognitionConfig.detection
  const {
    interval,
    leaveDuration,
    faceMinArea,
    faceMaxArea,
    faceMinConfidence,
    faceMaxAngle,
    faceRequireFrontal,
    personMinCoverage,
    personMaxPersons,
  } = detectionConfig
  
  if (interval === undefined || leaveDuration === undefined || faceMinArea === undefined || 
      faceMaxArea === undefined || faceMinConfidence === undefined || faceMaxAngle === undefined ||
      faceRequireFrontal === undefined || personMinCoverage === undefined || personMaxPersons === undefined) {
    throw new Error('人脸识别检测配置不完整，请检查配置文件中的 faceRecognition.detection 所有参数')
  }
  
  const {
    showVideo,
    onCameraReady,
    onCameraError,
    onCameraStatusChange,
  } = options


  const service = new DetectionService()
  const exceptionStore = useExceptionStore()
  let clearTimer: Function | null = null
  let _canvasElement: HTMLCanvasElement | null = null
  let _renderVideoCleanup: Function | null = null

  const defaultWidth = 1280
  const defaultHeight = 720

  const isWeb = Capacitor.getPlatform() === 'web';

  // 是否激活
  const isActive = ref(false)
  let _lastActiveTime = 0
  // Only one capture/detection result may update presence at a time. Camera
  // captures and ML Kit callbacks can complete out of order on slower Android
  // devices; without this guard, an old positive frame can overwrite a newer
  // empty frame and keep the terminal in the "person present" state.
  let detectionInFlight = false
  let detectionEpoch = 0

  // 激活回调
  let onActiveCallback: Callback = () => { }
  // 离开回调
  let onInactiveCallback: Callback = () => { }

  // 初始化回调
  let initCallback = () => { }

  const cameraStatus = ref<CameraStatus>('idle')
  const cameraError = ref<CameraErrorInfo | null>(null)
  const isRunning = ref(false)
  let startPromise: Promise<void> | null = null

  const notifyStatus = () => {
    onCameraStatusChange?.(cameraStatus.value, { error: cameraError.value })
  }

  const setCameraReady = () => {
    cameraError.value = null
    cameraStatus.value = 'ready'
    try {
      exceptionStore.resolveByKey(CAMERA_ERROR_KEY)
    } catch (_) {}
    onCameraReady?.()
    notifyStatus()
  }

  const parseCameraError = (error: unknown): CameraErrorInfo => {
    const rawMessage = error instanceof Error ? error.message : (typeof error === 'string' ? error : '')
    const normalized = rawMessage.toLowerCase()
    if (normalized.includes('notfounderror') || normalized.includes('requested device not found')) {
      return {
        code: 'CAMERA_NOT_FOUND',
        message: '未检测到可用摄像头设备，请检查连接或启用摄像头权限后刷新页面',
        originalError: error
      }
    }
    if (normalized.includes('notallowederror') || normalized.includes('permission')) {
      return {
        code: 'CAMERA_PERMISSION_DENIED',
        message: '摄像头权限被拒绝，请授权后刷新页面',
        originalError: error
      }
    }
    return {
      code: 'CAMERA_INIT_FAILED',
      message: rawMessage || '摄像头初始化失败，请检查设备后重试',
      originalError: error
    }
  }

  const handleCameraError = (error: unknown) => {
    const parsed = parseCameraError(error)
    cameraError.value = parsed
    cameraStatus.value = 'error'
    
    // 在 hook 内部直接上报异常
    try {
      const severity = parsed.code === 'CAMERA_INIT_FAILED' ? 'high' : 'critical'
      const title = parsed.code === 'CAMERA_PERMISSION_DENIED' ? '摄像头权限被拒绝' : '摄像头异常'
      exceptionStore.report({
        severity,
        title,
        detail: parsed.message,
        source: 'Camera',
        code: parsed.code,
        dedupeKey: CAMERA_ERROR_KEY
      })
    } catch (_) {}
    
    // 仍然调用外部回调，允许外部做额外处理
    onCameraError?.(parsed)
    notifyStatus()
  }

  const markInitializing = () => {
    cameraStatus.value = 'initializing'
    cameraError.value = null
    notifyStatus()
  }

  // 开始检测
  const start = async () => {
    if (isRunning.value) return
    if (startPromise) {
      await startPromise
      return
    }
    markInitializing()
    startPromise = (async () => {
      try {
        detectionEpoch += 1
        detectionInFlight = false
        await service.loadModels()
        await startCameraPreview()
        await sleep(2000) // 等待摄像头预览稳定
        clearTimer = useInterval(detectFrame, interval)
        initCallback()
        isRunning.value = true
        setCameraReady()
      } catch (error) {
        isRunning.value = false
        handleCameraError(error)
        throw error
      } finally {
        startPromise = null
      }
    })()
    await startPromise
  }

  // 停止检测
  const stop = async () => {
    // Ignore any asynchronous result that was captured before detection was
    // stopped. It must not reactivate presence after the camera is closed.
    detectionEpoch += 1
    detectionInFlight = false
    if (startPromise) {
      try {
        await startPromise
      } catch (_) {
        // ignore start errors, already handled in start()
      }
    }
    // start() may have completed after the first invalidation above. Advance
    // once more so a result from that startup cannot survive this stop().
    detectionEpoch += 1
    detectionInFlight = false
    if (!isRunning.value) {
      if (cameraStatus.value !== 'error') {
        cameraStatus.value = 'idle'
        notifyStatus()
      }
      return
    }
    await stopCameraPreview()
    clearTimer?.()
    // 清理渲染视频资源
    _renderVideoCleanup?.()
    _renderVideoCleanup = null
    // 释放模型资源，防止内存泄露
    await service.dispose()
    isRunning.value = false
    if (cameraStatus.value !== 'error') {
      cameraStatus.value = 'idle'
      notifyStatus()
    }
  }

  const onInit = (callback: () => void) => {
    initCallback = callback
  }
  // 激活回调
  const onActive = (callback: Callback) => {
    onActiveCallback = callback
  }
  // 离开回调
  const onInactive = (callback: Callback) => {

    onInactiveCallback = callback
  }

  // 开始预览
  const startCameraPreview = async () => {
    const cameraPreviewOptions: CameraPreviewOptions = {
      height: defaultHeight,
      width: defaultWidth,
      toBack: true,
      enableOpacity: true,
    }

    if (isWeb) {
      // 创建一个 Id 为 lzwcaicameraPreview 的 div
      const cameraPreviewDiv = document.createElement('div')
      cameraPreviewDiv.id = 'lzwcaicameraPreview'
      cameraPreviewDiv.style.display = 'none'
      document.body.appendChild(cameraPreviewDiv)
      cameraPreviewOptions.parent = 'lzwcaicameraPreview'
    }
    await CameraPreview.start(cameraPreviewOptions)
    if (isWeb) return true
    try {
      const { value: isCameraStarted } = await CameraPreview.isCameraStarted()
      if (!isCameraStarted) {
        throw new Error('Camera preview not started')
      }
      return isCameraStarted
    } catch (error) {
      console.error('Camera preview not started', error)
      return false
    }
  }

  // 停止预览
  const stopCameraPreview = async () => {
    await CameraPreview.stop()
  }

  // 拍照
  const capture = async () => {
    const result = await CameraPreview.captureSample({})
    return result.value
  }

  // 检测帧
  const detectFrame = async () => {
    if (detectionInFlight) {
      return
    }

    const frameEpoch = detectionEpoch
    detectionInFlight = true
    try {
      const base64PictureData = await capture()
      const [faces, persons] = await Promise.all([
        service.detectFaces(base64PictureData, faceMinArea, faceMaxArea, faceMinConfidence, faceMaxAngle, faceRequireFrontal),
        service.detectPersons(base64PictureData, personMaxPersons, personMinCoverage),
      ])

      // A result from an older camera lifecycle is stale (for example after a
      // preview restart), so it cannot affect the current presence state.
      if (frameEpoch !== detectionEpoch || !isRunning.value) {
        return
      }

      // The terminal's automatic interaction is explicitly a frontal-face
      // interaction. Selfie segmentation is still returned to callers as
      // supplemental information, but it must not independently keep a user
      // session alive: reflective/static backgrounds can otherwise be
      // segmented as foreground forever.
      const hasValidFace = faces.length > 0
      const now = Date.now()
      if (hasValidFace) {
        _lastActiveTime = now
        if (!isActive.value) {
          isActive.value = true
          onActiveCallback(faces, persons)
        }
        return
      }

      if (isActive.value && _lastActiveTime && now - _lastActiveTime > leaveDuration * 1000) {
        isActive.value = false
        _lastActiveTime = 0
        onInactiveCallback(faces, persons)
      }
    } catch (err) {
      console.error('检测失败:', err)
    } finally {
      if (frameEpoch === detectionEpoch) {
        detectionInFlight = false
      }
    }
  }

  // 检测当前帧
  const detectCurrentFrame = async () => {
    try {
      const base64PictureData = await capture()
      const faces = await service.detectFaces(base64PictureData, faceMinArea, faceMaxArea, faceMinConfidence, faceMaxAngle, faceRequireFrontal)
      const persons = await service.detectPersons(base64PictureData, personMaxPersons, personMinCoverage)
      return { faces, persons }
    } catch (err) {
      console.error('检测失败:', err)
      return { faces: [], persons: [] }
    }
  }

  // 渲染视频，返回一个函数，用于停止渲染
  const renderVideo = (): Function => {
    const { enable = false, width, height } = showVideo || {}
    if (enable) {
      _canvasElement = _mountCanvas()
      const ctx = _canvasElement.getContext('2d')
      if (!ctx) {
        throw new Error('Canvas context not found')
      }
      // 每秒 25 帧
      const interval = 50
      const timer = setInterval(async () => {
        const base64PictureData = await capture()
        const bitmap = await createImageBitmap(await fetch(`data:image/jpeg;base64,${base64PictureData}`).then(r => r.blob()))
        ctx.drawImage(bitmap, 0, 0, _canvasElement!.width, _canvasElement!.height)
        try { bitmap.close() } catch (_) { }
      }, interval)

      _renderVideoCleanup = () => {
        clearInterval(timer)
        // 清理 canvas 元素，防止 DOM 泄露
        if (_canvasElement && _canvasElement.parentNode) {
          _canvasElement.parentNode.removeChild(_canvasElement)
          _canvasElement = null
        }
      }

      return _renderVideoCleanup
    } else {
      return () => { }
    }
  }

  const _mountCanvas = () => {
    const { x = 0, y = 0, width = defaultWidth / 4, height = defaultHeight / 4 } = showVideo || {}
    const canvasElement = document.createElement('canvas')
    canvasElement.width = width
    canvasElement.height = height
    canvasElement.style.left = `${x}px`
    canvasElement.style.top = `${y}px`
    canvasElement.style.position = 'absolute'
    canvasElement.style.zIndex = '1000'
    document.body.appendChild(canvasElement)
    return canvasElement
  }

  const sleep = (ms: number) => {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  const ensureStarted = async () => {
    await start()
  }

  const ensureStopped = async () => {
    await stop()
  }


  return {
    start,
    stop,
    onInit,
    onActive,
    onInactive,
    renderVideo,
    startCameraPreview,
    stopCameraPreview,
    capture,
    detectFrame,
    detectCurrentFrame,
    ensureStarted,
    ensureStopped,
    cameraStatus,
    cameraError,
    isRunning,
  }
}

export default useDetection
