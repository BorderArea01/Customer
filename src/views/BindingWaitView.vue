<template>
  <div class="binding-wait-page">
    <div class="binding-container">
      <!-- 页面头部 -->
      <div class="page-header">
        <h1 class="page-title">设备绑定</h1>
      </div>

      <!-- 绑定成功状态 -->
      <div v-if="deviceStore.isBound" class="binding-success">
        <div class="success-icon">✓</div>
        <h2>绑定成功</h2>
        <p>数字员工ID: {{ deviceStore.employeeInfo?.employeeId }}</p>
        <p>用户ID: {{ deviceStore.employeeInfo?.userId }}</p>
        <p class="success-message">绑定成功！正在跳转到数字人界面...</p>
      </div>

      <!-- 等待绑定状态 -->
      <div v-else class="waiting-binding">
        <div class="loading-icon">⏳</div>
        <h2>等待绑定</h2>
        <p>设备已激活，等待服务端绑定数字员工</p>
        <p class="device-id">设备ID: {{ deviceStore.deviceConfig?.deviceId }}</p>
        
        <div class="binding-status">
          <div class="status-dot"></div>
          <span>轮询检查绑定状态中...</span>
        </div>
        
        <div class="action-buttons">
          <button @click="handleReActivate" class="small-btn">重新激活</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useDeviceStore } from '@/stores/device'

// Router
const router = useRouter()

// Store
const deviceStore = useDeviceStore()

// 处理重新激活
const handleReActivate = () => {
  deviceStore.resetActivation()
  deviceStore.setState.activationError('')
  router.push('/device-activation')
}

// 监听绑定状态变化
watch(() => deviceStore.isBound, (isBound) => {
  // 确保绑定状态为 true 且 employeeId 存在时才跳转
  if (isBound && deviceStore.employeeInfo?.employeeId) {
    // 绑定成功，延迟跳转到数字人界面
    console.log('🎉 设备绑定成功，跳转到数字人界面...', {
      deviceId: deviceStore.deviceConfig?.deviceId,
      employeeInfo: deviceStore.employeeInfo
    })
    setTimeout(() => {
      router.push('/live2d')
    }, 2000) // 延迟2秒让用户看到成功状态
  }
}, { immediate: true })

// 页面初始化
onMounted(async () => {
  // 检查设备激活状态
  if (!deviceStore.isActivated) {
    console.log('设备未激活，跳转到激活页面')
    router.push('/device-activation')
    return
  }

  // 如果已经绑定且 employeeId 存在，直接跳转到数字人界面
  if (deviceStore.isBound && deviceStore.employeeInfo?.employeeId) {
    console.log('设备已绑定，跳转到数字人界面', {
      employeeId: deviceStore.employeeInfo.employeeId
    })
    router.push('/live2d')
    return
  }

  // 开始轮询检查设备绑定状态
  console.log('🔗 开始轮询检查设备绑定状态...')
  console.log('🔍 [BindingWait] 当前状态:', {
    isPollingBinding: deviceStore.isPollingBinding,
    hasServerId: !!deviceStore.deviceConfig?.serverId,
    isBound: deviceStore.isBound
  })
  
  try {
    // 如果状态不一致，先停止再启动
    if (deviceStore.isPollingBinding && !deviceStore.deviceConfig?.serverId) {
      console.log('⚠️ [BindingWait] 检测到异常状态，先停止轮询')
      deviceStore.stopBindingPolling()
    }
    
    deviceStore.startBindingPolling()
    console.log('✅ 轮询已启动')
  } catch (error) {
    console.error('❌ 启动轮询失败:', error)
    return
  }
})

// 页面卸载时停止轮询
onBeforeUnmount(() => {
  deviceStore.stopBindingPolling()
})
</script>

<style scoped>
.binding-wait-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 2rem;
}

.binding-container {
  background: white;
  border-radius: 1rem;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
  padding: 3rem;
  max-width: 500px;
  width: 100%;
}

.page-header {
  text-align: center;
  margin-bottom: 2rem;
}

.page-title {
  font-size: 2rem;
  font-weight: 700;
  color: #1f2937;
  margin: 0;
}

/* 绑定成功状态 */
.binding-success {
  text-align: center;
  padding: 2rem 0;
}

.success-icon {
  font-size: 4rem;
  color: #10b981;
  margin-bottom: 1rem;
}

.binding-success h2 {
  margin: 0 0 1rem;
  color: #1f2937;
  font-size: 1.5rem;
}

.binding-success p {
  margin: 0.5rem 0;
  color: #6b7280;
}

.success-message {
  color: #10b981 !important;
  font-weight: 500;
}

/* 等待绑定状态 */
.waiting-binding {
  text-align: center;
  padding: 2rem 0;
}

.loading-icon {
  font-size: 3rem;
  color: #f59e0b;
  margin-bottom: 1rem;
  animation: spin 2s linear infinite;
}

.waiting-binding h2 {
  margin: 0 0 1rem;
  color: #1f2937;
  font-size: 1.5rem;
}

.waiting-binding p {
  margin: 0.5rem 0;
  color: #6b7280;
}

.device-id {
  font-family: monospace;
  background: #f3f4f6;
  padding: 0.5rem;
  border-radius: 0.5rem;
  margin: 1rem 0;
}

.binding-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin: 1rem 0;
  color: #6b7280;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #10b981;
  animation: pulse 1s infinite;
}

.action-buttons {
  display: flex;
  justify-content: center;
  margin-top: 1rem;
}

.small-btn {
  padding: 0.5rem 1rem;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  background: #f9fafb;
  color: #6b7280;
  min-width: 100px;
}

.small-btn:hover:not(:disabled) {
  background: #f3f4f6;
  border-color: #9ca3af;
  color: #374151;
}

.small-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@media (max-width: 640px) {
  .binding-container {
    padding: 2rem;
    margin: 1rem;
  }
  
  .page-title {
    font-size: 1.5rem;
  }
}
</style>
