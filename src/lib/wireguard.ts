// WireGuard tunnels. They live in /etc/config/network (an interface with proto wireguard, and one
// `wireguard_<name>` section per peer); the router adds live status and key generation (rpcd lumen.wg_*).
import { call } from './ubus';
import { asList, str, sectionOps, uciGet, type UciConfig, type UciOp, type UciSection, type UciValue } from './uci';
import { validV4, validV4Cidr } from './routing';

export const WG_KEY = /^[A-Za-z0-9+/]{43}=$/;
export const validTunnelName = (n: string) => /^[a-z][a-z0-9_]{0,14}$/.test(n);
export const validPort = (p: string) => /^\d{1,5}$/.test(p) && +p >= 1 && +p <= 65535;

export interface WgRuntimePeer { public: string; endpoint: string | null; allowed: string[]; handshake: number; rx: number; tx: number; keepalive: number }
export interface WgRuntime { installed: boolean; proto: boolean; interfaces: Record<string, { public: string; port: number; peers: WgRuntimePeer[] }> }

export interface WgPeer {
  section: string; name: string; publicKey: string; hasPsk: boolean; allowed: string[];
  endpointHost: string; endpointPort: string; keepalive: string; routeAllowed: boolean;
  raw: UciSection; live?: WgRuntimePeer;
}
export interface WgTunnel {
  name: string; section: UciSection; addresses: string[]; port: string; publicKey: string; dns: string[];
  peers: WgPeer[]; role: 'server' | 'client'; zone: string; disabled: boolean;
}
export interface WgData { runtime: WgRuntime; network: UciConfig; firewall: UciConfig }

export const NO_RUNTIME: WgRuntime = { installed: false, proto: false, interfaces: {} };

/** What the page loads from the router: the two UCI files that hold tunnels, and the live WireGuard status. */
export async function loadWg(): Promise<WgData> {
  const [network, firewall, runtime] = await Promise.all([
    uciGet('network'), uciGet('firewall').catch(() => ({} as UciConfig)), loadRuntime(),
  ]);
  return { network, firewall, runtime };
}
export const loadRuntime = () => call<WgRuntime>('lumen', 'wg_status').catch(() => NO_RUNTIME);

export function parseTunnels(network: UciConfig, firewall: UciConfig, runtime: WgRuntime): { tunnels: WgTunnel[]; zones: string[] } {
  const zones = Object.values(firewall).filter((s) => s['.type'] === 'zone');
  const tunnels: WgTunnel[] = Object.values(network).filter((s) => s['.type'] === 'interface' && str(s.proto) === 'wireguard').map((s) => {
    const name = s['.name'], live = runtime.interfaces?.[name];
    const peers: WgPeer[] = Object.values(network).filter((p) => p['.type'] === `wireguard_${name}`).map((p) => {
      const pub = str(p.public_key);
      return {
        section: p['.name'], name: str(p.description) || pub.slice(0, 8) || 'Peer', publicKey: pub, hasPsk: !!str(p.preshared_key),
        allowed: asList(p.allowed_ips), endpointHost: str(p.endpoint_host), endpointPort: str(p.endpoint_port),
        keepalive: str(p.persistent_keepalive), routeAllowed: str(p.route_allowed_ips) === '1', raw: p,
        live: live?.peers.find((x) => x.public === pub),
      };
    });
    const zone = zones.find((z) => asList(z.network).includes(name));
    return {
      name, section: s, addresses: [...asList(s.addresses), ...asList(s.ipaddr)], port: str(s.listen_port), publicKey: live?.public ?? '',
      dns: asList(s.dns), peers, role: peers.some((p) => p.endpointHost) ? 'client' : 'server', zone: zone ? str(zone.name) : '', disabled: str(s.disabled) === '1',
    };
  });
  return { tunnels, zones: zones.map((z) => str(z.name)) };
}

// ---- keys (generated on the router, which has the real random source and `wg`)
export async function newKeyPair(): Promise<{ private: string; public: string }> {
  const r = await call<{ private?: string; public?: string; error?: string }>('lumen', 'wg_keys', { kind: 'key' });
  if (!r.private || !r.public) throw new Error(r.error ?? 'could not generate a key');
  return { private: r.private, public: r.public };
}
export async function newPsk(): Promise<string> {
  const r = await call<{ psk?: string; error?: string }>('lumen', 'wg_keys', { kind: 'psk' });
  if (!r.psk) throw new Error(r.error ?? 'could not generate a key');
  return r.psk;
}
/** Public key of a tunnel: from the running interface, or derived from its private key when it is down. */
export async function tunnelPublicKey(t: WgTunnel): Promise<string> {
  if (t.publicKey) return t.publicKey;
  const r = await call<{ public?: string; error?: string }>('lumen', 'wg_keys', { kind: 'key', key: str(t.section.private_key) });
  if (!r.public) throw new Error(r.error ?? 'could not read the public key');
  return r.public;
}

