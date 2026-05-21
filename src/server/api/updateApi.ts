export interface LiveUpdateResponse {
    bundleId: string
    url: string
}

export interface ApkUpdateResponse {
    version: string
    url: string
}

export class UpdateApi {
    /**
     * 获取最新APK版本信息
     * @param baseUrl 更新服务器地址
     * @returns Promise<ApkUpdateResponse | undefined>
     */
    static async getLatestApkVersion(baseUrl: string): Promise<ApkUpdateResponse | undefined> {
        try {
            const url = `${baseUrl}/apk/latest`
            console.log('🔗 [UpdateApi] 获取最新APK版本:', url)

            const response = await fetch(url)
            if (!response.ok) return

            const result = await response.json()
            console.log('✅ [UpdateApi] 获取最新APK版本成功:', result)
            return result
        } catch (error) {
            console.error('❌ [UpdateApi] 获取最新APK版本失败:', error)
            return undefined
        }
    }

    /**
     * 获取最新LiveUpdate包信息
     * @param baseUrl 更新服务器地址
     * @param channel 更新通道
     * @returns Promise<LiveUpdateResponse | undefined>
     */
    static async getLatestLiveUpdate(baseUrl: string, channel: string): Promise<LiveUpdateResponse | undefined> {
        try {
            const url = `${baseUrl}/live-updates/latest?channel=${encodeURIComponent(channel)}`
            console.log('🔗 [UpdateApi] 获取最新LiveUpdate包:', url)

            const response = await fetch(url)
            if (!response.ok) return

            const result = await response.json()
            console.log('✅ [UpdateApi] 获取最新LiveUpdate包成功:', result)
            return result
        } catch (error) {
            console.error('❌ [UpdateApi] 获取最新LiveUpdate包失败:', error)
            return undefined
        }
    }
}
