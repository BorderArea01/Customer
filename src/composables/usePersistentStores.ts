import { watch } from 'vue'
import { useAppConfigStore } from '@/stores/appConfig'
import { useConfigStore } from '@/stores/config'
import { useDeviceStore } from '@/stores/device'
import { savePersistentStores, type PersistentStoreData } from '@/utils/persistentConfig'

function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout>
  return () => {
    clearTimeout(timer)
    timer = setTimeout(fn, ms)
  }
}

export function usePersistentStores() {
  const appConfigStore = useAppConfigStore()
  const configStore = useConfigStore()
  const deviceStore = useDeviceStore()

  const flush = debounce(() => {
    const data: PersistentStoreData = {
      appConfig: {
        config: appConfigStore.config,
        workflowOverrides: appConfigStore.workflowOverrides,
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
        deviceConfig: deviceStore.deviceConfig,
        deviceInfo: deviceStore.deviceInfo,
        employeeInfo: deviceStore.employeeInfo
      }
    }
    savePersistentStores(data)
  }, 500)

  watch(
    [
      () => appConfigStore.config,
      () => appConfigStore.workflowOverrides,
      () => appConfigStore.isLoaded,
      () => configStore.serverIp,
      () => configStore.serverUrl,
      () => configStore.silentLoginUsername,
      () => configStore.silentLoginPassword,
      () => deviceStore.activationStatus,
      () => deviceStore.bindingStatus,
      () => deviceStore.deviceConfig,
      () => deviceStore.deviceInfo,
      () => deviceStore.employeeInfo
    ],
    flush,
    { deep: true }
  )
}
