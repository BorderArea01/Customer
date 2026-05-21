/// <reference types="vite/client" />

declare const __APP_VERSION__: string

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

// 为 JS 工具模块提供全局类型
declare module '../../utils/markdown.js' {
  export function renderMarkdown(text: string): string
  export function renderMarkdownInline(text: string): string
  export function renderMarkdownWithToc(text: string): { content: string; toc: string }
  export const md: any
}
