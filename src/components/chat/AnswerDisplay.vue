<template>
  <div class="answer-section">
    <div class="answer-content">
      <div v-if="hasError" class="error-state">
        <div class="error-icon">
          <svg viewBox="0 0 24 24" fill="currentColor" class="w-8 h-8">
            <path
              d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
          </svg>
        </div>
        <p class="error-text">{{ errorText || '发送失败，请稍后重试' }}</p>
      </div>

      <div v-else-if="!answer && !isLoading && asrNoticeText" class="placeholder placeholder-asr">
        <div class="placeholder-icon">
          <svg viewBox="0 0 24 24" fill="currentColor" class="w-8 h-8">
            <path
              d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
          </svg>
        </div>
        <p class="placeholder-text">{{ asrNoticeText }}</p>
      </div>

      <div v-else-if="!answer && !isLoading" class="placeholder placeholder-default">
        <div class="placeholder-icon">
          <svg viewBox="0 0 24 24" fill="currentColor" class="w-8 h-8">
            <path
              d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
          </svg>
        </div>
        <p class="placeholder-text">等待您的提问...</p>
      </div>

      <div v-else-if="isLoading && !answer" class="loading-state">
        <div class="skeleton-container">
          <div class="el-skeleton is-animated">
            <div class="el-skeleton__item el-skeleton__p is-first"></div>
            <div class="el-skeleton__item el-skeleton__p el-skeleton__paragraph"></div>
            <div class="el-skeleton__item el-skeleton__p el-skeleton__paragraph"></div>
            <div class="el-skeleton__item el-skeleton__p el-skeleton__paragraph"></div>
            <div class="el-skeleton__item el-skeleton__p el-skeleton__paragraph"></div>
            <div class="el-skeleton__item el-skeleton__p el-skeleton__paragraph is-last"></div>
          </div>
        </div>
        <div class="loading-content">
          <div class="loading-icon">
            <img src="@/assets/ai-full-page-show.png" alt="Loading" class="loading-image" />
          </div>
          <p class="loading-text">{{ getLoadingText() }}</p>
        </div>
      </div>

      <MarkdownRender :content="answer" />
    </div>
  </div>
</template>

<script setup lang="ts">
import MarkdownRender from 'vue-renderer-markdown'

interface Props {
  answer: string
  isLoading: boolean
  processingContent: string
  hasError: boolean
  errorText?: string
  asrNoticeText?: string
}

const props = defineProps<Props>()

const getLoadingText = () => {
  if (props.processingContent && props.processingContent.trim()) {
    return props.processingContent.trim()
  }
  return 'AI正在思考中...'
}
</script>

<style scoped lang="css">
.answer-section {
  flex: 1;
}

.answer-content {
  padding: 1.5rem 1.5rem;
  min-height: 16rem;
  max-height: 32rem;
  overflow-y: auto;
  border-radius: 0 0 1rem 1rem;
  background: var(--bg-secondary);
}

.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 6rem;
  color: #dc2626;
  text-align: center;
}

.error-icon {
  margin-bottom: 0.5rem;
}

.error-icon svg {
  width: 2rem;
  height: 2rem;
}

.error-text {
  font-size: 0.875rem;
  color: #dc2626;
  max-width: 18rem;
  line-height: 1.5;
}

.placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 6rem;
  color: var(--text-tertiary);
}

.placeholder-icon {
  margin-bottom: 0.5rem;
}

.placeholder-icon svg {
  width: 2rem;
  height: 2rem;
}

.placeholder-text {
  font-size: 0.875rem;
}

.placeholder-asr {
  color: #ea580c;
}

.placeholder-default {
  color: var(--primary-color);
}

.loading-state {
  position: relative;
  min-height: 6rem;
  width: 100%;
  display: grid;
  grid-template-rows: 1fr;
}

.skeleton-container {
  grid-row: 1;
  grid-column: 1;
  width: 100%;
  opacity: 0.7;
}

.loading-content {
  grid-row: 1;
  grid-column: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-top: 1rem;
  z-index: 2;
  pointer-events: none;
}

.loading-icon {
  margin-bottom: 0.5rem;
}

.loading-image {
  width: 4rem;
  height: 4rem;
  object-fit: contain;
  animation: pulse 2s ease-in-out infinite;
}

