<template>
  <div v-if="visible" class="update-dialog-backdrop" @click.self="handleClose">
    <div class="update-dialog" role="dialog" aria-modal="true">
      <!-- 关闭按钮 -->
      <button class="close-btn" @click="handleClose" aria-label="关闭">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

      <!-- 弹窗头部 -->
      <div class="dialog-header">
        <div class="dialog-icon-wrapper">
          <div class="dialog-icon">📤</div>
        </div>
        <div class="dialog-title">发现新版本</div>
        <!-- 版本信息 -->
        <div class="version-info">
          <div class="version-section">
            <div class="version-label">当前版本</div>
            <div class="version-value">{{ currentVersion || 'N/A' }}</div>
          </div>
          <div class="version-divider"></div>
          <div class="version-section">
            <div class="version-label">新版本</div>
            <div class="version-value new">{{ newVersion }}</div>
          </div>
        </div>
        <!-- 更新说明 -->
        <div v-if="updateDescription" class="update-description">
          {{ updateDescription }}
        </div>
      </div>

      <!-- 弹窗内容 -->
      <div class="dialog-body">

        <!-- 更新状态 -->
        <div v-if="isUpdating" class="update-status">
          <!-- 检测中 -->
          <div v-if="isChecking" class="status-item">
            <div class="status-icon checking">⏳</div>
            <div class="status-text">正在检查更新...</div>
          </div>

          <!-- 下载中 -->
          <div v-if="isDownloading" class="status-item">
            <div class="status-icon downloading">📥</div>
            <div class="status-content">
              <div class="status-text">正在下载更新...</div>
              <div class="progress-container">
                <div class="progress-bar">
                  <div 
                    class="progress-fill" 
                    :style="{ width: `${downloadProgress}%` }"
                  ></div>
                </div>
                <div class="progress-text">{{ downloadProgress }}%</div>
              </div>
            </div>
          </div>

          <!-- 安装中 -->
          <div v-if="isInstalling" class="status-item">
            <div class="status-icon installing">📦</div>
            <div class="status-text">正在安装更新...</div>
          </div>

          <!-- 更新完成 -->
          <div v-if="updateSuccess" class="status-item success">
            <div class="status-icon">✅</div>
            <div class="status-text">更新完成，请重启应用</div>
          </div>

          <!-- 更新失败 -->
          <div v-if="updateError" class="status-item error">
            <div class="status-icon">❌</div>
            <div class="status-content">
              <div class="status-text">更新失败</div>
              <div class="error-message">{{ updateError }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 弹窗底部按钮 -->
      <div class="dialog-footer">
        <button 
          v-if="!isUpdating && !updateSuccess"
          class="btn btn-update" 
          @click="handleUpdate"
          :disabled="isChecking"
        >
          立即更新
        </button>
        <button 
          v-if="updateError"
          class="btn btn-retry" 
          @click="handleRetry"
        >
          重试
        </button>
        <button 
          v-if="updateSuccess"
          class="btn btn-restart" 
          @click="handleRestart"
        >
          重启应用
        </button>
        <button 
          v-if="!isUpdating && !updateSuccess"
          class="btn btn-cancel" 
          @click="handleClose"
        >
          稍后更新
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useUpdateStore } from '@/stores/update'
import { useUpdate } from '@/hooks/update'
import { storeToRefs } from 'pinia'
import type { FirmwareCheckResponse } from '@/server/api/versionApi'
import { getFirmwareDownloadURL } from '@/server/api/versionApi'

interface Props {
  visible: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  close: []
}>()

const updateStore = useUpdateStore()
const { updateInfo, currentVersion: storeCurrentVersion } = storeToRefs(updateStore)

// 更新相关状态
const {
  state: updateState,
  getCurrentVersion,
  executeFullUpdate
} = useUpdate({
  onCheckStart: () => {
    console.log('🔍 [UpdateDialog] 开始检查更新')
  },
  onCheckComplete: (hasUpdate) => {
    console.log('✅ [UpdateDialog] 检查完成:', hasUpdate)
  },
  onDownloadStart: () => {
    console.log('📥 [UpdateDialog] 开始下载')
  },
  onDownloadProgress: (progress) => {
    console.log(`📥 [UpdateDialog] 下载进度: ${progress}%`)
  },
  onDownloadComplete: () => {
    console.log('✅ [UpdateDialog] 下载完成')
  },
  onInstallStart: () => {
    console.log('📦 [UpdateDialog] 开始安装')
  },
  onUpdateSuccess: () => {
    console.log('✅ [UpdateDialog] 更新成功')
  },
  onUpdateError: (error) => {
    console.error('❌ [UpdateDialog] 更新失败:', error)
  }
})

// 计算属性
const currentVersion = computed(() => {
  const version = storeCurrentVersion.value || ''
  return version ? `V ${version}` : 'N/A'
})
const newVersion = computed(() => {
  const version = updateInfo.value?.version || ''
  return version ? `V ${version}` : ''
})
const updateDescription = computed(() => updateInfo.value?.description || '')

const isChecking = computed(() => updateState.isChecking)
const isDownloading = computed(() => updateState.isDownloading)
const isInstalling = computed(() => updateState.isInstalling)
const downloadProgress = computed(() => updateState.downloadProgress)
const updateError = computed(() => updateState.error)
const updateSuccess = computed(() => !isChecking.value && !isDownloading.value && !isInstalling.value && !updateError.value && downloadProgress.value === 100)

const isUpdating = computed(() => isChecking.value || isDownloading.value || isInstalling.value || updateSuccess.value || !!updateError.value)

// 关闭弹窗
const handleClose = () => {
  if (!isUpdating.value) {
    updateStore.hideUpdateDialog()
    emit('close')
  }
}

