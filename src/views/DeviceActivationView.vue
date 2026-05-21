<template>
  <div class="device-activation-page">
    <div class="activation-container">
      <!-- 页面头部 -->
      <div class="page-header">
        <h1 class="page-title">设备激活</h1>
        <p class="page-subtitle">请输入激活信息来激活您的设备</p>
      </div>

      <!-- 激活表单 -->
      <div class="activation-form">
        <div class="form-group">
          <label for="serverIp" class="form-label">服务器IP地址</label>
          <input
            id="serverIp"
            v-model="formData.serverIp"
            type="text"
            class="form-input"
            placeholder="例如: 192.168.1.100"
            :disabled="isActivating"
            @keyup.enter="handleActivate"
          />
        </div>

        <div class="form-group">
          <label for="activationCode" class="form-label">激活码</label>
          <input
            id="activationCode"
            v-model="formData.activationCode"
            type="text"
            class="form-input"
            placeholder="请输入激活码"
            :disabled="isActivating"
            @keyup.enter="handleActivate"
          />
        </div>

        <div class="form-group">
          <label for="deviceName" class="form-label">设备名称</label>
          <input
            id="deviceName"
            v-model="formData.deviceName"
            type="text"
            class="form-input"
            placeholder="例如: 接待终端01"
            :disabled="isActivating"
            @keyup.enter="handleActivate"
          />
        </div>

        <div class="form-group">
          <label for="deviceTypeName" class="form-label">设备类型</label>
          <select
            id="deviceTypeName"
            v-model="formData.deviceTypeName"
            class="form-input"
            :disabled="isActivating"
          >
            <option value="大屏">大屏</option>
            <option value="机器人">机器人</option>
            <option value="轮足机器人">轮足机器人</option>
          </select>
        </div>

        <button
          @click="handleActivate"
          :disabled="!isFormValid || isActivating || hasSubmitted"
          class="activate-btn"
        >
          <span v-if="isActivating" class="loading-spinner"></span>
          {{ isActivating ? '激活中...' : '激活设备' }}
        </button>

        <!-- 错误信息 -->
        <div v-if="activationError" class="error-message">
          {{ activationError }}
        </div>
      </div>

      <!-- 激活成功状态 -->
      <div v-if="deviceStore.isActivated" class="activation-success">
        <div class="success-icon">✓</div>
        <h2>激活成功</h2>
        <p>设备已成功激活，正在跳转到绑定页面...</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useDeviceStore, DeviceActivationStatus } from '@/stores/device'
import { useConfigStore } from '@/stores/config'
import { useAppConfigStore } from '@/stores/appConfig'
import { useUserStore } from '@/stores/user'
import { Device } from '@capacitor/device'
import { DeviceApi, UserApi } from '@/server'

// Router
const router = useRouter()

// Store
const deviceStore = useDeviceStore()
const configStore = useConfigStore()
const appConfigStore = useAppConfigStore()
const userStore = useUserStore()

// 表单数据
const formData = ref({
  serverIp: '',
  activationCode: '',
  deviceName: '',
  deviceTypeName: '大屏'
})

// 响应式数据
const isActivating = ref(false)
const activationError = ref('')
const hasSubmitted = ref(false) // 防重复上报

// 计算属性
const isFormValid = computed(() => {
  return formData.value.serverIp.trim() !== '' &&
         formData.value.activationCode.trim() !== '' &&
         formData.value.deviceName.trim() !== ''
})

