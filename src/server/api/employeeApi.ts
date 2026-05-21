import { HttpClient } from '../httpClient'

// 内联定义ApiResponse类型，避免导入问题
interface ApiResponse<T = any> {
    code: number
    msg: string
    data: T
}

// 员工状态枚举
export enum EmployeeServerStatus {
    UNPUBLISHED = 0,    // 未发布
    PUBLISHING = 1,     // 发布中
    RUNNING = 2,        // 运行中
    ERROR = -1,         // 异常
    STOPPED = -2        // 停止
}

// 员工信息接口（队列状态接口返回的数据结构）
export interface EmployeeInfo {
    id: string
    employeeId: string
    serverStatus: EmployeeServerStatus
    status?: number
    containerName?: string | null
    serverId?: string
    dockerInfoId?: string
    modelId?: string
    promptId?: string
    enableLongTermMemory?: boolean
    createBy?: string | null
    createTime?: string | null
    updateBy?: string | null
    updateTime?: string | null
}

export class EmployeeApi {
    /**
     * 获取员工状态（队列状态）
     * @param employeeId 员工ID
     * @returns Promise<EmployeeInfo>
     */
    static async getEmployeeStatus(employeeId: string): Promise<EmployeeInfo> {
        const endpoint = `/system/employee/getEmployees/queue_status/${employeeId}`

        try {
            const result: ApiResponse<EmployeeInfo> = await HttpClient.get(endpoint)

            if (result.code !== 200) {
                throw new Error(result.msg || '获取员工状态失败')
            }

            return result.data
        } catch (error) {
            console.error('❌ [EmployeeApi] 获取员工状态失败:', error)
            throw error
        }
    }

    /**
     * 获取员工状态文本描述
     * @param status 员工状态
     * @returns string
     */
    static getStatusText(status: EmployeeServerStatus): string {
        const statusMap: Record<EmployeeServerStatus, string> = {
            [EmployeeServerStatus.UNPUBLISHED]: '未发布',
            [EmployeeServerStatus.PUBLISHING]: '发布中',
            [EmployeeServerStatus.RUNNING]: '运行中',
            [EmployeeServerStatus.ERROR]: '异常',
            [EmployeeServerStatus.STOPPED]: '停止'
        }
        return statusMap[status] || '未知状态'
    }

    /**
     * 检查员工是否处于运行状态
     * @param status 员工状态
     * @returns boolean
     */
    static isRunning(status: EmployeeServerStatus): boolean {
        return status === EmployeeServerStatus.RUNNING
    }
}