// ---- IPv4 helpers
const toInt = (ip: string) => ip.split('.').reduce((a, o) => a * 256 + +o, 0);
const fromInt = (n: number) => [24, 16, 8, 0].map((s) => Math.floor(n / 2 ** s) % 256).join('.');
export const hostOf = (cidr: string) => cidr.split('/')[0];
export function netOf(cidr: string): string {
  const [ip, bits = '32'] = cidr.split('/'), size = 2 ** (32 - +bits);
  return `${fromInt(Math.floor(toInt(ip) / size) * size)}/${bits}`;
}
export function isPrivateV4(ip: string): boolean {
  if (!validV4(ip)) return false;
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
}
/** First unused host address of the tunnel's network, as a /32 for a new peer. */
export function nextPeerIp(t: WgTunnel): string {
  const mine = t.addresses.find((a) => validV4Cidr(a) && a.includes('/'));
  if (!mine) return '';
  const bits = +mine.split('/')[1], size = 2 ** (32 - bits), base = Math.floor(toInt(hostOf(mine)) / size) * size;
  const used = new Set<number>([toInt(hostOf(mine))]);
  for (const p of t.peers) for (const a of p.allowed) if (validV4Cidr(a)) used.add(toInt(hostOf(a)));
  for (let i = 1; i < Math.min(size - 1, 4096); i++) if (!used.has(base + i)) return `${fromInt(base + i)}/32`;
  return '';
}

// ---- status
export type PeerState = 'connected' | 'idle' | 'never';
export function peerState(p: WgPeer, now = Date.now() / 1000): PeerState {
  const h = p.live?.handshake ?? 0;
  return !h ? 'never' : now - h < 180 ? 'connected' : 'idle';
}

// ---- validation
export function validAllowed(list: string): string {
  const items = list.split(/[\s,]+/).filter(Boolean);
  if (!items.length) return 'Allowed IPs are needed';
  for (const a of items) if (!validV4Cidr(a) && !/^[0-9a-fA-F:]+(\/\d{1,3})?$/.test(a)) return `“${a}” is not an IP address or network`;
  return '';
}

// ---- operations
const wanZoneName = (fw: UciConfig) => {
  const zs = Object.values(fw).filter((s) => s['.type'] === 'zone');
  return str((zs.find((z) => str(z.name) === 'wan') ?? zs.find((z) => str(z.masq) === '1'))?.name);
};
const zoneSection = (fw: UciConfig, name: string) => Object.values(fw).find((s) => s['.type'] === 'zone' && str(s.name) === name);

export interface NewServer { name: string; port: string; address: string; zone: string; openWan: boolean }
export function serverOps(f: NewServer, privateKey: string, fw: UciConfig): UciOp[] {
  const ops: UciOp[] = [{ op: 'add', config: 'network', type: 'interface', name: f.name, values: { proto: 'wireguard', private_key: privateKey, listen_port: f.port, addresses: [f.address] } }];
  const z = f.zone ? zoneSection(fw, f.zone) : undefined;
  if (z) ops.push(...sectionOps('firewall', z['.name'], z, { network: [...asList(z.network), f.name] }));
  const wan = wanZoneName(fw);
  if (f.openWan && wan) ops.push({ op: 'add', config: 'firewall', type: 'rule', values: { name: `Allow-WireGuard-${f.name}`, src: wan, proto: 'udp', dest_port: f.port, target: 'ACCEPT' } });
  return ops;
}

export interface PeerForm { name: string; publicKey: string; psk: string; allowed: string; keepalive: string }
const peerValues = (f: PeerForm): Record<string, UciValue | undefined> => ({
  description: f.name.trim(), public_key: f.publicKey.trim(), preshared_key: f.psk.trim() || undefined,
  allowed_ips: f.allowed.split(/[\s,]+/).filter(Boolean), route_allowed_ips: '1', persistent_keepalive: f.keepalive.trim() || undefined,
});
export function addPeerOps(tunnel: string, f: PeerForm): UciOp[] {
  const values: Record<string, UciValue> = {};
  for (const [k, v] of Object.entries(peerValues(f))) if (v !== undefined) values[k] = v;
  return [{ op: 'add', config: 'network', type: `wireguard_${tunnel}`, values }];
}
export function editPeerOps(p: WgPeer, f: PeerForm): UciOp[] {
  // the preshared key is never read back into the form: only replace it when a new one was typed
  const v = peerValues({ ...f, psk: f.psk || str(p.raw.preshared_key) });
  return sectionOps('network', p.section, p.raw, v);
}
export const deletePeerOps = (p: WgPeer): UciOp[] => [{ op: 'del', config: 'network', section: p.section }];

export function deleteTunnelOps(t: WgTunnel, fw: UciConfig): UciOp[] {
  const ops: UciOp[] = t.peers.map((p) => ({ op: 'del' as const, config: 'network', section: p.section }));
  ops.push({ op: 'del', config: 'network', section: t.name });
  for (const z of Object.values(fw).filter((s) => s['.type'] === 'zone' && asList(s.network).includes(t.name)))
    ops.push(...sectionOps('firewall', z['.name'], z, { network: asList(z.network).filter((n) => n !== t.name) }));
  for (const r of Object.values(fw).filter((s) => s['.type'] === 'rule' && str(s.name) === `Allow-WireGuard-${t.name}`)) ops.push({ op: 'del', config: 'firewall', section: r['.name'] });
  return ops;
}

