import { batch, call } from './ubus';
import type { Service, Stats, Board, Client, ClientKind, ClientLink, HostHint, Lease, NetDevice, NetInterface, NetworkMap, SystemInfo, WifiIface } from './types';

export const getBoard = () => call<Board>('system', 'board');
export const getSystem = () => call<SystemInfo>('system', 'info');

export interface Snapshot {
  system: SystemInfo | null;
  stats: Stats | null;
  devices: Record<string, NetDevice>;
  interfaces: NetInterface[];
}

/** Everything the dashboard polls, in one HTTP request. */
export async function getSnapshot(): Promise<Snapshot> {
  const [system, devs, ifs, stats] = await batch([
    ['system', 'info'],
    ['network.device', 'status'],
    ['network.interface', 'dump'],
    ['lumen', 'stats'],
  ]);
  const devices: Record<string, NetDevice> = {};
  for (const [name, d] of Object.entries<any>(devs ?? {})) devices[name] = { ...d, name };
  return { system, stats, devices, interfaces: ifs?.interface ?? [] };
}

export function kindOf(name: string): ClientKind {
  const n = name.toLowerCase();
  if (/iphone|android|galaxy|pixel|redmi|xiaomi|huawei|phone|ipad|tablet/.test(n)) return 'phone';
  if (/macbook|laptop|portatil|notebook|thinkpad/.test(n)) return 'laptop';
  if (/desktop|^pc|imac|gaming|workstation/.test(n)) return 'desktop';
  if (/tv|chromecast|roku|firestick|apple-tv|appletv/.test(n)) return 'tv';
  if (/print|impres|brother|canon|epson|^hp/.test(n)) return 'printer';
  if (/nas|server|raspberry|pve|proxmox|docker|openwrt/.test(n)) return 'server';
  if (/shelly|esp|tasmota|sonoff|tuya|cam|bulb|hue/.test(n)) return 'iot';
  return 'unknown';
}

const bandOf = (mhz?: number) => !mhz ? '' : mhz < 3000 ? '2.4 GHz' : mhz < 5900 ? '5 GHz' : '6 GHz';

