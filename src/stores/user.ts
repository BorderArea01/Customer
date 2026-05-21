import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { VisitorInfo } from '@/utils/faceRecognition'
import { generateUUID } from '@/utils/uuid'

export const useUserStore = defineStore('user', () => {
  // 状态
  const currentVisitor = ref<VisitorInfo | null>(null)
  const isSessionActive = ref(false)
  const recognitionStatus = ref('等待识别...')
  const isRecognizing = ref(false)
  const currentSessionId = ref<string | null>(null)

  // 计算属性
  const isGuest = computed(() => {
    if (!currentVisitor.value) return true
    return currentVisitor.value.userId === 'guest' || 
           !currentVisitor.value.userId || 
           currentVisitor.value.userId.trim() === ''
  })
  const visitorName = computed(() => {
    if (!currentVisitor.value) return '游客'
    return currentVisitor.value.nickName || '用户'
  })
  const userType = computed(() => {
    if (!currentVisitor.value) return '访客'
    return currentVisitor.value.userType === 'unknown' ? '访客' : currentVisitor.value.userType
  })
  const receptionLocation = computed(() => currentVisitor.value?.receptionLocation || '')

  // 设置访客信息
  const setVisitor = (visitor: VisitorInfo) => {
    currentVisitor.value = visitor
    isSessionActive.value = true
    // 创建新的会话ID
    currentSessionId.value = generateUUID()
  }

  // 设置静默登录用户信息
  const setSilentLoginUser = (userInfo: {
    userId: string
    nickName: string
    userType: string
    receptionLocation?: string
    passStatus?: string
  }) => {
    currentVisitor.value = {
      userId: userInfo.userId,
      nickName: userInfo.nickName,
      userType: userInfo.userType,
      receptionLocation: userInfo.receptionLocation || '大屏',
      passStatus: userInfo.passStatus || '1'
    }
    isSessionActive.value = true
    // 创建新的会话ID
    currentSessionId.value = generateUUID()
  }

  // 设置为游客
  const setGuest = () => {
    currentVisitor.value = {
      userId: 'guest',
      nickName: '游客',
      userType: '访客',
      receptionLocation: '大屏',
      passStatus: '1'
    }
    isSessionActive.value = true
    // 创建新的会话ID
    currentSessionId.value = generateUUID()
  }

  // 清除访客信息（结束会话）
  const clearVisitor = () => {
    currentVisitor.value = null
    isSessionActive.value = false
    recognitionStatus.value = '等待识别...'
    isRecognizing.value = false
    // 销毁会话ID
    currentSessionId.value = null
  }

  // 设置识别状态
  const setRecognitionStatus = (status: string) => {
    recognitionStatus.value = status
  }

  // 设置识别中状态
  const setRecognizing = (recognizing: boolean) => {
    isRecognizing.value = recognizing
  }

  // 结束会话（用户离开）
  const endSession = () => {
    clearVisitor()
  }


  return {
    // 状态
    currentVisitor,
    isSessionActive,
    recognitionStatus,
    isRecognizing,
    currentSessionId,
    
    // 计算属性
    isGuest,
    visitorName,
    userType,
    receptionLocation,
    
    // 方法
    setVisitor,
    setSilentLoginUser,
    setGuest,
    clearVisitor,
    setRecognitionStatus,
    setRecognizing,
    endSession
  }
}) 