import { Capacitor } from '@capacitor/core'
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { LzwcSsdp, type SsdpDevice } from 'capacitor-ssdp'

export interface UseSsdpOptions {
  autoStart?: boolean
  ntFilter?: string
  cacheMaxAge?: number
}

export default function useSsdp(options: UseSsdpOptions = {}) {
  const { autoStart = false, ntFilter = 'agentbox:device', cacheMaxAge = 60_000 } = options

  const devices = ref<SsdpDevice[]>([])
  const isRunning = ref(false)
  const error = ref<string | null>(null)
  let autoStopTimer: NodeJS.Timeout | null = null

  const upsertDevice = (d: SsdpDevice) => {
    const idx = devices.value.findIndex(x => x.location === d.location)
    if (idx >= 0) devices.value[idx] = d
    else devices.value.push(d)
  }

  const removeDevice = (location: string) => {
    devices.value = devices.value.filter(x => x.location !== location)
  }

  const start = async (override?: Partial<UseSsdpOptions>) => {
    try {
      if (Capacitor.getPlatform() === 'web') {
        console.warn('SSDP discovery is not supported on Web platform')
        return
      }
      const useNt = override?.ntFilter ?? ntFilter
      const useCache = override?.cacheMaxAge ?? cacheMaxAge
      await LzwcSsdp.start({ ntFilter: useNt, cacheMaxAge: useCache })
      isRunning.value = true
      // 5秒后自动停止
      autoStopTimer = setTimeout(async () => {
        await stop()
      }, 5000)
    } catch (e: any) {
      error.value = e?.message || String(e)
    }
  }

  const stop = async () => {
    try {
      if (autoStopTimer) {
        clearTimeout(autoStopTimer)
        autoStopTimer = null
      }
      await LzwcSsdp.stop()
    } finally {
      isRunning.value = false
    }
  }

  const openService = (device: SsdpDevice, port: string) => {
    try {
      let base = device.location
      if (!base.startsWith('http')) base = 'http://' + base
      const url = new URL(base)
      if (port === '8080') {
        url.protocol = 'https:'
        url.port = '8080'
      } else {
        url.protocol = 'http:'
        url.port = port
      }
      window.open(url.toString(), '_blank')
    } catch (e) {
      console.error('openService failed', e)
    }
  }

  onMounted(() => {
    const sub1 = LzwcSsdp.addListener('deviceDiscovered', (d) => {
      upsertDevice(d)
    })
    const sub2 = LzwcSsdp.addListener('deviceExpired', (d: any) => {
      removeDevice(d.location)
    })
    const sub3 = LzwcSsdp.addListener('error', (e: any) => {
      error.value = e?.message || 'unknown'
    })
    if (autoStart) start()

    onBeforeUnmount(async () => {
      await LzwcSsdp.removeAllListeners()
        ; (await sub1).remove()
        ; (await sub2).remove()
        ; (await sub3).remove()
      if (autoStopTimer) {
        clearTimeout(autoStopTimer)
        autoStopTimer = null
      }
      await stop()
    })
  })

  return {
    devices,
    isRunning,
    error,
    start,
    stop,
    openService,
  }
}


