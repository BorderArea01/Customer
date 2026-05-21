declare module 'capacitor-detection' {
  export interface FaceDetectionOptions {
    base64: string
    minArea: number
    maxArea: number
    minConfidence: number
    maxFaceAngle: number
    requireFrontalFace: boolean
  }

  export interface PersonDetectionOptions {
    base64: string
    maxPersons: number
    minCoverage: number
  }

  export interface FaceDetectionPlugin {
    loadModels(): Promise<void>
    isModelsLoaded(): Promise<{ loaded: boolean }>
    detectFaces(options: FaceDetectionOptions): Promise<{ results: any[] }>
    detectPersons(options: PersonDetectionOptions): Promise<{ results: any[] }>
    dispose(): Promise<void>
  }

  export const LzwcDetection: FaceDetectionPlugin
}

declare module 'capacitor-funasr' {
  import type { PluginListenerHandle } from '@capacitor/core'

  export interface FunasrAudioDevice {
    id: string
    name: string
    type: 'microphone' | 'headset' | 'bluetooth' | 'default'
  }

  export interface FunasrConnectionStatus {
    connected: boolean
    status: string
    message?: string
  }

  export interface FunasrPlugin {
    initialize(config: Record<string, unknown>): Promise<void>
    startListening(): Promise<{ text?: string } | void>
    stopListening(): Promise<{ text?: string } | void>
    disconnect(): Promise<void>
    getConnectionStatus(): Promise<FunasrConnectionStatus>
    getAudioDevices(): Promise<{ devices: FunasrAudioDevice[] }>
    selectAudioDevice(options: { deviceId: string }): Promise<void>
    sendHeartbeat(): Promise<{ success?: boolean; message?: string }>
    addListener(eventName: string, listenerFunc: (event: any) => void): Promise<PluginListenerHandle>
    removeAllListeners(): Promise<void>
  }

  export const LzwcFunasr: FunasrPlugin
}

declare module 'capacitor-ssdp' {
  import type { PluginListenerHandle } from '@capacitor/core'

  export interface SsdpDevice {
    usn?: string
    nt?: string
    st?: string
    server?: string
    location: string
    senderIp?: string
    senderPort?: number
    friendlyName?: string
    headers?: Record<string, string>
    expiresAt?: number
  }

  export interface SsdpPlugin {
    start(options: { ntFilter?: string; cacheMaxAge?: number }): Promise<void>
    stop(): Promise<void>
    addListener(eventName: string, listenerFunc: (event: any) => void): Promise<PluginListenerHandle>
    removeAllListeners(): Promise<void>
  }

  export const LzwcSsdp: SsdpPlugin
}
