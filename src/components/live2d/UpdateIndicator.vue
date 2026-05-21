<template>
  <div 
    v-if="hasUpdate" 
    class="update-indicator" 
    @click="handleClick"
    :class="{ 'pulsing': hasUpdate && !isUpdateDialogVisible }"
    title="有新版本可用，点击查看"
  >
    <div>📤</div>
    <span class="update-badge" v-if="hasUpdate"></span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useUpdateStore } from '@/stores/update'
import { storeToRefs } from 'pinia'

const updateStore = useUpdateStore()
const { hasUpdate, isUpdateDialogVisible } = storeToRefs(updateStore)

const handleClick = () => {
  updateStore.showUpdateDialog()
}
</script>

<style scoped>
.update-indicator {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  background: var(--bg-elevated);
  color: var(--text-color);
  border-radius: 0.4rem;
  cursor: pointer;
  box-shadow: var(--shadow-medium);
  transition: transform 0.2s ease, background-color 0.2s ease;
  z-index: 2001;
}

.update-indicator:hover {
  transform: scale(1.05);
}

.update-indicator.pulsing {
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    box-shadow: var(--shadow-medium);
  }
  50% {
    box-shadow: 0 2px 12px var(--primary-color), var(--shadow-medium);
  }
}

.update-badge {
  position: absolute;
  top: 0px;
  right: 0px;
  width: 8px;
  height: 8px;
  background: #ff9800;
  border-radius: 50%;
  border: 2px solid var(--bg-elevated);
  animation: blink 1.5s ease-in-out infinite;
}

@keyframes blink {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.update-indicator svg {
  width: 16px;
  height: 16px;
  color: var(--text-color);
}

/* 深色模式支持 */
@media (prefers-color-scheme: dark) {
  .update-indicator {
    background: rgba(30, 30, 30, 0.9);
  }
}
</style>

