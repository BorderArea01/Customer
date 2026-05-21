import { WebPlugin } from '@capacitor/core'
import type { LzwcSsdpPlugin, StartOptions, SsdpDevice } from './definitions'

export class LzwcSsdpWeb extends WebPlugin implements LzwcSsdpPlugin {
  private cache: SsdpDevice[] = []

  async start(_options?: StartOptions): Promise<void> {
    console.warn('[capacitor-ssdp] Web platform does not support UDP multicast; returning empty results')
  }

  async stop(): Promise<void> {
    // noop
  }

  async getCached(): Promise<{ devices: SsdpDevice[] }> {
    return { devices: this.cache }
  }
}


