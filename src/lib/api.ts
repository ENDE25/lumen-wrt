import { batch, call } from './ubus';
import type { Board, Client, ClientKind, HostHint, Lease, NetDevice, NetInterface, SystemInfo } from './types';

export const getBoard = () => call<Board>('system', 'board');
export const getSystem = () => call<SystemInfo>('system', 'info');

export interface Snapshot {
  system: SystemInfo | null;
  devices: Record<string, NetDevice>;
  interfaces: NetInterface[];
}

/** Everything the dashboard polls, in one HTTP request. */
export async function getSnapshot(): Promise<Snapshot> {
  const [system, devs, ifs] = await batch([
    ['system', 'info'],
    ['network.device', 'status'],
    ['network.interface', 'dump'],
  ]);
  const devices: Record<string, NetDevice> = {};
  for (const [name, d] of Object.entries<any>(devs ?? {})) devices[name] = { ...d, name };
  return { system, devices, interfaces: ifs?.interface ?? [] };
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

export async function getClients(): Promise<Client[]> {
  const [hints, leases] = await batch([['luci-rpc', 'getHostHints'], ['luci-rpc', 'getDHCPLeases']]);
  const byMac = new Map<string, Lease>();
  for (const l of (leases?.dhcp_leases ?? []) as Lease[]) byMac.set(l.macaddr.toUpperCase(), l);

  const out: Client[] = [];
  for (const [mac, h] of Object.entries<HostHint>(hints ?? {})) {
    const lease = byMac.get(mac.toUpperCase());
    const name = (h.name || (lease && lease.hostname !== '*' ? lease.hostname : '')) || '';
    out.push({
      mac, name, ip: h.ipaddrs?.[0] ?? lease?.ipaddr ?? '', ip6: h.ip6addrs ?? [],
      kind: kindOf(name), leaseExpires: lease?.expires, static: !lease,
    });
  }
  return out.sort((a, b) => ipNum(a.ip) - ipNum(b.ip));
}

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
