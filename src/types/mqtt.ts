export interface MqttConfig {
  host: string
  username: string
  password: string
  userId: string
  sendTopic: string
  receiveTopic: string
}

export type MqttStatus = 
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error'
  | 'offline'
  | 'reconnecting'
  | 'closed'
  | 'timeout'
  | 'auth_failed'
  | 'reconnect_failed'

export interface MqttMessage {
  text?: string
  index?: number
  is_end?: boolean
  type?: string
  message_id?: string
  session_id?: string
  [key: string]: any
}

export interface MqttSendMessage {
  query: string
  type: string
  demp_id: string
  device_id: string
  device_type: string
  response_mode: string
  permission_id: string
  [key: string]: any
}

export interface BindingMessage {
  type: 'binding' | 'unbind'
  employeeId: string
  userId?: string
}


