<template>
  <div class="status-wrapper">
    <div class="status-indicator" :class="sizeClass">
      <div class="status-circle" :class="status">
        <!-- 内容按状态切换 -->
        <template v-if="status === 'idle'">
          <div class="idle-dot"></div>
        </template>

        <template v-else-if="status === 'voice'">
          <div class="voice-loading-gif"></div>
        </template>

        <template v-else-if="status === 'loading'">
          <div class="loading-spinner">
            <div class="spinner-ring"></div>
          </div>
        </template>

        <template v-else-if="status === 'typing'">
          <div class="typing-dots">
            <div v-for="i in 3" :key="i" class="dot" :style="{ animationDelay: (i * 0.2) + 's' }"></div>
          </div>
        </template>

        <template v-else-if="status === 'error'">
          <div class="error-icon">
            <svg viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5">
              <path fill-rule="evenodd"
                d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z"
                clip-rule="evenodd" />
            </svg>
          </div>
        </template>

        <template v-else-if="status === 'reconnecting'">
          <div class="reconnect-spinner">
            <div class="spinner-ring"></div>
          </div>
        </template>
      </div>
    </div>
    <div v-if="status === 'reconnecting' && reconnectText" class="reconnect-text">{{ reconnectText }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

// Props 定义
const props = defineProps({
  status: {
    type: String,
    default: 'idle',
    validator: (value: string) => (['idle', 'voice', 'loading', 'typing', 'error', 'reconnecting'] as const).includes(value as any)
  },
  size: {
    type: String,
    default: 'md',
    validator: (value: string) => (['sm', 'md', 'lg'] as const).includes(value as any)
  },
  reconnectText: {
    type: String,
    default: ''
  }
})

// 尺寸类名
const sizeClass = computed(() => {
  const sizeClasses: Record<string, string> = {
    sm: 'w-10 h-10',
    md: 'w-14 h-14',
    lg: 'w-16 h-16'
  }
  return sizeClasses[props.size] || sizeClasses.md
})
</script>

<style scoped>
.status-indicator {
  @apply relative flex items-center justify-center mx-auto;
  border-radius: 50%;
  z-index: 1000;
}

.status-circle {
  @apply w-full h-full flex items-center justify-center relative;
  border-color: var(--border-light);
  /* background: radial-gradient(circle, var(--primary-color) 0%, var(--primary-color) 20%, var(--primary-light) 40%, var(--primary-lighter) 60%, rgba(255, 255, 255, 0.1) 80%, transparent 100%); */
  opacity: 0.4;
}



.status-circle::before {
  content: '';
  @apply absolute inset-0 rounded-full;
  background: radial-gradient(circle, var(--primary-color) 0%, var(--primary-light) 30%, var(--primary-lighter) 50%, rgba(255, 255, 255, 0.2) 70%, rgba(255, 255, 255, 0.05) 85%, transparent 100%);
  backdrop-filter: blur(9px);
  z-index: 1;
  opacity: 0.6;
  animation: breathe-glow 3s ease-in-out infinite;
}

.status-circle>* {
  position: relative;
  z-index: 2;
}

/* 静止状态 */
.status-circle.idle {
  background: radial-gradient(circle, var(--primary-color) 0%, var(--primary-color) 15%, var(--primary-light) 35%, var(--primary-lighter) 55%, rgba(255, 255, 255, 0.15) 75%, rgba(255, 255, 255, 0.05) 90%, transparent 100%);
  opacity: 0.6;
  border-radius: 50%
}

.idle-dot {
  @apply w-2.5 h-2.5 rounded-full animate-pulse shadow-lg;
  background: #fff;
  animation: idle-pulse 2s ease-in-out infinite;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

@keyframes idle-pulse {

  0%,
  100% {
    opacity: 0.6;
    transform: scale(1);
  }

  50% {
    opacity: 1;
    transform: scale(1.2);
  }
}

@keyframes breathe {

  0%,
  100% {
    transform: scale(1);
    opacity: 0.8;
  }

  50% {
    transform: scale(1.05);
    opacity: 1;
  }
}

@keyframes breathe-glow {

  0%,
  100% {
    opacity: 0.3;
    transform: scale(1);
  }

  50% {
    opacity: 0.6;
    transform: scale(1.1);
  }
}

/* 声纹状态 */
.status-circle.voice {
  background: radial-gradient(circle, var(--primary-color) 0%, var(--primary-color) 15%, var(--primary-light) 35%, var(--primary-lighter) 55%, rgba(255, 255, 255, 0.15) 75%, rgba(255, 255, 255, 0.05) 90%, transparent 100%);
}

.voice-loading-gif {
  width: 1.8rem;
  height: 1.8rem;
  background-color: #f5f5f5;
  -webkit-mask-image: url('@/assets/loading.gif');
  mask-image: url('@/assets/loading.gif');
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-position: center;
  mask-position: center;
  -webkit-mask-size: contain;
  mask-size: contain;
}

/* Loading状态 */
.status-circle.loading {
  background: radial-gradient(circle, rgba(34, 197, 94, 0.6) 0%, rgba(34, 197, 94, 0.4) 25%, rgba(34, 197, 94, 0.2) 50%, rgba(34, 197, 94, 0.1) 75%, rgba(34, 197, 94, 0.05) 90%, transparent 100%);
}

.loading-spinner {
  @apply relative w-6 h-6;
}

.spinner-ring {
  @apply absolute w-full h-full border-4 border-transparent rounded-full animate-spin;
  border-top-color: #f5f5f5;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

/* 输出状态 */
.status-circle.typing {
  background: radial-gradient(circle, rgba(168, 85, 247, 0.6) 0%, rgba(168, 85, 247, 0.4) 25%, rgba(168, 85, 247, 0.2) 50%, rgba(168, 85, 247, 0.1) 75%, rgba(168, 85, 247, 0.05) 90%, transparent 100%);
}

.typing-dots {
  @apply flex items-center justify-center gap-0.5;
}

.dot {
  @apply w-1.5 h-1.5 rounded-full shadow-md;
  background: #f5f5f5;
  animation: typing-bounce 1.4s ease-in-out infinite;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

@keyframes typing-bounce {

  0%,
  80%,
  100% {
    transform: scale(0.8);
    opacity: 0.5;
  }

  40% {
    transform: scale(1.2);
    opacity: 1;
  }
}

/* 错误状态 */
.status-circle.error {
  background: radial-gradient(circle, rgba(239, 68, 68, 0.6) 0%, rgba(239, 68, 68, 0.4) 25%, rgba(239, 68, 68, 0.2) 50%, rgba(239, 68, 68, 0.1) 75%, rgba(239, 68, 68, 0.05) 90%, transparent 100%);
  border-color: var(--error-color);
}

.error-icon {
  color: var(--error-color);
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
}

/* 重连状态 */
.status-circle.reconnecting {
  background: radial-gradient(circle, rgba(251, 146, 60, 0.6) 0%, rgba(251, 146, 60, 0.4) 25%, rgba(251, 146, 60, 0.2) 50%, rgba(251, 146, 60, 0.1) 75%, rgba(251, 146, 60, 0.05) 90%, transparent 100%);
}

.reconnect-spinner .spinner-ring {
  border-top-color: #f97316;
}

.status-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.375rem;
}

.reconnect-text {
  font-size: 0.7rem;
  color: #f97316;
  text-align: center;
  white-space: nowrap;
  font-weight: 500;
}

/* 悬停效果 */
.status-indicator:hover .status-circle {
  @apply transform scale-110 transition-transform duration-300;
  box-shadow: var(--shadow-heavy);
}

/* 响应式设计 */
@media (max-width: 640px) {
  .status-indicator {
    @apply w-12 h-12;
  }

  .idle-dot {
    @apply w-2 h-2;
  }

  .loading-spinner {
    @apply w-5 h-5;
  }

  .dot {
    @apply w-1 h-1;
  }
}
</style>