// ---- client configuration (the .conf a phone or laptop imports)
export interface ClientConf { privateKey: string; address: string; dns: string; serverPublicKey: string; psk?: string; endpointHost: string; endpointPort: string; allowedIps: string; keepalive: string }
export function clientConfText(c: ClientConf): string {
  const host = c.endpointHost.includes(':') ? `[${c.endpointHost}]` : c.endpointHost;
  return [
    '[Interface]', `PrivateKey = ${c.privateKey}`, `Address = ${c.address}`, ...(c.dns ? [`DNS = ${c.dns}`] : []), '',
    '[Peer]', `PublicKey = ${c.serverPublicKey}`, ...(c.psk ? [`PresharedKey = ${c.psk}`] : []), `Endpoint = ${host}:${c.endpointPort}`, `AllowedIPs = ${c.allowedIps}`,
    ...(c.keepalive ? [`PersistentKeepalive = ${c.keepalive}`] : []), '',
  ].join('\n');
}

// ---- importing a configuration from a provider (wg-quick format)
export interface WgImport { name: string; iface: Record<string, UciValue>; peers: Record<string, UciValue>[] }
const csv = (v: string) => v.split(/[\s,]+/).filter(Boolean);
export function parseWgConf(text: string): WgImport | { error: string } {
  const iface: Record<string, string> = {}, peers: Record<string, string>[] = [];
  let cur: Record<string, string> | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/[#;].*$/, '').trim();
    if (!line) continue;
    const sec = /^\[(\w+)\]$/.exec(line);
    if (sec) {
      const n = sec[1].toLowerCase();
      if (n === 'interface') cur = iface; else if (n === 'peer') { cur = {}; peers.push(cur); } else return { error: `Unknown section [${sec[1]}]` };
      continue;
    }
    const kv = /^([A-Za-z]+)\s*=\s*(.*)$/.exec(line);
    if (!kv || !cur) return { error: `Cannot read the line “${raw.trim().slice(0, 40)}”` };
    cur[kv[1].toLowerCase()] = kv[2].trim();
  }
  if (!iface.privatekey) return { error: 'The [Interface] section needs a PrivateKey' };
  if (!WG_KEY.test(iface.privatekey)) return { error: 'The private key is not valid' };
  if (!iface.address) return { error: 'The [Interface] section needs an Address' };
  if (!peers.length) return { error: 'There is no [Peer] section' };
  const addrs = csv(iface.address).filter((a) => /^[0-9a-fA-F:.]+(\/\d{1,3})?$/.test(a));
  if (!addrs.length) return { error: 'The Address is not valid' };
  const out: WgImport = { name: '', iface: { proto: 'wireguard', private_key: iface.privatekey, addresses: addrs }, peers: [] };
  if (iface.dns) out.iface.dns = csv(iface.dns).filter((d) => /^[0-9a-fA-F:.]+$/.test(d));
  if (iface.mtu && /^\d{3,4}$/.test(iface.mtu)) out.iface.mtu = iface.mtu;
  if (iface.listenport && validPort(iface.listenport)) out.iface.listen_port = iface.listenport;
  for (const p of peers) {
    if (!WG_KEY.test(p.publickey ?? '')) return { error: 'A peer has no valid PublicKey' };
    const v: Record<string, UciValue> = { public_key: p.publickey, route_allowed_ips: '1', allowed_ips: csv(p.allowedips ?? '0.0.0.0/0') };
    if (p.presharedkey) { if (!WG_KEY.test(p.presharedkey)) return { error: 'A preshared key is not valid' }; v.preshared_key = p.presharedkey; }
    if (p.endpoint) {
      const m = /^\[?([^\]]+?)\]?:(\d{1,5})$/.exec(p.endpoint);
      if (!m || !validPort(m[2])) return { error: `The endpoint “${p.endpoint}” is not valid` };
      v.endpoint_host = m[1]; v.endpoint_port = m[2];
    }
    if (p.persistentkeepalive && /^\d{1,5}$/.test(p.persistentkeepalive) && +p.persistentkeepalive > 0) v.persistent_keepalive = p.persistentkeepalive;
    out.peers.push(v);
  }
  return out;
}

export function importOps(name: string, imp: WgImport, zone: string, fw: UciConfig): UciOp[] {
  const ops: UciOp[] = [{ op: 'add', config: 'network', type: 'interface', name, values: imp.iface }];
  for (const p of imp.peers) ops.push({ op: 'add', config: 'network', type: `wireguard_${name}`, values: p });
  const z = zone ? zoneSection(fw, zone) : undefined;
  if (z) ops.push(...sectionOps('firewall', z['.name'], z, { network: [...asList(z.network), name] }));
  return ops;
}
