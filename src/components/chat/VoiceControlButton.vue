<template>
  <div class="voice-section">
    <div class="press-hint" :class="{ cancel: isCancelZone }">{{ isPressing ? pressHintText : '' }}</div>
    <button 
      class="voice-button" 
      :class="{ 'cancel': isCancelZone, 'thinking': isLoading, 'listening': listening }"
      :disabled="isPressDisabled && !isLoading" 
      @mousedown.prevent="handlePressStart" 
      @mousemove.prevent="handlePressMove"
      @mouseup.prevent="handlePressEnd" 
      @touchstart="handleTouchStart" 
      @touchmove.prevent="handlePressMove" 
      @touchend="handleTouchEnd"
      @touchcancel.prevent="handlePressCancel" 
      @click.stop="handleButtonClick"
    >
      {{ pressButtonLabel }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

interface Props {
  isPressDisabled: boolean
  isLoading: boolean
  listening: boolean
  isCancelZone: boolean
  isPressing: boolean
  isConnected: boolean
  listenStateConnected: boolean
  employeeStatusText?: string
  isEmployeeRunning?: boolean
}

interface Emits {
  (e: 'press-start', event: TouchEvent | MouseEvent): void
  (e: 'press-move', event: TouchEvent | MouseEvent): void
  (e: 'press-end'): void
  (e: 'press-cancel'): void
  (e: 'button-click'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// 防抖相关状态
const isClickProcessing = ref(false)
const clickDebounceTimer = ref<ReturnType<typeof setTimeout> | null>(null)

// 防抖工具函数
const debounce = (fn: (...args: any[]) => void, delay: number) =>
  (...args: any[]) => {
    if (clickDebounceTimer.value) clearTimeout(clickDebounceTimer.value)
    clickDebounceTimer.value = setTimeout(() => fn(...args), delay)
  }

// 计算属性
const pressHintText = computed(() => {
  return props.isCancelZone ? '松开取消' : '上滑取消'
})

const pressButtonLabel = computed(() => {
  if (props.isLoading) return '正在思考中，点击取消会话'
  if (!props.listening) return '按住说话'
  return props.isCancelZone ? '松开取消' : '松开结束'
})

// 事件处理
const handlePressStart = (e: TouchEvent | MouseEvent) => {
  emit('press-start', e)
}

const handlePressMove = (e: TouchEvent | MouseEvent) => {
  emit('press-move', e)
}

const handlePressEnd = (e: TouchEvent | MouseEvent) => {
  // 在思考状态下，不执行按压逻辑，让click事件正常触发
  if (props.isLoading) {
    return
  }
  emit('press-end')
}

const handlePressCancel = () => {
  emit('press-cancel')
}


const handleTouchStart = (e: TouchEvent) => {
  // 在思考状态下，直接触发点击事件
  if (props.isLoading) {
    e.preventDefault()
    handleButtonClick()
    return
  }
  emit('press-start', e)
}

const handleTouchEnd = (e: TouchEvent) => {
  // 在思考状态下，不执行触摸逻辑
  if (props.isLoading) {
    return
  }
  emit('press-end')
}

// 优化的按钮点击处理 - 添加防抖和状态保护
const handleButtonClick = debounce(() => {
  // 防止重复处理
  if (isClickProcessing.value) return

  // 基本状态检查
  if (props.isPressDisabled && !props.isLoading) return

  isClickProcessing.value = true

  
  emit('button-click')
  
  // 短暂延迟后重置处理状态，防止快速连续点击
  setTimeout(() => {
    isClickProcessing.value = false
  }, 300)
}, 150) // 150ms防抖延迟
</script>

<style scoped lang="css">
/* 语音区域 */
.voice-section {
  margin-top: 2.25rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.press-hint {
  height: 1.5rem;
  user-select: none;
  -webkit-user-select: none;
  pointer-events: none;
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
  border-radius: 9999px;
  color: var(--primary-color);
  transition: background 0.15s ease;
}

.press-hint.cancel {
  color: rgba(220, 38, 38, 0.85);
}

/* 语音按钮 */
.voice-button {
  width: 100%;
  height: 3.5rem;
  padding: 0 1rem;
  border-radius: 0.75rem;
  color: white;
  font-size: 1rem;
  transition: background-color 0.15s ease, box-shadow 0.15s ease;
  background: var(--primary-gradient);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 500;
}



.voice-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
  pointer-events: none;
}

/* 思考状态下的按钮样式 - 橙色渐变 */
.voice-button.thinking {
  background: linear-gradient(135deg, #f97316, #ea580c);
  cursor: pointer;
  pointer-events: auto;
  /* 安卓端优化 */
  -webkit-tap-highlight-color: rgba(249, 115, 22, 0.3);
  touch-action: manipulation;
}

.voice-button.thinking:hover {
  box-shadow: 0 4px 12px rgba(249, 115, 22, 0.3);
}

/* 取消状态下的按钮样式 - 红色渐变 */
.voice-button.cancel {
  background: linear-gradient(135deg, #ef4444, #dc2626);
  cursor: pointer;
  pointer-events: auto;
  /* 安卓端优化 */
  -webkit-tap-highlight-color: rgba(239, 68, 68, 0.3);
  touch-action: manipulation;
}

.voice-button.cancel:hover {
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
}

/* 按住说话状态下的按钮样式 - 使用主题色渐变 + 流光效果 */
.voice-button.listening {
  background: var(--primary-gradient);
  position: relative;
  overflow: hidden;
  cursor: pointer;
  pointer-events: auto;
  /* 安卓端优化 */
  -webkit-tap-highlight-color: var(--primary-color);
  touch-action: manipulation;
}

.voice-button.listening:hover {
  box-shadow: 0 4px 12px var(--primary-color);
  opacity: 0.9;
}

/* 流光效果 */
.voice-button.listening::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.4),
    transparent
  );
  animation: shimmer 2s infinite;
  z-index: 1;
  /* 性能优化：使用GPU加速 */
  transform: translateZ(0);
  will-change: left;
}

/* 流光动画关键帧 */
@keyframes shimmer {
  0% {
    left: -100%;
  }
  100% {
    left: 100%;
  }
}

/* 确保按钮文字在流光之上 */
.voice-button.listening {
  z-index: 2;
}

/* 安卓端触摸优化 */
.voice-button {
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  -webkit-user-select: none;
  user-select: none;
}
</style>
