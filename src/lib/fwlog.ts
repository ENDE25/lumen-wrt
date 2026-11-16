// Firewall block statistics, computed in the browser from the kernel log lines fw4 writes when a zone has `log 1`.
// Nothing runs in the background: the log buffer (RAM, a few hundred KB at most) is read when the page is open.
import { call } from './ubus';

export interface Block { t: number; action: 'drop' | 'reject'; zone: string; dir: string; src: string; dst: string; proto: string; dport: number }
export interface FwStats {
  total: number; since: number; unique: number;
  buckets: number[]; bucketMs: number; start: number;
  sources: [string, number][]; ports: [string, number][]; zones: [string, number][];
}

// e.g.  "kern.warn kernel: [ 321.5] reject wan in: IN=wan OUT= MAC=... SRC=1.2.3.4 DST=5.6.7.8 LEN=60 ... PROTO=TCP SPT=4444 DPT=22 ..."
const LINE = /(drop|reject) (\S+) (in|out|fwd): .*?SRC=(\S+) DST=(\S+).*?PROTO=(\w+)(?:.*?DPT=(\d+))?/;

export async function getBlocks(): Promise<Block[]> {
  const r = await call<{ log: { msg: string; time: number }[] }>('log', 'read', { lines: 5000, stream: false, oneshot: true });
  const out: Block[] = [];
  for (const l of r.log ?? []) {
    const m = LINE.exec(l.msg);
    if (m) out.push({ t: l.time, action: m[1] as Block['action'], zone: m[2], dir: m[3], src: m[4], dst: m[5], proto: m[6], dport: m[7] ? +m[7] : 0 });
  }
  return out;
}

const top = (m: Map<string, number>, n: number) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n);
const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

export function summarize(blocks: Block[], now = Date.now()): FwStats {
  const day = 24 * 3600e3;
  const list = blocks.filter((b) => b.t >= now - day);
  const oldest = list.reduce((a, b) => Math.min(a, b.t), now);
  const span = Math.min(day, Math.max(3600e3, now - oldest));      // 1 h .. 24 h shown
  const N = 24, bucketMs = span / N, start = now - span;
  const buckets = new Array<number>(N).fill(0);
  const src = new Map<string, number>(), ports = new Map<string, number>(), zones = new Map<string, number>();
  for (const b of list) {
    buckets[Math.min(N - 1, Math.floor((b.t - start) / bucketMs))]++;
    bump(src, b.src); bump(zones, b.zone);
    if (b.dport) bump(ports, `${b.dport}/${b.proto.toLowerCase()}`);
  }
  return { total: list.length, since: list.length ? oldest : now, unique: src.size, buckets, bucketMs, start, sources: top(src, 6), ports: top(ports, 6), zones: top(zones, 4) };
}

export const PORT_NAME: Record<number, string> = { 21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP', 53: 'DNS', 80: 'HTTP', 110: 'POP3', 123: 'NTP', 143: 'IMAP', 443: 'HTTPS', 445: 'SMB', 1433: 'MSSQL', 1900: 'UPnP', 3306: 'MySQL', 3389: 'RDP', 5060: 'SIP', 5900: 'VNC', 8080: 'HTTP-alt', 8443: 'HTTPS-alt' };
