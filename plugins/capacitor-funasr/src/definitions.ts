export interface AudioDevice {
  id: string;
  name: string;
  type: 'microphone' | 'headset' | 'bluetooth' | 'default';
}

export interface LzwcFunasrPlugin {
  echo(options: { value: string }): Promise<{ value: string }>;

  /**
   * 初始化FunASR连接
   */
  initialize(options: {
    serverUrl: string;
    hotWords?: string;
    sampleRate?: number;
    chunkSize?: string;
    chunkInterval?: number;
    mode?: string;
    wavFormat?: string;
  }): Promise<{ success: boolean; message?: string }>;

  /**
   * 开始语音识别
   */
  startListening(): Promise<{ success: boolean; message?: string }>;

  /**
   * 停止语音识别
   */
  stopListening(): Promise<{ success: boolean; message?: string }>;

  /**
   * 断开连接
   */
  disconnect(): Promise<{ success: boolean; message?: string }>;

  /**
   * 检查连接状态
   */
  getConnectionStatus(): Promise<{ connected: boolean; status: string }>;

  /**
   * 获取可用音频设备
   */
  getAudioDevices(): Promise<{ devices: AudioDevice[] }>;

  /**
   * 选择音频设备
   */
  selectAudioDevice(options: { deviceId: string }): Promise<void>;

  /**
   * 发送心跳消息（用于保持连接活跃）
   */
  sendHeartbeat(): Promise<{ success: boolean; message?: string }>;

  /**
   * 添加事件监听器
   */
  addListener(eventName: 'recognitionResult', listenerFunc: (result: RecognitionResult) => void): Promise<any>;
  addListener(eventName: 'connectionStatusChanged', listenerFunc: (status: ConnectionStatus) => void): Promise<any>;
  addListener(eventName: 'error', listenerFunc: (error: ErrorEvent) => void): Promise<any>;
}

/**
 * 识别结果事件
 */
export interface RecognitionResult {
  text: string;
  isFinal: boolean;
  mode?: string;
  timestamp: number;
}

/**
 * 连接状态事件
 */
export interface ConnectionStatus {
  connected: boolean;
  status: string;
  message?: string;
}

/**
 * 错误事件
 */
export interface ErrorEvent {
  error: string;
  code?: number;
  message?: string;
}
