import { useConfigStore } from '@/stores/config'
import { useDeviceStore } from '@/stores/device'
import { useLogStore } from '@/stores/log'
import { useChatStore } from '@/stores/chat'
import { CapacitorHttp } from '@capacitor/core'
import { Capacitor } from '@capacitor/core'

export interface ApiResponse<T = any> {
    code: number
    msg: string
    data: T
}

export class HttpClient {

    /**
     * 通用GET请求
     * @param endpoint 接口端点或完整URL
     * @param params 查询参数
     * @param options 请求选项，可指定自定义baseUrl
     * @returns Promise<T>
     */
    static async get<T = any>(endpoint: string, params?: Record<string, string>, options?: { baseUrl?: string }): Promise<T> {
        const baseUrl = options?.baseUrl || this.getBaseUrl()
        let url = endpoint.startsWith('http://') || endpoint.startsWith('https://') 
            ? endpoint 
            : `${baseUrl}${endpoint}`

        if (params) {
            const searchParams = new URLSearchParams(params)
            url += `?${searchParams.toString()}`
        }

        try {
            try { useLogStore().append({ source: 'HTTP', level: 'info', message: `GET ${url}` }) } catch {}
            console.log('📡 [HttpClient] 发送GET请求:', url)
            console.log('📡 [HttpClient] 平台:', Capacitor.getPlatform())

            let result: any

            // 在原生平台使用 CapacitorHttp 绕过 CORS，在 Web 平台使用 fetch
            if (Capacitor.isNativePlatform()) {
                const response = await CapacitorHttp.get({
                    url: url,
                    headers: {
                        'Content-Type': 'application/json',
                    },
                })

                console.log('📡 [HttpClient] 响应状态:', response.status)
                console.log('📡 [HttpClient] 响应头:', response.headers)

                if (response.status < 200 || response.status >= 300) {
                    const errorText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
                    console.error('❌ [HttpClient] HTTP错误:')
                    console.error('  状态码:', response.status)
                    console.error('  响应内容:', errorText)
                    throw new Error(`HTTP ${response.status} - ${errorText}`)
                }

                // CapacitorHttp 返回的 data 可能已经是对象，也可能需要解析
                result = typeof response.data === 'string' ? JSON.parse(response.data) : response.data
            } else {
                console.log('🌐 [HttpClient] 使用fetch请求')
                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                })


                if (!response.ok) {
                    const errorText = await response.text().catch(() => '无法读取响应内容')
                    console.error('❌ [HttpClient] HTTP错误:')
                    console.error('  状态码:', response.status)
                    console.error('  状态文本:', response.statusText)
                    console.error('  响应内容:', errorText)
                    throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`)
                }

                result = await response.json()
            }

            try { useLogStore().append({ source: 'HTTP', level: 'info', message: `OK GET ${url}`, detail: result }) } catch {}
            return result
        } catch (error: any) {
            console.error('❌ [HttpClient] GET请求失败')
            console.error('  请求URL:', url)
            console.error('  错误类型:', error?.constructor?.name || typeof error)
            console.error('  错误消息:', error?.message || String(error))
            console.error('  错误堆栈:', error?.stack || '无堆栈信息')
            if (error?.name) {
                console.error('  错误名称:', error.name)
            }
            if (error?.cause) {
                console.error('  错误原因:', error.cause)
            }
            // 尝试打印完整的错误对象
            try {
                console.error('  完整错误对象:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2))
            } catch (e) {
                console.error('  无法序列化错误对象:', e)
                console.error('  原始错误:', error)
            }
            try { useLogStore().append({ source: 'HTTP', level: 'error', message: `FAIL GET ${url}`, detail: error }) } catch {}
            throw error
        }
    }

    /**
     * 通用POST请求
     * @param endpoint 接口端点
     * @param data 请求数据
     * @param options 请求选项
     * @returns Promise<T>
     */
    static async post<T = any>(endpoint: string, data?: any, options?: { injectChatIds?: boolean }): Promise<T> {
        const baseUrl = this.getBaseUrl()
        const url = `${baseUrl}${endpoint}`

        // 如果需要注入聊天ID，使用ChatStore处理
        let requestData = data
        if (options?.injectChatIds && data) {
            const chatStore = useChatStore()
            requestData = chatStore.attachIdsToPayload(data)
        }

        try {
            try { useLogStore().append({ source: 'HTTP', level: 'info', message: `POST ${url}`, detail: requestData }) } catch {}

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: requestData ? JSON.stringify(requestData) : undefined,
            })

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`)
            }

