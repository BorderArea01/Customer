/**
 * 生成UUID v4
 * @returns 返回一个标准的UUID v4字符串
 */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

/**
 * 生成简短的会话ID（用于日志显示）
 * @param uuid 完整的UUID
 * @returns 返回前8位字符
 */
export function getShortSessionId(uuid: string): string {
  return uuid.substring(0, 8)
}
