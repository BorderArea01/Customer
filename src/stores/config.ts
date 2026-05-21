import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// 全局配置接口
export interface GlobalConfig {
  serverIp: string
  serverUrl: string
  silentLoginUsername?: string
  silentLoginPassword?: string
}

export const useConfigStore = defineStore('config', () => {
  // 状态
  const serverIp = ref('')
  const serverUrl = ref('')
  const silentLoginUsername = ref('')
  const silentLoginPassword = ref('')

  // 计算属性
  const isConfigured = computed(() => {
    return serverIp.value !== '' && serverUrl.value !== ''
  })

  // 静默登录相关计算属性
  const hasCredentials = computed(() => !!silentLoginUsername.value && !!silentLoginPassword.value)

  // 设置服务器IP
  // 支持两种格式：
  // 1. 完整URL：https://dempmana.lzwcai.com 或 http://192.168.1.1:8088
  // 2. IP/域名：192.168.1.1 或 dempmana.lzwcai.com
  const setServerIp = (ip: string) => {
    // 如果输入是完整URL，提取主机部分存储到serverIp，完整URL存储到serverUrl
    if (/^https?:\/\//.test(ip)) {
      try {
        const urlObj = new URL(ip)
        serverIp.value = urlObj.hostname
        // serverUrl直接使用输入的完整URL
        serverUrl.value = ip
      } catch {
        // 解析失败，当作普通IP处理
        const cleanedIp = ip.replace(/^https?:\/\//, '').replace(/^:\/\//, '')
        serverIp.value = cleanedIp
        serverUrl.value = ip // 如果解析失败，使用原始输入
      }
    } else {
      // 清理 ip：移除可能存在的协议前缀
      const cleanedIp = ip.replace(/^https?:\/\//, '').replace(/^:\/\//, '')
      // 如果是IP或域名，存储IP，serverUrl也设置为IP（后续可以通过updateFromDeviceConfig更新为完整URL）
      serverIp.value = cleanedIp
      serverUrl.value = cleanedIp // 临时设置为IP，后续会被更新为完整URL
    }
  }

  // 从设备配置更新全局配置
  const updateFromDeviceConfig = (deviceConfig: any) => {
    // 更新 serverUrl（从激活返回的 deviceConfig 中获取）
    if (deviceConfig.serverUrl) {
      serverUrl.value = deviceConfig.serverUrl
      // 如果 serverIp 为空，从 serverUrl 中提取
      if (!serverIp.value && serverUrl.value) {
        try {
          const urlObj = new URL(serverUrl.value)
          serverIp.value = urlObj.hostname
        } catch {
          // 解析失败，保持 serverIp 为空
        }
      }
    }
  }

  // 加载配置（现在由插件自动处理）
  const loadConfig = () => {
    // 插件会自动从localStorage恢复状态
    console.log('配置已通过插件自动加载')
  }

  // 设置静默登录凭据
  const setCredentials = (username: string, password: string) => {
    console.log('🔐 [ConfigStore] 保存静默登录凭据:', { username, hasPassword: !!password })
    silentLoginUsername.value = username
    silentLoginPassword.value = password
  }

  // 清除静默登录凭据
  const clearCredentials = () => {
    console.log('🔐 [ConfigStore] 清除静默登录凭据')
    silentLoginUsername.value = ''
    silentLoginPassword.value = ''
  }

  // 获取静默登录凭据
  const getCredentials = () => {
    if (hasCredentials.value) {
      return {
        username: silentLoginUsername.value,
        password: silentLoginPassword.value
      }
    }
    return null
  }

  // 清除配置
  const clearConfig = () => {
    serverIp.value = ''
    serverUrl.value = ''
    silentLoginUsername.value = ''
    silentLoginPassword.value = ''
  }

  // 获取完整配置
  const getGlobalConfig = (): GlobalConfig => {
    return {
      serverIp: serverIp.value,
      serverUrl: serverUrl.value,
      silentLoginUsername: silentLoginUsername.value || undefined,
      silentLoginPassword: silentLoginPassword.value || undefined
    }
  }

  return {
    // 状态
    serverIp,
    serverUrl,
    silentLoginUsername,
    silentLoginPassword,
    
    // 计算属性
    isConfigured,
    hasCredentials,
    
    // 方法
    setServerIp,
    updateFromDeviceConfig,
    loadConfig,
    clearConfig,
    getGlobalConfig,
    setCredentials,
    clearCredentials,
    getCredentials
  }
}, {
  persist: true
}) 