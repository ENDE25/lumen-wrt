// Editable view of an interface in /etc/config/network (static, DHCP and PPPoE), with optional VLAN tag on the port.
import { uciGet, str, asList, sectionOps, type UciOp, type UciSection, type UciConfig } from './uci';
import { validV4Cidr, validV4 } from './routing';

export type Proto = 'static' | 'dhcp' | 'pppoe';
export const PROTOS: [Proto, string][] = [['dhcp', 'DHCP client'], ['static', 'Static address'], ['pppoe', 'PPPoE']];
export const isEditable = (proto: string): proto is Proto => PROTOS.some(([p]) => p === proto);

export interface IfForm { proto: Proto; ipaddr: string; gateway: string; dns: string; useIspDns: boolean; metric: string; username: string; password: string; vlan: string }
export interface IfCfg { section: UciSection; form: IfForm; baseDevice: string; vlanSection: UciSection | null; canVlan: boolean; all: UciConfig }

const prefixOf = (mask: string) => mask.split('.').reduce((n, o) => n + (+o).toString(2).replace(/0/g, '').length, 0);

export async function loadIf(name: string): Promise<IfCfg | null> {
  const all = await uciGet('network');
  const section = Object.values(all).find((s) => s['.type'] === 'interface' && s['.name'] === name);
  if (!section) return null;
  const proto = str(section.proto) as Proto;
  let ip = asList(section.ipaddr)[0] ?? '';
  if (ip && !ip.includes('/') && str(section.netmask)) ip += '/' + prefixOf(str(section.netmask));
  const dev = str(section.device) || str(section.ifname);
  const vlanSection = Object.values(all).find((s) => s['.type'] === 'device' && str(s.type) === '8021q' && str(s.name) === dev) ?? null;
  return {
    section, all, vlanSection, baseDevice: vlanSection ? str(vlanSection.ifname) : dev, canVlan: !dev.startsWith('br-') && !!dev,
    form: {
      proto: isEditable(proto) ? proto : 'dhcp', ipaddr: ip, gateway: str(section.gateway), dns: asList(section.dns).join('\n'),
      useIspDns: str(section.peerdns) !== '0', metric: str(section.metric), username: str(section.username), password: str(section.password),
      vlan: vlanSection ? str(vlanSection.vid) : '',
    },
  };
}

export function validate(f: IfForm, canVlan: boolean): string {
  if (f.proto === 'static') {
    if (!f.ipaddr.includes('/') || !validV4Cidr(f.ipaddr)) return 'Address must include its prefix, for example 192.168.1.1/24';
    if (f.gateway && !validV4(f.gateway)) return 'Gateway must be an IPv4 address';
  }
  if (f.proto === 'pppoe' && !f.username.trim()) return 'PPPoE needs the username from your provider';
  if ((f.proto === 'static' || !f.useIspDns) && f.dns.split(/[\s,]+/).filter(Boolean).some((d) => !validV4(d) && !/^[0-9a-fA-F:]+$/.test(d))) return 'DNS servers must be IP addresses';
  if (f.metric && !/^\d{1,5}$/.test(f.metric)) return 'Metric is a number';
  if (f.vlan && (!canVlan || !/^\d{1,4}$/.test(f.vlan) || +f.vlan < 1 || +f.vlan > 4094)) return canVlan ? 'VLAN ID is 1–4094' : 'VLAN tags are not available on a bridge';
  return '';
}

export function buildOps(name: string, cfg: IfCfg, f: IfForm): UciOp[] {
  const ops: UciOp[] = [];
  const dev = f.vlan ? `${cfg.baseDevice}.${f.vlan}` : cfg.baseDevice;
  // VLAN: an 802.1q device on the port, and the interface uses it.
  if (cfg.canVlan) {
    if (f.vlan && !cfg.vlanSection) ops.push({ op: 'add', config: 'network', type: 'device', values: { type: '8021q', ifname: cfg.baseDevice, vid: f.vlan, name: dev } });
    else if (f.vlan && cfg.vlanSection) ops.push(...sectionOps('network', cfg.vlanSection['.name'], cfg.vlanSection, { vid: f.vlan, name: dev }));
  }
  const dns = f.dns.split(/[\s,]+/).filter(Boolean);
  const staticP = f.proto === 'static', ppp = f.proto === 'pppoe';
  const next: Record<string, string | string[] | undefined> = {
    proto: f.proto,
    device: cfg.canVlan ? dev : undefined,
    ipaddr: staticP ? [f.ipaddr] : undefined, netmask: undefined, gateway: staticP ? f.gateway : undefined,
    username: ppp ? f.username : undefined, password: ppp ? f.password : undefined,
    peerdns: !staticP && !f.useIspDns ? '0' : undefined,
    dns: staticP || !f.useIspDns ? dns : undefined,
    metric: f.metric,
  };
  if (!cfg.canVlan) delete next.device;
  const s = cfg.section;
  // `ifname` is the pre-23.05 spelling of `device`; keep a single one.
  if (cfg.canVlan && str(s.ifname) && !str(s.device)) next.ifname = undefined;
  ops.push(...sectionOps('network', s['.name'], s, next));
  if (cfg.canVlan && !f.vlan && cfg.vlanSection) ops.push({ op: 'del', config: 'network', section: cfg.vlanSection['.name'] });
  return ops;
}
