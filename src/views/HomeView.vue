<template>
  <div class="p-5 max-w-2xl mx-auto bg-red">
    <h1 class="text-3xl font-bold text-gray-800 mb-6">设备信息</h1>
    <div class="bg-gray-100 p-5 rounded-lg mb-6">
      <div class="py-2 border-b border-gray-300 last:border-b-0">
        <strong class="text-gray-700">设备名称:</strong>
        <span class="ml-2 text-gray-600">{{ deviceInfo.name || '获取中...' }}</span>
      </div>
      <div class="py-2 border-b border-gray-300 last:border-b-0">
        <strong class="text-gray-700">设备id:</strong>
        <span class="ml-2 text-gray-600">{{ deviceInfo.deviceId || '获取中...' }}</span>
      </div>
      <div class="py-2 border-b border-gray-300 last:border-b-0">
        <strong class="text-gray-700">平台:</strong>
        <span class="ml-2 text-gray-600">{{ deviceInfo.platform || '获取中...' }}</span>
      </div>
      <div class="py-2 border-b border-gray-300 last:border-b-0">
        <strong class="text-gray-700">操作系统版本:</strong>
        <span class="ml-2 text-gray-600">{{ deviceInfo.osVersion || '获取中...' }}</span>
      </div>
      <div class="py-2 border-b border-gray-300 last:border-b-0">
        <strong class="text-gray-700">设备型号:</strong>
        <span class="ml-2 text-gray-600">{{ deviceInfo.model || '获取中...' }}</span>
      </div>
      <div class="py-2 border-b border-gray-300 last:border-b-0">
        <strong class="text-gray-700">制造商:</strong>
        <span class="ml-2 text-gray-600">{{ deviceInfo.manufacturer || '获取中...' }}</span>
      </div>
      <div class="py-2 border-b border-gray-300 last:border-b-0">
        <strong class="text-gray-700">是否虚拟:</strong>
        <span class="ml-2 text-gray-600">{{ deviceInfo.isVirtual ? '是' : '否' }}</span>
      </div>
      <div class="py-2 border-b border-gray-300 last:border-b-0">
        <strong class="text-gray-700">Web视图版本:</strong>
        <span class="ml-2 text-gray-600">{{ deviceInfo.webViewVersion || '获取中...' }}</span>
      </div>
    </div>

    <!-- 主题切换 -->
    <div class="theme-card">
      <h2 class="theme-title">主题切换</h2>
      <div class="flex items-center gap-4">
        <button
          @click="handleThemeToggle"
          class="theme-toggle-btn"
          :class="isDark ? 'theme-toggle-btn-dark' : 'theme-toggle-btn-light'"
        >
          {{ isDark ? '🌙 深色模式' : '☀️ 浅色模式' }}
        </button>
        <span class="theme-info">当前主题: {{ currentTheme }}</span>
      </div>
    </div>

    <!-- 测试输入框 -->
    <div class="bg-white p-5 rounded-lg mb-6 border border-gray-300">
      <h2 class="text-xl font-semibold text-gray-800 mb-4">输入框测试</h2>
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">普通输入框</label>
          <input
            v-model="testInput1"
            type="text"
            placeholder="请输入内容..."
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">数字输入框</label>
          <input
            v-model="testInput2"
            type="number"
            placeholder="请输入数字..."
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">文本域</label>
          <textarea
            v-model="testTextarea"
            placeholder="请输入多行文本..."
            rows="3"
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          ></textarea>
        </div>
        <div>
          <p class="text-sm text-gray-600">
            输入内容：{{ testInput1 }} | {{ testInput2 }} | {{ testTextarea }}
          </p>
        </div>
      </div>
    </div>

    <div class="flex gap-3 justify-center">
      <button
        @click="getDeviceInfo"
        class="px-5 py-2.5 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors duration-300 text-base font-medium"
      >
        刷新设备信息
      </button>
      <button
        @click="showToast"
        class="px-5 py-2.5 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors duration-300 text-base font-medium"
      >
        显示Toast消息
      </button>
      <router-link
        to="/live2d"
        class="px-5 py-2.5 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors duration-300 text-base font-medium"
      >
        Live2D数字人
      </router-link>
      <router-link
        to="/recognition"
        class="px-5 py-2.5 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors duration-300 text-base font-medium"
      >
        人脸人体识别
      </router-link>
      <router-link
        to="/speech-test"
        class="px-5 py-2.5 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors duration-300 text-base font-medium"
      >
        语音合成
      </router-link>
      <router-link
        to="/speech-recognition"
        class="px-5 py-2.5 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors duration-300 text-base font-medium"
      >
        语音识别
      </router-link>
      <router-link
        to="/funasr-test"
        class="px-5 py-2.5 bg-purple-500 text-white rounded-md hover:bg-purple-600 transition-colors duration-300 text-base font-medium"
      >
        FunASR测试
      </router-link>
      <router-link
        to="/ssdp-test"
        class="px-5 py-2.5 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors duration-300 text-base font-medium"
      >
        SSDP发现
      </router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Device } from '@capacitor/device'
