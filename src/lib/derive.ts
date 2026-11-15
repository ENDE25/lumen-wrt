import type { Stats, SystemInfo } from './types';

export interface Mem { total: number; used: number; cache: number; free: number; swapTotal: number; swapUsed: number; pct: number; real: boolean }

/** Memory as the router itself sees it. Prefers /proc/meminfo (container-correct) over sysinfo(). */
export function memory(stats: Stats | null, sys: SystemInfo | null): Mem | null {
  if (stats?.mem.MemTotal) {
    const m = stats.mem, free = m.MemFree, avail = Math.max(m.MemAvailable, free);
    return { total: m.MemTotal, used: m.MemTotal - avail, cache: avail - free, free,
      swapTotal: m.SwapTotal, swapUsed: m.SwapTotal - m.SwapFree, pct: Math.round(((m.MemTotal - avail) / m.MemTotal) * 100), real: true };
  }
  if (sys) {
    const m = sys.memory, avail = Math.max(m.available, m.free);
    return { total: m.total, used: m.total - avail, cache: avail - m.free, free: m.free,
      swapTotal: sys.swap.total, swapUsed: sys.swap.total - sys.swap.free, pct: Math.round(((m.total - avail) / m.total) * 100), real: false };
  }
  return null;
}

export const maxTemp = (s: Stats | null) => (s?.temps.length ? Math.max(...s.temps.map((t) => t.c)) : null);
export const tempTone = (c: number) => (c >= 85 ? 'bad' : c >= 70 ? 'warn' : 'ok');
