import { HttpClient } from '../httpClient'
import type { DeviceConfig, DeviceInfo } from '@/stores/device'

// 内联定义ApiResponse类型，避免导入问题
interface ApiResponse<T = any> {
    code: number
    msg: string
    data: T
}

export interface DeviceReportRequest {
    activationCode: string
    deviceName: string
    deviceTypeName: string
    deviceId: string
}

export interface DeviceReportResponse {
    serverId: string
    activationTime: string
}

// 新的配置结构接口（从 deviceParams 获取）
export interface DeviceParamsConfig {
    isCloud: boolean
    silentLogin: boolean
    enableCamera: boolean
    showSettingsButton: boolean
    // 语音识别配置
    speechRecognition?: {
        protocol?: string
        ip?: string
        port?: number
        url?: string
    }
    // 语音播报配置
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
        // Live2D动作配置（现在在 live2dModelConfig 内部）
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
    chatMqttBroker?: {
        mqttProtocol?: string
        mqttIp?: string
        mqttPort?: number
        mqttDefaultPort?: number
        mqttUsername?: string
        mqttPassword?: string
        mqttUrl?: string
    }
    deviceServerIp?: string
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
}

export interface DeviceInfoResponse {
    deviceId?: string
    serverId?: string
    employeeId?: string | null
    userId?: string
    deviceParams?: DeviceParamsConfig | null
    [key: string]: any
}

export class DeviceApi {
    /**
     * 设备上报
     * @param requestData 设备上报数据
     * @returns Promise<DeviceReportResponse>
     */
    static async reportDevice(requestData: DeviceReportRequest): Promise<DeviceReportResponse> {
        const endpoint = '/system/serverConfig/deviceActivate'

        try {
            console.log('🔗 [DeviceApi] 设备上报:', endpoint)

            const result: ApiResponse<DeviceReportResponse> = await HttpClient.post(endpoint, requestData)

            if (result.code !== 200) {
                throw new Error(result.msg || '设备上报失败')
            }

            console.log('✅ [DeviceApi] 设备上报成功:', result.data)
            return result.data
        } catch (error) {
            console.error('❌ [DeviceApi] 设备上报失败:', error)
            throw error
        }
    }

    /**
     * 查询设备信息
     * @param serverId 服务器ID（设备上报后返回的唯一标识）
     * @returns Promise<DeviceInfoResponse>
     */
    static async getDeviceInfo(serverId: string): Promise<DeviceInfoResponse> {
        const endpoint = '/system/baseDevice/info'

        try {
            console.log('🔗 [DeviceApi] 查询设备信息:', endpoint, { deviceId: serverId })
            console.log('📡 [DeviceApi] 准备发送 GET 请求到:', endpoint)

            const result: ApiResponse<DeviceInfoResponse> = await HttpClient.get(endpoint, { deviceId: serverId })

            console.log('📥 [DeviceApi] 接口响应:', result)

            if (result.code !== 200) {
                throw new Error(result.msg || '查询设备信息失败')
            }

            console.log('✅ [DeviceApi] 查询设备信息成功:', result.data)
            return result.data
        } catch (error) {
            console.error('❌ [DeviceApi] 查询设备信息失败:', error)
            throw error
        }
    }

    /**
     * 完整的设备激活流程
     * @param deviceInfo 设备信息
     * @returns Promise<DeviceConfig>
     */
    static async activateDevice(deviceInfo: DeviceInfo): Promise<DeviceConfig> {
        try {
            console.log('🔧 [DeviceApi] 开始设备激活流程...')

            // 1. 设备上报
            const reportResult = await this.reportDevice({
                activationCode: deviceInfo.activationCode,
                deviceName: deviceInfo.deviceName,
                deviceTypeName: deviceInfo.deviceTypeName,
                deviceId: deviceInfo.deviceId
            })

            // 2. 构建设备配置（不再需要获取MQTT配置）
            const deviceConfig: DeviceConfig = {
                serverId: reportResult.serverId,
                activationTime: reportResult.activationTime,
                deviceId: deviceInfo.deviceId,
                serverUrl: HttpClient.getBaseUrl()
            }

            console.log('✅ [DeviceApi] 设备上报成功:', deviceConfig)
            return deviceConfig
        } catch (error) {
            console.error('❌ [DeviceApi] 设备激活失败:', error)
            throw error
        }
    }
}
