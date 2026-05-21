import { HttpClient } from '../httpClient'

/**
 * API响应结构
 */
interface ApiResponse<T = any> {
  code: number
  msg?: string
  message?: string
  data: T
}

/**
 * 更新类型枚举
 */
export enum UpdateType {
  /** 全量更新 */
  FULL = 1,
  /** 增量更新 */
  INCREMENTAL = 2,
}

/**
 * 版本信息类型
 */
export type StoreVersionInfoType = 'appVersion' | 'majorVersion'

/**
 * 版本信息值类型
 */
export interface StoreVersionInfoTypeValue {
  /** 下载地址 */
  downloadUrl: string
  /** 状态：1-可用，0-不可用 */
  status: number
  /** 版本号 */
  version: string
  /** 更新类型 */
  appUpdateType: UpdateType
  /** 版本ID（用于增量更新的bundleId） */
  id: string
}

/**
 * 版本列表项
 */
export interface VersionInfoItem extends StoreVersionInfoTypeValue {}

/**
 * 版本信息响应数据结构
 */
export interface StoreVersionInfoResponse {
  /** 版本列表（包含全量与增量） */
  versions: VersionInfoItem[]
}

/**
 * 固件检查响应数据结构
 */
export interface FirmwareCheckResponse {
  id: number
  createTime: string
  updateTime: string
  version: string
  fileName: string
  originalFileName: string
  size: number
  description: string
  firmwareCategoryId: number
  sql: string | null
  status: number
  signatureBase64: string
  createBy: string | null
  updateBy: string | null
  allowIp: string
}

/**
 * 外部API基础URL（固件管理）
 */
const FIRMWARE_API_BASE_URL = 'http://183.239.61.90:8001'

/**
 * 固件类别代码
 */
const FIRMWARE_CATEGORY_CODE = 'lzwc-demp-customer-apkupdater'

/**
 * 检查设备是否需要更新
 * @param currentVersion 当前版本号
 * @returns Promise<ApiResponse<FirmwareCheckResponse | null>>
 */
export async function checkFirmwareUpdate(currentVersion?: string): Promise<ApiResponse<FirmwareCheckResponse | null>> {
  const endpoint = '/admin/firmware/info/check'
  
  const params: Record<string, string> = {
    firmwareCategoryCode: FIRMWARE_CATEGORY_CODE,
  }
  
  if (currentVersion) {
    params.currentVersion = currentVersion
  }
  
  try {
    const result: ApiResponse<FirmwareCheckResponse | null> = await HttpClient.get(endpoint, params, {
      baseUrl: FIRMWARE_API_BASE_URL,
    })
    
    if (result.code !== 200 && result.code !== 1000) {
      throw new Error(result.message || result.msg || '检查更新失败')
    }
    
    return result
  } catch (error: any) {
    console.error('❌ [VersionApi] 检查固件更新失败:', error?.message || error)
    throw error
  }
}

/**
 * 根据容器名称和版本号获取下载地址
 * @param version 版本号
 * @returns Promise<ApiResponse<string>>
 */
export async function getFirmwareDownloadURL(version: string): Promise<ApiResponse<string>> {
  const endpoint = '/admin/firmware/info/getDownloadURL'
  
  const params: Record<string, string> = {
    firmwareCategoryCode: FIRMWARE_CATEGORY_CODE,
    version: version,
  }
  
  try {
    const result: ApiResponse<string> = await HttpClient.get(endpoint, params, {
      baseUrl: FIRMWARE_API_BASE_URL,
    })
    
    if (result.code !== 200 && result.code !== 1000) {
      throw new Error(result.message || result.msg || '获取下载地址失败')
    }
    
    return result
  } catch (error: any) {
    console.error('❌ [VersionApi] 获取下载地址失败:', error?.message || error)
    throw error
  }
}

