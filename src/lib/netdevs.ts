// Bridges and VLAN tables (/etc/config/network `device` bridges and `bridge-vlan` sections), plus interface create/delete helpers.
import { uciGet, str, asList, sectionOps, type UciConfig, type UciOp, type UciSection } from './uci';

export interface Bridge { section: string; name: string; ports: string[]; vlanFiltering: boolean; raw: UciSection }
export interface VPort { port: string; tagged: boolean; pvid: boolean }
export interface BVlan { section: string; device: string; vlan: string; ports: VPort[]; local: boolean; raw: UciSection }

export const parsePort = (s: string): VPort => {
  const [port, flags = ''] = s.split(':');
  return { port, tagged: flags.includes('t'), pvid: flags.includes('*') };
};
export const fmtPort = (p: VPort) => `${p.port}:${p.tagged ? 't' : 'u'}${p.pvid ? '*' : ''}`;

export interface NetCfg { all: UciConfig; bridges: Bridge[]; vlans: BVlan[]; ifaces: UciSection[] }
export async function loadNet(): Promise<NetCfg> {
  const all = await uciGet('network');
  const secs = Object.values(all);
  return {
    all,
    ifaces: secs.filter((s) => s['.type'] === 'interface'),
    bridges: secs.filter((s) => s['.type'] === 'device' && str(s.type) === 'bridge').map((s) => ({ section: s['.name'], name: str(s.name), ports: asList(s.ports), vlanFiltering: str(s.vlan_filtering) === '1', raw: s })),
    vlans: secs.filter((s) => s['.type'] === 'bridge-vlan').map((s) => ({ section: s['.name'], device: str(s.device), vlan: str(s.vlan), ports: asList(s.ports).map(parsePort), local: str(s.local) !== '0', raw: s })),
  };
}

export const validName = (n: string) => /^[a-z][a-z0-9_]{0,14}$/.test(n);
export const validBridgeName = (n: string) => /^[A-Za-z][A-Za-z0-9_.-]{0,14}$/.test(n);

// ---- create / delete interface -------------------------------------------------------------------------------

export interface NewIf { name: string; proto: 'static' | 'dhcp' | 'pppoe'; device: string; ipaddr: string; gateway: string; dns: string; username: string; password: string; zone: string; dhcpServer: boolean }

export async function buildNewInterface(f: NewIf): Promise<UciOp[]> {
  const ops: UciOp[] = [];
  const values: Record<string, string | string[]> = { proto: f.proto, device: f.device };
  if (f.proto === 'static') {
    values.ipaddr = [f.ipaddr];
    if (f.gateway) values.gateway = f.gateway;
  }
  if (f.proto === 'pppoe') { values.username = f.username; values.password = f.password; }
  const dns = f.dns.split(/[\s,]+/).filter(Boolean);
  if (dns.length) { values.dns = dns; if (f.proto !== 'static') values.peerdns = '0'; }
  ops.push({ op: 'add', config: 'network', type: 'interface', name: f.name, values });
  if (f.zone) {                                                  // join a firewall zone, otherwise its traffic is dropped by default
    const fw = await uciGet('firewall');
    const z = Object.values(fw).find((s) => s['.type'] === 'zone' && str(s.name) === f.zone);
    if (z) ops.push(...sectionOps('firewall', z['.name'], z, { network: [...asList(z.network), f.name] }));
  }
  if (f.proto === 'static' && f.dhcpServer) ops.push({ op: 'add', config: 'dhcp', type: 'dhcp', name: f.name, values: { interface: f.name, start: '100', limit: '150', leasetime: '12h' } });
  return ops;
}

/** Everything that refers to an interface, or a reason it cannot be deleted. */
export async function buildDeleteInterface(name: string, device: string): Promise<{ ops: UciOp[]; blocker: string }> {
  const [fw, dhcp, wl, net] = await Promise.all([uciGet('firewall').catch(() => ({})), uciGet('dhcp').catch(() => ({})), uciGet('wireless').catch(() => ({})), uciGet('network')]);
  const wifi = Object.values(wl).find((s) => s['.type'] === 'wifi-iface' && asList(s.network).includes(name));
  if (wifi) return { ops: [], blocker: `The Wi-Fi network “${str(wifi.ssid)}” uses this interface. Move or delete it first (Wi-Fi page).` };
  const ops: UciOp[] = [{ op: 'del', config: 'network', section: name }];
  for (const z of Object.values(fw)) if (z['.type'] === 'zone' && asList(z.network).includes(name)) ops.push(...sectionOps('firewall', z['.name'], z, { network: asList(z.network).filter((n) => n !== name) }));
  for (const d of Object.values(dhcp)) if (d['.type'] === 'dhcp' && str(d.interface) === name) ops.push({ op: 'del', config: 'dhcp', section: d['.name'] });
  // a VLAN device that only this interface used goes with it
  const vdev = Object.values(net).find((s) => s['.type'] === 'device' && str(s.type) === '8021q' && str(s.name) === device);
  if (vdev && !Object.values(net).some((s) => s['.type'] === 'interface' && s['.name'] !== name && str(s.device) === device)) ops.push({ op: 'del', config: 'network', section: vdev['.name'] });
  return { ops, blocker: '' };
}
