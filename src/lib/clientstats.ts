import type { Client, ClientTraffic } from './types';

export interface ClientRow { mac: string; name: string; sub: string; kind: string; rx: number; tx: number; all: number; pct: number; known: boolean }

/** Join traffic totals with the known client list (by MAC), biggest first. */
export function clientRows(traffic: ClientTraffic | null, clients: Client[]): ClientRow[] {
  const totals = traffic?.totals ?? {};
  const byMac = new Map(clients.map((c) => [c.mac.toLowerCase(), c]));
  const rows = Object.entries(totals).map(([mac, [rx, tx]]) => {
    const c = byMac.get(mac);
    const unattributed = mac === '?';
    return {
      mac, rx, tx, all: rx + tx, pct: 0, known: !!c,
      name: unattributed ? 'Unattributed' : c?.name || c?.ip || mac,
      sub: unattributed ? 'traffic whose device could not be identified' : c ? (c.name ? c.ip : c.mac) : 'no longer seen on the network',
      kind: unattributed ? 'unknown' : c?.kind ?? 'unknown',
    };
  }).sort((a, b) => b.all - a.all);
  const top = Math.max(1, rows[0]?.all ?? 1);
  rows.forEach((r) => (r.pct = (r.all / top) * 100));
  return rows;
}
