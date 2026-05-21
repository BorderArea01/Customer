<script setup lang="ts">
import { RouterView, useRouter } from 'vue-router'
import { onMounted, onBeforeUnmount, watch } from 'vue'
import { themeManager } from '@/utils/theme'
import { useDeviceStore } from '@/stores/device'
import { usePersistentStores } from '@/composables/usePersistentStores'

const router = useRouter()
const deviceStore = useDeviceStore()

// 将核心配置自动备份到 Capacitor Filesystem，卸载重装不丢失
usePersistentStores()

// 全局监听设备绑定状态变化，确保绑定成功后自动跳转
watch(() => deviceStore.isBound, (isBound) => {
  // 如果设备已绑定且 employeeId 存在，且当前在绑定等待页面，则跳转到数字人界面
  if (isBound && deviceStore.employeeInfo?.employeeId) {
    const currentRoute = router.currentRoute.value
    if (currentRoute.name === 'binding-wait') {
      console.log('🎉 [App] 设备绑定成功，从绑定等待页面跳转到数字人界面...', {
        deviceId: deviceStore.deviceConfig?.deviceId,
        employeeId: deviceStore.employeeInfo.employeeId,
        currentRoute: currentRoute.name
      })
      setTimeout(() => {
        router.push('/live2d')
      }, 500) // 短暂延迟，确保状态更新完成
    }
  }
}, { immediate: false })

// 处理数字员工绑定事件
const handleDigitalWorkerBound = () => {
  const currentRoute = router.currentRoute.value
  if (currentRoute.name === 'binding-wait' && deviceStore.isBound && deviceStore.employeeInfo?.employeeId) {
    console.log('🎉 [App] 收到数字员工绑定事件，跳转到数字人界面...', {
      employeeId: deviceStore.employeeInfo.employeeId
    })
    setTimeout(() => {
      router.push('/live2d')
    }, 500)
  }
}

onMounted(() => {
  // 初始化主题
  themeManager.getTheme()
  
  // 监听数字员工绑定事件（全局事件）
  window.addEventListener('digital-worker-bound', handleDigitalWorkerBound)
})

onBeforeUnmount(() => {
  // 清理事件监听器
  window.removeEventListener('digital-worker-bound', handleDigitalWorkerBound)
})
</script>

<template>
  <RouterView />
</template>

<style>
body {
  background: var(--bg-container);
  color: var(--text-color);
  transition:
    background-color 0.3s ease,
    color 0.3s ease;
  user-select: none !important;
}
</style>
