import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { useAppConfigStore } from '@/stores/appConfig'
import { useConfigStore } from '@/stores/config'
import {
  DeviceActivationStatus,
  DeviceBindingStatus,
  type DeviceConfig,
  type DeviceInfo,
  type EmployeeInfo,
  useDeviceStore
} from '@/stores/device'
import { savePersistentStores, type PersistentStoreData } from '@/utils/persistentConfig'

const EXPORT_VERSION = 1
const EXTRA_LOCAL_STORAGE_KEYS = [
  'theme',
  'custom-label',
  'tts-provider',
  'voicebox-tts-config',
  'silentLogin',
  'update_has_auto_shown'
] as const

export interface ExportedConfig {
  version: number
  exportTime: string
  persistentStores: PersistentStoreData
  extraLocalStorage: Record<string, string | null>
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const buildPersistentStoreData = (): PersistentStoreData => {
  const appConfigStore = useAppConfigStore()
  const configStore = useConfigStore()
  const deviceStore = useDeviceStore()

  return {
    appConfig: {
      config: clone(appConfigStore.config),
      workflowOverrides: clone(appConfigStore.workflowOverrides),
      isLoaded: appConfigStore.isLoaded
    },
    config: {
      serverIp: configStore.serverIp,
      serverUrl: configStore.serverUrl,
      silentLoginUsername: configStore.silentLoginUsername,
      silentLoginPassword: configStore.silentLoginPassword
    },
    device: {
      activationStatus: deviceStore.activationStatus,
      bindingStatus: deviceStore.bindingStatus,
      deviceConfig: clone(deviceStore.deviceConfig),
      deviceInfo: clone(deviceStore.deviceInfo),
      employeeInfo: clone(deviceStore.employeeInfo)
    }
  }
}

const serializeConfig = (): ExportedConfig => {
  const extraLocalStorage: Record<string, string | null> = {}

  for (const key of EXTRA_LOCAL_STORAGE_KEYS) {
    extraLocalStorage[key] = localStorage.getItem(key)
  }

  return {
    version: EXPORT_VERSION,
    exportTime: new Date().toISOString(),
    persistentStores: buildPersistentStoreData(),
    extraLocalStorage
  }
}

const validateConfig = (data: ExportedConfig): void => {
  if (!data || data.version !== EXPORT_VERSION) {
    throw new Error(`不支持的配置文件版本：${data?.version ?? '未知'}`)
  }

  if (!data.persistentStores?.appConfig || !data.persistentStores?.config || !data.persistentStores?.device) {
    throw new Error('配置文件缺少必要的持久化数据')
  }
}

const writeStoresToLocalStorage = (stores: PersistentStoreData) => {
  localStorage.setItem('appConfig', JSON.stringify(stores.appConfig))
  localStorage.setItem('config', JSON.stringify(stores.config))
  localStorage.setItem('device', JSON.stringify(stores.device))
}

const writeExtraLocalStorage = (entries: Record<string, string | null>) => {
  for (const key of EXTRA_LOCAL_STORAGE_KEYS) {
    const value = entries[key] ?? null
    if (value === null) {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, value)
    }
  }
}

const patchActiveStores = (stores: PersistentStoreData) => {
  const appConfigStore = useAppConfigStore()
  const configStore = useConfigStore()
  const deviceStore = useDeviceStore()

  appConfigStore.$patch(clone(stores.appConfig))
  configStore.$patch(clone(stores.config))
  deviceStore.$patch({
    activationStatus: stores.device.activationStatus as DeviceActivationStatus,
    bindingStatus: stores.device.bindingStatus as DeviceBindingStatus,
    deviceConfig: clone(stores.device.deviceConfig) as DeviceConfig | null,
    deviceInfo: clone(stores.device.deviceInfo) as DeviceInfo | null,
    employeeInfo: clone(stores.device.employeeInfo) as EmployeeInfo | null
  })
}

const applyConfig = async (data: ExportedConfig): Promise<number> => {
  validateConfig(data)

  const stores = clone(data.persistentStores)
  writeStoresToLocalStorage(stores)
  writeExtraLocalStorage(data.extraLocalStorage ?? {})
  patchActiveStores(stores)
  await savePersistentStores(stores)

  return 3 + Object.keys(data.extraLocalStorage ?? {}).length
}

export const syncCurrentConfigToStorage = async (): Promise<void> => {
  await savePersistentStores(buildPersistentStoreData())
}

export const exportConfig = async (): Promise<string> => {
  const data = serializeConfig()
  const json = JSON.stringify(data, null, 2)
  const filename = `config-${new Date().toISOString().slice(0, 10)}.json`

  if (Capacitor.isNativePlatform()) {
    await Filesystem.writeFile({
      path: filename,
      data: json,
      directory: Directory.Documents,
      encoding: Encoding.UTF8
    })

    const { uri } = await Filesystem.getUri({
      path: filename,
      directory: Directory.Documents
    })

    return uri
  }

  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
  return filename
}

export const importConfigFromFile = async (file: File): Promise<number> => {
  const text = await file.text()
  const data = JSON.parse(text) as ExportedConfig
  return applyConfig(data)
}
