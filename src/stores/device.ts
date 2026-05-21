import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { EmployeeApi, EmployeeServerStatus } from '@/server/api/employeeApi'
import { DeviceApi } from '@/server/api/deviceApi'

// 设备激活状态枚举
export enum DeviceActivationStatus {
  UNACTIVATED = 'unactivated', // 未激活
  REPORTED = 'reported', // 已上报
  ACTIVATED = 'activated' // 已激活
}

// 设备绑定状态枚举
export enum DeviceBindingStatus {
  UNBOUND = 'unbound', // 未绑定
  BINDING = 'binding', // 绑定中
  BOUND = 'bound' // 已绑定
}

// 设备配置接口
export interface DeviceConfig {
  serverId: string
  activationTime: string
  deviceId: string
  serverUrl: string
}

// 设备信息接口
export interface DeviceInfo {
  deviceId: string
  deviceName: string
  deviceTypeName: string
  serverIp: string
  activationCode: string
}

// 数字员工信息接口（合并了绑定信息和状态信息）
export interface EmployeeInfo {
  employeeId: string  // 员工ID
  userId: string      // 用户ID
  serverStatus?: EmployeeServerStatus  // 服务器状态（从API获取）
}

// 常量
const EMPLOYEE_STATUS_CHECK_INTERVAL = 10000 // 10秒
const EMPLOYEE_STATUS_CHECK_TIMEOUT = 20000 // 20秒
const BINDING_POLLING_INTERVAL = 5000 // 5秒轮询一次