// 激活设备
const handleActivate = async () => {
  // 多重防抖：isActivating + hasSubmitted + isActivated
  if (!isFormValid.value || isActivating.value || hasSubmitted.value || deviceStore.isActivated) {
    if (!deviceStore.isActivated) {
      activationError.value = '请填写完整的激活信息'
    }
    return
  }

  try {
    isActivating.value = true
    hasSubmitted.value = true
    activationError.value = ''

    // 生成设备ID
    const deviceId = await generateDeviceId()
    console.log('🚀 生成的设备ID:', deviceId)

    // 构建设备信息
    const deviceInfo = {
      deviceId: deviceId,
      deviceName: formData.value.deviceName,
      deviceTypeName: formData.value.deviceTypeName,
      serverIp: formData.value.serverIp,
      activationCode: formData.value.activationCode
    }

    console.log('🚀 开始设备激活流程:', {
      deviceInfo,
      formData: formData.value,
      deviceId: deviceInfo.deviceId,
      deviceName: deviceInfo.deviceName,
      deviceTypeName: deviceInfo.deviceTypeName,
      serverIp: deviceInfo.serverIp,
      activationCode: deviceInfo.activationCode
    })

    // 先设置服务器IP到配置store，这样API调用就能获取到正确的服务器地址
    configStore.setServerIp(formData.value.serverIp)

    // 执行设备激活流程
    console.log('🚀 开始设备激活流程...')
    const deviceConfig = await DeviceApi.activateDevice(deviceInfo)

    // 保存到store
    deviceStore.setState.deviceInfo(deviceInfo)
    deviceStore.setState.deviceConfig(deviceConfig)
    deviceStore.setState.activationStatus(DeviceActivationStatus.ACTIVATED) // 上报成功，设备已激活

    // 更新全局配置
    configStore.updateFromDeviceConfig(deviceConfig)

    console.log('✅ 设备上报成功:', deviceConfig)

    // 尝试获取设备配置（如果已有 deviceParams）
    try {
      const deviceInfoResponse = await DeviceApi.getDeviceInfo(deviceConfig.serverId)
      if (deviceInfoResponse.deviceParams) {
        console.log('🔧 [DeviceActivation] 获取到设备配置，开始更新...')
        
        // 解析 deviceParams（可能是 JSON 字符串）
        let deviceParams: any = deviceInfoResponse.deviceParams
        if (typeof deviceParams === 'string') {
          try {
            deviceParams = JSON.parse(deviceParams)
            console.log('✅ [DeviceActivation] 成功解析 deviceParams JSON 字符串')
          } catch (error) {
            console.error('❌ [DeviceActivation] 解析 deviceParams JSON 失败:', error)
            throw error
          }
        }
        
        appConfigStore.setConfig(deviceParams as any)
        
        // 检查配置中是否有静默登录凭据，如果有则执行静默登录
        if (deviceParams.silentLoginUsername && deviceParams.silentLoginPassword) {
          try {
            console.log('🔐 [DeviceActivation] 检测到配置中的静默登录凭据，开始静默登录...')
            const userInfo = await UserApi.silentLogin({
              userName: deviceParams.silentLoginUsername,
              password: deviceParams.silentLoginPassword
            })

            // 将用户信息存储到store
            userStore.setSilentLoginUser({
              userId: userInfo.userId,
              nickName: userInfo.nickName || '用户',
              userType: userInfo.userType || '员工',
              receptionLocation: '大屏',
              passStatus: '1'
            })

            // 将静默登录凭据存储到configStore中
            configStore.setCredentials(
              deviceParams.silentLoginUsername,
              deviceParams.silentLoginPassword
            )

            console.log('✅ [DeviceActivation] 静默登录成功:', userInfo)
            console.log('✅ [DeviceActivation] 静默登录凭据已保存到配置中')
          } catch (error) {
            console.error('❌ [DeviceActivation] 静默登录失败:', error)
            // 静默登录失败不影响激活流程，只记录错误
            console.warn('⚠️ [DeviceActivation] 静默登录失败，但设备激活已成功，将继续流程')
          }
        } else {
          console.log('ℹ️ [DeviceActivation] 配置中未包含静默登录凭据，跳过静默登录')
        }
        
        console.log('✅ [DeviceActivation] 设备配置已更新')
      }
    } catch (configError) {
      console.warn('⚠️ [DeviceActivation] 获取设备配置失败，将在绑定后重试:', configError)
    }

    // 跳转到绑定页面
    router.push('/binding-wait')

  } catch (error) {
    console.error('设备激活失败:', error)
    console.error('设备激活失败详情:', {
      errorType: typeof error,
      errorName: error instanceof Error ? error.name : 'Unknown',
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined
    })
    activationError.value = error instanceof Error ? error.message : '激活失败，请重试'
    hasSubmitted.value = false // 失败时允许重试
  } finally {
    isActivating.value = false
  }
}

// 页面初始化
onMounted(async () => {
  // 如果已经激活，直接跳转到绑定页面
  if (deviceStore.isActivated) {
    router.push('/binding-wait')
    return
  }

  // 获取设备信息并设置默认设备名称
  try {
    const deviceInfo = await Device.getInfo()
    
    // 检查是否是Android平台
    if (deviceInfo.platform === 'android') {
      // 在Android上直接使用设备名称
      formData.value.deviceName = deviceInfo.name || `Android设备_${Date.now()}`
    } else {
      // 如果不是Android或获取失败，使用备用方案
      formData.value.deviceName = `设备_${Date.now()}`
    }
  } catch (error) {
    console.error('获取设备信息失败:', error)
    formData.value.deviceName = `设备_${Date.now()}`
  }
})

// 生成设备ID
const generateDeviceId = async (): Promise<string> => {
  try {
    // 使用Device.getId()获取设备唯一标识
    const idInfo = await Device.getId()
    if (idInfo.identifier) {
      return idInfo.identifier
    }
    
    // 如果获取失败，使用备用方案
    console.warn('获取设备ID失败，使用备用ID')
    return `DEVICE_${Date.now().toString(36).toUpperCase()}`
  } catch (error) {
    console.error('获取设备信息失败:', error)
    return `DEVICE_${Date.now().toString(36).toUpperCase()}`
  }
}
</script>

