import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

// 读取 package.json 获取版本号
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const packageJson = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'))
const appVersion = packageJson.version

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [
    vue(),
    vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '$': fileURLToPath(new URL('./plugins', import.meta.url)),
    },
  },
  optimizeDeps: {
    include: [
      'mqtt',
      '@mediapipe/selfie_segmentation',
      '@mediapipe/face_mesh',
      '@tensorflow-models/body-segmentation',
      '@tensorflow-models/face-landmarks-detection',
      '@tensorflow/tfjs',
      '@tensorflow/tfjs-backend-webgl'
    ],
    exclude: [
      'capacitor-funasr',
      'capacitor-speech',
      'capacitor-ssdp'
      // 注意：capacitor-detection 需要预构建其依赖，所以不排除
    ] // 只排除不依赖复杂第三方库的本地插件
  },
  server: {
    watch: {
      ignored: [
        '!**/node_modules/capacitor-funasr/**',
        '!**/node_modules/capacitor-speech/**',
        '!**/node_modules/capacitor-ssdp/**'
        // 注意：capacitor-detection 不在这里监听，因为它的依赖需要预构建
      ] // 只监听不依赖复杂第三方库的本地插件
    },
    proxy: {
      // 代理 ChatTTS 请求到服务端
      '/api/chattts': {
        target: 'http://47.107.249.126:9966',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/chattts/, '')
      },
      // Aliyun TTS proxy removed
    }
  },
})
