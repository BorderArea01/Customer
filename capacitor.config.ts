import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.lzwcai.demp.customer.v2',
  appName: '数字员工接待终端',
  webDir: 'dist',
  server: {
    androidScheme: 'http'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#ffffff',
      showSpinner: true,
      spinnerColor: '#999999'
    },
    LiveUpdate: {
      readyTimeout: 10000
    }
  }
}

export default config