import { Toast } from '@capacitor/toast'
import { toggleTheme, getTheme, isDarkMode } from '@/utils/theme'

interface DeviceInfo {
  deviceId: string
  name: string
  platform: string
  osVersion: string
  model: string
  manufacturer: string
  isVirtual: boolean
  webViewVersion: string
}

const deviceInfo = ref<DeviceInfo>({
  deviceId: '',
  name: '',
  platform: '',
  osVersion: '',
  model: '',
  manufacturer: '',
  isVirtual: false,
  webViewVersion: '',
})

const testInput1 = ref('')
const testInput2 = ref('')
const testTextarea = ref('')
const currentTheme = ref(getTheme())
const isDark = ref(isDarkMode())

const getDeviceInfo = async () => {
  try {
    const info = await Device.getInfo()
    const idInfo = await Device.getId()
    deviceInfo.value = {
      deviceId: idInfo.identifier || '',
      name: info.name || '',
      platform: info.platform || '',
      osVersion: info.osVersion || '',
      model: info.model || '',
      manufacturer: info.manufacturer || '',
      isVirtual: info.isVirtual || false,
      webViewVersion: info.webViewVersion || '',
    }
  } catch (error) {
    console.error('获取设备信息失败:', error)
  }
}

const showToast = async () => {
  try {
    await Toast.show({
      text: '这是一个Toast消息！',
      duration: 'short',
      position: 'bottom',
    })
  } catch (error) {
    console.error('显示Toast失败:', error)
  }
}

const handleThemeToggle = () => {
  toggleTheme()
  currentTheme.value = getTheme()
  isDark.value = isDarkMode()
}

onMounted(() => {
  getDeviceInfo()
})
</script>

<style scoped>
.theme-card {
  @apply p-5 rounded-lg mb-6 border;
  background: var(--bg-card);
  border-color: var(--border-color);
}

.theme-title {
  @apply text-xl font-semibold mb-4;
  color: var(--text-color);
}

.theme-toggle-btn {
  @apply px-4 py-2 rounded-md transition-all duration-300 text-base font-medium;
}

.theme-toggle-btn-light {
  background: var(--primary-gradient);
  color: var(--text-inverse);
}

.theme-toggle-btn-light:hover {
  background: var(--primary-gradient-dark);
}

.theme-toggle-btn-dark {
  background: var(--bg-tertiary);
  color: var(--text-color);
  border: 1px solid var(--border-color);
}

.theme-toggle-btn-dark:hover {
  background: var(--bg-hover);
}

.theme-info {
  @apply text-sm;
  color: var(--text-secondary);
}

/* 更新其他卡片样式 */
.bg-white {
  background: var(--bg-card) !important;
}

.border-gray-300 {
  border-color: var(--border-color) !important;
}

.text-gray-800 {
  color: var(--text-color) !important;
}

.text-gray-700 {
  color: var(--text-color) !important;
}

.text-gray-600 {
  color: var(--text-secondary) !important;
}

/* 按钮样式 */
.bg-blue-500 {
  background: var(--primary-gradient) !important;
}

.bg-blue-500:hover {
  background: var(--primary-gradient-dark) !important;
}

.bg-gray-600 {
  background: var(--bg-tertiary) !important;
  color: var(--text-color) !important;
}

.bg-gray-600:hover {
  background: var(--bg-hover) !important;
}

.bg-green-500 {
  background: var(--success-gradient) !important;
}

.bg-green-500:hover {
  background: var(--success-gradient) !important;
  filter: brightness(0.9);
}
</style>
