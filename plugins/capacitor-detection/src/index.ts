import { registerPlugin } from '@capacitor/core';

import type { LzwcDetectionPlugin } from './definitions';

const LzwcDetection = registerPlugin<LzwcDetectionPlugin>('LzwcDetection', {
  web: () => import('./web').then((m) => new m.LzwcDetectionWeb()),
});

export * from './definitions';
export { LzwcDetection };
