<template>
  <div v-if="showSettingsButton" ref="rootRef" class="action-menu">
    <button
      class="fab"
      :class="{ active: settingsLocked }"
      :title="settingsLocked ? '设置中心已上锁' : '设置中心未上锁'"
      @click="handleLockToggle"
    >
      <span>{{ settingsLocked ? '🔒' : '🔓' }}</span>
    </button>

    <button class="fab" title="打开设置" @click="openDialog">
      <span>⚙️</span>
    </button>

    <!-- 密码验证弹窗 -->
    <div v-if="showPasswordDialog" class="settings-backdrop" @click.self="showPasswordDialog = false">
      <div class="password-dialog" role="dialog" aria-modal="true">
        <div class="settings-header">
          <div class="title">请输入管理员密码</div>
          <button class="close-btn" title="关闭" @click="showPasswordDialog = false">✕</button>
        </div>
        <div class="password-body">
          <input
            ref="passwordInputRef"
            v-model="passwordInput"
            type="password"
            class="password-input"
            placeholder="请输入密码"
            @keyup.enter="verifyAndUnlock"
          />
          <p v-if="passwordError" class="password-error">密码错误，请重试</p>
          <button class="primary-btn password-confirm-btn" @click="verifyAndUnlock">确认</button>
        </div>
      </div>
    </div>

    <SettingsDialog
      v-model:visible="showDialog"
      :cameraDebugEnabled="cameraDebugEnabled"
      :locked="settingsLocked"
      @toggle-camera-debug="emit('toggle-camera-debug')"
      @lock="handleLock"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import SettingsDialog from '@/components/settings/SettingsDialog.vue'
import { useAppConfigStore } from '@/stores/appConfig'

const ADMIN_PASSWORD = 'lzwc@2025.'

const emit = defineEmits<{
  'toggle-camera-debug': []
}>()

defineProps<{ cameraDebugEnabled: boolean }>()

const appConfigStore = useAppConfigStore()
const rootRef = ref<HTMLElement | null>(null)
const showDialog = ref(false)
const settingsLocked = ref(false)

const showPasswordDialog = ref(false)
const passwordInput = ref('')
const passwordError = ref(false)
const passwordInputRef = ref<HTMLInputElement | null>(null)
const pendingUnlock = ref(false)

const showSettingsButton = computed(() => appConfigStore.showSettingsButton)

const openDialog = () => {
  showDialog.value = true
}

const handleLockToggle = () => {
  if (!settingsLocked.value) {
    // 未锁 -> 直接上锁
    settingsLocked.value = true
  } else {
    // 已锁 -> 需要密码才能解
    pendingUnlock.value = true
    passwordInput.value = ''
    passwordError.value = false
    showPasswordDialog.value = true
    nextTick(() => {
      passwordInputRef.value?.focus()
    })
  }
}

const verifyAndUnlock = () => {
  if (passwordInput.value === ADMIN_PASSWORD) {
    settingsLocked.value = false
    showPasswordDialog.value = false
    passwordInput.value = ''
    passwordError.value = false
  } else {
    passwordError.value = true
  }
}

const handleLock = () => {
  settingsLocked.value = true
}

watch(showPasswordDialog, visible => {
  if (visible) {
    nextTick(() => {
      passwordInputRef.value?.focus()
    })
  }
})
</script>

<style scoped>
.action-menu {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.fab {
  background: var(--bg-elevated);
  color: var(--text-color);
  width: 2rem;
  height: 2rem;
  border: none;
  border-radius: 0.4rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: var(--shadow-medium);
  transition: transform 0.2s ease, background-color 0.2s ease, color 0.2s ease;
}

.fab:hover {
  transform: scale(1.05);
}

.fab.active {
  background: var(--color-primary);
  color: #fff;
}

.settings-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
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

.close-btn {
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 1rem;
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