/** Clients plus how each one is attached (port / SSID). One batch + one wifi batch. */
export async function getNetworkMap(): Promise<NetworkMap> {
  const [hints, leases, topo, radios, devs, ifs] = await batch([
    ['luci-rpc', 'getHostHints'], ['luci-rpc', 'getDHCPLeases'],
    ['lumen', 'topology'], ['luci-rpc', 'getWirelessDevices'],
    ['network.device', 'status'], ['network.interface', 'dump'],
  ]);

  // The router itself is not a "client": hide every MAC / IP that belongs to it.
  const ownMacs = new Set<string>(Object.values<any>(devs ?? {}).map((d) => String(d.macaddr ?? '').toLowerCase()).filter(Boolean));
  const ownIps = new Set<string>();
  for (const i of (ifs?.interface ?? []) as NetInterface[]) (i['ipv4-address'] ?? []).forEach((a) => ownIps.add(a.address));

  // Wi-Fi: interface names come from the wireless config; iwinfo then gives SSID + associations.
  const ifnames: { ifname: string; ssid: string; mode: string; section?: string; radio?: string }[] = [];
  for (const [radio, r] of Object.entries<any>(radios ?? {}))
    for (const i of r.interfaces ?? []) if (i.ifname) ifnames.push({ ifname: i.ifname, ssid: i.config?.ssid ?? '', mode: i.config?.mode ?? 'ap', section: i.section, radio });
  const wifiRes = ifnames.length
    ? await batch(ifnames.flatMap(({ ifname }) => [['iwinfo', 'info', { device: ifname }], ['iwinfo', 'assoclist', { device: ifname }]] as [string, string, object][]))
    : [];
  const wifi: WifiIface[] = ifnames.map((w, i) => {
    const info = wifiRes[i * 2] ?? {}, assoc = wifiRes[i * 2 + 1]?.results ?? [];
    return {
      ifname: w.ifname, section: w.section, radio: w.radio, ssid: info.ssid || w.ssid, mode: info.mode || w.mode, channel: info.channel,
      band: bandOf(info.frequency),
      clients: assoc.map((a: any) => ({ mac: String(a.mac).toLowerCase(), signal: a.signal, rx: a.rx?.rate, tx: a.tx?.rate })),
    };
  });

  const byMac = new Map<string, Lease>();
  for (const l of (leases?.dhcp_leases ?? []) as Lease[]) byMac.set(l.macaddr.toLowerCase(), l);
  const bridges: Record<string, string[]> = topo?.bridges ?? {};
  const wifiOf = new Map<string, { w: WifiIface; c: WifiIface['clients'][number] }>();
  wifi.forEach((w) => w.clients.forEach((c) => wifiOf.set(c.mac, { w, c })));
  const fdbPort = new Map<string, string>();
  for (const entries of Object.values<any[]>(topo?.fdb ?? {}))
    for (const e of entries) if (!e.local && e.port) fdbPort.set(String(e.mac).toLowerCase(), e.port);
  const neighDev = new Map<string, string>();
  for (const n of (topo?.neigh ?? []) as { mac: string; dev: string }[]) neighDev.set(n.mac.toLowerCase(), n.dev);

  const clients: Client[] = [];
  for (const [mac, h] of Object.entries<HostHint>(hints ?? {})) {
    const m = mac.toLowerCase();
    if (ownMacs.has(m) || h.ipaddrs?.some((ip) => ownIps.has(ip))) continue;
    const lease = byMac.get(m);
    const name = (h.name || (lease && lease.hostname !== '*' ? lease.hostname : '')) || '';
    let link: ClientLink | undefined;
    const wf = wifiOf.get(m);
    if (wf) link = { type: 'wifi', dev: wf.w.ifname, ssid: wf.w.ssid, band: wf.w.band, signal: wf.c.signal, rx: wf.c.rx, tx: wf.c.tx };
    else if (fdbPort.has(m)) link = { type: 'wired', dev: fdbPort.get(m)! };
    else if (neighDev.has(m)) link = { type: 'wired', dev: neighDev.get(m)! };
    clients.push({
      mac, name, ip: h.ipaddrs?.[0] ?? lease?.ipaddr ?? '', ip6: h.ip6addrs ?? [],
      kind: kindOf(name), leaseExpires: lease?.expires, static: !lease, link,
    });
  }
  clients.sort((a, b) => ipNum(a.ip) - ipNum(b.ip));
  return { clients, wifi, bridges };
}

export const getClients = async (): Promise<Client[]> => (await getNetworkMap()).clients;

function ipNum(ip: string): number {
  const p = ip.split('.').map(Number);
  return p.length === 4 && p.every((n) => !isNaN(n)) ? p.reduce((a, n) => a * 256 + n, 0) : Number.MAX_SAFE_INTEGER;
}

export interface LogLine { time: number; msg: string }
export async function getLog(): Promise<LogLine[]> {
  const r = await call<{ log: { msg: string; time: number }[] }>('log', 'read', { lines: 200, stream: false, oneshot: true });
  return (r.log ?? []).map((l) => ({ time: l.time, msg: l.msg })).reverse();
}

export const reboot = () => call('system', 'reboot');

/** failed first (has instances, none running), then running, then services without a daemon */
const rank = (s: Service) => (s.running ? 1 : s.instances ? 0 : 2);
export const isFailed = (s: Service) => !s.running && s.instances > 0;

export async function getServices(): Promise<Service[]> {
  const r = await call<Record<string, { instances?: Record<string, { running?: boolean; exit_code?: number }> }>>('service', 'list');
  return Object.entries(r ?? {}).map(([name, v]) => {
    const inst = Object.values(v.instances ?? {});
    return { name, instances: inst.length, running: inst.some((i) => i.running), exitCode: inst.find((i) => !i.running)?.exit_code };
  }).sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}
