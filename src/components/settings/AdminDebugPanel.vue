<template>
  <div class="panel">
    <h3 class="panel-title">管理员调试</h3>

    <div class="form-row">
      <label class="form-label">人脸图像预览</label>
      <button class="primary-btn" @click="$emit('toggle-camera-debug')">
        {{ cameraDebugEnabled ? '关闭预览' : '打开预览' }}
      </button>
    </div>

    <div class="form-row">
      <label class="form-label">打开日志</label>
      <button class="secondary-btn" @click="openLog">打开日志</button>
    </div>

    <div class="section-divider"></div>
    <h4 class="section-title">人脸过滤强度</h4>
    <div class="filter-presets">
      <button
        v-for="preset in filterPresets"
        :key="preset.id"
        class="preset-btn"
        :class="{ active: currentFilterId === preset.id }"
        @click="applyFilterPreset(preset)"
      >
        {{ preset.name }}
      </button>
    </div>
    <div v-if="activePreset" class="preset-desc">
      <p>{{ activePreset.description }}</p>
      <small>
        置信度: {{ activePreset.config.faceMinConfidence }} |
        角度: {{ activePreset.config.faceMaxAngle }} |
        最小占比: {{ (activePreset.config.faceMinArea * 100).toFixed(1) }}%
      </small>
    </div>

    <div class="section-divider"></div>
    <h4 class="section-title">聊天诊断</h4>

    <div class="diagnostic-grid">
      <div class="diagnostic-item">
        <span class="diagnostic-label">绑定状态</span>
        <span class="diagnostic-value">{{ deviceStore.isBound ? '已绑定' : '未绑定' }}</span>
      </div>
      <div class="diagnostic-item">
        <span class="diagnostic-label">数字员工状态</span>
        <span class="diagnostic-value">{{ deviceStore.employeeStatusText }}</span>
      </div>
      <div class="diagnostic-item">
        <span class="diagnostic-label">员工 ID</span>
        <span class="diagnostic-value mono">{{ deviceStore.employeeInfo?.employeeId || '-' }}</span>
      </div>
      <div class="diagnostic-item">
        <span class="diagnostic-label">MQTT 状态</span>
        <span class="diagnostic-value">{{ chatStore.mqttConnectionStatus }}</span>
      </div>
      <div class="diagnostic-item diagnostic-item-wide">
        <span class="diagnostic-label">MQTT 地址</span>
        <span class="diagnostic-value mono">{{ mqttInfo.host || appConfigStore.mqttUrl || '-' }}</span>
      </div>
      <div class="diagnostic-item diagnostic-item-wide">
        <span class="diagnostic-label">MQTT 用户名</span>
        <span class="diagnostic-value mono">{{ mqttInfo.username || appConfigStore.config.chatMqttBroker?.mqttUsername || '-' }}</span>
      </div>
      <div class="diagnostic-item diagnostic-item-wide">
        <span class="diagnostic-label">接收 Topic</span>
        <span class="diagnostic-value mono">{{ mqttInfo.receiveTopic || '-' }}</span>
      </div>
      <div class="diagnostic-item diagnostic-item-wide">
        <span class="diagnostic-label">最近连接错误</span>
        <span class="diagnostic-value diagnostic-error">
          {{ chatStore.mqttError?.message || deviceStore.bindingPollingError || '-' }}
        </span>
      </div>
      <div class="diagnostic-item diagnostic-item-wide">
        <span class="diagnostic-label">语音识别地址</span>
        <span class="diagnostic-value mono">{{ appConfigStore.speechRecognitionUrl || '-' }}</span>
      </div>
    </div>

    <div class="form-row">
      <label class="form-label">聊天连接</label>
      <div class="button-group">
        <button class="primary-btn" :disabled="isReconnecting" @click="reconnectMqtt">
          {{ isReconnecting ? '重连中...' : '重连 MQTT' }}
        </button>
        <button class="secondary-btn" @click="refreshMqttInfo">刷新状态</button>
      </div>
    </div>

    <div class="form-row">
      <label class="form-label">语音识别</label>
      <div class="button-group">
        <button class="primary-btn" :disabled="isVoiceReconnecting" @click="reconnectVoice">
          {{ isVoiceReconnecting ? '重连中...' : '重连语音识别' }}
        </button>
      </div>
    </div>

    <div class="section-divider"></div>
    <h4 class="section-title">应用更新测试</h4>

    <div class="form-row">
      <label class="form-label">当前版本</label>
      <span class="version-text">{{ currentVersion || '获取中...' }}</span>
    </div>

    <div class="form-row">
      <label class="form-label">更新状态</label>
      <div class="update-status">
        <span v-if="updateState.isChecking" class="status-badge checking">检查中...</span>
        <span v-else-if="updateState.isDownloading" class="status-badge downloading">
          下载中 {{ updateState.downloadProgress }}%
        </span>
        <span v-else-if="updateState.isInstalling" class="status-badge installing">安装中...</span>
        <span v-else-if="updateState.error" class="status-badge error">{{ updateState.error }}</span>
        <span v-else class="status-badge idle">就绪</span>
      </div>
    </div>

    <div v-if="updateState.isDownloading" class="form-row">
      <label class="form-label">下载进度</label>
      <div class="progress-bar-container">
        <div class="progress-bar" :style="{ width: updateState.downloadProgress + '%' }"></div>
        <span class="progress-text">{{ updateState.downloadProgress }}%</span>
      </div>
    </div>

    <div class="form-row">
      <label class="form-label">操作</label>
      <div class="button-group">
        <button
          class="primary-btn"
          :disabled="updateState.isChecking || updateState.isDownloading || updateState.isInstalling"
          @click="handleCheckUpdate"
        >
          {{ updateState.isChecking ? '检查中...' : '检查更新' }}
        </button>
        <button class="secondary-btn" :disabled="updateState.isChecking" @click="handleGetCurrentVersion">
          获取版本
        </button>
      </div>
    </div>

    <div class="form-row">
      <label class="form-label">清除本地数据</label>
      <button class="danger-btn" :disabled="isClearing" @click="clearLocalStorage">
        {{ isClearing ? '清除中...' : '清除数据' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useLogStore } from '@/stores/log'
import { useUpdate } from '@/hooks/update'
import { Dialog } from '@capacitor/dialog'
import { Capacitor } from '@capacitor/core'
import { useChatStore } from '@/stores/chat'
import { useDeviceStore } from '@/stores/device'
import { useAppConfigStore } from '@/stores/appConfig'
import { getVoiceReconnect } from '@/utils/reconnectRegistry'

interface Props {
  cameraDebugEnabled?: boolean
}

defineProps<Props>()
defineEmits<{ 'toggle-camera-debug': [] }>()

const isClearing = ref(false)
const isReconnecting = ref(false)
const logStore = useLogStore()
const chatStore = useChatStore()
const deviceStore = useDeviceStore()
const appConfigStore = useAppConfigStore()
const currentVersion = ref('')
const mqttInfoVersion = ref(0)

const filterPresets = [
  {
    id: 0,
    name: '无过滤',
    description: '只要画面中有人脸就触发，适合排查识别链路。',
    config: {
      faceMinArea: 0,
      faceMaxArea: 1,
      faceMinConfidence: 0,
      faceMaxAngle: 180,
      faceRequireFrontal: false
    }
  },
  {
    id: 1,
    name: '宽松',
    description: '适合光线偏弱、侧脸或距离稍远的现场环境。',
    config: {
      faceMinArea: 0.01,
      faceMaxArea: 0.8,
      faceMinConfidence: 0.3,
      faceMaxAngle: 60,
      faceRequireFrontal: false
    }
  },
  {
    id: 2,
    name: '标准',
    description: '平衡误触和识别成功率，适合大多数接待场景。',
    config: {
      faceMinArea: 0.035,
      faceMaxArea: 0.3,
      faceMinConfidence: 0.7,
      faceMaxAngle: 30,
      faceRequireFrontal: true
    }
  },
  {
    id: 3,
    name: '严格',
    description: '减少路人和远距离误触，适合人流复杂场所。',
    config: {
      faceMinArea: 0.06,
      faceMaxArea: 0.25,
      faceMinConfidence: 0.85,
      faceMaxAngle: 20,
      faceRequireFrontal: true
    }
  }
]

type FilterPreset = (typeof filterPresets)[number]

const currentFilterId = ref<number>(-1)

const activePreset = computed(() => filterPresets.find(preset => preset.id === currentFilterId.value))

const syncCurrentFilterPreset = () => {
  const detection = appConfigStore.faceRecognition?.detection
  if (!detection) {
    currentFilterId.value = -1
    return
  }

  const matched = filterPresets.find(preset =>
    preset.config.faceMinArea === detection.faceMinArea &&
    preset.config.faceMaxArea === detection.faceMaxArea &&
    preset.config.faceMinConfidence === detection.faceMinConfidence &&
    preset.config.faceMaxAngle === detection.faceMaxAngle &&
    preset.config.faceRequireFrontal === detection.faceRequireFrontal
  )

  currentFilterId.value = matched?.id ?? -1
}

const applyFilterPreset = (preset: FilterPreset) => {
  currentFilterId.value = preset.id
  appConfigStore.updateConfig({
    faceRecognition: {
      ...(appConfigStore.config.faceRecognition ?? {}),
      detection: {
        ...(appConfigStore.config.faceRecognition?.detection ?? {}),
        ...preset.config
      }
    }
  })
}

const mqttInfo = computed(() => {
  mqttInfoVersion.value
  return chatStore.getMqttConnectionInfo()
})

const refreshMqttInfo = () => {
  mqttInfoVersion.value += 1
}

const reconnectMqtt = async () => {
  if (isReconnecting.value) return

  isReconnecting.value = true
  try {
    chatStore.disconnectMqtt()
    chatStore.reloadMqttConfig()
    await chatStore.connectMqtt()
    refreshMqttInfo()
    await Dialog.alert({
      title: '重连完成',
      message: 'MQTT 已重新连接'
    })
  } catch (error: any) {
    refreshMqttInfo()
    await Dialog.alert({
      title: '重连失败',
      message: error?.message || 'MQTT 重连失败'
    })
  } finally {
    isReconnecting.value = false
  }
}

// 语音识别重连
const isVoiceReconnecting = ref(false)

const reconnectVoice = async () => {
  if (isVoiceReconnecting.value) return

  isVoiceReconnecting.value = true
  try {
    const fn = getVoiceReconnect()
    if (!fn) {
      await Dialog.alert({
        title: '重连失败',
        message: '语音识别服务未初始化，请稍后重试'
      })
      return
    }
    await fn()
    await Dialog.alert({
      title: '重连完成',
      message: '语音识别服务已重新连接'
    })
  } catch (error: any) {
    await Dialog.alert({
      title: '重连失败',
      message: error?.message || '语音识别重连失败'
    })
  } finally {
    isVoiceReconnecting.value = false
  }
}

const { state: updateState, checkUpdate, getCurrentVersion } = useUpdate({
  onCheckComplete: async hasUpdate => {
    if (hasUpdate) return

    if (Capacitor.isNativePlatform()) {
      await Dialog.alert({
        title: '检查完成',
        message: '当前已经是最新版本'
      })
      return
    }

    alert('当前已经是最新版本')
  },
  onUpdateSuccess: async () => {
    if (Capacitor.isNativePlatform()) {
      await Dialog.alert({
        title: '更新成功',
        message: '应用已更新，请重启应用'
      })
      return
    }

    alert('应用已更新，请重启应用')
  },
  onUpdateError: async error => {
    if (Capacitor.isNativePlatform()) {
      await Dialog.alert({
        title: '更新失败',
        message: error
      })
      return
    }

    alert(`更新失败: ${error}`)
  }
})

const handleGetCurrentVersion = async () => {
  try {
    const version = await getCurrentVersion()
    currentVersion.value = version
    if (Capacitor.isNativePlatform()) {
      await Dialog.alert({
        title: '当前版本',
        message: version
      })
      return
    }

    alert(`当前版本: ${version}`)
  } catch (error: any) {
    const errorMsg = error?.message || '获取版本失败'
    if (Capacitor.isNativePlatform()) {
      await Dialog.alert({
        title: '获取失败',
        message: errorMsg
      })
      return
    }

    alert(`获取版本失败: ${errorMsg}`)
  }
}

const handleCheckUpdate = async () => {
  try {
    await checkUpdate()
  } catch (error) {
    console.error('[Update] 检查更新失败:', error)
  }
}

onMounted(async () => {
  refreshMqttInfo()
  syncCurrentFilterPreset()
  if (!Capacitor.isNativePlatform()) return

  try {
    currentVersion.value = await getCurrentVersion()
  } catch (error) {
    console.warn('[Update] 初始化时获取版本失败:', error)
  }
})

const clearLocalStorage = async () => {
  if (isClearing.value) return

  const confirmed = confirm('确定要清除所有本地存储数据吗？此操作不可撤销。')
  if (!confirmed) return

  isClearing.value = true

  try {
    localStorage.clear()
    sessionStorage.clear()

    if ('indexedDB' in window) {
      try {
        const databases = await indexedDB.databases()
        for (const db of databases) {
          if (db.name) {
            indexedDB.deleteDatabase(db.name)
          }
        }
      } catch (error) {
        console.warn('清除 IndexedDB 失败:', error)
      }
    }

    if ('caches' in window) {
      try {
        const cacheNames = await caches.keys()
        await Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)))
      } catch (error) {
        console.warn('清除 Cache Storage 失败:', error)
      }
    }

    setTimeout(() => {
      window.location.href = '/'
    }, 1000)
  } catch (error) {
    console.error('清除本地存储失败:', error)
    alert('清除数据失败，请重试')
    isClearing.value = false
  }
}

