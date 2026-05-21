<template>
  <div v-if="visible && !authenticated" class="settings-backdrop" @click.self="close">
    <div class="password-dialog" role="dialog" aria-modal="true">
      <div class="settings-header">
        <div class="title">请输入管理员密码</div>
        <button class="close-btn" title="关闭" @click="close">✕</button>
      </div>
      <div class="password-body">
        <input
          ref="passwordInputRef"
          v-model="passwordInput"
          type="password"
          class="password-input"
          placeholder="请输入密码"
          @keyup.enter="verifyPassword"
        />
        <p v-if="passwordError" class="password-error">密码错误，请重试</p>
        <button class="primary-btn password-confirm-btn" @click="verifyPassword">确认</button>
      </div>
    </div>
  </div>

  <div v-if="visible && authenticated" class="settings-backdrop" @click.self="close">
    <div class="settings-dialog" role="dialog" aria-modal="true">
      <div class="settings-header">
        <div class="title">设置中心</div>
        <div class="header-actions">
          <button class="config-btn" title="导出配置" @click="handleExportConfig">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>导出</span>
          </button>
          <button class="config-btn" title="导入配置" @click="triggerImportConfig">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>导入</span>
          </button>
          <input
            ref="fileInputRef"
            type="file"
            accept=".json,application/json"
            style="display: none"
            @change="handleFileImport"
          />
          <button class="lock-btn" title="锁定设置" @click="lockSettings">🔒 锁定</button>
          <button class="close-btn" title="关闭" @click="close">✕</button>
        </div>
      </div>
      <div class="settings-body">
        <aside class="sidebar">
          <button class="nav-item" :class="{ active: activeTab === 'general' }" @click="activeTab = 'general'">
            通用设置
          </button>
          <button class="nav-item" :class="{ active: activeTab === 'admin' }" @click="activeTab = 'admin'">
            管理员调试
          </button>
          <button class="nav-item" :class="{ active: activeTab === 'discovery' }" @click="activeTab = 'discovery'">
            设备发现
          </button>
          <button class="nav-item" :class="{ active: activeTab === 'announcement' }" @click="activeTab = 'announcement'">
            公告配置
          </button>
        </aside>

        <section class="content">
          <div v-if="activeTab === 'general'" class="panel">
            <GeneralSettings />
          </div>

          <div v-else-if="activeTab === 'admin'" class="panel">
            <AdminDebugPanel
              :cameraDebugEnabled="localCameraEnabled"
              @toggle-camera-debug="toggleCameraPreview"
            />
          </div>

          <div v-else-if="activeTab === 'discovery'" class="panel">
            <DeviceDiscoveryPanel />
          </div>

          <div v-else class="panel">
            <AnnouncementSettings />
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Capacitor } from '@capacitor/core'
import { Dialog } from '@capacitor/dialog'
import { nextTick, onMounted, ref, watch } from 'vue'
import { themeManager, getTheme, type Theme } from '@/utils/theme'
import GeneralSettings from './GeneralSettings.vue'
import AdminDebugPanel from './AdminDebugPanel.vue'
import DeviceDiscoveryPanel from './DeviceDiscoveryPanel.vue'
import AnnouncementSettings from './AnnouncementSettings.vue'
import { exportConfig, importConfigFromFile } from '@/utils/configExport'

const ADMIN_PASSWORD = 'lzwc@2025.'

interface Props {
  visible: boolean
  locked?: boolean
  cameraDebugEnabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  locked: false,
  cameraDebugEnabled: false
})

const emit = defineEmits<{
  'update:visible': [value: boolean]
  'toggle-camera-debug': []
  lock: []
}>()

const activeTab = ref<'general' | 'admin' | 'discovery' | 'announcement'>('general')
const theme = ref<Theme>(getTheme())
const authenticated = ref(!props.locked)
const passwordInput = ref('')
const passwordError = ref(false)
const passwordInputRef = ref<HTMLInputElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const localCameraEnabled = ref<boolean>(!!props.cameraDebugEnabled)

const resetAuthState = () => {
  authenticated.value = !props.locked
  passwordInput.value = ''
  passwordError.value = false
}

const verifyPassword = () => {
  if (passwordInput.value === ADMIN_PASSWORD) {
    authenticated.value = true
    passwordError.value = false
    passwordInput.value = ''
    return
  }

  passwordError.value = true
}

const lockSettings = () => {
  emit('lock')
  close()
}

const triggerImportConfig = () => {
  fileInputRef.value?.click()
}

