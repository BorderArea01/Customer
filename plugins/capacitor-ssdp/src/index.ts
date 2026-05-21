import { registerPlugin } from '@capacitor/core'
import type { LzwcSsdpPlugin } from './definitions'

export const LzwcSsdp = registerPlugin<LzwcSsdpPlugin>('LzwcSsdp', {
  web: () => import('./web').then(m => new m.LzwcSsdpWeb())
})

export * from './definitions'


