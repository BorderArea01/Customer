import { WebPlugin } from '@capacitor/core';
import type {
  LzwcSpeechPlugin,
  SpeechOptions,
  VoiceInfo,
  SpeechResponse,
  QueueStatus,
  PluginListenerHandle
} from './definitions';

export class LzwcSpeechWeb extends WebPlugin implements LzwcSpeechPlugin {
  private isCurrentlySpeaking = false;
  private queue: SpeechOptions[] = [];
  private queuePlaying = false;
  private queueIndex = -1;


  async initialize(_options?: { deviceId?: string; xunfeiAppId?: string; xunfeiApiKey?: string; xunfeiApiSecret?: string; xunfeiAbilityId?: string }): Promise<SpeechResponse> {
    if ('speechSynthesis' in window) {
      return { success: true };
    }
    return { success: false };
  }

  async setCredentials(_options: { xunfeiAppId?: string; xunfeiApiKey?: string; xunfeiApiSecret?: string; xunfeiAbilityId?: string }): Promise<SpeechResponse> {
    // Web 端仅为兼容占位，直接返回成功
    return { success: true };
  }

  async speak(options: SpeechOptions): Promise<SpeechResponse> {
    try {
      if (!('speechSynthesis' in window)) {
        return {
          success: false,
          message: 'Speech synthesis not supported in this browser',
          user_stopped: false
        };
      }

      // 支持打断：若正在说话，先中断再继续
      if (this.isCurrentlySpeaking || window.speechSynthesis.speaking) {
        try {
          window.speechSynthesis.cancel();
        } catch {}
        this.isCurrentlySpeaking = false;
      }

      const { text, speed = 50, pitch = 50, volume = 50, language = 'zh-CN' } = options;

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = language;
      utterance.rate = Math.max(0.1, Math.min(10, speed / 50));
      utterance.pitch = Math.max(0, Math.min(2, pitch / 50));
      utterance.volume = Math.max(0, Math.min(1, volume / 100));

      utterance.onstart = () => {
        this.isCurrentlySpeaking = true;
        this.notifyListeners('start', { text });
      };

      utterance.onend = () => {
        this.isCurrentlySpeaking = false;
        this.notifyListeners('end', { interrupted: false });
      };

      utterance.onerror = (ev: any) => {
        this.isCurrentlySpeaking = false;
        const message = ev?.error || 'Unknown error';
        this.notifyListeners('error', { message });
      };

      utterance.onpause = () => { };
      utterance.onresume = () => { };
      utterance.onboundary = (e: any) => {
        try {
          this.notifyListeners('boundary', {
            name: e?.name,
            charIndex: e?.charIndex,
            charLength: e?.charLength
          });
        } catch { }
      };

      window.speechSynthesis.speak(utterance);
      return {
        success: true,
        user_stopped: false
      };
    } catch (error) {
      // 确保在异常情况下也重置状态
      this.isCurrentlySpeaking = false;
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        user_stopped: false
      };
    }
  }

  async getVoices(): Promise<{ voices: VoiceInfo[] }> {
    if (!('speechSynthesis' in window)) {
      return { voices: [] };
    }

    const voices = window.speechSynthesis.getVoices();
    const voiceInfos: VoiceInfo[] = voices.map(voice => ({
      id: voice.voiceURI,
      name: voice.name,
      language: voice.lang,
      default: voice.default
    }));

    return { voices: voiceInfos };
  }

  async stop(): Promise<SpeechResponse> {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      this.isCurrentlySpeaking = false;
      // 主动停止时对齐原生行为：发送 end(interrupted)
      this.notifyListeners('end', { interrupted: true });
    }
    return { success: true };
  }

  async isSpeaking(): Promise<{ isSpeaking: boolean }> {
    if (!('speechSynthesis' in window)) {
      return { isSpeaking: false };
    }

    return {
      isSpeaking: this.isCurrentlySpeaking || window.speechSynthesis.speaking
    };
  }

  // 队列方法 - Web平台简易实现（串行播放）
  async addToQueue(options: SpeechOptions): Promise<SpeechResponse> {
    this.queue.push(options);
    return { success: true };
  }

  private playNextInQueue() {
    if (!('speechSynthesis' in window)) {
      this.queuePlaying = false;
      this.notifyListeners('queue_end', { completed: false, interrupted: true });
      return;
    }

    if (!this.queuePlaying) return;
    if (this.queueIndex + 1 >= this.queue.length) {
      // 完成
      const total = this.queue.length;
      this.queue = [];
      this.queuePlaying = false;
      this.queueIndex = -1;
      this.notifyListeners('queue_end', { completed: true, interrupted: false, totalItems: total });
      return;
    }

    this.queueIndex += 1;
    const options = this.queue[this.queueIndex];
    const { text, speed = 50, pitch = 50, volume = 50, language = 'zh-CN' } = options;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;
    utterance.rate = Math.max(0.1, Math.min(10, speed / 50));
    utterance.pitch = Math.max(0, Math.min(2, pitch / 50));
    utterance.volume = Math.max(0, Math.min(1, volume / 100));

    const item = { id: `${Date.now()}_${this.queueIndex}`, text };
    utterance.onstart = () => {
      this.isCurrentlySpeaking = true;
      this.notifyListeners('queue_item_start', { item, index: this.queueIndex });
    };
    utterance.onend = () => {
      this.isCurrentlySpeaking = false;
      this.notifyListeners('queue_item_end', { item, index: this.queueIndex, success: true });
      this.playNextInQueue();
    };
    utterance.onerror = (ev: any) => {
      this.isCurrentlySpeaking = false;
      const message = ev?.error || 'Unknown error';
      this.notifyListeners('error', { message });
      this.notifyListeners('queue_item_end', { item, index: this.queueIndex, success: false });
      this.playNextInQueue();
    };

    window.speechSynthesis.speak(utterance);
  }

  async startQueuePlayback(_options?: { autoStart?: boolean; clearExisting?: boolean }): Promise<SpeechResponse> {
    if (this.queuePlaying) return { success: true };
    const totalItems = this.queue.length;
    this.queuePlaying = true;
    this.queueIndex = -1;
    this.notifyListeners('queue_start', { totalItems });
    if (totalItems === 0) {
      // 空队列也视为立即结束
      this.notifyListeners('queue_end', { completed: true, interrupted: false, totalItems: 0 });
      this.queuePlaying = false;
      return { success: true };
    }
    this.playNextInQueue();
    return { success: true };
  }

  async stopQueuePlayback(): Promise<SpeechResponse> {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    const wasPlaying = this.queuePlaying;
    this.queue = [];
    this.queuePlaying = false;
    this.queueIndex = -1;
    this.isCurrentlySpeaking = false;
    if (wasPlaying) this.notifyListeners('queue_end', { completed: false, interrupted: true });
    return { success: true };
  }

  async clearQueue(): Promise<SpeechResponse> {
    this.queue = [];
    return { success: true };
  }

  async getQueueStatus(): Promise<QueueStatus> {
    return {
      isPlaying: this.queuePlaying,
      currentIndex: this.queueIndex,
      totalItems: this.queue.length,
      remainingItems: this.queuePlaying ? Math.max(0, this.queue.length - this.queueIndex - 1) : this.queue.length,
      currentItem: this.queuePlaying && this.queueIndex >= 0 && this.queueIndex < this.queue.length
        ? { id: `${Date.now()}_${this.queueIndex}`, text: this.queue[this.queueIndex].text }
        : undefined
    };
  }

  // 事件监听方法：使用 WebPlugin 的默认实现（保留以兼容类型）
  async addListener(eventName: string, listenerFunc: (event: any) => void): Promise<PluginListenerHandle> {
    return super.addListener(eventName, listenerFunc);
  }

}
