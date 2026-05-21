<template>
  <Teleport to="body">
    <div
      v-if="list && list.enabled && mode !== 'none' && list.items?.length"
      class="announcement-overlay"
    >
      <!-- 多卡片滚动模式 -->
      <template v-if="mode === 'scroll'">
        <div v-if="list.title" class="announcement-header">
          <span class="announcement-title">{{ list.title }}</span>
        </div>
        <div class="scroll-track" ref="scrollTrackRef">
          <div class="scroll-inner">
            <div v-for="(item, idx) in list.items" :key="idx" class="announcement-card">
              <div class="card-left">
                <template v-for="field in leftFields" :key="field">
                  <a
                    v-if="isPhoneField(item[field])"
                    :href="'tel:' + item[field]"
                    class="card-field card-phone"
                  >{{ item[field] }}</a>
                  <span v-else class="card-field card-text">{{ item[field] }}</span>
                </template>
              </div>
              <div class="card-right">
                <template v-for="field in rightFields" :key="field">
                  <span class="card-field card-text">{{ item[field] }}</span>
                </template>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- 单卡片轮播模式 -->
      <template v-else>
        <div v-if="list.title" class="announcement-header">
          <span class="announcement-title">{{ list.title }}</span>
        </div>
        <Transition name="card-fade" mode="out-in">
          <div class="single-card" :key="currentIndex">
            <div class="card-left">
              <template v-for="field in leftFields" :key="field">
                <a
                  v-if="isPhoneField(list.items[currentIndex]?.[field])"
                  :href="'tel:' + list.items[currentIndex]![field]"
                  class="card-field card-phone"
                >{{ list.items[currentIndex]?.[field] }}</a>
                <span v-else class="card-field card-text">{{ list.items[currentIndex]?.[field] }}</span>
              </template>
            </div>
            <div class="card-right">
              <template v-for="field in rightFields" :key="field">
                <span class="card-field card-text">{{ list.items[currentIndex]?.[field] }}</span>
              </template>
            </div>
          </div>
        </Transition>
      </template>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { useAppConfigStore } from '@/stores/appConfig'
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'

const appConfigStore = useAppConfigStore()
const list = computed(() => appConfigStore.contactList)

const mode = computed(() => list.value?.displayMode || 'scroll')

const allFields = computed(() => {
  const explicit = list.value?.cardFields
  const items = list.value?.items
  if (!items?.length) return explicit || []
  if (explicit && explicit.length) {
    const result = [...explicit]
    const seen = new Set(explicit)
    for (const item of items) {
      for (const key of Object.keys(item)) {
        if (item[key] && !seen.has(key)) {
          seen.add(key)
          result.push(key)
        }
      }
    }
    return result
  }
  const first = items[0]
  return first ? Object.keys(first).filter(k => first[k]) : []
})

const leftFields = computed(() => {
  const f = allFields.value
  const mid = Math.ceil(f.length / 2)
  return f.slice(0, mid)
})

const rightFields = computed(() => {
  const f = allFields.value
  const mid = Math.ceil(f.length / 2)
  return f.slice(mid)
})

const isPhoneField = (val: unknown): val is string =>
  typeof val === 'string' && /^[\d\-()（）]+$/.test(val) && val.replace(/[\-()（）]/g, '').length >= 7

// 单卡片轮播
const currentIndex = ref(0)
let carouselTimer: ReturnType<typeof setInterval> | null = null

const startCarousel = () => {
  stopCarousel()
  const interval = list.value?.scrollInterval ?? 5000
  carouselTimer = setInterval(() => {
    const len = list.value?.items?.length ?? 0
    if (len > 1) currentIndex.value = (currentIndex.value + 1) % len
  }, interval)
}

const stopCarousel = () => {
  if (carouselTimer) { clearInterval(carouselTimer); carouselTimer = null }
}

watch(mode, (m) => {
  if (m === 'single') startCarousel()
  else stopCarousel()
})

onMounted(() => { if (mode.value === 'single') startCarousel() })
onBeforeUnmount(() => stopCarousel())

