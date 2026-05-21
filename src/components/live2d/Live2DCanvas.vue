<template>
  <div class="canvas-container">
    <canvas
      :key="canvasKey"
      id="live2d-canvas"
      class="live2d-canvas"
    ></canvas>
    <div v-if="loading" class="loading-overlay">
      <div class="loading-spinner"></div>
      <p>正在加载Live2D模型...</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useLive2DStore } from '@/stores/live2d'
import { useAppConfigStore } from '@/stores/appConfig'

// Props
interface Props {
  loading: boolean
  modelLoaded: boolean
  canvasKey: number
}

const props = defineProps<Props>()

// Emits
const emit = defineEmits<{
  'model-loaded': [data: { expressions: any[], motions: any }]
  'loading-change': [loading: boolean]
}>()

// Store
const live2DStore = useLive2DStore()
const appConfigStore = useAppConfigStore()

// 初始化标志，防止重复初始化
let isInitializing = false
let hasInitialized = false
let watchStopHandle: (() => void) | null = null
let currentModelPath: string | null = null // 记录当前初始化的模型路径
let initAbortController: AbortController | null = null // 用于取消正在进行的初始化

// 初始化Live2D的函数
const initializeLive2D = async () => {
  // 获取当前模型路径
  const modelPath = appConfigStore.live2dModelPath
  
  // 检查配置是否已加载
  if (!appConfigStore.isLoaded) {
    console.log('⏳ [Live2DCanvas] 配置尚未加载完成，等待配置加载...')
    return
  }
  
  // 检查模型路径是否存在
  if (!modelPath) {
    console.log('⏳ [Live2DCanvas] 模型路径尚未配置，等待配置加载...')
    return
  }
  
  // 如果正在初始化相同的模型路径，跳过
  if (isInitializing && currentModelPath === modelPath) {
    console.log('⏳ [Live2DCanvas] 正在初始化相同的模型，跳过重复调用', modelPath)
    return
  }
  
  // 如果正在初始化不同的模型路径，取消旧的初始化
  if (isInitializing && currentModelPath !== modelPath) {
    console.log('🔄 [Live2DCanvas] 检测到模型路径变化，取消旧的初始化', {
      oldPath: currentModelPath,
      newPath: modelPath
    })
    if (initAbortController) {
      initAbortController.abort()
    }
    // 等待一小段时间让取消操作完成
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  
  // 如果已经初始化过，先销毁旧实例
  if (hasInitialized) {
    console.log('🔄 [Live2DCanvas] 检测到已初始化，先销毁旧实例')
    try {
      live2DStore.destroy()
      // 等待销毁完成
      await new Promise(resolve => setTimeout(resolve, 100))
    } catch (error) {
      console.warn('⚠️ [Live2DCanvas] 销毁旧实例时出现警告:', error)
    }
    hasInitialized = false
  }
  
  // 再次检查配置，确保配置已完全更新
  const currentPath = appConfigStore.live2dModelPath
  if (!appConfigStore.isLoaded || !currentPath) {
    console.log('⏳ [Live2DCanvas] 配置尚未完全更新，等待配置更新...')
    isInitializing = false
    return
  }
  
  // 如果配置又变化了，不继续初始化
  if (currentPath !== modelPath) {
    console.log('⏳ [Live2DCanvas] 配置在检查过程中又变化了，取消初始化', {
      originalPath: modelPath,
      currentPath: currentPath
    })
    return
  }
  
  // 创建新的 AbortController
  initAbortController = new AbortController()
  const signal = initAbortController.signal
  
  isInitializing = true
  currentModelPath = modelPath
  
  console.log('🎨 [Live2DCanvas] 开始初始化Live2D，模型路径:', modelPath)
  
  try {
    // 检查是否已被取消
    if (signal.aborted) {
      console.log('⏹️ [Live2DCanvas] 初始化已被取消')
      return
    }
    
    console.log('🎨 [Live2DCanvas] 组件挂载开始...')
    console.log('🎨 [Live2DCanvas] 组件状态:', {
      loading: props.loading,
      modelLoaded: props.modelLoaded,
      canvasKey: props.canvasKey,
      configLoaded: appConfigStore.isLoaded,
      modelPath: appConfigStore.live2dModelPath,
      currentModelPath: currentModelPath
    })
    
    // 使用nextTick确保DOM完全渲染后再查找Canvas元素
    await nextTick()
    
    // 再次检查是否已被取消
    if (signal.aborted) {
      console.log('⏹️ [Live2DCanvas] 初始化在等待DOM时被取消')
      return
    }
    
    // 再次验证模型路径是否变化
    const currentPath = appConfigStore.live2dModelPath
    if (currentPath !== modelPath) {
      console.log('⏹️ [Live2DCanvas] 模型路径在初始化过程中变化，取消初始化', {
        originalPath: modelPath,
        currentPath: currentPath
      })
      return
    }
    
    // 添加重试机制查找Canvas元素
    let canvas: HTMLCanvasElement | null = null
    let retryCount = 0
    const maxRetries = 5
    const retryDelay = 100
    
    while (!canvas && retryCount < maxRetries && !signal.aborted) {
      canvas = document.querySelector('#live2d-canvas') as HTMLCanvasElement
      
      if (!canvas) {
        retryCount++
        console.log(`🎨 [Live2DCanvas] Canvas元素查找失败，重试 ${retryCount}/${maxRetries}`)
        await new Promise(resolve => setTimeout(resolve, retryDelay))
      }
    }
    
    // 检查是否已被取消
    if (signal.aborted) {
      console.log('⏹️ [Live2DCanvas] 初始化在查找Canvas时被取消')
      return
    }
    
    console.log('🎨 [Live2DCanvas] Canvas元素检查:', {
      hasCanvas: !!canvas,
      canvasId: canvas?.id,
      canvasWidth: canvas?.width,
      canvasHeight: canvas?.height,
      canvasStyle: canvas?.style?.display,
      retryCount,
      modelPath: modelPath
    })
    
    if (!canvas) {
      throw new Error(`找不到Canvas元素，已重试${maxRetries}次`)
    }
    
    // 最后一次验证模型路径
    const finalPath = appConfigStore.live2dModelPath
    if (finalPath !== modelPath) {
      console.log('⏹️ [Live2DCanvas] 模型路径在初始化前最后检查时变化，取消初始化', {
        originalPath: modelPath,
        finalPath: finalPath
      })
      return
    }
    
    // 再次检查是否已被取消
    if (signal.aborted) {
      console.log('⏹️ [Live2DCanvas] 初始化在调用 init 前被取消')
      return
    }
    
    // 再次验证 canvas 元素是否还存在
    const finalCanvas = document.querySelector('#live2d-canvas') as HTMLCanvasElement
    if (!finalCanvas || finalCanvas !== canvas) {
      console.warn('⚠️ [Live2DCanvas] Canvas元素在初始化前被替换或移除')
      return
    }
    
    console.log('🎨 [Live2DCanvas] 开始初始化Live2D，确认模型路径:', modelPath)
    // 初始化Live2D
    const result = await live2DStore.init()
    console.log('🎨 [Live2DCanvas] Live2D初始化成功:', result)
    
    // 检查是否已被取消（可能在异步初始化过程中被取消）
    if (signal.aborted) {
      console.log('⏹️ [Live2DCanvas] 初始化在完成后被取消，销毁实例')
      try {
        live2DStore.destroy()
      } catch (error) {
        console.warn('⚠️ [Live2DCanvas] 取消时销毁实例失败:', error)
      }
      return
    }
    
    // 通知父组件模型已加载
    emit('model-loaded', result)
    emit('loading-change', false)
    console.log('✅ [Live2DCanvas] 组件初始化完成，模型路径:', modelPath)
    
    hasInitialized = true
  } catch (error) {
    // 如果是取消操作，不记录错误
    if (signal.aborted) {
      console.log('⏹️ [Live2DCanvas] 初始化被取消')
      return
    }
    
    console.error('❌ [Live2DCanvas] Live2D Canvas初始化失败:', error)
    console.error('❌ [Live2DCanvas] 错误详情:', JSON.stringify({
      errorType: typeof error,
      errorName: error instanceof Error ? error.name : 'Unknown',
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined
    }, null, 2))
    emit('loading-change', false)
    hasInitialized = false // 初始化失败时重置标志
  } finally {
    // 只有在当前初始化完成时才重置标志
    if (currentModelPath === modelPath) {
      isInitializing = false
      currentModelPath = null
      initAbortController = null
    }
  }
}

onMounted(async () => {
  // 重置初始化标志（组件重新挂载时）
  hasInitialized = false
  isInitializing = false
  currentModelPath = null
  
  // 取消之前的初始化（如果有）
  if (initAbortController) {
    initAbortController.abort()
    initAbortController = null
  }
  
  console.log('🎨 [Live2DCanvas] 组件挂载，canvasKey:', props.canvasKey)
  
  // 等待 DOM 完全渲染（多次 nextTick 确保 DOM 更新完成）
  await nextTick()
  await new Promise(resolve => setTimeout(resolve, 100))
  await nextTick()
  
  // 再次检查 canvasKey 是否变化（可能在等待过程中组件又被卸载了）
  if (!document.querySelector('#live2d-canvas')) {
    console.log('⏹️ [Live2DCanvas] Canvas元素不存在，组件可能已被卸载')
    return
  }
  
  // 尝试初始化（如果配置已加载）
  await initializeLive2D()
  
  // 监听配置加载状态和模型路径变化，配置加载完成后自动初始化
  watchStopHandle = watch(
    () => [appConfigStore.isLoaded, appConfigStore.live2dModelPath, props.canvasKey] as const,
    (newValues, oldValues) => {
      // 安全处理参数，避免解构 undefined
      const [isLoaded, modelPath, canvasKey] = newValues || []
      const [oldIsLoaded, oldModelPath, oldCanvasKey] = oldValues || [undefined, undefined, undefined]
      
      // 如果配置已加载且有模型路径
      const configReady = isLoaded && modelPath
      
      // 检查是否真的发生了变化（避免首次调用时误触发）
      const pathChanged = oldModelPath !== undefined && modelPath !== oldModelPath
      const keyChanged = oldCanvasKey !== undefined && canvasKey !== oldCanvasKey
      const configChanged = pathChanged || keyChanged
      
      // 如果配置已准备好，且（配置变化了 或 还未初始化）
      if (configReady && (configChanged || !hasInitialized)) {
        console.log('✅ [Live2DCanvas] 配置已加载完成或配置变化，准备初始化Live2D', {
          modelPath,
          oldModelPath,
          canvasKey,
          oldCanvasKey,
          hasInitialized,
          pathChanged,
          keyChanged,
          isInitializing,
          currentModelPath
        })
        
        // 如果正在初始化不同的模型，等待一下让旧的初始化有机会取消
        if (isInitializing && currentModelPath !== modelPath) {
          console.log('⏳ [Live2DCanvas] 等待旧的初始化取消...')
          setTimeout(() => {
            initializeLive2D()
          }, 100)
        } else {
          // 使用 nextTick 确保 DOM 更新完成
          nextTick(() => {
            initializeLive2D()
          })
        }
      }
    },
    { immediate: false } // 改为 false，因为已经在 onMounted 中手动初始化了
  )
})

onBeforeUnmount(() => {
  console.log('🔄 [Live2DCanvas] 组件卸载，canvasKey:', props.canvasKey)
  
  // 取消正在进行的初始化（重要：必须在组件卸载时立即取消）
  if (initAbortController) {
    console.log('⏹️ [Live2DCanvas] 组件卸载时取消正在进行的初始化')
    initAbortController.abort()
    initAbortController = null
  }
  
  // 停止监听器
  if (watchStopHandle) {
    watchStopHandle()
    watchStopHandle = null
  }
  
  // 如果已经初始化，销毁实例（因为组件被卸载了）
  if (hasInitialized) {
    console.log('🗑️ [Live2DCanvas] 组件卸载时销毁已初始化的实例')
    try {
      // 先取消初始化，再同步销毁（不使用 setTimeout，确保立即执行）
      live2DStore.cancelInit()
      live2DStore.destroy()
    } catch (error) {
      console.warn('⚠️ [Live2DCanvas] 卸载时销毁实例失败:', error)
    }
  } else if (isInitializing) {
    // 如果正在初始化，只取消初始化，不销毁（因为可能还没有创建实例）
    console.log('⏹️ [Live2DCanvas] 组件卸载时取消正在进行的初始化')
    live2DStore.cancelInit()
  }
  
  // 重置所有标志
  hasInitialized = false
  isInitializing = false
  currentModelPath = null
})
</script>

<style scoped>
.canvas-container {
  background: var(--bg-container);
  position: relative;
  width: 100%;
  height: 100%;
}

.live2d-canvas {
  width: 100%;
  height: 100%;
  display: block;
  background: transparent;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.9);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 1rem;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--color-primary);
  border-top: 4px solid transparent;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style> 