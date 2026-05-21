<template>
  <div class="panel">
    <span class="panel-title">通用设置</span>

    <div class="form-row">
      <label class="form-label">左上角标签</label>
      <input v-model="customLabel" type="text" class="input-text" placeholder="留空则不显示" />
    </div>

    <div class="form-row" style="justify-content: space-between;">
      <label class="section-title">主题模式</label>
      <div class="radio-group">
        <label class="radio-item">
          <input v-model="theme" type="radio" name="theme" value="light" />
          <span>浅色</span>
        </label>
        <label class="radio-item">
          <input v-model="theme" type="radio" name="theme" value="dark" />
          <span>深色</span>
        </label>
        <label class="radio-item">
          <input v-model="theme" type="radio" name="theme" value="auto" />
          <span>跟随系统</span>
        </label>
      </div>
    </div>

    <!-- TTS 语音合成配置 -->
    <div class="section">
      <div class="section-title">语音合成 (TTS)</div>

      <div class="form-row">
        <label class="form-label">TTS引擎</label>
        <div class="radio-group">
          <label class="radio-item">
            <input type="radio" name="ttsProvider" value="xunfei" v-model="ttsProvider" />
            <span>讯飞</span>
          </label>
          <label class="radio-item">
            <input type="radio" name="ttsProvider" value="voicebox" v-model="ttsProvider" />
            <span>Voicebox</span>
          </label>
        </div>
      </div>
      <div class="form-row tts-hint">
        <span>切换后重启应用生效</span>
      </div>

      <template v-if="ttsProvider === 'voicebox'">
        <div class="form-row">
          <label class="form-label">服务地址</label>
          <input type="text" class="input-text" v-model="voiceboxUrl" placeholder="例如: http://192.168.2.236:17493" />
        </div>
        <div class="form-row">
          <label class="form-label">Profile索引</label>
          <input type="number" class="input-text" style="max-width: 80px;" v-model.number="voiceboxProfileIndex" min="0" />
        </div>
        <div class="form-row">
          <label class="form-label">引擎</label>
          <input type="text" class="input-text" style="max-width: 120px;" v-model="voiceboxEngine" placeholder="qwen" />
        </div>
        <div class="form-row">
          <label class="form-label">模型大小</label>
          <input type="text" class="input-text" style="max-width: 120px;" v-model="voiceboxModelSize" placeholder="0.6B" />
        </div>
      </template>
    </div>

    <!-- 工作流配置 -->
    <div class="section">
      <div class="section-title">工作流配置</div>

      <div class="form-row">
        <label class="form-label">执行地址</label>
        <input
          v-model="executionUrl"
          type="text"
          class="input-text"
          placeholder="例如: http://192.168.11.24:8088/open/workflow/execute"
        />
      </div>

      <div class="section-title workflow-subtitle">开门工作流</div>
      <div class="form-row">
        <label class="form-label">API Key</label>
        <input v-model="openDoorApiKey" type="text" class="input-text" placeholder="Workflow API Key" />
      </div>
      <div class="form-row">
        <label class="form-label">Workflow ID</label>
        <input v-model="openDoorWorkflowId" type="text" class="input-text" placeholder="Workflow ID" />
      </div>

      <div class="section-title workflow-subtitle">关门工作流</div>
      <div class="form-row">
        <label class="form-label">API Key</label>
        <input v-model="closeDoorApiKey" type="text" class="input-text" placeholder="Workflow API Key" />
      </div>
      <div class="form-row">
        <label class="form-label">Workflow ID</label>
        <input v-model="closeDoorWorkflowId" type="text" class="input-text" placeholder="Workflow ID" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useAppConfigStore } from '@/stores/appConfig'
import { themeManager, getTheme, type Theme } from '@/utils/theme'
import { getTtsProvider, setTtsProvider } from '@/hooks/speech'

const theme = ref<Theme>(getTheme())
const appConfigStore = useAppConfigStore()
const customLabel = ref(localStorage.getItem('custom-label') || '')

