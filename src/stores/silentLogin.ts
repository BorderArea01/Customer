import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'

// 静默登录凭据接口
export interface SilentLoginCredentials {
  username: string
  password: string
}

export const useSilentLoginStore = defineStore('silentLogin', () => {
  // 状态
  const credentials = ref<SilentLoginCredentials | null>(null)
  const isLoaded = ref(false)

  // 计算属性
  const hasCredentials = computed(() => !!credentials.value)
  const username = computed(() => credentials.value?.username || '')

  // 设置凭据
  const setCredentials = (username: string, password: string) => {
    console.log('🔐 [SilentLoginStore] 保存静默登录凭据:', { username, hasPassword: !!password })
    credentials.value = { username, password }
    
    // 立即检查持久化状态
    setTimeout(() => {
      try {
        const stored = localStorage.getItem('silentLogin')
        console.log('🔐 [SilentLoginStore] 保存后立即检查localStorage:', stored ? JSON.parse(stored) : null)
        
        // 验证数据是否正确保存
        if (!stored) {
          console.error('❌ [SilentLoginStore] localStorage中没有找到silentLogin数据！')
        } else {
          const parsedData = JSON.parse(stored)
          if (!parsedData.credentials) {
            console.error('❌ [SilentLoginStore] localStorage中的数据结构不正确:', parsedData)
          }
        }
      } catch (e) {
        console.error('❌ [SilentLoginStore] 检查localStorage失败:', e)
      }
    }, 50)
  }

  // 清除凭据
  const clearCredentials = () => {
    console.log('🔐 [SilentLoginStore] 清除静默登录凭据')
    credentials.value = null
  }

  // 获取凭据（用于API调用）
  const getCredentials = (): SilentLoginCredentials | null => {
    return credentials.value
  }

  // 调试：Store初始化时检查持久化数据
  console.log('🔐 [SilentLoginStore] Store初始化，检查持久化状态...')
  
  // 立即检查初始状态
  console.log('🔐 [SilentLoginStore] 初始化时即时状态:', {
    hasCredentials: hasCredentials.value,
    credentialsValue: credentials.value
  })
  
  // 手动检查和恢复持久化数据（作为备选方案）
  const manualRestore = () => {
    try {
      const stored = localStorage.getItem('silentLogin')
      console.log('🔐 [SilentLoginStore] 初始化时localStorage数据:', stored ? JSON.parse(stored) : null)
      
      if (stored && !credentials.value) {
        console.warn('🔐 [SilentLoginStore] Pinia持久化插件未恢复数据，尝试手动恢复...')
        const parsedData = JSON.parse(stored)
        
        // 检查数据结构
        if (parsedData && parsedData.credentials) {
          credentials.value = parsedData.credentials
          console.log('✅ [SilentLoginStore] 手动恢复成功:', {
            username: parsedData.credentials.username,
            hasPassword: !!parsedData.credentials.password
          })
        }
      }
      
      console.log('🔐 [SilentLoginStore] 最终store状态:', {
        hasCredentials: hasCredentials.value,
        username: username.value,
        credentialsValue: credentials.value
      })
      
      isLoaded.value = true
    } catch (e) {
      console.warn('🔐 [SilentLoginStore] 初始化检查失败:', e)
      isLoaded.value = true
    }
  }
  
  // 延迟执行，确保Pinia插件有机会先恢复
  setTimeout(manualRestore, 100)
  
  // 监听store状态变化
  watch(credentials, (newVal, oldVal) => {
    console.log('🔐 [SilentLoginStore] 凭据状态变化:', {
      from: oldVal ? { username: oldVal.username, hasPassword: !!oldVal.password } : null,
      to: newVal ? { username: newVal.username, hasPassword: !!newVal.password } : null
    })
  }, { deep: true })

  return {
    // 状态
    credentials,
    isLoaded,
    
    // 计算属性
    hasCredentials,
    username,
    
    // 方法
    setCredentials,
    clearCredentials,
    getCredentials
  }
}, {
  persist: {
    key: 'silentLogin',
    storage: localStorage
  }
})