<style scoped>
.device-activation-page {
  min-height: 100vh;
  width: 100vw;
  display: flex;
  flex-direction: column;
  background: var(--bg-layout);
  overflow-y: auto;
}

.activation-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  max-width: 1200px;
  width: 100%;
  margin: 0 auto;
  padding: 3rem 2rem;
}

.page-header {
  text-align: center;
  margin-bottom: 3rem;
  padding-top: 2rem;
}

.page-title {
  font-size: 3rem;
  font-weight: 700;
  color: var(--text-color);
  margin: 0 0 1rem;
  text-shadow: var(--title-shadow);
}

.page-subtitle {
  color: var(--text-secondary);
  font-size: 1.25rem;
  margin: 0;
}

.activation-form {
  background: var(--bg-elevated);
  border-radius: 1.5rem;
  padding: 3rem;
  margin: 0 auto;
  max-width: 800px;
  width: 100%;
}

.form-group {
  margin-bottom: 2rem;
}

.form-label {
  display: block;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 0.75rem;
  font-size: 1.1rem;
}

.form-input {
  width: 100%;
  padding: 1rem 1.25rem;
  border: 2px solid var(--border-color);
  border-radius: 0.75rem;
  font-size: 1.1rem;
  transition: all 0.3s;
  background: var(--bg-secondary);
  color: var(--text-color);
}

.form-input:focus {
  outline: none;
  border-color: var(--primary-color);
  background: var(--bg-elevated);
  box-shadow: var(--shadow-focus);
}

.form-input:disabled {
  background-color: var(--bg-disabled);
  cursor: not-allowed;
  opacity: 0.6;
}

.form-input select {
  appearance: none;
  background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6,9 12,15 18,9'%3e%3c/polyline%3e%3c/svg%3e");
  background-repeat: no-repeat;
  background-position: right 0.7rem center;
  background-size: 1em;
  padding-right: 2.5rem;
}

.activate-btn {
  width: 100%;
  padding: 1.25rem 2rem;
  background: var(--primary-gradient);
  color: var(--text-inverse);
  border: none;
  border-radius: 0.75rem;
  font-size: 1.25rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  margin-top: 1rem;
  box-shadow: var(--shadow-medium);
}

.activate-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: var(--shadow-heavy);
}

.activate-btn:active:not(:disabled) {
  transform: translateY(0);
}

.activate-btn:disabled {
  background: var(--bg-disabled);
  color: var(--text-disabled);
  cursor: not-allowed;
  box-shadow: none;
  transform: none;
}

.loading-spinner {
  width: 1.25rem;
  height: 1.25rem;
  border: 2px solid transparent;
  border-top: 2px solid currentColor;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.error-message {
  color: var(--error-color);
  background: var(--bg-elevated);
  border: 2px solid var(--border-error);
  border-radius: 0.75rem;
  padding: 1rem;
  margin-top: 1.5rem;
  text-align: center;
  font-size: 1rem;
  font-weight: 500;
}

.activation-success {
  text-align: center;
  padding: 3rem 0;
  background: var(--bg-elevated);
  border-radius: 1.5rem;
  margin: 2rem auto;
  max-width: 600px;
  width: 100%;
}

.success-icon {
  font-size: 5rem;
  color: var(--success-color);
  margin-bottom: 1.5rem;
  animation: successPop 0.5s ease-out;
}

.activation-success h2 {
  color: var(--text-color);
  font-size: 2rem;
  margin: 0 0 1rem;
  font-weight: 700;
}

.activation-success p {
  color: var(--text-secondary);
  font-size: 1.1rem;
  margin: 0;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@keyframes successPop {
  0% {
    transform: scale(0);
    opacity: 0;
  }
  50% {
    transform: scale(1.2);
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

@media (max-width: 768px) {
  .activation-container {
    padding: 2rem 1rem;
  }

  .page-header {
    margin-bottom: 2rem;
    padding-top: 1rem;
  }
  
  .page-title {
    font-size: 2rem;
  }

  .page-subtitle {
    font-size: 1rem;
  }

  .activation-form {
    padding: 2rem 1.5rem;
  }

  .form-label {
    font-size: 1rem;
  }

  .form-input {
    padding: 0.875rem 1rem;
    font-size: 1rem;
  }

  .activate-btn {
    padding: 1rem 1.5rem;
    font-size: 1.1rem;
  }

  .activation-success h2 {
    font-size: 1.5rem;
  }

  .success-icon {
    font-size: 4rem;
  }
}

@media (max-width: 480px) {
  .page-title {
    font-size: 1.75rem;
  }

  .activation-form {
    padding: 1.5rem 1rem;
  }

  .form-group {
    margin-bottom: 1.5rem;
  }
}
</style>
