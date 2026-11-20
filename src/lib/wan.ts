// Internet links (WANs). A router can have several: OpenWrt sends traffic through the one with the lowest
// metric among those that are up with a default route; the others wait as backups and take over only when it
// goes down (mwan3, when installed, can also check the link and share the load: that is not modelled here).
import type { NetInterface } from './types';

export type WanRole = 'primary' | 'backup' | 'failover' | 'down';
export interface Wan {
  iface: NetInterface;
  name: string;          // UCI interface name, e.g. wan, wanb
  dev?: string;          // device carrying it, e.g. eth0, pppoe-wan, phy0-sta0
  up: boolean;           // up and holding a default route
  metric: number;
  gateway?: string;
  role: WanRole;         // primary: preferred and in use; backup: waiting; failover: a backup in use; down
}

export const hasDefaultRoute = (i: NetInterface) => !!i.route?.some((r) => r.target === '0.0.0.0' && r.mask === 0);
// IPv6-only companions (wan6 and friends) belong to an IPv4 link; they are not links of their own.
const V6_ONLY = /^(dhcpv6|6in4|6to4|6rd|dslite|map|464xlat)$/;

/**
 * Every Internet link, preferred first. `wanNets` are the networks of the firewall's WAN zone(s): they let a link
 * that is down still be listed (it has no default route then). Without them only links that are up are found.
 */
export function wansOf(interfaces: NetInterface[], wanNets?: string[] | null): Wan[] {
  const zone = new Set(wanNets ?? []);
  const cands = interfaces.filter((i) => i.interface !== 'loopback' && !V6_ONLY.test(i.proto) &&
    ((i.up && hasDefaultRoute(i)) || zone.has(i.interface)));
  const list = cands.map((i) => ({
    iface: i, name: i.interface, dev: i.l3_device ?? i.device, up: i.up && hasDefaultRoute(i), metric: i.metric ?? 0,
    gateway: i.route?.find((r) => r.target === '0.0.0.0' && r.mask === 0)?.nexthop, role: 'down' as WanRole,
  }));
  // preferred order: by metric (what the kernel uses), then by name so the order is stable
  list.sort((a, b) => a.metric - b.metric || a.name.localeCompare(b.name));
  const active = list.find((w) => w.up);
  for (const w of list) {
    if (!w.up) w.role = 'down';
    else if (w !== active) w.role = 'backup';
    else w.role = w === list[0] ? 'primary' : 'failover';   // a preferred link is down: a backup is carrying traffic
  }
  return list;
}

export const ROLE_LABEL: Record<WanRole, string> = { primary: 'Primary', backup: 'Backup', failover: 'Backup · in use', down: 'Down' };

/** Firewall networks that face the Internet: the zone called "wan" and any zone that masquerades. */
export function wanZoneNets(fw: Record<string, Record<string, unknown>>): string[] {
  const out: string[] = [];
  for (const s of Object.values(fw)) {
    if (s['.type'] !== 'zone' || !(s.name === 'wan' || s.masq === '1')) continue;
    const n = s.network;
    out.push(...(Array.isArray(n) ? n.map(String) : typeof n === 'string' ? n.split(/\s+/) : []));
  }
  return out;
}
