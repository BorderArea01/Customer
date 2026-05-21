// FunASR 语音合成（讯飞）
export { default as useFunASRSpeech } from './funasrSpeech'

// Voicebox 语音合成（自部署）
export { default as useVoiceboxSpeech } from './voiceboxSpeech'

// 导出类型定义
export type { SpeechOptions, QueueStatus } from 'capacitor-speech'
export type { UseSpeech, UseSpeechOptions } from './funasrSpeech'

// 默认导出：根据 localStorage 配置选择 TTS 后端
import useFunASRSpeech from './funasrSpeech'
import useVoiceboxSpeech from './voiceboxSpeech'
import type { UseSpeechOptions } from './funasrSpeech'

const TTS_PROVIDER_KEY = 'tts-provider'

export function getTtsProvider(): 'xunfei' | 'voicebox' {
  return (localStorage.getItem(TTS_PROVIDER_KEY) as 'xunfei' | 'voicebox') || 'xunfei'
}

export function setTtsProvider(provider: 'xunfei' | 'voicebox') {
  localStorage.setItem(TTS_PROVIDER_KEY, provider)
}

const useSpeech = (options?: UseSpeechOptions) => {
  const provider = getTtsProvider()

  if (provider === 'voicebox') {
    console.log('[Speech] 使用 Voicebox TTS')
    return useVoiceboxSpeech(options)
  }

  console.log('[Speech] 使用讯飞 TTS')
  return useFunASRSpeech(options)
}

export default useSpeech
