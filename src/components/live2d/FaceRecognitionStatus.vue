<template>
  <div class="face-recognition-status">
    <!-- 优先显示人脸识别状态，如果没有则显示员工状态    -->
    <div v-if="showFaceStatus" class="status-indicator face-status" :class="{ active: isDetectionActive }">
      <div class="status-dot"></div>
      <span class="status-text">{{ recognitionStatus }}</span>
    </div>
    <div v-else-if="showEmployeeStatus" class="status-indicator employee-status" :class="employeeStatusClass">
      <div class="status-dot"></div>
      <span class="status-text">{{ employeeStatusText }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { useDeviceStore } from '../../stores/device'
import { EmployeeServerStatus } from '../../server/api/employeeApi'

// Props
interface Props {
  isDetectionActive: boolean
  isSessionActive: boolean
  recognitionStatus: string
}

const props = defineProps<Props>()

// Store
const deviceStore = useDeviceStore()

// 员工状态相关计算属性
const isEmployeeRunning = computed(() => {
  return deviceStore.isEmployeeRunning
})

const showEmployeeStatus = computed(() => {
  return deviceStore.isBound && deviceStore.employeeInfo?.serverStatus !== undefined
})

const employeeStatusText = computed(() => {
  if (!deviceStore.employeeInfo?.serverStatus) return ''
  return deviceStore.employeeStatusText
})

const employeeStatusClass = computed(() => {
  const status = deviceStore.employeeInfo?.serverStatus
  if (status === undefined) return 'status-default'

  switch (status) {
    case EmployeeServerStatus.RUNNING:
      return 'status-running'
    case EmployeeServerStatus.PUBLISHING:
      return 'status-publishing'
    case EmployeeServerStatus.UNPUBLISHED:
      return 'status-unpublished'
    case EmployeeServerStatus.ERROR:
      return 'status-error'
    case EmployeeServerStatus.STOPPED:
      return 'status-stopped'
    default:
      return 'status-default'
  }
})

// 显示逻辑
const showFaceStatus = computed(() => {
  // 只有在员工运行中且有人脸识别活动时才显示人脸状态
  return isEmployeeRunning.value && (props.isDetectionActive || props.isSessionActive)
})

// 组件挂载时启动员工状态监控
onMounted(() => {
  if (deviceStore.isBound) {
    deviceStore.startEmployeeStatusMonitoring()
  }
})

// 组件卸载时停止员工状态监控
onBeforeUnmount(() => {
  deviceStore.stopEmployeeStatusMonitoring()
})
</script>

<style scoped>
.face-recognition-status {
  position: fixed;
  top: 0.6rem;
  left: 0.6rem;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 2rem;
  padding: 0.5rem 1rem;
  border-radius: 0.4rem;
  background: var(--bg-elevated);
  color: var(--text-color);
  box-shadow: var(--shadow-medium);
  transition: transform 0.2s ease, background-color 0.2s ease;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-tertiary);
  transition: background-color 0.3s ease;
}

.status-indicator.active .status-dot {
  background: var(--success-color);
  animation: pulse 1s infinite;
}

/* 员工状态样式 */
.employee-status.status-running .status-dot {
  background: var(--success-color);
}

.employee-status.status-publishing .status-dot {
  background: #1d4ed8;
}

.employee-status.status-unpublished .status-dot {
  background: var(--text-tertiary);
}

.employee-status.status-error .status-dot {
  background: var(--error-color);
}

.employee-status.status-stopped .status-dot {
  background: var(--error-color);
}

.employee-status.status-default .status-dot {
  background: var(--text-tertiary);
}

.status-text {
  font-size: 14px;
  color: var(--text-color);
  font-weight: 500;
}

@keyframes pulse {
  0% {
    transform: scale(1);
  }

  50% {
    transform: scale(1.1);
  }

  100% {
    transform: scale(1);
  }
}

/* 响应式设计 */
@media (max-width: 768px) {
  .face-recognition-status {
    top: 10px;
    left: 10px;
  }
}
</style>