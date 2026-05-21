<template>
  <div class="network-speed-indicator" :class="containerClass" @click="handleClick">
    <div v-if="isNoNetwork" class="no-network">❌网络异常</div>
    <div v-else class="signal-bars" :class="signalColorClass">
      <div class="bar bar-1" :class="{ active: signalLevel >= 1, testing: isTesting }"></div>
      <div class="bar bar-2" :class="{ active: signalLevel >= 2, testing: isTesting }"></div>
      <div class="bar bar-3" :class="{ active: signalLevel >= 3, testing: isTesting }"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useConfigStore } from '../../stores/config'
import { 
  testNetworkSpeed, 
  quickNetworkTest, 
  getNetworkQuality,
  type NetworkSpeedResult 
} from '../../utils/networkSpeedTest'

interface Props {
  autoStart?: boolean
  interval?: number
}

const props = withDefaults(defineProps<Props>(), {
  autoStart: true,
  interval: 30000
})

const configStore = useConfigStore()

const networkSpeed = ref<NetworkSpeedResult>({
  downloadSpeed: 0,
  uploadSpeed: 0,
  latency: 0,
  packetLoss: 0,
  status: 'testing',
  timestamp: Date.now()
})

const isTestingNetwork = ref(false)
const networkTestInterval = ref<number | null>(null)

const isTesting = computed(() => networkSpeed.value.status === 'testing')

const isNoNetwork = computed(() => networkSpeed.value.status === 'error')

const signalLevel = computed(() => {
  if (isNoNetwork.value) return 0
  const quality = getNetworkQuality(networkSpeed.value.latency, networkSpeed.value.packetLoss || 0)
  if (quality.level === 'excellent' || quality.level === 'good') return 3
  if (quality.level === 'fair') return 2
  return 1 // poor
})

const signalColorClass = computed(() => {
  if (signalLevel.value >= 3) return 'color-good'
  if (signalLevel.value === 2) return 'color-fair'
  return 'color-poor'
})

const containerClass = computed(() => {
  if (isNoNetwork.value) return 'status-error'
  if (isTesting.value) return 'status-testing'
  return 'status-ok'
})

const performNetworkTest = async () => {
  if (isTestingNetwork.value) return
  
  isTestingNetwork.value = true
  networkSpeed.value.status = 'testing'
  
  try {
    const { useAppConfigStore } = await import('@/stores/appConfig')
    const appConfigStore = useAppConfigStore()
    
    // 使用 configStore.serverUrl 或 serverIp
    let testServer = configStore.serverUrl
    if (!testServer) {
      // 如果没有 serverUrl，使用 serverIp（如果它是完整URL）
      if (configStore.serverIp && /^https?:\/\//.test(configStore.serverIp)) {
        testServer = configStore.serverIp
      } else {
        throw new Error('服务器URL未配置')
      }
    }
    
    if (!testServer) throw new Error('服务器地址未配置')
    const quickResult = await quickNetworkTest(testServer)
    
    if (quickResult.success) {
      const fullResult = await testNetworkSpeed({
        timeout: 3000,
        pingCount: 3,
        testServer
      })
      networkSpeed.value = fullResult
    } else {
      networkSpeed.value = {
        downloadSpeed: 0,
        uploadSpeed: 0,
        latency: 0,
        packetLoss: 100,
        status: 'error',
        error: quickResult.message,
        timestamp: Date.now()
      }
    }
  } catch (error) {
    networkSpeed.value = {
      downloadSpeed: 0,
      uploadSpeed: 0,
      latency: 0,
      packetLoss: 100,
      status: 'error',
      error: error instanceof Error ? error.message : '网络测试失败',
      timestamp: Date.now()
    }
  } finally {
    isTestingNetwork.value = false
  }
}

const handleClick = () => {
  // 点击容器可触发重新测试（无打扰，不显示文字按钮）
  if (!isTestingNetwork.value) performNetworkTest()
}

const startNetworkMonitoring = () => {
  performNetworkTest()
  networkTestInterval.value = window.setInterval(performNetworkTest, props.interval)
}

const stopNetworkMonitoring = () => {
  if (networkTestInterval.value) {
    clearInterval(networkTestInterval.value)
    networkTestInterval.value = null
  }
}

const triggerTest = () => performNetworkTest()

defineExpose({
  triggerTest,
  startNetworkMonitoring,
  stopNetworkMonitoring,
  networkSpeed: computed(() => networkSpeed.value),
  isTestingNetwork: computed(() => isTestingNetwork.value)
})

onMounted(() => {
  if (props.autoStart) startNetworkMonitoring()
})

onBeforeUnmount(() => {
  stopNetworkMonitoring()
})
</script>

<style scoped>
.network-speed-indicator {
  background: var(--bg-elevated);
  color: var(--text-color);
  padding: 0.5rem 1rem;
  border-radius: 0.4rem;
  display: flex;
  align-items: center;
  min-height: 2rem;
  justify-content: center;
  cursor: pointer;
  box-shadow: var(--shadow-medium);
  transition: transform 0.2s ease, background-color 0.2s ease;
}

.signal-bars {
  display: inline-flex;
  align-items: flex-end;
  gap: 3px;
}

.bar {
  width: 4px;
  height: 6px;
  border-radius: 2px;
  background: var(--text-tertiary);
  opacity: 0.35;
  transition: background-color 0.2s ease, opacity 0.2s ease, height 0.2s ease;
}

.bar-2 { height: 9px; }
.bar-3 { height: 12px; }

.bar.active { opacity: 1; }

.signal-bars.color-good .bar.active { background: #10b981; }
.signal-bars.color-fair .bar.active { background: #f59e0b; }
.signal-bars.color-poor .bar.active { background: #ef4444; }

/* 测试中：轻微呼吸动画，避免分散注意力 */
.bar.testing { animation: breathe 1.2s ease-in-out infinite; }

@keyframes breathe {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 0.9; }
}

.no-network {
  font-size: 12px;
  line-height: 1;
  color: #ef4444;
  font-weight: 700;
}

.status-testing {
  outline: none;
}

@media (max-width: 768px) {
  .network-speed-indicator {
    padding: 3px 5px;
    min-width: 32px;
    height: 20px;
  }
}

@media (prefers-color-scheme: dark) {
  .network-speed-indicator {
    background: rgba(30, 30, 30, 0.9);
    border-color: rgba(255, 255, 255, 0.1);
  }
}
</style>
