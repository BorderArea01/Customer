// 主题类型
export type Theme = 'light' | 'dark' | 'auto'

// 主题切换工具
export class ThemeManager {
  private static instance: ThemeManager
  private currentTheme: Theme = 'light'

  private constructor() {
    this.init()
  }

  static getInstance(): ThemeManager {
    if (!ThemeManager.instance) {
      ThemeManager.instance = new ThemeManager()
    }
    return ThemeManager.instance
  }

  private init() {
    // 从localStorage获取保存的主题
    const savedTheme = localStorage.getItem('theme') as Theme
    if (savedTheme) {
      this.setTheme(savedTheme)
    } else {
      // 检查系统偏好
      this.setTheme('auto')
    }
  }

  setTheme(theme: Theme) {
    this.currentTheme = theme
    localStorage.setItem('theme', theme)

    if (theme === 'auto') {
      // 监听系统主题变化
      this.handleSystemThemeChange()
    } else {
      document.documentElement.setAttribute('data-theme', theme)
    }
  }

  getTheme(): Theme {
    return this.currentTheme
  }

  private handleSystemThemeChange() {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    
    const updateTheme = (e: MediaQueryListEvent | MediaQueryList) => {
      const systemTheme = e.matches ? 'dark' : 'light'
      document.documentElement.setAttribute('data-theme', systemTheme)
    }

    // 初始设置
    updateTheme(mediaQuery)
    
    // 监听变化
    mediaQuery.addEventListener('change', updateTheme)
  }

  toggleTheme() {
    const newTheme = this.currentTheme === 'light' ? 'dark' : 'light'
    this.setTheme(newTheme)
  }

  // 检查当前是否为暗色模式
  isDarkMode(): boolean {
    return document.documentElement.getAttribute('data-theme') === 'dark'
  }
}

// 导出单例实例
export const themeManager = ThemeManager.getInstance()

// 便捷函数
export const setTheme = (theme: Theme) => themeManager.setTheme(theme)
export const getTheme = () => themeManager.getTheme()
export const toggleTheme = () => themeManager.toggleTheme()
export const isDarkMode = () => themeManager.isDarkMode() 