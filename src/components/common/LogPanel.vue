<template>
  <div v-if="visible" class="log-panel">
    <div class="log-header">
      <div class="title">运行日志</div>
      <div class="actions">
        <button class="btn" @click="filter = 'ALL'">全部</button>
        <button class="btn" @click="filter = 'HTTP'">HTTP</button>
        <button class="btn" @click="filter = 'MQTT'">MQTT</button>
        <button class="btn" @click="clear">清空</button>
        <button class="btn" @click="hide">关闭</button>
      </div>
    </div>
    <div class="log-body" ref="bodyRef">
      <div v-for="l in filtered" :key="l.id" class="row" :class="l.level">
        <span class="time">{{ formatTime(l.time) }}</span>
        <span class="src">[{{ l.source }}]</span>
        <span class="lvl">{{ l.level.toUpperCase() }}</span>
        <span class="msg">{{ l.message }}</span>
        <button v-if="hasDetail(l)" class="link" @click="toggle(l.id)">
          {{ isExpanded(l.id) ? '收起' : '展开' }}
        </button>
        <pre v-if="isExpanded(l.id)" class="detail">{{ formatDetail(l.detail) }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useLogStore } from '@/stores/log'

const store = useLogStore()
const visible = computed(() => store.visible)
const logs = computed(() => store.logs)

const filter = ref<'ALL' | 'HTTP' | 'MQTT'>('ALL')
const filtered = computed(() => filter.value === 'ALL' ? logs.value : logs.value.filter(l => l.source === filter.value))

const bodyRef = ref<HTMLDivElement | null>(null)
const expanded = ref<Record<string, boolean>>({})
const toggle = (id: string) => { expanded.value[id] = !expanded.value[id] }
const isExpanded = (id: string) => !!expanded.value[id]
const hasDetail = (l: any) => l && typeof l.detail !== 'undefined'
const formatDetail = (d: any) => {
  try {
    if (d === undefined || d === null) return ''
    return typeof d === 'string' ? d : JSON.stringify(d, null, 2)
  } catch {
    return String(d)
  }
}
watch(filtered, () => {
  requestAnimationFrame(() => {
    const el = bodyRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
})

const clear = () => store.clear()
const hide = () => store.hide()
const formatTime = (iso: string) => new Date(iso).toLocaleTimeString()

onMounted(() => {
  // 初始滚动到最底
  const el = bodyRef.value
  if (el) el.scrollTop = el.scrollHeight
})
</script>

<style scoped>
.log-panel {
  position: fixed;
  right: 16px;
  bottom: 16px;
  width: 480px;
  max-height: 40vh;
  z-index: 2200;
  background: var(--bg-elevated);
  color: var(--text-color);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-medium);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
}
.log-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border-color);
}
.title { font-weight: 600; }
.actions { display: flex; gap: 6px; }
.btn {
  background: var(--bg-hover);
  border: 1px solid var(--border-color);
  color: var(--text-color);
  padding: 2px 8px;
  border-radius: 6px;
  cursor: pointer;
}
.link { margin-left: 8px; background: transparent; border: none; color: var(--color-primary); cursor: pointer; }
.log-body {
  padding: 6px 8px;
  overflow: auto;
}
.row { font-size: 12px; line-height: 1.6; white-space: pre-wrap; word-break: break-all; }
.row .time { color: var(--text-secondary); margin-right: 6px; }
.row .src { color: var(--color-primary); margin-right: 6px; }
.row .lvl { margin-right: 6px; }
.detail { background: var(--bg-hover); border: 1px solid var(--border-color); padding: 6px; border-radius: 6px; margin-top: 4px; }
.row.info { }
.row.warn { color: #b7791f; }
.row.error { color: #c53030; }
.row.debug { color: #718096; }
</style>


