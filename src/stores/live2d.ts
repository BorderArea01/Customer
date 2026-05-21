import { defineStore } from 'pinia'
import { ref } from 'vue'
import { Live2DService } from '@/utils/live2dService'
import { useAppConfigStore } from './appConfig'
import { useUserStore } from './user'
import { useConfigStore } from './config'
import { UserApi } from '@/server'

export const useLive2DStore = defineStore('live2d', () => {
  // 状态
  const loading = ref(true)
  const modelLoaded = ref(false)
  const availableExpressions = ref<any[]>([])
  const availableMotions = ref<Record<string, any[]>>({})
  const modelPosition = ref({ x: -141, y: 88 })

  // Live2D服务实例
  let live2dService: Live2DService | null = null

  // 初始化取消控制器（用于取消正在进行的初始化）
  let initAbortController: AbortController | null = null

  // 嘴型联动控制
  let mouthRafId: number | null = null
  let mouthActive = false
  let mouthDebugLastLog = 0
  let mouthParamValue = 0

  // 随机动作定时器
  let randomMotionTimer: NodeJS.Timeout | null = null

  const getModelInstance = () => {
    return live2dService?.getModel()
  }

  // 执行静默登录（如果需要）
  const performSilentLoginIfNeeded = async () => {
    try {
      const appConfigStore = useAppConfigStore()
      const userStore = useUserStore()
      const configStore = useConfigStore()

      // 等待配置加载完成（最多等待3秒）
      let waitCount = 0
      const maxWaitCount = 30 // 3秒 (30 * 100ms)
      while (!appConfigStore.isLoaded && waitCount < maxWaitCount) {
        await new Promise(resolve => setTimeout(resolve, 100))
        waitCount++
      }


      // 检查是否启用静默登录且有保存的凭据
      if (appConfigStore.isSilentLoginEnabled && configStore.hasCredentials) {

        const credentials = configStore.getCredentials()
        if (!credentials) {
          console.warn('🔐 [Live2DStore] 无法获取凭据')
          return
        }

        // 执行静默登录
        const userInfo = await UserApi.silentLogin({
          userName: credentials.username,
          password: credentials.password
        })

        // 将用户信息存储到store
        userStore.setSilentLoginUser({
          userId: userInfo.userId,
          nickName: userInfo.nickName || '用户',
          userType: userInfo.userType || '员工',
          receptionLocation: '大屏',
          passStatus: '1'
        })
      }
    } catch (error) {
      console.error('❌ [Live2DStore] 静默登录失败:', error)
      console.error('❌ [Live2DStore] 错误详情:', {
        errorType: typeof error,
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined
      })
      // 静默登录失败不影响Live2D初始化
    }
  }

  const setMouthOpen = (value: number) => {
    const model = getModelInstance()
    mouthParamValue = Math.max(0, Math.min(1, value))
    if (model?.internalModel?.coreModel) {
      model.internalModel.coreModel.setParameterValueById('ParamMouthOpenY', mouthParamValue)
    }
  }

  // 初始化
  const init = async () => {
    // 取消之前的初始化（如果有）
    if (initAbortController) {
      console.log('🔄 [Live2DStore] 取消之前的初始化')
      initAbortController.abort()
      initAbortController = null
    }

    // 创建新的 AbortController
    initAbortController = new AbortController()
    const signal = initAbortController.signal

    try {
      loading.value = true
      modelLoaded.value = false

      // 如果已有实例，先销毁
      if (live2dService) {
        console.log('🔄 [Live2DStore] 检测到已有实例，先销毁旧实例')
        try {
          live2dService.destroy()
        } catch (error) {
          console.warn('⚠️ [Live2DStore] 销毁旧实例时出现警告:', error)
        }
        live2dService = null
      }

      // 检查是否已被取消
      if (signal.aborted) {
        console.log('⏹️ [Live2DStore] 初始化已被取消')
        return { expressions: [], motions: {} }
      }

      // 获取canvas元素
      const canvas = document.querySelector('#live2d-canvas') as HTMLCanvasElement

      if (!canvas) {
        throw new Error('找不到canvas元素，请检查DOM是否正确渲染')
      }

      // 从配置中获取模型路径和配置
      const appConfigStore = useAppConfigStore()

      // 检查配置是否已加载
      if (!appConfigStore.isLoaded) {
        throw new Error('配置尚未加载完成，无法初始化Live2D模型')
      }

      const modelPath = appConfigStore.live2dModelPath
      const modelConfig = appConfigStore.live2dModelConfig

      // 检查模型路径是否存在
      if (!modelPath) {
        throw new Error('模型路径不能为空，必须等待配置加载完成')
      }

      // 创建Live2D服务实例
      const serviceConfig: any = {
        modelPath: modelPath,
        autoInteract: false,
        position: modelConfig?.position || modelPosition.value,
        scale: modelConfig?.scale || 1,
        widthPercent: modelConfig?.widthPercent,
        heightPercent: modelConfig?.heightPercent
      }

      // 创建Live2D服务实例
      try {
        live2dService = new Live2DService(serviceConfig)

        // 验证实例是否创建成功
        if (!live2dService) {
          throw new Error('Live2D服务实例创建失败：构造函数返回null')
        }
      } catch (error) {
        console.error('❌ [Live2DStore] 创建Live2D服务实例失败:', error)
        live2dService = null
        throw new Error(`Live2D服务实例创建失败: ${error instanceof Error ? error.message : String(error)}`)
      }

      // 检查是否需要静默登录
      await performSilentLoginIfNeeded()

      // 再次验证实例（防止异步操作中实例被清空）
      if (!live2dService) {
        throw new Error('Live2D服务实例在初始化过程中丢失')
      }

      // 检查是否已被取消
      if (signal.aborted) {
        console.log('⏹️ [Live2DStore] 初始化在调用 init 前被取消')
        // 清理已创建的服务实例
        try {
          live2dService.destroy()
        } catch (error) {
          console.warn('⚠️ [Live2DStore] 取消时销毁实例失败:', error)
        }
        live2dService = null
        return { expressions: [], motions: {} }
      }

      // 在调用 init 前再次检查 canvas 是否还存在
      const canvasBeforeInit = document.querySelector('#live2d-canvas') as HTMLCanvasElement
      if (!canvasBeforeInit || canvasBeforeInit !== canvas) {
        console.log('⏹️ [Live2DStore] Canvas元素在调用 init 前被替换或移除')
        // 清理已创建的服务实例
        try {
          live2dService.destroy()
        } catch (error) {
          console.warn('⚠️ [Live2DStore] 清理实例失败:', error)
        }
        live2dService = null
        return { expressions: [], motions: {} }
      }

      const result = await live2dService.init(canvas)

      // 检查是否已被取消（可能在异步初始化过程中被取消）
      if (signal.aborted) {
        console.log('⏹️ [Live2DStore] 初始化在完成后被取消，销毁实例')
        try {
          live2dService.destroy()
        } catch (error) {
          console.warn('⚠️ [Live2DStore] 取消时销毁实例失败:', error)
        }
        live2dService = null
        return { expressions: [], motions: {} }
      }

      // 在初始化完成后再次检查 canvas 是否还存在
      const canvasAfterInit = document.querySelector('#live2d-canvas') as HTMLCanvasElement
      if (!canvasAfterInit || canvasAfterInit !== canvas) {
        console.warn('⚠️ [Live2DStore] Canvas元素在初始化完成后被替换或移除')
        // 清理已创建的服务实例
        try {
          live2dService.destroy()
        } catch (error) {
          console.warn('⚠️ [Live2DStore] 清理实例失败:', error)
        }
        live2dService = null
        return { expressions: [], motions: {} }
      }

      // 更新可用表情和动作
      availableExpressions.value = result.availableExpressions
      availableMotions.value = result.availableMotions

      loading.value = false
      modelLoaded.value = true


      // 启动随机动作定时器
      startRandomMotionTimer()

      return {
        expressions: availableExpressions.value,
        motions: availableMotions.value
      }

    } catch (error) {
      console.error('❌ [Live2DStore] Live2D初始化失败:', error)
      console.error('❌ [Live2DStore] 错误详情:', JSON.stringify({
        errorType: typeof error,
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined
      }, null, 2))

      loading.value = false
      modelLoaded.value = false

      // 如果是取消操作，不显示错误
      if (signal.aborted) {
        console.log('⏹️ [Live2DStore] 初始化被取消，不显示错误')
        return { expressions: [], motions: {} }
      }

      // 显示错误信息
      const canvas = document.getElementById('live2d-canvas') as HTMLCanvasElement
      if (canvas) {
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.fillStyle = '#ff0000'
          ctx.font = '16px Arial'
          ctx.fillText('Live2D加载失败', 10, 30)
        }
      }

      throw error
    } finally {
      // 清理 AbortController（如果当前初始化完成且未被取消）
      if (initAbortController && !signal.aborted) {
        initAbortController = null
      }
    }
  }

  // 播放表情
  const playExpression = (expressionId: string) => {
    if (live2dService) {
      live2dService.playExpression(expressionId)
    }
  }

  // 播放动作
  const playMotion = (motionGroup: string, motionId: string) => {
    if (live2dService) {
      live2dService.playMotion(motionGroup, motionId)
    }
  }

  // 播放随机动作
  const playRandomMotion = () => {
    if (!live2dService || !modelLoaded.value) return

    try {
      // 优先使用配置中的动作列表
      const appConfigStore = useAppConfigStore()
      const motionConfig = appConfigStore.live2dModelConfig?.live2dMotions

      if (motionConfig?.availableMotions && motionConfig.availableMotions.length > 0) {
        // 使用配置的动作列表
        const randomIndex = Math.floor(Math.random() * motionConfig.availableMotions.length)
        const randomMotion = motionConfig.availableMotions[randomIndex]


        // 根据动作类型选择播放方式
        if (randomMotion.paramId) {
          // 使用表情API播放动作（xiaolongren等模型）
          // 先重置所有相关参数，然后设置目标参数
          const allParams = ['Param36', 'Param37', 'Param38'] // xiaolongren的所有动作参数
          allParams.forEach(param => {
            if (param !== randomMotion.paramId && live2dService) {
              live2dService.setParameterValue(param, 0)
            }
          })
          // 设置目标参数为1
          if (live2dService) {
            live2dService.setParameterValue(randomMotion.paramId, 1)

            // 设置定时器，2秒后重置参数
            setTimeout(() => {
              if (live2dService && randomMotion.paramId) {
                live2dService.setParameterValue(randomMotion.paramId, 0)
              }
            }, 2000)
          }
        } else if (randomMotion.motionGroup && randomMotion.motionIndex !== undefined) {
          // 使用动作API播放动作（Haru等模型）
          live2dService.playMotion(randomMotion.motionGroup, randomMotion.motionIndex.toString())
        }
      } else {
        // 回退到原有的动作系统
        const motionCategories = Object.keys(availableMotions.value)
        if (motionCategories.length > 0) {
          const randomCategory = motionCategories[Math.floor(Math.random() * motionCategories.length)]
          const motions = availableMotions.value[randomCategory]

          if (motions && motions.length > 0) {
            const randomIndex = Math.floor(Math.random() * motions.length)
            // 使用索引作为motionId，因为Live2D API通常需要索引
            live2dService.playMotion(randomCategory, randomIndex.toString())
          }
        }
      }
    } catch (error) {
      console.error('播放随机动作失败:', error)
    }
  }

  // 测试动作（兼容性方法）
  const testMotion = () => {
    playRandomMotion()
  }

  // 启动随机动作定时器
  const startRandomMotionTimer = () => {
    if (randomMotionTimer) {
      clearInterval(randomMotionTimer)
    }

    const appConfigStore = useAppConfigStore()
    const motionConfig = appConfigStore.live2dModelConfig?.live2dMotions

    // 只有当interval大于0时才启动定时器
    if (motionConfig?.randomMotionSettings?.enabled && motionConfig.randomMotionSettings.interval && motionConfig.randomMotionSettings.interval > 0) {
      const interval = motionConfig.randomMotionSettings.interval

      randomMotionTimer = setInterval(() => {
        if (modelLoaded.value) {
          playRandomMotion()
        }
      }, interval)
    } else {
    }
  }

  // 停止随机动作定时器
  const stopRandomMotionTimer = () => {
    if (randomMotionTimer) {
      clearInterval(randomMotionTimer)
      randomMotionTimer = null
    }
  }

  // 重置所有动作参数（用于xiaolongren模型）
  const resetAllMotionParams = () => {
    if (live2dService) {
      const allParams = ['Param36', 'Param37', 'Param38'] // xiaolongren的所有动作参数
      allParams.forEach(param => {
        if (live2dService) {
          live2dService.setParameterValue(param, 0)
        }
      })
    }
  }

  // 触发事件动作
  const triggerEventMotion = (eventType: string) => {
    const appConfigStore = useAppConfigStore()
    const motionConfig = appConfigStore.live2dModelConfig?.live2dMotions

    if (motionConfig?.randomMotionSettings?.enabled &&
      motionConfig.randomMotionSettings.triggerEvents?.includes(eventType)) {
      playRandomMotion()
    }
  }

  // 使用 TTS 播报时的嘴型联动（基于节律与噪声的拟合）
  const startMouthByTTS = (options?: { speed?: number; volume?: number; scale?: number; attackMs?: number; releaseMs?: number }) => {
    console.log('🎭 [Live2D] startMouthByTTS 被调用', { options })
    const model = getModelInstance()
    if (!model || !model.internalModel) {
      console.warn('🎭 [Live2D] 模型未加载，无法启动嘴型')
      return
    }
    console.log('🎭 [Live2D] 模型已加载，开始启动嘴型动画')

    // 停止现有动画
    if (mouthRafId) {
      cancelAnimationFrame(mouthRafId)
      mouthRafId = null
    }
    mouthActive = true

    const speed = Math.max(0, Math.min(100, options?.speed ?? 50))
    const volume = Math.max(0, Math.min(100, options?.volume ?? 50))
    const scale = Math.max(0.3, Math.min(1.2, options?.scale ?? 1))
    const attackMs = Math.max(5, options?.attackMs ?? 30)
    const releaseMs = Math.max(20, options?.releaseMs ?? 120)

    const baseFreq = 1 + (speed - 50) / 25 // 约 0.0-4.0 Hz 范围内
    let level = 0
    let lastTs = performance.now()

    const update = () => {
      if (!mouthActive) return
      const now = performance.now()
      const dt = Math.max(1, now - lastTs)
      lastTs = now

      const t = now / 1000
      const rhythmic = Math.abs(Math.sin(2 * Math.PI * baseFreq * t))
      const noise = Math.random() * 0.6
      const target = Math.min(1, 0.7 * rhythmic + 0.3 * noise) * (0.6 + 0.4 * (volume / 100))

      const attackAlpha = 1 - Math.exp(-dt / attackMs)
      const releaseAlpha = 1 - Math.exp(-dt / releaseMs)
      const alpha = target > level ? attackAlpha : releaseAlpha
      level = level + (target - level) * alpha

      setMouthOpen(Math.max(0, Math.min(1, level * scale)))

      if (now - mouthDebugLastLog > 500) {
        mouthDebugLastLog = now
      }
      mouthRafId = requestAnimationFrame(update)
    }

    mouthRafId = requestAnimationFrame(update)
  }

  const stopMouth = () => {
    if (mouthRafId) {
      cancelAnimationFrame(mouthRafId)
      mouthRafId = null
    }
    mouthActive = false
    setMouthOpen(0)
  }

  // 重新加载（兼容性方法）
  const reload = () => {
    console.warn('重新加载功能暂未实现')
  }

  // 选择表情（兼容性方法）
  const selectExpression = (expression: any) => {
    const expressionId = expression.name || expression.Name || expression.id || expression.Id
    if (expressionId) {
      playExpression(expressionId)
    }
  }

  // 处理窗口大小变化（兼容性方法）
  const handleResize = () => {
    console.warn('窗口大小变化处理暂未实现')
  }

  // 设置模型位置
  const setPosition = (x: number, y: number) => {
    modelPosition.value = { x, y }
    if (live2dService) {
      live2dService.setPosition(x, y)
    }
  }

  // 设置模型缩放
  const setScale = (scale: number) => {
    if (live2dService) {
      live2dService.setScale(scale)
    }
  }

  // 销毁模型
  const destroy = () => {
    // 取消正在进行的初始化
    if (initAbortController) {
      console.log('🔄 [Live2DStore] destroy: 取消正在进行的初始化')
      initAbortController.abort()
      initAbortController = null
    }

    // 停止随机动作定时器
    stopRandomMotionTimer()

    if (live2dService) {
      live2dService.destroy()
      live2dService = null
    }
    loading.value = false
    modelLoaded.value = false
    availableExpressions.value = []
    availableMotions.value = {}
  }

  // 取消初始化（不销毁实例）
  const cancelInit = () => {
    if (initAbortController) {
      console.log('⏹️ [Live2DStore] 取消初始化')
      initAbortController.abort()
      initAbortController = null
    }
  }

  // 获取模型实例
  const getModel = () => {
    return live2dService?.getModel()
  }

  // 获取PIXI应用实例
  const getApp = () => {
    return live2dService?.getApp()
  }

  return {
    // 状态
    loading,
    modelLoaded,
    availableExpressions,
    availableMotions,
    modelPosition,

    // 方法
    init,
    playExpression,
    playMotion,
    playRandomMotion,
    testMotion,
    startRandomMotionTimer,
    stopRandomMotionTimer,
    resetAllMotionParams,
    triggerEventMotion,
    startMouthByTTS,
    stopMouth,
    reload,
    selectExpression,
    handleResize,
    setPosition,
    setScale,
    destroy,
    cancelInit,
    getModel,
    getApp
  }
}, {
  persist: false
}) 