import type { Client, ClientTraffic } from './types';
import { lookup } from './vendor';

export interface ClientRow {
  mac: string; name: string; sub: string; kind: string; brand?: string; vendor?: string;
  rx: number; tx: number; all: number; pct: number; known: boolean;
  /** connected right now; null for the "unattributed" line, which is not a device */
  online: boolean | null;
  /** unix seconds of its latest traffic, when the router knows */
  last?: number;
}

/** Join traffic totals with the known client list (by MAC), biggest first. */
export function clientRows(traffic: ClientTraffic | null, clients: Client[]): ClientRow[] {
  const totals = traffic?.totals ?? {};
  const byMac = new Map(clients.map((c) => [c.mac.toLowerCase(), c]));
  const rows = Object.entries(totals).map(([mac, [rx, tx]]) => {
    const c = byMac.get(mac);
    const unattributed = mac === '?';
    // A device that has left the network is no longer in the router's lists: use what the collector remembered
    // about it (last IP and DHCP name), then the vendor of its MAC address.
    const who = c || unattributed ? undefined : traffic?.meta?.[mac];
    const v = c || unattributed ? undefined : lookup(mac);
    const name = unattributed ? 'Unattributed' : c?.name || who?.name || c?.ip || who?.ip || v?.vendor || mac;
    return {
      mac, rx, tx, all: rx + tx, pct: 0, known: !!c,
      online: unattributed ? null : !!c?.active,
      last: unattributed ? undefined : traffic?.last?.[mac],
      name,
      sub: unattributed ? 'traffic whose device could not be identified' : c ? (c.name ? c.ip : c.mac) : name === mac ? 'no longer seen on the network' : mac,
      kind: unattributed ? 'unknown' : c?.kind ?? v?.kind ?? 'unknown', brand: c?.brand ?? v?.brand ?? undefined, vendor: c?.vendor ?? v?.vendor ?? undefined,
    };
  }).sort((a, b) => b.all - a.all);
  const top = Math.max(1, rows[0]?.all ?? 1);
  rows.forEach((r) => (r.pct = (r.all / top) * 100));
  return rows;
}
