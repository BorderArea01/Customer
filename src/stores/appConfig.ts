import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export interface AppConfig {
  employeeId?: string
  isCloud: boolean
  silentLogin: boolean
  silentLoginUsername?: string
  silentLoginPassword?: string
  enableCamera: boolean
  showSettingsButton: boolean
  speechRecognition?: {
    protocol?: string
    ip?: string
    port?: number
    url?: string
  }
  speechBroadcast?: {
    voice?: string
    language?: string
    speed?: number
    pitch?: number
    volume?: number
    apiCredentials?: {
      appId?: string
      apiSecret?: string
      apiKey?: string
    }
  }
  live2dModelConfig?: {
    live2dModelPath?: string
    scale?: number
    position?: { xPercent: number; yPercent: number }
    widthPercent?: number
    heightPercent?: number
    live2dMotions?: {
      availableMotions?: Array<{
        id: string
        name: string
        paramId?: string
        motionGroup?: string
        motionIndex?: number
        description: string
      }>
      randomMotionSettings?: {
        enabled?: boolean
        interval?: number
        triggerEvents?: string[]
      }
    }
  }
  chatMqttBroker?: {
    mqttProtocol?: string
    mqttIp?: string
    mqttPort?: number
    mqttDefaultPort?: number
    mqttUsername?: string
    mqttPassword?: string
    mqttUrl?: string
  }
  theme?: {
    light: {
      primaryColor: string
      primaryLight: string
      primaryLighter: string
      primaryDark: string
      primaryDarker: string
      secondaryColor: string
      secondaryLight: string
      secondaryLighter: string
      secondaryDark: string
      secondaryDarker: string
      primaryGradient: string
      bgContainer: string
    }
    dark: {
      primaryColor: string
      primaryLight: string
      primaryLighter: string
      primaryDark: string
      primaryDarker: string
      secondaryColor: string
      secondaryLight: string
      secondaryLighter: string
      secondaryDark: string
      secondaryDarker: string
      primaryGradient: string
      bgContainer: string
    }
  }
  faceRecognition?: {
    detection?: {
      interval?: number
      leaveDuration?: number
      faceMinArea?: number
      faceMaxArea?: number
      faceMinConfidence?: number
      faceMaxAngle?: number
      faceRequireFrontal?: boolean
      personMinCoverage?: number
      personMaxPersons?: number
    }
  }
  workflow?: {
    executionUrl?: string
    openDoor?: {
      apiKey?: string
      workflowId?: string
    }
    closeDoor?: {
      apiKey?: string
      workflowId?: string
    }
  }
  contactList?: {
    enabled?: boolean
    displayMode?: 'scroll' | 'single' | 'none'
    title?: string
    scrollInterval?: number
    cardFields?: string[]
    items?: Array<Record<string, string>>
  }
}

export interface WorkflowConfig {
  executionUrl: string
  openDoor: {
    apiKey: string
    workflowId: string
  }
  closeDoor: {
    apiKey: string
    workflowId: string
  }
}

type WorkflowConfigUpdate = {
  executionUrl?: string
  openDoor?: Partial<WorkflowConfig['openDoor']>
  closeDoor?: Partial<WorkflowConfig['closeDoor']>
}

const createDefaultWorkflowConfig = (): WorkflowConfig => ({
  // Door workflows are device-specific. Configure them in the terminal settings;
  // never ship a production endpoint, workflow ID, or API key in source control.
  executionUrl: '',
  openDoor: {
    apiKey: '',
    workflowId: ''
  },
  closeDoor: {
    apiKey: '',
    workflowId: ''
  }
})

const createDefaultConfig = (): AppConfig => ({
  isCloud: false,
  silentLogin: false,
  enableCamera: true,
  showSettingsButton: true,
  workflow: createDefaultWorkflowConfig(),
  contactList: {
    enabled: true,
    displayMode: 'scroll',
    title: '各镇（街道）行政服务中心咨询电话',
    scrollInterval: 4000,
    cardFields: ['name', 'phone'],
    items: []
  }
})

const mergeWorkflowConfig = (
  base?: AppConfig['workflow'],
  overrides?: WorkflowConfigUpdate | null
): WorkflowConfig => {
  const defaults = createDefaultWorkflowConfig()

  return {
    executionUrl: overrides?.executionUrl ?? base?.executionUrl ?? defaults.executionUrl,
    openDoor: {
      apiKey: overrides?.openDoor?.apiKey ?? base?.openDoor?.apiKey ?? defaults.openDoor.apiKey,
      workflowId: overrides?.openDoor?.workflowId ?? base?.openDoor?.workflowId ?? defaults.openDoor.workflowId
    },
    closeDoor: {
      apiKey: overrides?.closeDoor?.apiKey ?? base?.closeDoor?.apiKey ?? defaults.closeDoor.apiKey,
      workflowId: overrides?.closeDoor?.workflowId ?? base?.closeDoor?.workflowId ?? defaults.closeDoor.workflowId
    }
  }
}

