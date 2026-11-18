// Which Lumen is installed, and is a newer release published? The check runs in the browser (the release
// index is a static file), so it works even when the router itself cannot resolve DNS.
import { call, MOCK } from './ubus';
import { cmpRelease } from './firmware';

export const DEFAULT_BASE = 'https://raw.githubusercontent.com/ENDE25/lumen-wrt/main/release';

export interface VersionInfo { managed: boolean; version?: string; installed?: number; base?: string }
export interface Latest { version: string; released?: string; notes?: string }

class Updates {
  info = $state<VersionInfo | null>(null);
  latest = $state<Latest | null>(null);
  checked = $state(false);
  checking = $state(false);
  error = $state('');

  /** Installed version: the installer's record, or the version baked into this build (dev installs). */
  get current(): string { return this.info?.version ?? __LUMEN_VERSION__; }
  get base(): string { return this.info?.base || DEFAULT_BASE; }
  get available(): boolean { return !!this.latest && cmpRelease(this.latest.version, this.current) > 0; }

  async refresh() {
    this.checking = true; this.error = '';
    try { this.info = await call<VersionInfo>('lumen', 'version'); } catch { this.info = { managed: false }; }
    try {
      if (MOCK) this.latest = { version: this.current, released: new Date().toISOString(), notes: '' };
      else {
        const r = await fetch(`${this.base}/latest.json`, { cache: 'no-store' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        this.latest = await r.json();
      }
    } catch (e) {
      this.latest = null;
      this.error = `Could not reach the release server (${e instanceof Error ? e.message : e}).`;
    }
    this.checked = true; this.checking = false;
  }
}
export const updates = new Updates();
