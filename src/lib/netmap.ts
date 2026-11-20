// Turns raw router data into a laid-out graph (a router-centred map):  Internet → Router → ports / SSIDs → clients.
import type { Board, Client, NetDevice, NetInterface, WifiIface } from './types';
import { ROLE_LABEL, wansOf, type Wan } from './wan';

export type NodeKind = 'internet' | 'router' | 'port' | 'ssid' | 'client';

export interface GNode {
  id: string; kind: NodeKind; x: number; y: number; w: number; h: number;
  title: string; sub: string; sub2?: string; icon: string; brand?: string; up: boolean;
  client?: Client; port?: NetDevice; wifi?: WifiIface; iface?: NetInterface; count?: number; uplink?: boolean; wan?: Wan;
}
export interface GLink { id: string; from: string; to: string; wifi: boolean; up: boolean; curve: boolean; label?: string; standby?: boolean }
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
  clients: Client[]; wifi: WifiIface[]; bridges: Record<string, string[]>; wans?: Wan[];
}): Graph {
  const { board, interfaces, devices, clients, wifi, bridges } = p;
  // every Internet link sits on the left, preferred first; none of them is listed as a LAN port
  const wans = p.wans ?? wansOf(interfaces);
  const wanDevs = new Set(wans.map((w) => w.iface.l3_device ?? w.dev).filter(Boolean) as string[]);
  const wan = wans.find((w) => w.up)?.iface;
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
    .filter((d) => !wanDevs.has(d.name) || byDev.has(d.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  for (const d of ports) {
    const net = ifaceOfDev(d.name)?.interface ?? Object.entries(bridges).find(([, m]) => m.includes(d.name))?.[0];
    attaches.push({
      id: `port:${d.name}`, kind: 'port', clients: byDev.get(d.name) ?? [],
      node: { title: d.name, sub: [d.carrier ? speed(d.speed) || 'Up' : 'No link', net].filter(Boolean).join(' · '), icon: 'devices', up: d.carrier, port: d },
    });
    byDev.delete(d.name);
  }
  // A Wi-Fi client interface is the way up, not a network we serve. When it carries the default route it becomes the
  // Internet link below; any other one is listed as an uplink without clients.
  const chan = (w: WifiIface) => [w.band, w.channel ? `ch ${w.channel}` : ''].filter(Boolean).join(' · ');
  const upWifi = wifi.find((w) => w.role === 'sta' && w.ifname === wanDev);
  const wanWifi = (dev?: string) => wifi.find((w) => w.role === 'sta' && w.ifname === dev);
  for (const w of wifi) {
    if (wanDevs.has(w.ifname)) { byDev.delete(w.ifname); continue; }
    const sta = w.role === 'sta';
    attaches.push({
      id: `ssid:${w.ifname}`, kind: 'ssid', clients: sta ? [] : byDev.get(w.ifname) ?? [],
      node: { title: w.ssid || w.ifname, sub: sta ? ['Uplink', chan(w)].filter(Boolean).join(' · ') : chan(w), icon: 'wifi', up: true, wifi: w, uplink: sta },
    });
    byDev.delete(w.ifname);
  }
  // leftovers: bridge itself or unknown attachment
  for (const [dev, list] of byDev) {
    if (wanDevs.has(dev) || bridgeNames.has(dev) || dev === '__unknown')
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
  const IH = 120;   // vertical room per Internet link
  let height = Math.max(y, 260, wans.length * IH + 40);
  const mid = rows.length ? (rows[0].cy + rows[rows.length - 1].cy) / 2 : height / 2;

  nodes.push({
    id: 'router', kind: 'router', x: COL.router, y: mid - 52, w: W.router, h: 104, up: true, icon: 'router',
    title: board?.hostname || 'Router', sub: board?.model || board?.release.description || '',
  });
  if (wans.length <= 1) {
    nodes.push({
      id: 'internet', kind: 'internet', x: COL.internet + 10, y: mid - 26, w: W.internet, h: 100, up: !!wan, icon: 'globe',
      title: 'Internet', sub: wan?.['ipv4-address']?.[0]?.address ?? (wan ? wan.proto : 'Offline'), iface: wan, wifi: upWifi, wan: wans[0],
    });
    links.push({ id: 'internet>router', from: 'internet', to: 'router', wifi: !!upWifi, up: !!wan, curve: false, label: wan ? (upWifi ? `${upWifi.ssid} · ${chan(upWifi)}` : `${wan.interface} · ${wanDev}`) : undefined });
  } else {
    // one globe per link, stacked around the router: the one in use solid, waiting backups dashed, dead ones faded
    const top = Math.max(16, mid - (wans.length * IH) / 2 + 10);
    height = Math.max(height, top + wans.length * IH);
    wans.forEach((w, i) => {
      const id = `internet:${w.name}`, ww = wanWifi(w.dev);
      nodes.push({
        id, kind: 'internet', x: COL.internet + 10, y: top + i * IH, w: W.internet, h: 100, up: w.up, icon: 'globe',
        title: w.name, sub: w.role === 'down' ? 'Down' : `${ROLE_LABEL[w.role]} · ${w.iface['ipv4-address']?.[0]?.address ?? w.iface.proto}`,
        iface: w.iface, wifi: ww, wan: w,
      });
      links.push({ id: `${id}>router`, from: id, to: 'router', wifi: !!ww, up: w.up, standby: w.role === 'backup', curve: false,
        label: ww ? `${ww.ssid} · ${chan(ww)}` : w.dev });
    });
  }
  for (const a of attaches) links.push({ id: `router>${a.id}`, from: 'router', to: a.id, wifi: a.kind === 'ssid', up: a.node.up ?? true, curve: false });

  return { nodes, links, width: COL.client + W.client + 24, height: height + 8 };
}