const cloneWorkflowConfig = (workflow?: AppConfig['workflow']): WorkflowConfig => (
  mergeWorkflowConfig(workflow, null)
)

export const useAppConfigStore = defineStore('appConfig', () => {
  const config = ref<AppConfig>(createDefaultConfig())
  const workflowOverrides = ref<WorkflowConfigUpdate | null>(null)
  const isLoaded = ref(false)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const isCloudMode = computed(() => config.value.isCloud)
  const isLocalMode = computed(() => !config.value.isCloud)
  const isSilentLoginEnabled = computed(() => config.value.silentLogin)
  const live2dModelPath = computed(() => config.value.live2dModelConfig?.live2dModelPath)
  const mqttUrl = computed(() => config.value.chatMqttBroker?.mqttUrl)
  const speechRecognitionUrl = computed(() => config.value.speechRecognition?.url)
  const isCameraEnabled = computed(() => config.value.enableCamera)
  const showSettingsButton = computed(() => config.value.showSettingsButton)
  const employeeId = computed(() => config.value.employeeId)

  const speechRecognition = computed(() => config.value.speechRecognition)
  const speechBroadcast = computed(() => config.value.speechBroadcast)
  const live2dModelConfig = computed(() => config.value.live2dModelConfig)
  const live2dMotions = computed(() => config.value.live2dModelConfig?.live2dMotions)
  const faceRecognition = computed(() => config.value.faceRecognition)
  const workflow = computed(() => config.value.workflow)
  const contactList = computed(() => config.value.contactList)

  const applyThemeReload = () => {
    import('../utils/themeLoader').then(({ reloadTheme }) => {
      reloadTheme()
    })
  }

  const setConfig = (newConfig: AppConfig) => {
    const prevContactList = config.value.contactList
    config.value = {
      ...createDefaultConfig(),
      ...newConfig,
      workflow: mergeWorkflowConfig(newConfig.workflow, workflowOverrides.value)
    }
    // 保留本地配置的公告数据：服务器下发的配置不含 contactList 时沿用本地已有数据
    if (!newConfig.contactList && prevContactList?.items?.length) {
      config.value.contactList = prevContactList
    }
    isLoaded.value = true
    error.value = null
    applyThemeReload()
  }

  const updateWorkflowConfig = (updates: WorkflowConfigUpdate) => {
    workflowOverrides.value = {
      ...(workflowOverrides.value ?? {}),
      ...updates,
      openDoor: {
        ...(workflowOverrides.value?.openDoor ?? {}),
        ...(updates.openDoor ?? {})
      },
      closeDoor: {
        ...(workflowOverrides.value?.closeDoor ?? {}),
        ...(updates.closeDoor ?? {})
      }
    }

    config.value = {
      ...config.value,
      workflow: mergeWorkflowConfig(config.value.workflow, workflowOverrides.value)
    }
  }

  const updateConfig = (updates: Partial<AppConfig>) => {
    const { workflow: workflowUpdate, ...otherUpdates } = updates
    config.value = { ...config.value, ...otherUpdates }

    if (workflowUpdate) {
      updateWorkflowConfig(workflowUpdate)
    }
  }

  const setLoading = (loadingState: boolean) => {
    loading.value = loadingState
  }

  const setError = (errorMessage: string | null) => {
    error.value = errorMessage
    if (errorMessage) {
      isLoaded.value = false
    }
  }

  const resetConfig = () => {
    config.value = createDefaultConfig()
    workflowOverrides.value = null
    isLoaded.value = false
    loading.value = false
    error.value = null
  }

  const getConfig = (): AppConfig => {
    const current = { ...config.value }
    return {
      ...current,
      workflow: cloneWorkflowConfig(current.workflow)
    }
  }

  return {
    config,
    workflowOverrides,
    isLoaded,
    loading,
    error,
    isCloudMode,
    isLocalMode,
    isSilentLoginEnabled,
    live2dModelPath,
    isCameraEnabled,
    showSettingsButton,
    employeeId,
    speechRecognition,
    speechRecognitionUrl,
    speechBroadcast,
    mqttUrl,
    live2dModelConfig,
    live2dMotions,
    faceRecognition,
    workflow,
    contactList,
    setConfig,
    updateConfig,
    updateWorkflowConfig,
    setLoading,
    setError,
    resetConfig,
    getConfig
  }
}, {
  persist: true
})
