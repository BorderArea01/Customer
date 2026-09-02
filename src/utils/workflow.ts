
import { useAppConfigStore } from '@/stores/appConfig'

const lastLogs = new Map<string, string>()

/**
 * Keeps a decimal identifier as a JSON number without converting it through
 * JavaScript's Number type (which would corrupt long integer identifiers).
 */
export class WorkflowNumericId {
  constructor(readonly value: string) {}
}

export const toWorkflowNumericId = (value: string | number | null | undefined): WorkflowNumericId | null => {
  const raw = typeof value === 'number' ? String(value) : value?.trim() || ''
  if (!/^\d+$/.test(raw)) return null

  // JSON numbers cannot retain leading zeroes. Normalize them before emitting
  // a bare numeric literal in the request body.
  return new WorkflowNumericId(raw.replace(/^0+(?=\d)/, ''))
}

const serializeWorkflowRequest = (workflowId: string, inputs?: Record<string, unknown>) => {
  if (!inputs || Object.keys(inputs).length === 0) {
    return JSON.stringify({ workflowId })
  }

  const personId = inputs.person_id
  if (!(personId instanceof WorkflowNumericId)) {
    return JSON.stringify({ workflowId, inputs })
  }

  const { person_id: _personId, ...otherInputs } = inputs
  const otherInputsJson = JSON.stringify(otherInputs)
  const inputsJson = Object.keys(otherInputs).length === 0
    ? `{\"person_id\":${personId.value}}`
    : `{\"person_id\":${personId.value},${otherInputsJson.slice(1)}`

  return `{\"workflowId\":${JSON.stringify(workflowId)},\"inputs\":${inputsJson}}`
}

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

export const executeWorkflow = async (type: 'open' | 'close', inputs?: Record<string, unknown>) => {
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

  // 前台人脸识别得到的身份必须交给工作流；员工打卡、访客审批由
  // 工作流内部统一判断。Temi 的人体检测没有身份时则不传 inputs。
  const hasInputs = Boolean(inputs && Object.keys(inputs).length > 0)
  const requestBody = serializeWorkflowRequest(config.workflowId, inputs)

  try {
    const apiKey = config.apiKey.trim()
    logUnique(`${type}-executing`, 'log', `[Workflow] Executing ${type} workflow...`, {
      url: workflowConfig.executionUrl,
      workflowId: config.workflowId,
      hasInputs
    })

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    }

    const response = await fetch(workflowConfig.executionUrl, {
      method: 'POST',
      headers,
      body: requestBody
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Workflow execution failed: ${response.status} ${response.statusText} - ${errorText}`)
    }

    const result = await response.json() as { code?: unknown; msg?: unknown }
    const resultCode = typeof result?.code === 'number' ? result.code : undefined
    if (resultCode !== undefined && resultCode !== 200) {
      throw new Error(`Workflow execution rejected: code=${resultCode}, msg=${String(result?.msg || '')}`)
    }
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