.loading-text {
  font-size: 0.875rem;
  color: var(--primary-color);
}

.el-skeleton {
  width: 100%;
}

.el-skeleton.is-animated .el-skeleton__item {
  background: linear-gradient(
    90deg,
    var(--border-secondary) 25%,
    var(--border-color) 37%,
    var(--border-secondary) 63%
  );
  background-size: 400% 100%;
  animation: el-skeleton-loading 1.4s ease infinite;
}

.el-skeleton__item {
  background: var(--border-secondary);
  display: inline-block;
  height: 1rem;
  border-radius: 4px;
  width: 100%;
}

.el-skeleton__p {
  width: 100%;
}

.el-skeleton__p.is-first {
  width: 50%;
}

.el-skeleton__p.is-last {
  width: 60%;
}

.el-skeleton__paragraph {
  margin-top: 0.75rem;
}

@keyframes el-skeleton-loading {
  0% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0 50%;
  }
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.8;
    transform: scale(1.05);
  }
}

.markdown-content {
  width: 100%;
  font-size: 0.875rem;
  line-height: 1.625;
  color: var(--text-color);
}

.markdown-content :deep(h1) {
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 0.75rem;
  margin-top: 1rem;
  color: var(--text-color);
}

.markdown-content :deep(h2) {
  font-size: 1.125rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
  margin-top: 0.75rem;
  color: var(--text-color);
}

.markdown-content :deep(h3) {
  font-size: 1rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
  margin-top: 0.5rem;
  color: var(--text-color);
}

.markdown-content :deep(p) {
  margin-bottom: 0.5rem;
  color: var(--text-color);
}

.markdown-content :deep(strong) {
  font-weight: 700;
  color: var(--text-color);
}

.markdown-content :deep(em) {
  font-style: italic;
  color: var(--text-color);
}

.markdown-content :deep(code) {
  padding: 0.125rem 0.25rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
  background: var(--bg-secondary);
  color: var(--text-color);
}

.markdown-content :deep(pre) {
  border-radius: 0.5rem;
  padding: 0.75rem;
  margin-bottom: 0.75rem;
  overflow-x: auto;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
}

.markdown-content :deep(pre code) {
  background: transparent;
  padding: 0;
  font-size: 0.75rem;
  color: var(--text-color);
}

.markdown-content :deep(blockquote) {
  border-left: 4px solid;
  padding-left: 0.75rem;
  padding-top: 0.5rem;
  padding-bottom: 0.5rem;
  margin-bottom: 0.75rem;
  border-left-color: var(--primary-color);
  background: var(--bg-secondary);
  color: var(--text-color);
}

.markdown-content :deep(ul) {
  list-style-type: disc;
  list-style-position: inside;
  margin-bottom: 0.75rem;
  color: var(--text-color);
}

.markdown-content :deep(ol) {
  list-style-type: decimal;
  list-style-position: inside;
  margin-bottom: 0.75rem;
  color: var(--text-color);
}

.markdown-content :deep(li) {
  margin-bottom: 0.25rem;
}

.markdown-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 0.75rem;
  font-size: 0.75rem;
  border: 1px solid var(--border-color);
}

.markdown-content :deep(th) {
  padding: 0.25rem 0.5rem;
  font-weight: 700;
  text-align: left;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  color: var(--text-color);
}

.markdown-content :deep(td) {
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--border-color);
  color: var(--text-color);
}

.markdown-content :deep(tr:nth-child(even)) {
  background: var(--bg-secondary);
}

.markdown-content :deep(a) {
  text-decoration: underline;
  color: var(--primary-color);
}

.markdown-content :deep(a:hover) {
  color: var(--primary-dark);
}

.markdown-content :deep(hr) {
  border-top: 1px solid;
  margin: 1rem 0;
  border-color: var(--border-color);
}

.answer-content::-webkit-scrollbar {
  width: 0.5rem;
}

.answer-content::-webkit-scrollbar-track {
  background: transparent;
}

.answer-content::-webkit-scrollbar-thumb {
  background-color: #d1d5db;
  border-radius: 9999px;
}

.answer-content::-webkit-scrollbar-thumb:hover {
  background-color: #9ca3af;
}
</style>
