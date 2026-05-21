import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export type ExceptionSeverity = 'critical' | 'high' | 'medium' | 'low'

export interface AppException {
  id: string
  time: string
  severity: ExceptionSeverity
  title: string
  detail?: string
  source?: string
  code?: string
  dedupeKey?: string
}

interface ReportPayload {
  severity: ExceptionSeverity
  title: string
  detail?: string
  source?: string
  code?: string
  dedupeKey?: string
}

export const useExceptionStore = defineStore('appException', () => {
  const generateId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  // 默认异常：数字员工离线（可在建立连接后按 key 清理）
  const exceptions = ref<AppException[]>([])

  const report = (payload: ReportPayload): AppException => {
    // 去重策略：若提供 dedupeKey，则更新现有同 key 的异常而不是重复堆叠
    if (payload.dedupeKey) {
      const existing = exceptions.value.find(e => e.dedupeKey === payload.dedupeKey)
      if (existing) {
        existing.severity = payload.severity
        existing.title = payload.title
        existing.detail = payload.detail
        existing.source = payload.source
        existing.code = payload.code
        existing.time = new Date().toISOString()
        return existing
      }
    }

    const item: AppException = {
      id: generateId(),
      time: new Date().toISOString(),
      severity: payload.severity,
      title: payload.title,
      detail: payload.detail,
      source: payload.source,
      code: payload.code,
      dedupeKey: payload.dedupeKey,
    }
    exceptions.value.unshift(item)
    return item
  }

  const resolveById = (id: string) => {
    const idx = exceptions.value.findIndex(e => e.id === id)
    if (idx !== -1) exceptions.value.splice(idx, 1)
  }

  const resolveByKey = (dedupeKey: string) => {
    for (let i = exceptions.value.length - 1; i >= 0; i -= 1) {
      if (exceptions.value[i].dedupeKey === dedupeKey) {
        exceptions.value.splice(i, 1)
      }
    }
  }

  const clearAll = () => { exceptions.value = [] }

  const list = computed(() => [...exceptions.value]
    .sort((a, b) => {
      const severityRank: Record<ExceptionSeverity, number> = {
        critical: 3,
        high: 2,
        medium: 1,
        low: 0,
      }
      const rankDiff = severityRank[b.severity] - severityRank[a.severity]
      if (rankDiff !== 0) return rankDiff
      return b.time.localeCompare(a.time)
    }))

  const hasBlocking = computed(() => list.value.some(e => e.severity === 'critical' || e.severity === 'high'))

  // 强制刷新弹窗状态
  const forceReloadDialogVisible = ref(false)

  const showForceReloadDialog = () => {
    forceReloadDialogVisible.value = true
  }

  const hideForceReloadDialog = () => {
    forceReloadDialogVisible.value = false
  }

  return {
    exceptions,
    list,
    hasBlocking,
    report,
    resolveById,
    resolveByKey,
    clearAll,
    forceReloadDialogVisible,
    showForceReloadDialog,
    hideForceReloadDialog,
  }
})