export const useDeviceStore = defineStore('device', () => {
  // 状态
  const activationStatus = ref<DeviceActivationStatus>(DeviceActivationStatus.UNACTIVATED)
  const bindingStatus = ref<DeviceBindingStatus>(DeviceBindingStatus.UNBOUND)
  const deviceConfig = ref<DeviceConfig | null>(null)
  const deviceInfo = ref<DeviceInfo | null>(null)
  const employeeInfo = ref<EmployeeInfo | null>(null)
  const isActivating = ref(false)
  const activationError = ref<string>('')
  const showActivationModal = ref(false)
  const showBindingModal = ref(false)
  const employeeStatusTimer = ref<ReturnType<typeof setInterval> | null>(null)
  const isCheckingEmployeeStatus = ref(false)
  const bindingPollingTimer = ref<ReturnType<typeof setInterval> | null>(null)
  const isPollingBinding = ref(false)
  const bindingPollingError = ref<string | null>(null)
  const lastBindingCheckTime = ref<number | null>(null)

  // 计算属性
  const isActivated = computed(() => activationStatus.value === DeviceActivationStatus.ACTIVATED)
  const isReported = computed(() => activationStatus.value === DeviceActivationStatus.REPORTED)
  const needsActivation = computed(() => activationStatus.value === DeviceActivationStatus.UNACTIVATED)
  const isBound = computed(() => bindingStatus.value === DeviceBindingStatus.BOUND)
  const needsBinding = computed(() => 
    bindingStatus.value === DeviceBindingStatus.UNBOUND || 
    bindingStatus.value === DeviceBindingStatus.BINDING
  )
  const canUseApp = computed(() => isActivated.value && isBound.value)
  const isEmployeeRunning = computed(() => 
    employeeInfo.value?.serverStatus === EmployeeServerStatus.RUNNING
  )
  const employeeStatusText = computed(() => 
    employeeInfo.value?.serverStatus 
      ? EmployeeApi.getStatusText(employeeInfo.value.serverStatus)
      : '未知状态'
  )

  // 统一的状态设置方法
  const setState = {
    activationStatus: (status: DeviceActivationStatus) => activationStatus.value = status,
    deviceConfig: (config: DeviceConfig) => deviceConfig.value = config,
    deviceInfo: (info: DeviceInfo) => deviceInfo.value = info,
    activating: (activating: boolean) => isActivating.value = activating,
    activationError: (error: string) => activationError.value = error,
    bindingStatus: (status: DeviceBindingStatus) => bindingStatus.value = status,
    employeeInfo: (info: EmployeeInfo | null) => employeeInfo.value = info
  }

  // 弹窗控制
  const showActivation = () => { showActivationModal.value = true }
  const hideActivation = () => { showActivationModal.value = false }
  const showBinding = () => { showBindingModal.value = true }
  const hideBinding = () => { showBindingModal.value = false }

  // 解绑数字员工
  const unbindEmployee = () => {
    employeeInfo.value = null
    bindingStatus.value = DeviceBindingStatus.UNBOUND
    showBindingModal.value = true
  }

  // 重置激活状态
  const resetActivation = () => {
    activationStatus.value = DeviceActivationStatus.UNACTIVATED
    bindingStatus.value = DeviceBindingStatus.UNBOUND
    deviceConfig.value = null
    deviceInfo.value = null
    employeeInfo.value = null
    isActivating.value = false
    activationError.value = ''
    showActivationModal.value = false
    showBindingModal.value = false
    isCheckingEmployeeStatus.value = false
    stopEmployeeStatusMonitoring()
    stopBindingPolling()
  }

  // 检查员工状态
  const checkEmployeeStatus = async () => {
    if (!employeeInfo.value?.employeeId) {
      console.log('⚠️ [DeviceStore] 检查员工状态跳过: 没有 employeeId')
      return
    }
    
    if (isCheckingEmployeeStatus.value) {
      console.log('⚠️ [DeviceStore] 检查员工状态跳过: 正在检查中')
      return
    }

    const timeoutId = setTimeout(() => {
      isCheckingEmployeeStatus.value = false
    }, EMPLOYEE_STATUS_CHECK_TIMEOUT)

    try {
      isCheckingEmployeeStatus.value = true
      console.log('🔍 [DeviceStore] 开始检查员工状态, employeeId:', employeeInfo.value.employeeId)
      const statusInfo = await EmployeeApi.getEmployeeStatus(employeeInfo.value.employeeId)
      
      // 合并状态信息到 employeeInfo
      employeeInfo.value = {
        ...employeeInfo.value,
        // 更新服务器状态
        serverStatus: statusInfo.serverStatus
      }
      console.log('✅ [DeviceStore] 员工状态更新成功, serverStatus:', statusInfo.serverStatus)
    } catch (error) {
      console.error('❌ [DeviceStore] 员工状态检查失败:', error)
    } finally {
      clearTimeout(timeoutId)
      isCheckingEmployeeStatus.value = false
    }
  }

  // 启动员工状态监控
  const startEmployeeStatusMonitoring = () => {
    if (!employeeInfo.value?.employeeId) {
      console.warn('⚠️ [DeviceStore] 启动员工状态监控失败: 没有 employeeId')
      return
    }
    
    console.log('🚀 [DeviceStore] 启动员工状态监控, employeeId:', employeeInfo.value.employeeId)
    stopEmployeeStatusMonitoring()
    checkEmployeeStatus()
    employeeStatusTimer.value = setInterval(checkEmployeeStatus, EMPLOYEE_STATUS_CHECK_INTERVAL)
    console.log('✅ [DeviceStore] 员工状态监控已启动，每', EMPLOYEE_STATUS_CHECK_INTERVAL / 1000, '秒检查一次')
  }

  // 停止员工状态监控
  const stopEmployeeStatusMonitoring = () => {
    if (employeeStatusTimer.value) {
      clearInterval(employeeStatusTimer.value)
      employeeStatusTimer.value = null
    }
    isCheckingEmployeeStatus.value = false
  }

  // 重置为未激活状态（内部辅助方法）
  const resetToUnactivated = () => {
    setState.activationStatus(DeviceActivationStatus.UNACTIVATED)
    setState.bindingStatus(DeviceBindingStatus.UNBOUND)
  }

  // 检查设备激活状态
  const checkActivationStatus = async () => {
    try {
      if (!deviceConfig.value || !deviceInfo.value || !deviceConfig.value.serverId) {
        resetToUnactivated()
        return
      }

      // 设备上报成功后即为已激活状态
      const hasEmployeeInfo = !!employeeInfo.value?.employeeId

      setState.activationStatus(DeviceActivationStatus.ACTIVATED)
      setState.bindingStatus(
        hasEmployeeInfo 
          ? DeviceBindingStatus.BOUND 
          : DeviceBindingStatus.UNBOUND
      )
    } catch (error) {
      console.error('检查设备激活状态失败:', error)
      resetToUnactivated()
    }
  }

  // 检查设备绑定状态
  const checkBindingStatus = async () => {
    if (!deviceConfig.value?.serverId) {
      console.warn('⚠️ [DeviceStore] 设备未激活，无法检查绑定状态')
      return
    }

    try {
      lastBindingCheckTime.value = Date.now()
      console.log('🔍 [DeviceStore] 轮询检查设备绑定状态...', deviceConfig.value.serverId)

      const deviceInfo = await DeviceApi.getDeviceInfo(deviceConfig.value.serverId)
      
      // 判断设备是否已绑定：需要同时存在 deviceId、deviceParams 和 employeeId
      if (deviceInfo.deviceId && deviceInfo.deviceParams && deviceInfo.employeeId) {
        // 更新员工信息（即使没有 userId 也要设置，只要有 employeeId 即可）
        const employeeInfo = {
          employeeId: deviceInfo.employeeId,
          userId: deviceInfo.userId || ''
        }
        setState.employeeInfo(employeeInfo)
        
        // 设置绑定状态为已绑定
        setState.bindingStatus(DeviceBindingStatus.BOUND)
        
        // 触发绑定成功事件（只要有 employeeId 就触发）
        window.dispatchEvent(new CustomEvent('digital-worker-bound', { 
          detail: { 
            employeeId: deviceInfo.employeeId, 
            userId: deviceInfo.userId || '' 
          } 
        }))
        
        console.log('✅ [DeviceStore] 设备已绑定，deviceId:', deviceInfo.deviceId, 'employeeId:', deviceInfo.employeeId, 'userId:', deviceInfo.userId || '未设置')
        
        // 绑定成功后停止轮询
        stopBindingPolling()
      } else {
        // 如果 deviceId 和 deviceParams 存在但 employeeId 不存在，说明设备已激活但未绑定数字员工
        if (deviceInfo.deviceId && deviceInfo.deviceParams && !deviceInfo.employeeId) {
          console.log('⏳ [DeviceStore] 设备已激活但未绑定数字员工（缺少 employeeId），继续等待...')
          // 确保绑定状态为未绑定，避免误判
          if (bindingStatus.value === DeviceBindingStatus.BOUND) {
            setState.bindingStatus(DeviceBindingStatus.UNBOUND)
          }
        } else {
          console.log('⏳ [DeviceStore] 设备尚未绑定（缺少 deviceId 或 deviceParams），继续等待...')
        }
      }
      
      bindingPollingError.value = null
    } catch (err: any) {
      const errorMessage = err?.message || '查询设备信息失败'
      bindingPollingError.value = errorMessage
      console.error('❌ [DeviceStore] 检查绑定状态失败:', errorMessage)
    }
  }

  // 开始绑定状态轮询
  const startBindingPolling = () => {
    // 如果状态不一致（isPollingBinding 为 true 但定时器不存在），先清理状态
    if (isPollingBinding.value && !bindingPollingTimer.value) {
      console.log('⚠️ [DeviceStore] 检测到状态不一致，清理旧状态')
      isPollingBinding.value = false
    }

    if (isPollingBinding.value) {
      console.log('⚠️ [DeviceStore] 绑定状态轮询已在进行中')
      return
    }

    if (!deviceConfig.value?.serverId) {
      throw new Error('设备未激活，无法开始轮询')
    }

    console.log('🚀 [DeviceStore] 开始轮询检查设备绑定状态...')
    isPollingBinding.value = true
    bindingPollingError.value = null

    // 立即执行一次检查
    checkBindingStatus()

    // 设置定时轮询
    bindingPollingTimer.value = setInterval(() => {
      checkBindingStatus()
    }, BINDING_POLLING_INTERVAL)
    
    console.log('✅ [DeviceStore] 绑定状态轮询已启动，定时器ID:', bindingPollingTimer.value)
  }

  // 停止绑定状态轮询
  const stopBindingPolling = () => {
    if (bindingPollingTimer.value) {
      clearInterval(bindingPollingTimer.value)
      bindingPollingTimer.value = null
    }
    isPollingBinding.value = false
    console.log('🛑 [DeviceStore] 停止绑定状态轮询')
  }

  return {
    // 状态
    activationStatus,
    bindingStatus,
    deviceConfig,
    deviceInfo,
    employeeInfo,
    isActivating,
    activationError,
    showActivationModal,
    showBindingModal,
    isCheckingEmployeeStatus,
    isPollingBinding,
    bindingPollingError,
    lastBindingCheckTime,
    
    // 计算属性
    isActivated,
    isReported,
    needsActivation,
    isBound,
    needsBinding,
    canUseApp,
    isEmployeeRunning,
    employeeStatusText,
    
    // 方法
    setState,
    showActivation,
    hideActivation,
    unbindEmployee,
    showBinding,
    hideBinding,
    resetActivation,
    checkActivationStatus,
    checkEmployeeStatus,
    startEmployeeStatusMonitoring,
    stopEmployeeStatusMonitoring,
    checkBindingStatus,
    startBindingPolling,
    stopBindingPolling
  }
}, {
  persist: true
}) 