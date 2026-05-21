<template>
  <div class="exception-stack" aria-live="assertive" aria-atomic="false">
    <transition-group name="exception-fade" tag="div">
      <div
        v-for="item in items"
        :key="item.id"
        class="exception-item"
        :class="severityClass(item.severity)"
        role="alert"
      >
        <div class="exception-icon" :class="severityClass(item.severity)" aria-hidden="true">{{ iconOf(item.severity) }}</div>
        <div class="exception-content">
          <div class="exception-title">
            <span class="title-text">{{ item.title }}</span>
            <span v-if="item.source" class="title-source">· {{ item.source }}</span>
          </div>
          <div v-if="item.detail" class="exception-detail">{{ item.detail }}</div>
          <div class="exception-time">{{ formatTime(item.time) }}</div>
        </div>
        <button class="exception-close" @click="dismiss(item.id)" :aria-label="`关闭异常: ${item.title}`">✕</button>
      </div>
    </transition-group>
  </div>
  
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useExceptionStore, type ExceptionSeverity } from '@/stores/exception'

interface Props {
  maxVisible?: number
}

const props = withDefaults(defineProps<Props>(), {
  maxVisible: 5
})

const store = useExceptionStore()

const items = computed(() => store.list.slice(0, props.maxVisible))

const severityClass = (s: ExceptionSeverity) => `sev-${s}`

const iconOf = (s: ExceptionSeverity) => {
  if (s === 'critical') return '⛔'
  if (s === 'high') return '⚠️'
  if (s === 'medium') return '❗'
  return 'ℹ️'
}

const formatTime = (iso: string) => {
  try {
    const d = new Date(iso)
    const hh = `${d.getHours()}`.padStart(2, '0')
    const mm = `${d.getMinutes()}`.padStart(2, '0')
    const ss = `${d.getSeconds()}`.padStart(2, '0')
    return `${hh}:${mm}:${ss}`
  } catch {
    return iso
  }
}

const dismiss = (id: string) => {
  store.resolveById(id)
}
</script>

<style scoped>
.exception-stack {
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none; /* 容器不拦截，子项可点击 */
}

.exception-item {
  pointer-events: auto;
  min-width: 18rem;
  max-width: 42rem;
  display: grid;
  grid-template-columns: 24px 1fr auto;
  gap: 10px;
  align-items: start;
  background: var(--bg-elevated);
  color: var(--text-color);
  border-radius: 10px;
  box-shadow: var(--shadow-large, 0 10px 20px rgba(0,0,0,0.15));
  padding: 10px 10px 10px 12px;
  border: 1px solid rgba(0,0,0,0.06);
  margin-bottom: 8px;
}

.exception-icon {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  line-height: 1;
}

.exception-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.exception-title {
  font-weight: 700;
  font-size: 13px;
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
}

.title-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.title-source { opacity: 0.6; font-weight: 500; font-size: 12px; }

.exception-detail { font-size: 12px; opacity: 0.9; }
.exception-time { font-size: 11px; opacity: 0.6; }

.exception-close {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--text-color);
  opacity: 0.7;
  cursor: pointer;
  font-size: 14px;
  padding: 0 4px;
}

.exception-close:hover { opacity: 1; }

/* 色板 */
.sev-critical { border-color: rgba(239, 68, 68, 0.45); box-shadow: 0 8px 18px rgba(239,68,68,0.18); }
.sev-high { border-color: rgba(245, 158, 11, 0.45); box-shadow: 0 8px 18px rgba(245,158,11,0.18); }
.sev-medium { border-color: rgba(59, 130, 246, 0.35); box-shadow: 0 8px 18px rgba(59,130,246,0.14); }
.sev-low { border-color: rgba(107, 114, 128, 0.35); box-shadow: 0 8px 18px rgba(107,114,128,0.12); }

/* 进出场动画 */
.exception-fade-enter-active, .exception-fade-leave-active { transition: all .2s ease; }
.exception-fade-enter-from, .exception-fade-leave-to { opacity: 0; transform: translateY(-6px); }

@media (prefers-color-scheme: dark) {
  .exception-item { border-color: rgba(255,255,255,0.08); }
}
</style>


