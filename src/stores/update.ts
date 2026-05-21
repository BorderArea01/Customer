import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { FirmwareCheckResponse } from '@/server/api/versionApi'

/**
 * 更新状态管理 Store
 */
export const useUpdateStore = defineStore('update', () => {
  // 状态
  const hasUpdate = ref(false) // 是否有可用更新
  const updateInfo = ref<FirmwareCheckResponse | null>(null) // 更新信息
  const isUpdateDialogVisible = ref(false) // 更新弹窗是否显示
  const hasAutoShown = ref(false) // 是否已经自动弹出过
  const isChecking = ref(false) // 是否正在检测
  const checkTimer = ref<ReturnType<typeof setInterval> | null>(null) // 定时器引用
  const currentVersion = ref<string>('') // 当前版本号

  // 常量
  const CHECK_INTERVAL = 10 * 1000 // 10秒检测一次
  const AUTO_SHOW_KEY = 'update_has_auto_shown' // localStorage key

  // 计算属性
  const shouldAutoShow = computed(() => hasUpdate.value && !hasAutoShown.value)

  // 初始化：从 localStorage 恢复 hasAutoShown 状态
  const initAutoShown = () => {
    try {
      const saved = localStorage.getItem(AUTO_SHOW_KEY)
      if (saved === 'true') {
        hasAutoShown.value = true
      }
    } catch (error) {
      console.warn('⚠️ [UpdateStore] 读取 localStorage 失败:', error)
    }
  }

  // 设置自动弹出状态
  const setAutoShown = (value: boolean) => {
    hasAutoShown.value = value
    try {
      localStorage.setItem(AUTO_SHOW_KEY, String(value))
    } catch (error) {
      console.warn('⚠️ [UpdateStore] 保存 localStorage 失败:', error)
    }
  }

  // 设置更新信息
  const setUpdateInfo = (info: FirmwareCheckResponse | null) => {
    updateInfo.value = info
    hasUpdate.value = !!info
  }

  // 显示更新弹窗
  const showUpdateDialog = () => {
    if (hasUpdate.value) {
      isUpdateDialogVisible.value = true
    }
  }

  // 隐藏更新弹窗
  const hideUpdateDialog = () => {
    isUpdateDialogVisible.value = false
    // 关闭弹窗时，标记为已自动弹出过（避免再次自动弹出）
    if (!hasAutoShown.value) {
      setAutoShown(true)
    }
  }

  // 清除更新状态（更新完成后调用）
  const clearUpdate = () => {
    hasUpdate.value = false
    updateInfo.value = null
    isUpdateDialogVisible.value = false
    hasAutoShown.value = false
    try {
      localStorage.removeItem(AUTO_SHOW_KEY)
    } catch (error) {
      console.warn('⚠️ [UpdateStore] 清除 localStorage 失败:', error)
    }
  }

  // 启动定时检测
  const startCheckTimer = (checkCallback: () => Promise<void>) => {
    // 如果定时器已存在，先清除
    if (checkTimer.value) {
      clearInterval(checkTimer.value)
    }

    // 立即执行一次检测
    checkCallback().catch((error) => {
      console.error('❌ [UpdateStore] 初始检测失败:', error)
    })

    // 设置定时检测
    checkTimer.value = setInterval(() => {
      checkCallback().catch((error) => {
        console.error('❌ [UpdateStore] 定时检测失败:', error)
      })
    }, CHECK_INTERVAL)

    console.log(`⏰ [UpdateStore] 定时检测已启动，间隔: ${CHECK_INTERVAL / 1000}秒`)
  }

  // 停止定时检测
  const stopCheckTimer = () => {
    if (checkTimer.value) {
      clearInterval(checkTimer.value)
      checkTimer.value = null
      console.log('⏹️ [UpdateStore] 定时检测已停止')
    }
  }

  // 初始化
  initAutoShown()

  return {
    // 状态
    hasUpdate,
    updateInfo,
    isUpdateDialogVisible,
    hasAutoShown,
    isChecking,
    currentVersion,
    // 计算属性
    shouldAutoShow,
    // 方法
    setUpdateInfo,
    setCurrentVersion: (version: string) => { currentVersion.value = version },
    showUpdateDialog,
    hideUpdateDialog,
    clearUpdate,
    setAutoShown,
    startCheckTimer,
    stopCheckTimer,
    setChecking: (checking: boolean) => { isChecking.value = checking }
  }
})

