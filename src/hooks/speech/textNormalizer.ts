/**
 * TTS 文本预处理：电话号码按位朗读、时间转中文、Markdown 清理
 */

// 电话号码：固话（带区号/连字符）或11位手机号
const PHONE_RE = /\b(?:0\d{2,3}[-\s]\d{7,8}|\d{7,8}|1[3-9]\d{9})\b/g

// 时间格式 HH:MM 或 HH:MM:SS
const TIME_RE = /\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/g

const normalizePhone = (m: string): string => {
  const digits = m.replace(/\D/g, '').split('')
  // 逐个数字加空格，让TTS逐位朗读
  return digits.join(' ')
}

const normalizeTime = (_m: string, h: string, min: string, sec?: string): string => {
  const hour = parseInt(h, 10)
  const minute = parseInt(min, 10)
  let result = `${hour}点`
  if (minute > 0) result += `${minute < 10 ? '零' : ''}${minute}分`
  if (sec) {
    const second = parseInt(sec, 10)
    if (second > 0) result += `${second < 10 ? '零' : ''}${second}秒`
  }
  return result
}

export const cleanMarkdown = (text: string): string => {
  if (!text) return text
  // 移除Markdown图片: ![alt](url)
  text = text.replace(/!\[[^\]]*\]\([^)]+\)/g, '')
  // 移除Markdown链接语法，保留文字: [text](url) → text
  text = text.replace(/\[([^\]]*)\]\([^)]+\)/g, '$1')
  // 移除残留的方括号和Markdown标记符号
  text = text.replace(/[*#_~`>\[\]]/g, '')
  // 移除HTML标签
  text = text.replace(/<[^>]*>/g, '')
  // 合并多余空白
  text = text.replace(/\s+/g, ' ')
  return text.trim()
}

/**
 * 对TTS输入文本做完整预处理
 */
export const normalizeForTTS = (text: string): string => {
  if (!text) return text
  let result = cleanMarkdown(text)
  // 先处理时间（避免被电话号码正则误匹配）
  result = result.replace(TIME_RE, normalizeTime)
  // 处理电话号码
  result = result.replace(PHONE_RE, normalizePhone)
  return result
}
