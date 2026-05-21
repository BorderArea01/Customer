import { Filesystem, Directory } from '@capacitor/filesystem'

const FILE_NAME = 'persistent_stores.json'

export interface PersistentStoreData {
  appConfig: {
    config: Record<string, unknown>
    workflowOverrides: Record<string, unknown> | null
    isLoaded: boolean
  }
  config: {
    serverIp: string
    serverUrl: string
    silentLoginUsername: string
    silentLoginPassword: string
  }
  device: {
    activationStatus: string
    bindingStatus: string
    deviceConfig: Record<string, unknown> | null
    deviceInfo: Record<string, unknown> | null
    employeeInfo: Record<string, unknown> | null
  }
}

export async function savePersistentStores(data: PersistentStoreData): Promise<void> {
  try {
    await Filesystem.writeFile({
      path: FILE_NAME,
      data: JSON.stringify(data),
      directory: Directory.Data
    })
    console.log('[PersistentConfig] 配置已备份到文件系统')
  } catch (e) {
    console.error('[PersistentConfig] 写入持久化配置失败:', e)
  }
}

export async function loadPersistentStores(): Promise<PersistentStoreData | null> {
  try {
    const result = await Filesystem.readFile({
      path: FILE_NAME,
      directory: Directory.Data
    })
    const parsed = JSON.parse(result.data as string)
    console.log('[PersistentConfig] 已从文件系统恢复配置')
    return parsed as PersistentStoreData
  } catch {
    // 文件不存在（首次安装）或解析失败，返回 null
    return null
  }
}
