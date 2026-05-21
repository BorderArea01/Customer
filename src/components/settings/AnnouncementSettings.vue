<template>
  <div class="panel">
    <span class="panel-title">公告配置</span>

    <!-- 展示模式 -->
    <div class="section">
      <div class="section-title">展示模式</div>
      <div class="form-row">
        <label class="form-label">启用公告</label>
        <label class="toggle-switch">
          <input type="checkbox" v-model="enabled" />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="form-row">
        <label class="form-label">展示方式</label>
        <div class="radio-group">
          <label class="radio-item">
            <input type="radio" v-model="displayMode" value="scroll" />
            <span>多卡片滚动</span>
          </label>
          <label class="radio-item">
            <input type="radio" v-model="displayMode" value="single" />
            <span>单卡片轮播</span>
          </label>
          <label class="radio-item">
            <input type="radio" v-model="displayMode" value="none" />
            <span>不展示</span>
          </label>
        </div>
      </div>
    </div>

    <div class="section" v-if="displayMode !== 'none'">
      <div class="section-title">基本设置</div>
      <div class="form-row">
        <label class="form-label">标题</label>
        <input type="text" class="input-text" v-model="title" placeholder="公告标题" />
      </div>
      <div class="form-row">
        <label class="form-label">轮播间隔(ms)</label>
        <input type="number" class="input-text" style="max-width: 100px;" v-model.number="scrollInterval" min="1000" step="500" />
      </div>
      <div class="form-row">
        <label class="form-label">展示字段</label>
        <input type="text" class="input-text" v-model="cardFieldsStr" placeholder="逗号分隔，如: name,phone" />
      </div>
    </div>

    <!-- JSON 导入/导出 -->
    <div class="section" v-if="displayMode !== 'none'">
      <div class="section-title">数据管理</div>
      <div class="btn-row">
        <button class="action-btn" @click="loadDefault">加载默认数据</button>
        <button class="action-btn" @click="triggerImport">导入JSON文件</button>
        <button class="action-btn" @click="exportJson">导出JSON</button>
      </div>
      <input ref="fileInputRef" type="file" accept=".json" style="display:none" @change="handleFileImport" />
      <p v-if="importMsg" class="msg" :class="importMsgType">{{ importMsg }}</p>
      <p class="hint">JSON格式：{ "items": [{"field1":"val1","field2":"val2"},...], "cardFields":["field1","field2"], "title":"...", "scrollInterval":4000 }</p>
    </div>

    <!-- JSON 编辑器 -->
    <div class="section" v-if="displayMode !== 'none'">
      <div class="section-title">
        JSON 编辑
        <span class="item-count">({{ itemCount }} 条记录)</span>
      </div>
      <textarea class="json-editor" v-model="jsonText" rows="12" placeholder="在此编辑JSON数据..."></textarea>
      <p v-if="jsonError" class="msg error">{{ jsonError }}</p>
      <button class="action-btn apply-btn" @click="applyJson">应用JSON</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAppConfigStore } from '@/stores/appConfig'
import { computed, ref, watch, nextTick } from 'vue'

const appConfigStore = useAppConfigStore()
const list = computed(() => appConfigStore.contactList)

// 防循环守卫
let syncingFromStore = false

// 编辑状态
const jsonText = ref('')
const jsonError = ref('')
const fileInputRef = ref<HTMLInputElement | null>(null)
const importMsg = ref('')
const importMsgType = ref<'success' | 'error'>('success')
const itemCount = ref(0)

// 从 store 构建 JSON 文本
const buildJsonText = () => {
  const src = list.value
  if (!src) return
  const obj: Record<string, unknown> = {
    title: src.title || '',
    scrollInterval: src.scrollInterval ?? 4000,
    cardFields: src.cardFields || [],
    items: src.items || [],
  }
  jsonText.value = JSON.stringify(obj, null, 2)
  itemCount.value = src.items?.length || 0
  jsonError.value = ''
}

buildJsonText()
watch(() => list.value, () => {
  if (!syncingFromStore) {
    buildJsonText()
  }
}, { deep: true })

const enabled = computed({
  get: () => list.value?.enabled ?? true,
  set: (v) => appConfigStore.updateConfig({ contactList: { ...list.value, enabled: v } as any })
})

const displayMode = computed({
  get: () => list.value?.displayMode || 'scroll',
  set: (v) => appConfigStore.updateConfig({ contactList: { ...list.value, displayMode: v } as any })
})

const scrollInterval = computed({
  get: () => list.value?.scrollInterval ?? 4000,
  set: (v) => appConfigStore.updateConfig({ contactList: { ...list.value, scrollInterval: v } as any })
})

const title = computed({
  get: () => list.value?.title ?? '',
  set: (v) => appConfigStore.updateConfig({ contactList: { ...list.value, title: v } as any })
})

const cardFieldsStr = computed({
  get: () => (list.value?.cardFields || []).join(','),
  set: (v) => {
    const fields = v.split(',').map(s => s.trim()).filter(Boolean)
    appConfigStore.updateConfig({ contactList: { ...list.value, cardFields: fields } as any })
  }
})

