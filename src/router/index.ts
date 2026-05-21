import { createRouter, createWebHistory } from 'vue-router'
import { useDeviceStore } from '@/stores/device'
import HomeView from '../views/HomeView.vue'
import Live2DView from '../components/live2d/index.vue'
import RecognitionView from '../views/RecognitionView.vue'

import DeviceActivationView from '../views/DeviceActivationView.vue'
import BindingWaitView from '../views/BindingWaitView.vue'
// Aliyun TTSTestView removed

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'live2d',
      component: Live2DView,
    },
    // Aliyun TTS test route removed
    {
      path: '/home',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/live2d',
      name: 'live2d-alt',
      component: Live2DView,
    },
    // 人脸人体识别
    {
      path: '/recognition',
      name: 'recognition',
      component: RecognitionView,
    },

    // 设备激活页面
    {
      path: '/device-activation',
      name: 'device-activation',
      component: DeviceActivationView,
    },
    // 绑定等待页面
    {
      path: '/binding-wait',
      name: 'binding-wait',
      component: BindingWaitView,
    },
  ],
})

// 路由守卫：根据设备状态进行页面跳转
router.beforeEach((to, from, next) => {
  console.log('🔀 [Router] 路由跳转:', { from: from.name, to: to.name })
  
  const deviceStore = useDeviceStore()
  
  // 如果设备已绑定且 employeeId 存在，访问绑定等待页面时自动跳转到数字人界面
  if (to.name === 'binding-wait' && deviceStore.isBound && deviceStore.employeeInfo?.employeeId) {
    console.log('🔀 [Router] 设备已绑定，从绑定等待页面跳转到数字人界面', {
      employeeId: deviceStore.employeeInfo.employeeId
    })
    next('/live2d')
    return
  }
  
  // 如果访问的是数字人页面，只做基本检查
  // 详细的配置检查在 Live2D 组件初始化时进行
  if (to.name === 'live2d' || to.name === 'live2d-alt' || to.path === '/') {
    // 检查设备是否已激活
    if (!deviceStore.isActivated) {
      console.log('🔀 [Router] 设备未激活，跳转到激活页面')
      next('/device-activation')
      return
    }
  }
  
  // 其他页面正常访问
  next()
})

export default router