const openLog = () => {
  logStore.show()
}
</script>

<style scoped>
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
  width: 7.5rem;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.diagnostic-grid {
  display: grid;
  gap: 0.625rem;
  margin-bottom: 0.75rem;
}

.diagnostic-item {
  display: grid;
  grid-template-columns: 7.5rem 1fr;
  gap: 0.75rem;
  align-items: start;
}

.diagnostic-label {
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.diagnostic-value {
  color: var(--text-color);
  font-size: 0.875rem;
  line-height: 1.5;
  word-break: break-all;
}

.diagnostic-error {
  color: #dc2626;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
}

.primary-btn {
  background: var(--color-primary);
  color: #fff;
  border: none;
  border-radius: 0.5rem;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.primary-btn:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
}

.primary-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.secondary-btn {
  background: transparent;
  color: var(--text-color);
  border: 0.0625rem solid var(--border-color);
  border-radius: 0.5rem;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.secondary-btn:hover:not(:disabled) {
  background: var(--bg-hover);
  transform: translateY(-1px);
}

.secondary-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.danger-btn {
  background: #ef4444;
  color: #fff;
  border: none;
  border-radius: 0.5rem;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.danger-btn:hover:not(:disabled) {
  background: #dc2626;
  transform: translateY(-1px);
}

.danger-btn:disabled {
  background: #9ca3af;
  cursor: not-allowed;
  transform: none;
}

.section-divider {
  margin: 1.25rem 0;
  border-top: 0.0625rem solid var(--border-color);
}

.section-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-primary);
  margin-bottom: 0.75rem;
}

.version-text {
  color: var(--text-color);
  font-family: monospace;
  font-size: 0.875rem;
}

.update-status {
  display: flex;
  align-items: center;
}

.status-badge {
  padding: 0.25rem 0.5rem;
  border-radius: 0.375rem;
  font-size: 0.75rem;
  font-weight: 500;
}

.status-badge.idle {
  background: var(--bg-hover);
  color: var(--text-secondary);
}

.status-badge.checking {
  background: #bee3f8;
  color: #2c5282;
}

.status-badge.downloading {
  background: #c6f6d5;
  color: #22543d;
}

.status-badge.installing {
  background: #fef5e7;
  color: #744210;
}

.status-badge.error {
  background: #fed7d7;
  color: #c53030;
}

.progress-bar-container {
  flex: 1;
  position: relative;
  height: 1.5rem;
  background: var(--bg-hover);
  border-radius: 0.375rem;
  overflow: hidden;
  min-width: 12.5rem;
}

.progress-bar {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: var(--color-primary);
  transition: width 0.3s ease;
}

.progress-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-color);
  z-index: 1;
}

.button-group {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.filter-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0.5rem 0;
}

.preset-btn {
  background: var(--bg-hover);
  color: var(--text-color);
  border: 1px solid var(--border-color);
  border-radius: 0.5rem;
  padding: 0.4rem 0.6rem;
  cursor: pointer;
  font-size: 0.85rem;
  transition: all 0.2s ease;
}

.preset-btn:hover {
  border-color: var(--color-primary);
}

.preset-btn.active {
  background: var(--color-primary);
  color: #fff;
  border-color: var(--color-primary);
}

.preset-desc {
  margin-top: 0.5rem;
  padding: 0.5rem;
  background: var(--bg-elevated);
  border-radius: 0.4rem;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.preset-desc p {
  margin: 0 0 0.25rem;
}

.preset-desc small {
  color: var(--text-color);
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
}
</style>
