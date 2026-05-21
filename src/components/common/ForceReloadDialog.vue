<template>
  <div v-if="visible" class="force-reload-backdrop" @click.self="handleCancel">
    <div class="force-reload-dialog" role="dialog" aria-modal="true">
      <div class="dialog-header">
        <div class="dialog-icon">⚠️</div>
        <div class="dialog-title">遇到问题，正在尝试强制重启</div>
      </div>
      
      <div class="dialog-body">
        <p class="dialog-message">
          系统检测到连接异常，已尝试多次重连失败。
          <br />
          建议重启应用以恢复正常连接。
        </p>
        <p v-if="countdown > 0" class="countdown-text">
          {{ countdown }} 秒后自动重启...
        </p>
      </div>
      
      <div class="dialog-footer">
        <button 
          class="btn btn-cancel" 
          @click="handleCancel"
        >
          取消
        </button>
        <button 
          class="btn btn-confirm" 
          @click="handleConfirm"
        >
          {{ countdown > 0 ? `确认重启 (${countdown}s)` : '立即重启' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'

interface Props {
  visible: boolean
  countdownSeconds?: number
}

const props = withDefaults(defineProps<Props>(), {
  countdownSeconds: 5
})

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const countdown = ref(props.countdownSeconds)
let countdownTimer: ReturnType<typeof setInterval> | null = null
let isCancelled = false

// 开始倒计时
const startCountdown = () => {
  isCancelled = false
  countdown.value = props.countdownSeconds
  
  if (countdownTimer) {
    clearInterval(countdownTimer)
  }
  
  countdownTimer = setInterval(() => {
    if (isCancelled) {
      return
    }
    
    countdown.value--
    
    if (countdown.value <= 0) {
      clearInterval(countdownTimer!)
      countdownTimer = null
      // 自动触发确认
      handleConfirm()
    }
  }, 1000)
}

// 停止倒计时
const stopCountdown = () => {
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
  isCancelled = true
}

// 确认重启
const handleConfirm = () => {
  stopCountdown()
  emit('confirm')
}

// 取消重启
const handleCancel = () => {
  stopCountdown()
  emit('cancel')
}

// 监听 visible 变化
watch(
  () => props.visible,
  (newVal) => {
    if (newVal) {
      startCountdown()
    } else {
      stopCountdown()
    }
  },
  { immediate: true }
)

// 组件卸载时清理
onBeforeUnmount(() => {
  stopCountdown()
})
</script>

<style scoped>
.force-reload-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.force-reload-dialog {
  background: var(--bg-elevated, #ffffff);
  color: var(--text-color, #333333);
  border: 0.0625rem solid var(--border-color, #e0e0e0);
  border-radius: 1rem;
  width: 90vw;
  max-width: 28rem;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  animation: slideUp 0.3s ease-out;
  overflow: hidden;
}

@keyframes slideUp {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.dialog-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1.5rem 1.5rem 1rem;
  border-bottom: 0.0625rem solid var(--border-color, #e0e0e0);
}

.dialog-icon {
  font-size: 2rem;
  line-height: 1;
}

.dialog-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-color, #333333);
  flex: 1;
}

.dialog-body {
  padding: 1.5rem;
}

.dialog-message {
  margin: 0 0 1rem;
  font-size: 0.9375rem;
  line-height: 1.6;
  color: var(--text-color-secondary, #666666);
}

.countdown-text {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--error-color, #f44336);
  text-align: center;
  animation: pulse 1s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}

.dialog-footer {
  display: flex;
  gap: 0.75rem;
  padding: 1rem 1.5rem 1.5rem;
  border-top: 0.0625rem solid var(--border-color, #e0e0e0);
}

.btn {
  flex: 1;
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  outline: none;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-cancel {
  background: var(--bg-secondary, #f5f5f5);
  color: var(--text-color, #333333);
}

.btn-cancel:hover:not(:disabled) {
  background: var(--bg-tertiary, #e0e0e0);
}

.btn-confirm {
  background: var(--error-color, #f44336);
  color: #ffffff;
}

.btn-confirm:hover:not(:disabled) {
  background: var(--error-color-dark, #d32f2f);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(244, 67, 54, 0.3);
}

/* 深色模式支持 */
@media (prefers-color-scheme: dark) {
  .force-reload-dialog {
    background: var(--bg-elevated, #1e1e1e);
    color: var(--text-color, #ffffff);
    border-color: var(--border-color, #333333);
  }
  
  .dialog-title {
    color: var(--text-color, #ffffff);
  }
  
  .dialog-message {
    color: var(--text-color-secondary, #b0b0b0);
  }
  
  .btn-cancel {
    background: var(--bg-secondary, #2a2a2a);
    color: var(--text-color, #ffffff);
  }
  
  .btn-cancel:hover:not(:disabled) {
    background: var(--bg-tertiary, #3a3a3a);
  }
}
</style>

