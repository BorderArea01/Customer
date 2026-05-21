import { registerPlugin } from '@capacitor/core';
import type { LzwcSpeechPlugin } from './definitions';

// 中文名映射表
const VOICE_MAP: Record<string, string> = {
  '晓燕': 'xiaoyan',
  '晓峰': 'xiaofeng'
};

// 参数标准化函数
const normalizeVoice = (voice?: any): string => {
  if (typeof voice === 'string') return VOICE_MAP[voice] || voice;
  if (voice?.name) return VOICE_MAP[voice.name] || voice.name;
  return 'xiaoyan';
};

const normalizeRange = (value?: number, min = 0, max = 100, defaultValue = 50): number => {
  if (typeof value !== 'number') return defaultValue;
  return Math.min(max, Math.max(min, Math.round(value)));
};

// 注册插件
const LzwcSpeech = registerPlugin<LzwcSpeechPlugin>('LzwcSpeech', {
  web: () => import('./web').then((m) => new m.LzwcSpeechWeb()),
});

// 导出增强的LzwcSpeech实例
const LzwcSpeechEnhanced = {
  ...LzwcSpeech,

  // 保持原始方法
  initialize: LzwcSpeech.initialize,
  setCredentials: (LzwcSpeech as any).setCredentials,
  stop: LzwcSpeech.stop,
  isSpeaking: LzwcSpeech.isSpeaking,
  getVoices: LzwcSpeech.getVoices,
  addListener: LzwcSpeech.addListener,
  clearQueue: LzwcSpeech.clearQueue,
  getQueueStatus: LzwcSpeech.getQueueStatus,

  // 增强的speak方法，带参数标准化
  speak: (options: any) => LzwcSpeech.speak({
    text: options.text || options,
    voice: normalizeVoice(options.voice),
    speed: normalizeRange(options.speed),
    pitch: normalizeRange(options.pitch),
    volume: normalizeRange(options.volume),
    language: options.language || options.lang || 'zh-CN'
  }),

  // 增强的addToQueue方法
  addToQueue: (options: any) => LzwcSpeech.addToQueue({
    text: options.text || options,
    voice: normalizeVoice(options.voice),
    speed: normalizeRange(options.speed),
    pitch: normalizeRange(options.pitch),
    volume: normalizeRange(options.volume),
    language: options.language || options.lang || 'zh-CN'
  }),

  // 简化的队列控制 - 映射到现有方法
  startQueue: () => LzwcSpeech.startQueuePlayback(),
  stopQueue: () => LzwcSpeech.stopQueuePlayback()
};

export * from './definitions';
export { LzwcSpeech, LzwcSpeechEnhanced };
