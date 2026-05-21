import type { PluginListenerHandle } from '@capacitor/core'

export interface SsdpDevice {
  location: string
  server?: string
  nt?: string
  usn?: string
  senderIp?: string
  lastSeen: number
}

export interface StartOptions {
  ntFilter?: string
  cacheMaxAge?: number
}

export interface LzwcSsdpPlugin {
  start(options?: StartOptions): Promise<void>
  stop(): Promise<void>
  getCached(): Promise<{ devices: SsdpDevice[] }>

  addListener(eventName: 'deviceDiscovered', listenerFunc: (device: SsdpDevice) => void): Promise<PluginListenerHandle>
  addListener(eventName: 'deviceExpired', listenerFunc: (device: { location: string }) => void): Promise<PluginListenerHandle>
  addListener(eventName: 'error', listenerFunc: (error: { message: string }) => void): Promise<PluginListenerHandle>
  removeAllListeners(): Promise<void>
}


