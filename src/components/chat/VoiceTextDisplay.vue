<template>
  <div class="qa-section">
    <div class="voice-text-display">
      <div class="voice-text-container" ref="voiceContainerRef">
        <div class="voice-tip">
          <span 
            class="placeholder-text" 
            :class="{ 
              'recognition-failed': recognitionFailed,
              'is-recognizing': isRecognizing
            }"
          >
            {{ placeholderText }}
          </span>
        </div>
        <div class="voice-content" ref="voiceContentRef">
          <div class="voice-text-wrapper" ref="marqueeContainerRef" :class="{ 'is-marquee': isMarquee }">
            <template v-if="isMarquee">
              <div class="marquee-track" :class="{ paused: marqueePaused }" :style="marqueeInlineStyle">
                <span class="voice-text" ref="voiceTextRef">{{ finalDisplayText }}</span>
                <span class="marquee-gap" aria-hidden="true"></span>
                <span class="voice-text clone">{{ finalDisplayText }}</span>
              </div>
            </template>
            <template v-else>
              <span class="voice-text" ref="voiceTextRef">{{ finalDisplayText }}</span>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'

interface Props {
  listening: boolean
  finalDisplayText: string
  isPressing: boolean
  recognitionFailed?: boolean
  isRecognizing?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  recognitionFailed: false,
  isRecognizing: false
})

// 计算占位符文本
const placeholderText = computed(() => {
  if (props.recognitionFailed) {
    return '！不好意思没有听清 请您再说一遍'
  }
  if (props.isRecognizing) {
    return '正在识别中'
  }
  if (props.isPressing) {
    return '正在聆听'
  }
  return '按住下方按钮开始语音输入'
})

// 跑马灯相关状态（内联实现）
const voiceContainerRef = ref<HTMLElement | null>(null)
const voiceContentRef = ref<HTMLElement | null>(null)
const marqueeContainerRef = ref<HTMLElement | null>(null)
const voiceTextRef = ref<HTMLElement | null>(null)
const isMarquee = ref(false)
const marqueePaused = ref(false)
const marqueeDistance = ref(0)
const marqueeDurationMs = ref(0)

// 常量
const MARQUEE_GAP_PX = 48
const MARQUEE_SPEED_PX_PER_SEC = 50

// 计算样式
const marqueeInlineStyle = computed(() => ({
  '--marquee-distance': `${marqueeDistance.value}px`,
  '--marquee-gap': `${MARQUEE_GAP_PX}px`,
  'animation-duration': `${marqueeDurationMs.value}ms`
}))

// 更新跑马灯
const updateMarquee = () => {
  const container = marqueeContainerRef.value
  const textEl = voiceTextRef.value
  if (!container || !textEl) {
    stopMarquee()
    isMarquee.value = false
    return
  }

  const maxScroll = Math.max(0, textEl.scrollWidth - container.clientWidth)
  isMarquee.value = maxScroll > 0

  if (isMarquee.value) {
    marqueeDistance.value = textEl.scrollWidth + MARQUEE_GAP_PX
    marqueeDurationMs.value = Math.max(1000, Math.round((marqueeDistance.value / MARQUEE_SPEED_PX_PER_SEC) * 1000))
    marqueePaused.value = false
  } else {
    marqueeDistance.value = 0
    marqueeDurationMs.value = 0
    stopMarquee()
  }
}

// 停止跑马灯
const stopMarquee = () => {
  // 无需重置 transform，由 CSS 动画负责循环
}

// 绑定跑马灯事件
const bindMarqueeEvents = () => {
  const container = marqueeContainerRef.value
  if (!container) return

  const pause = () => { marqueePaused.value = true }
  const resume = () => { marqueePaused.value = false }

  container.addEventListener('mouseenter', pause)
  container.addEventListener('mouseleave', resume)
  container.addEventListener('touchstart', pause, { passive: true })
  container.addEventListener('touchend', resume, { passive: true })

  ;(container as any)._pauseHandler = pause
  ;(container as any)._resumeHandler = resume
}

// 解绑跑马灯事件
const unbindMarqueeEvents = () => {
  const container = marqueeContainerRef.value
  if (!container) return

  const pause = (container as any)._pauseHandler
  const resume = (container as any)._resumeHandler

  if (pause) {
    container.removeEventListener('mouseenter', pause)
    container.removeEventListener('touchstart', pause)
  }
  if (resume) {
    container.removeEventListener('mouseleave', resume)
    container.removeEventListener('touchend', resume)
  }

  delete (container as any)._pauseHandler
  delete (container as any)._resumeHandler
}

// 监听文本变化，更新跑马灯
// 在语音录制期间暂停跑马灯更新，避免影响按钮位置
watch(() => props.finalDisplayText, async () => {
  // 如果正在录制，延迟更新跑马灯，避免布局变化影响按钮位置
  if (props.isPressing) {
    return
  }
  await nextTick()
  updateMarquee()
})

// 监听录制状态变化，录制结束后更新跑马灯
watch(() => props.isPressing, async (isPressing, wasPressing) => {
  // 录制刚结束时，更新跑马灯
  if (wasPressing && !isPressing) {
    await nextTick()
    updateMarquee()
  }
})

// 监听窗口尺寸变化
const handleResize = () => {
  updateMarquee()
}

onMounted(() => {
  nextTick(() => {
    updateMarquee()
    bindMarqueeEvents()
  })
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  unbindMarqueeEvents()
  window.removeEventListener('resize', handleResize)
})
</script>

<style scoped lang="css">
/* 问答区域 */
.qa-section {
  padding: 3rem 1.5rem;
  padding-bottom: 0.5rem;
  border-radius: 1rem 1rem 0 0;
  z-index: 10;
  opacity: 0.6;
  background: var(--aurora-bg);
}

/* 语音文字显示区域 */
.voice-text-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0.5rem 0;
}

.voice-text-container {
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
}

.voice-tip {
  height: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  font-size: 0.75rem;
  line-height: 1.5;
}

.placeholder-text.recognition-failed {
  color: #ff4444;
  font-weight: 500;
}

.placeholder-text.is-recognizing {
  color: var(--primary-color);
}

.voice-content {
  height: 3.5rem;
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: center;
}

.voice-text-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  height: 100%;
  padding: 0.5rem 0.75rem;
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.voice-text-wrapper::-webkit-scrollbar {
  display: none;
}

.voice-text-wrapper.is-marquee {
  justify-content: flex-start;
  overflow: hidden;
}

.voice-text {
  font-size: 1.5rem;
  font-weight: 500;
  color: var(--primary-color);
  text-align: center;
  white-space: nowrap;
  display: inline-block;
  line-height: 1.4;
}

.marquee-track {
  display: inline-flex;
  align-items: center;
  animation-name: marqueeSlide;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
  will-change: transform;
}

.marquee-track.paused {
  animation-play-state: paused;
}

.marquee-gap {
  flex: 0 0 var(--marquee-gap);
}


/* 跑马灯动画 */
@keyframes marqueeSlide {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(calc(-1 * var(--marquee-distance)));
  }
}
</style>
