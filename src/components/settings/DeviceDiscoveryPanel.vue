<template>
  <div class="panel">
    <h3 class="panel-title">AgentBox发现</h3>
    <div v-if="isWeb" class="empty-centered">Web 端不支持 SSDP，请在 Android 端运行</div>
    <template v-else>
      <div v-if="error" class="error">错误：{{ error }}</div>
      <div class="device-list" v-if="devices.length > 0">
        <div v-for="d in devices" :key="d.location" class="device-item">
          <div class="device-main">
            <span class="device-title">{{ d.location }}</span>
            <span v-if="isCurrentDevice(d)" class="badge-current">本机</span>
          </div>
          <div class="device-sub">
            <div class="device-meta">
              <div><span class="meta-label">设备 IP：</span><span class="meta-value">{{ d.senderIp }}</span></div>
              <div><span class="meta-label">设备标识 (NT)：</span><span class="meta-value">{{ d.nt }}</span></div>
              <div><span class="meta-label">服务信息：</span><span class="meta-value">{{ d.server }}</span></div>
            </div>
          </div>
          <div class="actions">
            <button class="primary-btn" @click="switchToDevice(d)" :disabled="isCurrentDevice(d)">
              {{ isCurrentDevice(d) ? '已是当前设备' : '切换到此设备' }}
            </button>
          </div>
        </div>
      </div>
      <div v-else class="empty-centered">暂无设备</div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { Capacitor } from '@capacitor/core'
import useSsdp from '@/hooks/ssdp'
import { useConfigStore } from '@/stores/config'

const isWeb = Capacitor.getPlatform() === 'web'
const { devices, error } = useSsdp({ autoStart: !isWeb })
const configStore = useConfigStore()

const isCurrentDevice = (d: any) => {
  try { return !!d?.senderIp && d.senderIp === configStore.serverIp } catch { return false }
}
const switchToDevice = (d: any) => {
  if (!d?.senderIp || isCurrentDevice(d)) return
  configStore.setServerIp(d.senderIp)
  window.location.href = '/live2d'
}
</script>

<style scoped>
.panel-title {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.625rem;
}

.empty-centered {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 12.5rem;
  color: var(--text-secondary);
}

.device-list {
  margin-top: 0.75rem;
  display: grid;
  gap: 0.625rem;
}

.device-item {
  border: 1px solid var(--border-color);
  border-radius: 0.625rem;
  padding: 0.625rem;
}

.device-main {
  font-weight: 600;
}

.device-sub {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-top: 0.375rem;
}

.device-title {
  font-size: 0.875rem;
}

.device-meta {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.25rem;
}

.meta-label {
  color: var(--text-secondary);
}

.meta-value {
  color: var(--text-color);
}

.actions {
  margin-top: 0.5rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.primary-btn {
  background: var(--color-primary);
  color: #fff;
  border: none;
  border-radius: 0.5rem;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
}

.badge-current {
  margin-left: 0.5rem;
  font-size: 0.75rem;
  background: var(--color-primary);
  color: #fff;
  border-radius: 0.375rem;
  padding: 0.125rem 0.375rem;
}

.error {
  color: #c53030;
  background: #fed7d7;
  border: 1px solid #feb2b2;
  padding: 0.5rem 0.625rem;
  border-radius: 0.5rem;
  margin-top: 0.625rem;
}
</style>
