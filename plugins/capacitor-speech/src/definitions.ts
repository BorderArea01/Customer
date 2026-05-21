// 核心语音选项接口
export interface SpeechOptions {
  text: string;
  voice?: string;
  speed?: number;
  pitch?: number;
  volume?: number;
  language?: string;
}

// 语音信息接口
export interface VoiceInfo {
  id: string;
  name: string;
  language: string;
  default: boolean;
}

// 简化事件接口
export interface SpeechEvent {
  type: 'start' | 'end' | 'error';
  text?: string;
  interrupted?: boolean;
  message?: string;
}

// 队列项接口
export interface QueueItem {
  id: string;
  text: string;
}

// 队列状态接口
export interface QueueStatus {
  isPlaying: boolean;
  currentIndex: number;
  totalItems: number;
  remainingItems: number;
  currentItem?: QueueItem;
}

// 队列事件接口
export interface QueueEvent {
  type: 'queue_start' | 'queue_end' | 'queue_item_start' | 'queue_item_end';
  totalItems?: number;
  completed?: boolean;
  interrupted?: boolean;
  item?: QueueItem;
  index?: number;
  success?: boolean;
}

// 简化响应接口
export interface SpeechResponse {
  success: boolean;
  message?: string;
  user_stopped?: boolean;
  queueId?: string;
}

// 监听器接口
export interface PluginListenerHandle {
  remove: () => Promise<void>;
}

// 简化的核心插件接口
export interface LzwcSpeechPlugin {
  // 核心方法
  initialize(options?: { deviceId?: string; xunfeiAppId?: string; xunfeiApiKey?: string; xunfeiApiSecret?: string }): Promise<SpeechResponse>;
  speak(options: SpeechOptions): Promise<SpeechResponse>;
  stop(): Promise<SpeechResponse>;
  isSpeaking(): Promise<{ isSpeaking: boolean }>;
  getVoices(): Promise<{ voices: VoiceInfo[] }>;

  // 运行时配置（可选）
  setCredentials?(options: { xunfeiAppId?: string; xunfeiApiKey?: string; xunfeiApiSecret?: string }): Promise<SpeechResponse>;

  // 队列方法 - 保持原有方法名以兼容Android实现
  addToQueue(options: SpeechOptions): Promise<SpeechResponse>;
  startQueuePlayback(options?: { autoStart?: boolean; clearExisting?: boolean }): Promise<SpeechResponse>;
  stopQueuePlayback(): Promise<SpeechResponse>;
  clearQueue(): Promise<SpeechResponse>;
  getQueueStatus(): Promise<QueueStatus>;

  // 事件监听 - 保持原有事件名称
  addListener(
    eventName: 'start' | 'end' | 'error' | 'boundary' | 'queue_start' | 'queue_end' | 'queue_item_start' | 'queue_item_end',
    listenerFunc: (event: any) => void
  ): Promise<PluginListenerHandle>;
}