            const result = await response.json()
            try { useLogStore().append({ source: 'HTTP', level: 'info', message: `OK POST ${url}`, detail: result }) } catch {}
            return result
        } catch (error) {
            try { useLogStore().append({ source: 'HTTP', level: 'error', message: `FAIL POST ${url}`, detail: error }) } catch {}
            throw error
        }
    }

    /**
     * 文件上传请求
     * @param endpoint 接口端点
     * @param formData FormData对象
     * @returns Promise<T>
     */
    static async upload<T = any>(endpoint: string, formData: FormData): Promise<T> {
        const baseUrl = this.getBaseUrl()
        const url = `${baseUrl}${endpoint}`

        try {
            try { useLogStore().append({ source: 'HTTP', level: 'info', message: `UPLOAD ${url}` }) } catch {}

            const response = await fetch(url, {
                method: 'POST',
                body: formData,
                headers: {
                    'Accept': 'application/json',
                },
            })

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`)
            }

            const result = await response.json()
            try { useLogStore().append({ source: 'HTTP', level: 'info', message: `OK UPLOAD ${url}`, detail: result }) } catch {}
            return result
        } catch (error) {
            try { useLogStore().append({ source: 'HTTP', level: 'error', message: `FAIL UPLOAD ${url}`, detail: error }) } catch {}
            throw error
        }
    }

    /**
     * 获取员工ID
     * @returns string | null
     */
    static getEmployeeId(): string | null {
        const deviceStore = useDeviceStore()
        return deviceStore.employeeInfo?.employeeId || null
    }

    /**
     * 流式POST请求（用于聊天等流式响应）
     * @param endpoint 接口端点
     * @param data 请求数据
     * @param onMessage 消息回调
     * @param options 请求选项
     * @returns Promise<void>
     */
    static async postStream<T = any>(
        endpoint: string, 
        data?: any, 
        onMessage?: (chunk: T) => void,
        options?: { injectChatIds?: boolean }
    ): Promise<void> {
        const baseUrl = this.getBaseUrl()
        const url = `${baseUrl}${endpoint}`

        // 如果需要注入聊天ID，使用ChatStore处理
        let requestData = data
        if (options?.injectChatIds && data) {
            const chatStore = useChatStore()
            requestData = chatStore.attachIdsToPayload(data)
        }

        try {
            try { useLogStore().append({ source: 'HTTP', level: 'info', message: `POST STREAM ${url}`, detail: requestData }) } catch {}

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'text/event-stream',
                },
                body: requestData ? JSON.stringify(requestData) : undefined,
            })

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`)
            }

            if (!response.body) {
                throw new Error('响应体为空')
            }

            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            const chatStore = useChatStore()

            try {
                while (true) {
                    const { done, value } = await reader.read()
                    
                    if (done) {
                        break
                    }

                    const chunk = decoder.decode(value, { stream: true })
                    const lines = chunk.split('\n')

                    for (const line of lines) {
                        if (line.trim() === '') continue
                        
                        if (line.startsWith('data: ')) {
                            const data = line.slice(6)
                            if (data === '[DONE]') {
                                break
                            }

                            try {
                                const parsed = JSON.parse(data)
                                
                                // 使用ChatStore过滤消息
                                if (chatStore.shouldAcceptIncoming(parsed)) {
                                    onMessage?.(parsed)
                                } else {
                                    console.log('🚫 [HTTP] 流式消息被过滤:', parsed)
                                }
                            } catch (parseError) {
                                console.warn('⚠️ [HTTP] 流式数据解析失败:', parseError, '原始数据:', data)
                            }
                        }
                    }
                }
            } finally {
                reader.releaseLock()
            }

            try { useLogStore().append({ source: 'HTTP', level: 'info', message: `OK POST STREAM ${url}` }) } catch {}
        } catch (error) {
            try { useLogStore().append({ source: 'HTTP', level: 'error', message: `FAIL POST STREAM ${url}`, detail: error }) } catch {}
            throw error
        }
    }

    /**
     * 获取基础URL
     * @returns string
     */
    static getBaseUrl(): string {
        const configStore = useConfigStore()
        
        // 优先使用 serverUrl（完整URL）
        if (configStore.serverUrl && /^https?:\/\//.test(configStore.serverUrl)) {
            return configStore.serverUrl
        }
        
        // 如果 serverUrl 是 IP/域名，尝试构建完整URL
        if (configStore.serverUrl && !/^https?:\/\//.test(configStore.serverUrl)) {
            // 如果 serverUrl 是 IP/域名，使用 http 协议和默认端口构建
            return `http://${configStore.serverUrl}:8088`
        }
        
        // 如果没有 serverUrl，使用 serverIp（如果它是完整URL）
        if (configStore.serverIp && /^https?:\/\//.test(configStore.serverIp)) {
            return configStore.serverIp
        }
        
        // 如果 serverIp 是 IP/域名，构建完整URL
        if (configStore.serverIp && !/^https?:\/\//.test(configStore.serverIp)) {
            return `http://${configStore.serverIp}:8088`
        }
        
        // 如果都没有，抛出错误
        throw new Error('服务器URL未配置')
    }
}
