const U = ['B', 'KB', 'MB', 'GB', 'TB'];

export function bytes(n: number, digits = 1): string {
  if (!isFinite(n) || n < 0) return '–';
  let i = 0;
  while (n >= 1024 && i < U.length - 1) { n /= 1024; i++; }
  return `${n >= 100 || i === 0 ? Math.round(n) : n.toFixed(digits)} ${U[i]}`;
}

/** bytes/s -> bits/s with SI prefixes, the way network people read it */
export function bps(bytesPerSec: number): string {
  const b = bytesPerSec * 8;
  if (b >= 1e9) return `${(b / 1e9).toFixed(2)} Gbps`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(b >= 1e8 ? 0 : 1)} Mbps`;
  if (b >= 1e3) return `${(b / 1e3).toFixed(0)} Kbps`;
  return `${Math.round(b)} bps`;
}

export function duration(sec: number): string {
  sec = Math.max(0, Math.floor(sec));
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600),
    m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (d) return `${d}d ${h}h ${m}m`;
  if (h) return `${h}h ${m}m ${s}s`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

export function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

export function cidr(a: { address: string; mask: number }): string {
  return `${a.address}/${a.mask}`;
}

export function load(v: number): string {
  return (v / 65536).toFixed(2);
}