const handleExportConfig = async () => {
  try {
    const target = await exportConfig()
    await showFeedback(`配置已导出：${target}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    await showError(`导出失败：${message}`)
  }
}

const handleFileImport = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  try {
    const count = await importConfigFromFile(file)
    await showFeedback(`配置已导入并应用（${count} 项）`)
    window.setTimeout(() => {
      close()
      window.location.reload()
    }, 800)
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    await showError(`导入失败：${message}`)
  } finally {
    target.value = ''
  }
}

const showFeedback = async (message: string) => {
  try {
    const { Toast } = await import('@capacitor/toast')
    await Toast.show({ text: message })
  } catch {
    console.log(`[Toast] ${message}`)
  }
}

const showError = async (message: string) => {
  if (Capacitor.isNativePlatform()) {
    await Dialog.alert({
      title: '错误',
      message
    })
    return
  }

  window.alert(message)
}

const toggleCameraPreview = () => {
  localCameraEnabled.value = !localCameraEnabled.value
  emit('toggle-camera-debug')
}

const close = () => {
  resetAuthState()
  emit('update:visible', false)
}

watch(
  () => props.cameraDebugEnabled,
  value => {
    localCameraEnabled.value = !!value
  },
  { immediate: true }
)

watch(
  () => props.visible,
  visible => {
    if (!visible) {
      resetAuthState()
      return
    }

    activeTab.value = 'general'
    theme.value = getTheme()
    resetAuthState()

    if (props.locked) {
      nextTick(() => {
        passwordInputRef.value?.focus()
      })
    }
  }
)

watch(
  () => props.locked,
  locked => {
    if (!props.visible) {
      authenticated.value = !locked
    }
  }
)

watch(
  () => theme.value,
  value => {
    themeManager.setTheme(value)
  }
)

onMounted(() => {
  theme.value = getTheme()
})
</script>

<style scoped>
.settings-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.settings-dialog {
  background: var(--bg-elevated);
  color: var(--text-color);
  border: 0.0625rem solid var(--border-color);
  border-radius: 0.875rem;
  width: 80vw;
  max-width: 56.25rem;
  height: 45vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-heavy);
  font-size: 1rem;
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 0.875rem;
  border-bottom: 0.0625rem solid var(--border-color);
}

.title {
  font-weight: 600;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.config-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  background: transparent;
  color: var(--text-color);
  border: 0.0625rem solid var(--border-color);
  border-radius: 0.375rem;
  padding: 0.35rem 0.6rem;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.config-btn:hover {
  background: var(--bg-hover);
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.lock-btn {
  background: transparent;
  border: 0.0625rem solid var(--border-color);
  color: inherit;
  cursor: pointer;
  font-size: 0.8rem;
  padding: 0.375rem 0.625rem;
  border-radius: 0.375rem;
  transition: background-color 0.2s ease;
}

.lock-btn:hover {
  background: var(--bg-hover);
}

.close-btn {
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 1rem;
}

.settings-body {
  display: grid;
  grid-template-columns: 24% 1fr;
  gap: 0;
  min-height: 26.25rem;
  flex: 1;
  overflow: hidden;
}

.sidebar {
  border-right: 0.0625rem solid var(--border-color);
  padding: 0.625rem;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  overflow: auto;
}

.nav-item {
  font-size: 0.9rem;
  text-align: left;
  width: 100%;
  background: transparent;
  color: inherit;
  border: 0.0625rem solid transparent;
  padding: 0.625rem 0.75rem;
  border-radius: 0.5rem;
  cursor: pointer;
}

.nav-item.active,
.nav-item:hover {
  background: var(--bg-hover);
  font-weight: 600;
  color: var(--color-primary);
}

.content {
  padding: 0.875rem;
  overflow: auto;
}

.primary-btn {
  background: var(--color-primary);
  color: #fff;
  border: none;
  border-radius: 0.5rem;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
}

.password-dialog {
  background: var(--bg-elevated);
  color: var(--text-color);
  border: 0.0625rem solid var(--border-color);
  border-radius: 0.875rem;
  width: 24rem;
  max-width: 90vw;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-heavy);
}

.password-body {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.password-input {
  width: 100%;
  padding: 0.625rem 0.75rem;
  border: 0.0625rem solid var(--border-color);
  border-radius: 0.5rem;
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 0.9rem;
  outline: none;
  box-sizing: border-box;
}

.password-input:focus {
  border-color: var(--color-primary);
}

.password-error {
  color: #c53030;
  font-size: 0.8rem;
  margin: 0;
}

.password-confirm-btn {
  align-self: flex-end;
}
</style>
