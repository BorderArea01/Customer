import { HttpClient } from '../httpClient'

// 内联定义ApiResponse类型，避免导入问题
interface ApiResponse<T = any> {
    code: number
    msg: string
    data: T
}

// 静默登录请求
export interface SilentLoginRequest {
    userName: string
    password: string
}

// 静默登录响应 - 根据实际接口返回结构定义
export interface SilentLoginResponse {
    userId: string
    userName?: string
    nickName?: string
    userType?: string
    admin?: boolean
    avatar?: string
    email?: string
    phonenumber?: string
    [key: string]: any // 其他可能的字段
}

export class UserApi {
    /**
     * 静默登录 - 通过账号密码获取用户信息
     * @param loginData 登录数据
     * @returns Promise<SilentLoginResponse>
     */
    static async silentLogin(loginData: SilentLoginRequest): Promise<SilentLoginResponse> {
        const endpoint = '/system/mcpServer/user/info'

        try {
            console.log('🔗 [UserApi] 静默登录:', endpoint)

            const result: ApiResponse<SilentLoginResponse> = await HttpClient.post(endpoint, loginData)

            if (result.code !== 200) {
                throw new Error(result.msg || '静默登录失败')
            }

            console.log('✅ [UserApi] 静默登录成功:', result.data)
            return result.data
        } catch (error) {
            console.error('❌ [UserApi] 静默登录失败:', error)
            throw error
        }
    }

}
