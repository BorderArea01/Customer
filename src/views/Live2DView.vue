<template>
  <div class="live2d-page">
    <div class="container">
      <h1 class="page-title">Live2D 数字人 + AI 聊天</h1>
      <p class="page-description">
        左侧显示数字人，右侧为 AI 聊天面板。点击 💬 按钮开启/关闭聊天功能。
      </p>
      <Live2DView />
    </div>
  </div>
</template>

<script setup lang="ts">
import Live2DView from '@/components/live2d/index.vue'
</script>

<style scoped>
.live2d-page {
  min-height: 100vh;
  background: var(--color-background);
  padding: 1rem 0;
}

.container {
  max-width: 100%;
  margin: 0 auto;
  padding: 0 1rem;
}

.page-title {
  text-align: center;
  color: var(--color-text);
  margin-bottom: 0.5rem;
  font-size: 1.5rem;
  font-weight: bold;
}

.page-description {
  text-align: center;
  color: var(--color-text-secondary);
  margin-bottom: 1rem;
  font-size: 0.9rem;
  opacity: 0.8;
}
</style> 