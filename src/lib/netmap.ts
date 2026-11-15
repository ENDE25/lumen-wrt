// Turns raw router data into a laid-out graph (a router-centred map):  Internet → Router → ports / SSIDs → clients.
import type { Board, Client, NetDevice, NetInterface, WifiIface } from './types';

export type NodeKind = 'internet' | 'router' | 'port' | 'ssid' | 'client';

export interface GNode {
  id: string; kind: NodeKind; x: number; y: number; w: number; h: number;
  title: string; sub: string; sub2?: string; icon: string; brand?: string; up: boolean;
  client?: Client; port?: NetDevice; wifi?: WifiIface; iface?: NetInterface; count?: number;
}
export interface GLink { id: string; from: string; to: string; wifi: boolean; up: boolean; curve: boolean; label?: string }
export interface Graph { nodes: GNode[]; links: GLink[]; width: number; height: number }

export const COL = { internet: 24, router: 330, attach: 660, client: 960 } as const;
const W = { internet: 140, router: 230, attach: 220, client: 250 } as const;
const ROW = 74, GAP = 22, CH = 62, AH = 58;

const VIRTUAL = /^(lo|ifb|veth|tap|tun|wg|bond|dummy|erspan|gre|ip6|sit|teql|bonding|phy|wlan)/;
const speed = (s?: string) => { const n = parseInt(s ?? '0'); return n >= 1000 ? `${n / 1000} Gb/s` : n ? `${n} Mb/s` : ''; };

/** Name, IP and MAC for a client. Without a name: IP and MAC. */
function clientLines(c: Client): { title: string; sub: string; sub2?: string } {
  const ip = c.ip || c.ip6[0] || '';
  if (c.name) return { title: c.name, sub: ip || 'no IP', sub2: c.mac };
  return ip ? { title: ip, sub: c.mac } : { title: c.mac, sub: '' };
}

export function buildGraph(p: {
  board: Board | null; interfaces: NetInterface[]; devices: Record<string, NetDevice>;
  clients: Client[]; wifi: WifiIface[]; bridges: Record<string, string[]>;
}): Graph {
  const { board, interfaces, devices, clients, wifi, bridges } = p;
  const wan = interfaces.find((i) => i.up && i.route?.some((r) => r.target === '0.0.0.0' && r.mask === 0));
  const wanDev = wan?.l3_device;
  const bridgeNames = new Set(Object.keys(bridges));

  // group clients by the attachment point they were seen on
  const byDev = new Map<string, Client[]>();
  for (const c of clients) {
    const d = c.link?.dev ?? '__unknown';
    (byDev.get(d) ?? byDev.set(d, []).get(d)!).push(c);
  }

  type Attach = { id: string; kind: 'port' | 'ssid'; node: Partial<GNode>; clients: Client[] };
  const attaches: Attach[] = [];
  const ifaceOfDev = (d: string) => interfaces.find((i) => i.l3_device === d || i.device === d);

  const ports = Object.values(devices)
    .filter((d) => d.type === 'Network device' && !VIRTUAL.test(d.name))
    .filter((d) => d.name !== wanDev || byDev.has(d.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  for (const d of ports) {
    const net = ifaceOfDev(d.name)?.interface ?? Object.entries(bridges).find(([, m]) => m.includes(d.name))?.[0];
    attaches.push({
      id: `port:${d.name}`, kind: 'port', clients: byDev.get(d.name) ?? [],
      node: { title: d.name, sub: [d.carrier ? speed(d.speed) || 'Up' : 'No link', net].filter(Boolean).join(' · '), icon: 'devices', up: d.carrier, port: d },
    });
    byDev.delete(d.name);
  }
  for (const w of wifi) {
    attaches.push({
      id: `ssid:${w.ifname}`, kind: 'ssid', clients: byDev.get(w.ifname) ?? [],
      node: { title: w.ssid || w.ifname, sub: [w.band, w.channel ? `ch ${w.channel}` : ''].filter(Boolean).join(' · '), icon: 'wifi', up: true, wifi: w },
    });
    byDev.delete(w.ifname);
  }
  // leftovers: bridge itself or unknown attachment
  for (const [dev, list] of byDev) {
    if (dev === wanDev || bridgeNames.has(dev) || dev === '__unknown')
      attaches.push({ id: `port:${dev}`, kind: 'port', clients: list, node: { title: dev === '__unknown' ? 'Unplaced' : dev, sub: dev === '__unknown' ? 'Unknown location' : 'Unidentified port', icon: 'devices', up: true } });
  }

  // ---- layout: stack attachments, each with its clients in consecutive rows
  const nodes: GNode[] = [], links: GLink[] = [];
  let y = 24;
  const rows: { cy: number }[] = [];
  for (const a of attaches) {
    const n = Math.max(1, a.clients.length);
    const blockH = n * ROW;
    const cy = y + blockH / 2;
    nodes.push({ x: COL.attach, y: cy - AH / 2, w: W.attach, h: AH, kind: a.kind, id: a.id, title: '', sub: '', icon: '', up: true, ...a.node, count: a.clients.length } as GNode);
    a.clients.forEach((c, i) => {
      const id = `client:${c.mac}`;
      nodes.push({ id, kind: 'client', x: COL.client, y: y + i * ROW + (ROW - CH) / 2, w: W.client, h: CH, ...clientLines(c), icon: c.kind, brand: c.brand, up: true, client: c });
      links.push({ id: `${a.id}>${id}`, from: a.id, to: id, wifi: a.kind === 'ssid', up: true, curve: true });
    });
    rows.push({ cy });
    y += blockH + GAP;
  }
  const height = Math.max(y, 260);
  const mid = rows.length ? (rows[0].cy + rows[rows.length - 1].cy) / 2 : height / 2;

  nodes.push({
    id: 'router', kind: 'router', x: COL.router, y: mid - 52, w: W.router, h: 104, up: true, icon: 'router',
    title: board?.hostname || 'Router', sub: board?.model || board?.release.description || '',
  });
  nodes.push({
    id: 'internet', kind: 'internet', x: COL.internet + 10, y: mid - 26, w: W.internet, h: 100, up: !!wan, icon: 'globe',
    title: 'Internet', sub: wan?.['ipv4-address']?.[0]?.address ?? (wan ? wan.proto : 'Offline'), iface: wan,
  });
  links.push({ id: 'internet>router', from: 'internet', to: 'router', wifi: false, up: !!wan, curve: false, label: wan ? `${wan.interface} · ${wanDev}` : undefined });
  for (const a of attaches) links.push({ id: `router>${a.id}`, from: 'router', to: a.id, wifi: a.kind === 'ssid', up: a.node.up ?? true, curve: false });

  return { nodes, links, width: COL.client + W.client + 24, height: height + 8 };
}