// TTS 引擎选择
const ttsProvider = ref<'xunfei' | 'voicebox'>(getTtsProvider())
watch(ttsProvider, (v) => setTtsProvider(v))

watch(customLabel, value => {
  if (value.trim()) {
    localStorage.setItem('custom-label', value)
    window.dispatchEvent(new CustomEvent('custom-label-changed', { detail: value }))
    return
  }

  localStorage.removeItem('custom-label')
  window.dispatchEvent(new CustomEvent('custom-label-changed', { detail: '' }))
})

// TTS Voicebox 配置 - 从 localStorage 读取，带默认值
const TTS_STORAGE_KEY = 'voicebox-tts-config'
const loadTtsConfig = () => {
  try {
    const saved = localStorage.getItem(TTS_STORAGE_KEY)
    if (saved) return JSON.parse(saved)
  } catch (_) {}
  return null
}
const savedTts = loadTtsConfig()
const voiceboxUrl = ref(savedTts?.url ?? 'http://192.168.2.236:17493')
const voiceboxProfileIndex = ref(savedTts?.profileIndex ?? 1)
const voiceboxEngine = ref(savedTts?.engine ?? 'qwen')
const voiceboxModelSize = ref(savedTts?.modelSize ?? '0.6B')

const saveTtsConfig = () => {
  try {
    localStorage.setItem(TTS_STORAGE_KEY, JSON.stringify({
      url: voiceboxUrl.value,
      profileIndex: voiceboxProfileIndex.value,
      engine: voiceboxEngine.value,
      modelSize: voiceboxModelSize.value,
    }))
  } catch (_) {}
}

watch([voiceboxUrl, voiceboxProfileIndex, voiceboxEngine, voiceboxModelSize], saveTtsConfig, { deep: true })

const workflow = computed(() => appConfigStore.workflow)

const executionUrl = computed({
  get: () => workflow.value?.executionUrl ?? '',
  set: value => {
    appConfigStore.updateWorkflowConfig({ executionUrl: value })
  }
})

const openDoorApiKey = computed({
  get: () => workflow.value?.openDoor?.apiKey ?? '',
  set: value => {
    appConfigStore.updateWorkflowConfig({
      openDoor: { apiKey: value }
    })
  }
})

const openDoorWorkflowId = computed({
  get: () => workflow.value?.openDoor?.workflowId ?? '',
  set: value => {
    appConfigStore.updateWorkflowConfig({
      openDoor: { workflowId: value }
    })
  }
})

const closeDoorApiKey = computed({
  get: () => workflow.value?.closeDoor?.apiKey ?? '',
  set: value => {
    appConfigStore.updateWorkflowConfig({
      closeDoor: { apiKey: value }
    })
  }
})

const closeDoorWorkflowId = computed({
  get: () => workflow.value?.closeDoor?.workflowId ?? '',
  set: value => {
    appConfigStore.updateWorkflowConfig({
      closeDoor: { workflowId: value }
    })
  }
})

onMounted(() => {
  theme.value = getTheme()
})

watch(
  () => theme.value,
  value => {
    themeManager.setTheme(value)
  }
)
</script>

<style scoped>
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

.input-text:focus {
  border-color: var(--color-primary);
}

.panel-title {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.625rem;
}

.form-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0.625rem 0;
}

.form-label {
  font-size: 0.8rem;
  width: 7.5rem;
  color: var(--text-secondary);
}

.radio-group {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}

.radio-item {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8rem;
}

.section {
  padding: 0.825rem 0;
  border-top: 0.0625rem solid var(--border-color);
  margin-top: 0.625rem;
}

.section-title {
  color: var(--color-secondary);
  font-weight: 400;
  font-size: 0.9rem;
}

.workflow-subtitle {
  font-size: 0.85rem;
  margin-top: 0.625rem;
}

.tts-hint {
  margin-top: 0.25rem;
}

.tts-hint span {
  color: var(--text-secondary);
  font-size: 0.7rem;
  opacity: 0.7;
}
</style>
