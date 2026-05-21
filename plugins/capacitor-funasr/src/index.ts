import { registerPlugin } from '@capacitor/core';

import type { LzwcFunasrPlugin } from './definitions';

const LzwcFunasr = registerPlugin<LzwcFunasrPlugin>('LzwcFunasr', {
  web: () => import('./web').then((m) => new m.LzwcFunasrWeb()),
});

export * from './definitions';
export { LzwcFunasr };
