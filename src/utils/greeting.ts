/**
 * 打招呼工具函数
 * 根据时间和用户类型生成不同的打招呼内容
 */

/**
 * 根据当前时间获取时间段问候语
 * @returns 时间段问候语（早上好/上午好/中午好/下午好/晚上好）
 */
export function getTimeGreeting(): string {
  const hour = new Date().getHours()
  
  if (hour >= 5 && hour < 9) {
    return '早上好'
  } else if (hour >= 9 && hour < 12) {
    return '上午好'
  } else if (hour >= 12 && hour < 14) {
    return '中午好'
  } else if (hour >= 14 && hour < 18) {
    return '下午好'
  } else {
    return '晚上好'
  }
}

/**
 * 访客打招呼模板
 */
const guestGreetingTemplates = [
  '{timeGreeting}，很高兴见到你',
  '{timeGreeting}，欢迎你的到来',
  '{timeGreeting}，很高兴认识你',
  '{timeGreeting}，欢迎光临',
  '{timeGreeting}，很高兴为你服务'
]

/**
 * 用户打招呼模板
 */
const userGreetingTemplates = [
  '{timeGreeting}，{userName}，很高兴见到你',
  '{timeGreeting}，{userName}，欢迎你的到来',
  '{timeGreeting}，{userName}，很高兴认识你',
  '{timeGreeting}，{userName}，欢迎光临',
  '{timeGreeting}，{userName}，很高兴见到你'
]

/**
 * 获取上次使用的模板索引（用于避免重复）
 */
let lastGuestTemplateIndex = -1
let lastUserTemplateIndex = -1

/**
 * 生成访客打招呼内容
 * @returns 打招呼内容
 */
export function generateGuestGreeting(): string {
  const timeGreeting = getTimeGreeting()
  
  // 随机选择一个模板，但避免与上次重复
  let templateIndex = Math.floor(Math.random() * guestGreetingTemplates.length)
  if (guestGreetingTemplates.length > 1 && templateIndex === lastGuestTemplateIndex) {
    // 如果与上次相同，选择下一个模板
    templateIndex = (templateIndex + 1) % guestGreetingTemplates.length
  }
  lastGuestTemplateIndex = templateIndex
  
  const template = guestGreetingTemplates[templateIndex]
  return template.replace('{timeGreeting}', timeGreeting)
}

/**
 * 生成用户打招呼内容
 * @param userName 用户名
 * @returns 打招呼内容
 */
export function generateUserGreeting(userName: string): string {
  const timeGreeting = getTimeGreeting()
  
  // 随机选择一个模板，但避免与上次重复
  let templateIndex = Math.floor(Math.random() * userGreetingTemplates.length)
  if (userGreetingTemplates.length > 1 && templateIndex === lastUserTemplateIndex) {
    // 如果与上次相同，选择下一个模板
    templateIndex = (templateIndex + 1) % userGreetingTemplates.length
  }
  lastUserTemplateIndex = templateIndex
  
  const template = userGreetingTemplates[templateIndex]
  return template
    .replace('{timeGreeting}', timeGreeting)
    .replace('{userName}', userName)
}

/**
 * 根据用户类型生成打招呼内容
 * @param isGuest 是否为访客
 * @param userName 用户名（非访客时必填）
 * @returns 打招呼内容
 */
export function generateGreeting(isGuest: boolean, userName?: string): string {
  if (isGuest) {
    return generateGuestGreeting()
  } else {
    if (!userName) {
      userName = '用户'
    }
    return generateUserGreeting(userName)
  }
}

