
import { useAppConfigStore } from '@/stores/appConfig'

const lastLogs = new Map<string, string>()

const logUnique = (
  key: string,
  level: 'log' | 'warn' | 'error',
  message: string,
  data?: unknown
) => {
  const normalizedData = data === undefined ? '' : JSON.stringify(data)
  const hash = `${message}:${normalizedData}`

  if (lastLogs.get(key) === hash) return

  lastLogs.set(key, hash)
  if (data === undefined) {
    console[level](message)
    return
  }

  console[level](message, data)
}

export const executeWorkflow = async (type: 'open' | 'close', inputs?: Record<string, any>) => {
  const appConfigStore = useAppConfigStore()
  const workflowConfig = appConfigStore.workflow

  if (!workflowConfig?.executionUrl) {
    logUnique('missing-url', 'warn', '[Workflow] Execution URL not configured')
    return
  }

  const config = type === 'open' ? workflowConfig.openDoor : workflowConfig.closeDoor
  if (!config?.workflowId || !config?.apiKey) {
    logUnique(`${type}-missing-config`, 'warn', `[Workflow] ${type} workflow configuration missing (ID or Key)`)
    return
  }

  const body = {
    workflowId: config.workflowId,
    inputs: inputs || {}
  }

  try {
    const apiKey = config.apiKey.trim()
    logUnique(`${type}-executing`, 'log', `[Workflow] Executing ${type} workflow...`, {
      url: workflowConfig.executionUrl,
      workflowId: body.workflowId,
      inputs: body.inputs
    })

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    }

    const response = await fetch(workflowConfig.executionUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Workflow execution failed: ${response.status} ${response.statusText} - ${errorText}`)
    }

    const result = await response.json()
    logUnique(`${type}-success`, 'log', `[Workflow] ${type} workflow executed successfully`, result)
    return result
  } catch (error) {
    logUnique(
      `${type}-error`,
      'error',
      `[Workflow] ${type} workflow execution error`,
      error instanceof Error ? error.message : error
    )
  }
}
