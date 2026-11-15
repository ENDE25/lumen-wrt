// Single shared poller: one batched request every INTERVAL ms feeds every page.
import { getSnapshot, type Snapshot } from './api';
import type { NetDevice, NetInterface, RatePoint, SystemInfo } from './types';

const INTERVAL = 2000;
const HISTORY = 150; // points kept per device (~5 min)

class Live {
  system = $state<SystemInfo | null>(null);
  devices = $state<Record<string, NetDevice>>({});
  interfaces = $state<NetInterface[]>([]);
  history = $state<Record<string, RatePoint[]>>({});
  error = $state<string | null>(null);
  loaded = $state(false);

  #timer: ReturnType<typeof setTimeout> | null = null;
  #prev: Record<string, { t: number; rx: number; tx: number }> = {};
  #users = 0;

  /** Page components call start() on mount and the returned fn on destroy. */
  start(): () => void {
    if (this.#users++ === 0) this.#loop();
    return () => { if (--this.#users === 0 && this.#timer) { clearTimeout(this.#timer); this.#timer = null; } };
  }

  async #loop() {
    try { this.#apply(await getSnapshot()); this.error = null; }
    catch (e) { this.error = e instanceof Error ? e.message : String(e); }
    if (this.#users > 0) this.#timer = setTimeout(() => this.#loop(), INTERVAL);
  }

  #apply(s: Snapshot) {
    const now = performance.now();
    for (const [name, d] of Object.entries(s.devices)) {
      const p = this.#prev[name];
      const rx = d.statistics?.rx_bytes ?? 0, tx = d.statistics?.tx_bytes ?? 0;
      if (p && now > p.t) {
        const dt = (now - p.t) / 1000;
        const pt: RatePoint = { t: Date.now(), rx: Math.max(0, (rx - p.rx) / dt), tx: Math.max(0, (tx - p.tx) / dt) };
        const h = this.history[name] ?? (this.history[name] = []);
        h.push(pt);
        if (h.length > HISTORY) h.shift();
      }
      this.#prev[name] = { t: now, rx, tx };
    }
    this.system = s.system;
    this.devices = s.devices;
    this.interfaces = s.interfaces;
    this.loaded = true;
  }

  /** Interface carrying the default route = "Internet". Falls back to first up interface. */
  get wan(): NetInterface | undefined {
    return this.interfaces.find((i) => i.up && i.route?.some((r) => r.target === '0.0.0.0' && r.mask === 0))
      ?? this.interfaces.find((i) => i.up && i.interface !== 'loopback');
  }

  rate(dev?: string): RatePoint | undefined {
    const h = dev ? this.history[dev] : undefined;
    return h?.[h.length - 1];
  }
}

export const live = new Live();
