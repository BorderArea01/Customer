import { defineStore } from 'pinia'
import { ref } from 'vue'

export type LogLevel = 'info' | 'warn' | 'error' | 'debug'

export interface AppLog {
  id: string
  time: string
  source: 'HTTP' | 'MQTT' | 'APP'
  level: LogLevel
  message: string
  detail?: any
}

export const useLogStore = defineStore('appLog', () => {
  const logs = ref<AppLog[]>([])
  const visible = ref(false)
  const max = 500

  const append = (entry: Omit<AppLog, 'id' | 'time'> & { time?: string }) => {
    const item: AppLog = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      time: entry.time || new Date().toISOString(),
      source: entry.source,
      level: entry.level,
      message: entry.message,
      detail: entry.detail,
    }
    logs.value.push(item)
    if (logs.value.length > max) logs.value.splice(0, logs.value.length - max)
  }

  const clear = () => { logs.value = [] }
  const show = () => { visible.value = true }
  const hide = () => { visible.value = false }
  const toggle = () => { visible.value = !visible.value }

  return { logs, visible, append, clear, show, hide, toggle }
})