// 滚动模式
const scrollTrackRef = ref<HTMLElement | null>(null)
let scrollTimer: ReturnType<typeof setInterval> | null = null

const startAutoScroll = () => {
  stopAutoScroll()
  scrollTimer = setInterval(() => {
    const el = scrollTrackRef.value
    if (!el) return
    const maxScroll = el.scrollHeight - el.clientHeight
    if (el.scrollTop >= maxScroll - 4) {
      el.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      el.scrollBy({ top: 80, behavior: 'smooth' })
    }
  }, list.value?.scrollInterval ?? 5000)
}

const stopAutoScroll = () => {
  if (scrollTimer) { clearInterval(scrollTimer); scrollTimer = null }
}

watch(mode, (m) => {
  if (m === 'scroll') startAutoScroll()
  else stopAutoScroll()
})

onMounted(() => { if (mode.value === 'scroll') startAutoScroll() })
onBeforeUnmount(() => stopAutoScroll())
</script>

<style lang="css">
.announcement-overlay {
  position: fixed;
  bottom: max(0.75rem, env(safe-area-inset-bottom));
  left: 0.75rem;
  width: min(46vw, 46rem);
  max-width: calc(100vw - 1.5rem);
  z-index: 45;
  padding: 0;
  pointer-events: none;
}

.announcement-header {
  text-align: center;
  margin-bottom: 0.5rem;
}

.announcement-title {
  font-size: 0.85rem;
  color: var(--text-secondary);
  letter-spacing: 0.05em;
  font-weight: 500;
}

.scroll-track {
  overflow-y: auto;
  overflow-x: hidden;
  max-height: min(22vh, 13rem);
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
}

.scroll-track::-webkit-scrollbar { width: 3px; }
.scroll-track::-webkit-scrollbar-thumb {
  background: var(--primary-light);
  border-radius: 9999px;
}

.scroll-inner {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.announcement-card {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  background: color-mix(in srgb, var(--bg-elevated) 88%, transparent);
  border: 1px solid var(--border-color, rgba(128,128,128,0.18));
  flex-shrink: 0;
}

.card-left {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}

.card-right {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.2rem;
  min-width: 0;
}

.card-field {
  line-height: 1.5;
  word-break: break-all;
}

.card-text {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-color);
}

.card-phone {
  font-size: 0.9rem;
  color: var(--primary-color);
  text-decoration: none;
  font-weight: 600;
}

.card-left .card-field:first-child {
  font-size: 1.1rem;
  font-weight: 700;
}

/* 单卡片 */
.single-card {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  padding: 0.875rem 1.25rem;
  margin: 0 auto;
  max-width: 100%;
  border-radius: 0.5rem;
  background: color-mix(in srgb, var(--bg-elevated) 88%, transparent);
  border: 1px solid var(--border-color, rgba(128,128,128,0.18));
}

.single-card .card-left .card-field:first-child { font-size: 1.2rem; }
.single-card .card-text { font-size: 1rem; }
.single-card .card-phone { font-size: 0.95rem; }

.card-fade-enter-active,
.card-fade-leave-active { transition: opacity 0.4s ease; }
.card-fade-enter-from,
.card-fade-leave-to { opacity: 0; }

/* 深色主题 */
[data-theme="dark"] .announcement-card,
[data-theme="dark"] .single-card {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.1);
}

[data-theme="dark"] .card-text {
  color: rgba(255, 255, 255, 0.92);
}

[data-theme="dark"] .card-phone {
  color: rgba(255, 255, 255, 0.75);
}

[data-theme="dark"] .announcement-title {
  color: rgba(255, 255, 255, 0.5);
}

@media (max-width: 900px), (orientation: portrait) {
  .announcement-overlay {
    top: calc(env(safe-area-inset-top) + 4.75rem);
    bottom: auto;
    left: 0.75rem;
    right: 0.75rem;
    width: auto;
  }

  .scroll-track {
    max-height: min(20vh, 11rem);
  }

  .announcement-card,
  .single-card {
    padding: 0.625rem 0.75rem;
  }
}
</style>
