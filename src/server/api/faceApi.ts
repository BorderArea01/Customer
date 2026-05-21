import { HttpClient } from '../httpClient'

export interface FaceRecognitionResponse {
    code: number
    msg: string
    data?: {
        userId: string
        nickName: string
        userType: string
        receptionLocation: string
        passStatus: string
    }
}

export class FaceApi {
    /**
     * 人脸识别
     * @param imageData 图像数据（base64或Blob）
     * @returns Promise<FaceRecognitionResponse['data'] | null>
     */
    static async recognizeFace(imageData: string | Blob): Promise<FaceRecognitionResponse['data'] | null> {
        try {
            const formData = new FormData()

            // 处理图像数据
            let file: File
            if (typeof imageData === 'string') {
                // 如果是base64字符串，转换为Blob
                const response = await fetch(imageData)
                const blob = await response.blob()
                file = new File([blob], 'frame.jpg', { type: 'image/jpeg' })
            } else {
                // 如果已经是Blob，直接使用
                file = new File([imageData], 'frame.jpg', { type: 'image/jpeg' })
            }

            formData.append('file', file)

            const endpoint = '/system/visitorRecord/recognizeFace'

            console.log('🔗 [FaceApi] 人脸识别:', endpoint)

            const result: FaceRecognitionResponse = await HttpClient.upload(endpoint, formData)

            if (result.code === 200 && result.data) {
                console.log('✅ [FaceApi] 人脸识别成功:', result.data)
                return result.data
            } else {
                console.warn('❌ [FaceApi] 人脸识别失败:', result.code, result.msg)
                return null
            }
        } catch (error) {
            console.error('❌ [FaceApi] 人脸识别异常:', error)
            return null
        }
    }
}
