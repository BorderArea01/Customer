import './assets/base.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'

import App from './App.vue'
import router from './router'

import { loadPersistentStores } from '@/utils/persistentConfig'

// 初始化应用
async function initializeApp() {
  const pinia = createPinia()
  pinia.use(piniaPluginPersistedstate)

  // 从文件系统恢复配置到 localStorage，Pinia 创建时会自动从 localStorage 还原
  const data = await loadPersistentStores()
  if (data) {
    localStorage.setItem('appConfig', JSON.stringify(data.appConfig))
    localStorage.setItem('config', JSON.stringify(data.config))
    localStorage.setItem('device', JSON.stringify(data.device))
  }

  const app = createApp(App)
  app.use(pinia)
  app.use(router)

  // 主题初始化将在配置加载完成后进行（通过 appConfigStore.setConfig 调用 reloadTheme）

  app.mount('#app')
}

// 启动应用
initializeApp()

