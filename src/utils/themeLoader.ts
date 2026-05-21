import { useAppConfigStore } from '../stores/appConfig'

export interface ThemeConfig {
  primaryColor: string
  primaryLight: string
  primaryLighter: string
  primaryDark: string
  primaryDarker: string
  secondaryColor: string
  secondaryLight: string
  secondaryLighter: string
  secondaryDark: string
  secondaryDarker: string
  primaryGradient: string
  bgContainer: string
}

export interface ThemeConfigWrapper {
  light: ThemeConfig
  dark: ThemeConfig
}


/**
 * 从应用配置中动态加载主题配置
 * 必须等待配置加载完成才能调用此函数
 */
export function loadThemeConfig(): ThemeConfigWrapper {
  const appConfigStore = useAppConfigStore()
  const config = appConfigStore.getConfig()
  
  // 检查配置是否已加载
  if (!appConfigStore.isLoaded) {
    throw new Error('配置尚未加载完成，无法加载主题配置')
  }
  
  // 检查配置中是否有主题配置
  if (!config || !config.theme || !config.theme.light || !config.theme.dark) {
    throw new Error('配置文件中没有找到主题配置')
  }
  
  console.log('🎨 [ThemeLoader] 使用配置文件中的主题:', config.theme)
  return config.theme
}

/**
 * 获取当前主题模式
 */
export function getCurrentThemeMode(): 'light' | 'dark' {
  const html = document.documentElement
  return html.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
}

/**
 * 根据当前主题模式获取主题配置
 */
export function getCurrentThemeConfig(): ThemeConfig {
  const themeWrapper = loadThemeConfig()
  const currentMode = getCurrentThemeMode()
  return themeWrapper[currentMode]
}

/**
 * 应用主题配置到CSS变量
 */
export function applyThemeConfig(theme: ThemeConfig) {
  const root = document.documentElement
  
  // 应用主色调
  root.style.setProperty('--primary-color', theme.primaryColor)
  root.style.setProperty('--primary-light', theme.primaryLight)
  root.style.setProperty('--primary-lighter', theme.primaryLighter)
  root.style.setProperty('--primary-dark', theme.primaryDark)
  root.style.setProperty('--primary-darker', theme.primaryDarker)
  
  // 应用辅助色
  root.style.setProperty('--secondary-color', theme.secondaryColor)
  root.style.setProperty('--secondary-light', theme.secondaryLight)
  root.style.setProperty('--secondary-lighter', theme.secondaryLighter)
  root.style.setProperty('--secondary-dark', theme.secondaryDark)
  root.style.setProperty('--secondary-darker', theme.secondaryDarker)
  
  // 应用渐变色配置
  root.style.setProperty('--primary-gradient', theme.primaryGradient)
  root.style.setProperty('--primary-gradient-light', `linear-gradient(135deg, ${theme.primaryLight} 0%, ${theme.secondaryLight} 100%)`)
  root.style.setProperty('--primary-gradient-dark', `linear-gradient(135deg, ${theme.primaryDark} 0%, ${theme.secondaryDark} 100%)`)
  root.style.setProperty('--secondary-gradient', `linear-gradient(135deg, ${theme.secondaryColor} 0%, ${theme.primaryColor} 100%)`)
  
  // 应用背景容器配置
  root.style.setProperty('--bg-container', theme.bgContainer)
  
  // 更新兼容性变量
  root.style.setProperty('--color-primary', theme.primaryColor)
  root.style.setProperty('--color-primary-dark', theme.primaryDark)
  
  // 更新边框焦点色
  root.style.setProperty('--border-focus', theme.primaryColor)
  
  // 更新背景激活色
  root.style.setProperty('--bg-active', `${theme.primaryColor}1a`) // 10% 透明度
  root.style.setProperty('--bg-selected', `${theme.primaryColor}14`) // 8% 透明度
  
  // 更新阴影焦点色
  root.style.setProperty('--shadow-focus', `0 0 0 2px ${theme.primaryColor}33`) // 20% 透明度
}

/**
 * 初始化主题
 * 必须等待配置加载完成才能调用此函数
 */
export function initTheme() {
  const theme = getCurrentThemeConfig()
  applyThemeConfig(theme)
  return theme
}

/**
 * 重新加载主题（当配置更新时调用）
 */
export function reloadTheme() {
  console.log('🎨 [ThemeLoader] 重新加载主题配置')
  const theme = getCurrentThemeConfig()
  applyThemeConfig(theme)
  return theme
}

/**
 * 切换主题模式
 */
export function switchTheme(mode: 'light' | 'dark') {
  const html = document.documentElement
  html.setAttribute('data-theme', mode)
  
  // 重新应用主题配置
  const theme = getCurrentThemeConfig()
  applyThemeConfig(theme)
  
  return theme
}

/**
 * 动态更新主题
 */
export function updateTheme(newTheme: Partial<ThemeConfig>) {
  const currentTheme = getCurrentThemeConfig()
  const updatedTheme = { ...currentTheme, ...newTheme }
  applyThemeConfig(updatedTheme)
  return updatedTheme
}

/**
 * 监听主题变化
 */
export function watchThemeChange(callback: (theme: ThemeConfig, mode: 'light' | 'dark') => void) {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
        const theme = getCurrentThemeConfig()
        const mode = getCurrentThemeMode()
        callback(theme, mode)
      }
    })
  })
  
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme']
  })
  
  return observer
}