// 开始更新
const handleUpdate = async () => {
  if (!updateInfo.value) {
    console.error('❌ [UpdateDialog] 没有更新信息')
    return
  }

  try {
    const version = updateInfo.value.version
    
    // 获取下载地址
    const res = await getFirmwareDownloadURL(version)
    if ((res.code !== 200 && res.code !== 1000) || !res.data) {
      throw new Error(res.message || res.msg || '获取下载地址失败')
    }

    const downloadUrl = res.data
    
    // 执行更新
    await executeFullUpdate(downloadUrl, version)
  } catch (error: any) {
    console.error('❌ [UpdateDialog] 更新失败:', error)
  }
}

// 重试更新
const handleRetry = () => {
  handleUpdate()
}

// 重启应用
const handleRestart = () => {
  window.location.reload()
}

// 监听弹窗显示，获取当前版本
watch(() => props.visible, async (newVal) => {
  if (newVal && !storeCurrentVersion.value) {
    try {
      const version = await getCurrentVersion()
      updateStore.setCurrentVersion(version)
    } catch (error) {
      console.error('❌ [UpdateDialog] 获取当前版本失败:', error)
    }
  }
}, { immediate: true })
</script>

<style scoped>
.update-dialog-backdrop {
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

.update-dialog {
  position: relative;
  background: var(--bg-elevated, #1e1e1e);
  color: var(--text-color, #ffffff);
  border: 0.0625rem solid var(--border-color, #333333);
  border-radius: 1rem;
  width: 90vw;
  max-width: 24rem;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  animation: slideUp 0.3s ease-out;
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

.close-btn {
  position: absolute;
  top: 1rem;
  right: 1rem;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  color: var(--text-color-secondary, rgba(255, 255, 255, 0.6));
  transition: all 0.2s ease;
  z-index: 1;
}

.close-btn:hover {
  background: var(--bg-secondary, rgba(255, 255, 255, 0.1));
  color: var(--text-color, #ffffff);
}

.dialog-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 1.5rem 1.5rem 1rem;
}

.dialog-icon-wrapper {
  width: 3.5rem;
  height: 3.5rem;
  background: var(--bg-container);
  border-radius: 0.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dialog-icon {
  font-size: 1.75rem;
  line-height: 1;
}

.dialog-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-color, #ffffff);
  text-align: center;
}

.dialog-body {
  padding: 0 1.5rem 1rem;
  background: var(--bg-elevated, #1e1e1e);
}

.version-info {
  display: flex;
  align-items: center;
  gap: 0;
  margin-top: 0.5rem;
  padding: 0;
  background: transparent;
  border-radius: 0.5rem;
}

.version-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.6rem;
}

.version-label {
  font-size: 0.75rem;
  color: var(--primary-color);
}

.version-value {
  font-size: 0.9375rem;
  color: var(--text-color);
}

.version-value.new {
  color: var(--text-color);
}

.version-divider {
  width: 2px;
  height: 2rem;
  background: var(--primary-color);
  margin: 0 0.5rem;
}

.update-description {
  margin-top: 0.5rem;
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--text-color);
  text-align: center;
  white-space: pre-wrap;
  word-break: break-word;
  padding: 0 0.5rem;
}

.update-status {
  margin-top: 1.5rem;
}

.status-item {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.75rem;
  background: var(--bg-secondary, rgba(255, 255, 255, 0.05));
  border-radius: 0.5rem;
}

.status-item.success {
  background: rgba(82, 196, 26, 0.15);
}

.status-item.error {
  background: rgba(255, 77, 79, 0.15);
}

.status-icon {
  font-size: 1.5rem;
  line-height: 1;
  flex-shrink: 0;
}

.status-icon.checking {
  animation: spin 1s linear infinite;
}

.status-icon.downloading {
  animation: bounce 1s ease-in-out infinite;
}

.status-icon.installing {
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes bounce {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-4px);
  }
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.status-content {
  flex: 1;
  min-width: 0;
}

.status-text {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-color, #ffffff);
  margin-bottom: 0.5rem;
}

.progress-container {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.progress-bar {
  flex: 1;
  height: 8px;
  background: var(--bg-tertiary, rgba(255, 255, 255, 0.1));
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--primary-color), var(--primary-color-dark));
  border-radius: 4px;
  transition: width 0.3s ease;
  animation: progressShine 2s ease-in-out infinite;
}

@keyframes progressShine {
  0% {
    background-position: -100% 0;
  }
  100% {
    background-position: 100% 0;
  }
}

.progress-text {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--primary-color);
  min-width: 45px;
  text-align: right;
}

.error-message {
  font-size: 0.875rem;
  color: var(--error-color, #ff4d4f);
  margin-top: 0.25rem;
}

.dialog-footer {
  display: flex;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  border-top: 0.0625rem solid var(--border-color, #333333);
  background: var(--bg-elevated, #1e1e1e);
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

.btn-update {
  background: var(--primary-color);
  color: #ffffff;
}

.btn-update:hover:not(:disabled) {
  background: var(--primary-color-dark);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px color-mix(in srgb, var(--primary-color) 40%, transparent);
}

.btn-retry {
  background: var(--primary-color);
  color: #ffffff;
}

.btn-retry:hover {
  background: var(--primary-color-dark);
}

.btn-restart {
  background: var(--success-color, #52c41a);
  color: #ffffff;
}

.btn-restart:hover {
  background: var(--success-color-dark, #389e0d);
}

.btn-cancel {
  background: var(--bg-secondary, rgba(255, 255, 255, 0.1));
  color: var(--text-color, #ffffff);
}

.btn-cancel:hover:not(:disabled) {
  background: var(--bg-tertiary, rgba(255, 255, 255, 0.2));
}

</style>