// 应用 JSON 编辑
const applyJson = () => {
  jsonError.value = ''
  try {
    const parsed = JSON.parse(jsonText.value)
    if (!parsed.items || !Array.isArray(parsed.items)) {
      jsonError.value = 'JSON 必须包含 "items" 数组'
      return
    }
    syncingFromStore = true
    appConfigStore.updateConfig({
      contactList: {
        ...list.value,
        title: parsed.title || '',
        scrollInterval: parsed.scrollInterval ?? 4000,
        cardFields: parsed.cardFields || [],
        items: parsed.items,
      } as any
    })
    itemCount.value = parsed.items.length
    nextTick(() => { syncingFromStore = false })
    importMsg.value = 'JSON 已应用'
    importMsgType.value = 'success'
    setTimeout(() => { importMsg.value = '' }, 2000)
  } catch (e) {
    jsonError.value = 'JSON 格式错误: ' + (e as Error).message
  }
}

// 加载默认数据
const loadDefault = async () => {
  try {
    const res = await fetch('/announcement.json')
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const data = await res.json()
    jsonText.value = JSON.stringify(data, null, 2)
    applyJson()
    importMsg.value = '已加载默认数据'
    importMsgType.value = 'success'
    setTimeout(() => { importMsg.value = '' }, 2000)
  } catch (e) {
    importMsg.value = '加载默认数据失败: ' + (e as Error).message
    importMsgType.value = 'error'
  }
}

// 导入 JSON 文件
const triggerImport = () => {
  fileInputRef.value?.click()
}

const handleFileImport = async (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    JSON.parse(text) // 校验
    jsonText.value = text
    applyJson()
    importMsg.value = `已导入: ${file.name}`
    importMsgType.value = 'success'
    setTimeout(() => { importMsg.value = '' }, 2000)
  } catch (err) {
    importMsg.value = '导入失败: ' + (err as Error).message
    importMsgType.value = 'error'
  } finally {
    input.value = ''
  }
}

// 导出 JSON
const exportJson = async () => {
  try {
    const data = {
      enabled: list.value?.enabled,
      displayMode: list.value?.displayMode,
      title: list.value?.title,
      scrollInterval: list.value?.scrollInterval,
      cardFields: list.value?.cardFields,
      items: list.value?.items,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'announcement.json'
    a.click()
    URL.revokeObjectURL(url)
    importMsg.value = '已导出'
    importMsgType.value = 'success'
    setTimeout(() => { importMsg.value = '' }, 2000)
  } catch (e) {
    importMsg.value = '导出失败'
    importMsgType.value = 'error'
  }
}
</script>

<style scoped>
.panel-title { font-size: 1rem; font-weight: 600; margin-bottom: 0.625rem; }

.section {
  padding: 0.625rem 0;
  border-top: 0.0625rem solid var(--border-color);
  margin-top: 0.5rem;
}

.section-title {
  color: var(--color-secondary);
  font-weight: 400;
  font-size: 0.9rem;
  margin-bottom: 0.375rem;
}

.item-count {
  font-size: 0.7rem;
  color: var(--text-tertiary);
  font-weight: 400;
}

.form-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0.5rem 0;
}

.form-label {
  font-size: 0.8rem;
  width: 7.5rem;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.input-text {
  flex: 1;
  padding: 0.375rem 0.5rem;
  border: 0.0625rem solid var(--border-color);
  border-radius: 0.25rem;
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 0.8rem;
  outline: none;
}

.input-text:focus { border-color: var(--color-primary); }

.radio-group { display: flex; align-items: center; gap: 0.625rem; }

.radio-item {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8rem;
}

.btn-row { display: flex; gap: 0.5rem; flex-wrap: wrap; }

.action-btn {
  padding: 0.375rem 0.75rem;
  border: 0.0625rem solid var(--border-color);
  border-radius: 0.375rem;
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 0.8rem;
  cursor: pointer;
  transition: background 0.15s;
}

.action-btn:hover { background: var(--bg-hover); }

.apply-btn {
  margin-top: 0.375rem;
  background: var(--color-primary);
  color: #fff;
  border-color: var(--color-primary);
}

.apply-btn:hover { opacity: 0.9; }

.json-editor {
  width: 100%;
  padding: 0.5rem;
  border: 0.0625rem solid var(--border-color);
  border-radius: 0.375rem;
  background: var(--bg-color);
  color: var(--text-color);
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 0.75rem;
  line-height: 1.4;
  resize: vertical;
  outline: none;
  box-sizing: border-box;
}

.json-editor:focus { border-color: var(--color-primary); }

.msg {
  margin-top: 0.375rem;
  font-size: 0.75rem;
}

.msg.success { color: var(--color-primary); }
.msg.error { color: #c53030; }

.hint {
  margin-top: 0.375rem;
  font-size: 0.65rem;
  color: var(--text-tertiary);
}

/* Toggle switch */
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 2.5rem;
  height: 1.375rem;
}

.toggle-switch input { display: none; }

.toggle-slider {
  position: absolute;
  inset: 0;
  background: var(--bg-active);
  border-radius: 9999px;
  cursor: pointer;
  transition: background 0.2s;
}

.toggle-slider::before {
  content: '';
  position: absolute;
  top: 0.125rem;
  left: 0.125rem;
  width: 1.125rem;
  height: 1.125rem;
  background: white;
  border-radius: 50%;
  transition: transform 0.2s;
}

.toggle-switch input:checked + .toggle-slider { background: var(--color-primary); }
.toggle-switch input:checked + .toggle-slider::before { transform: translateX(1.125rem); }
</style>
