import { asList, str, type UciConfig, type UciSection } from './uci';

export type Target = 'ACCEPT' | 'REJECT' | 'DROP';

export interface Zone { section: string; name: string; networks: string[]; input: Target; output: Target; forward: Target; masq: boolean; mtuFix: boolean; raw: UciSection }
export interface Forwarding { section: string; src: string; dest: string }
export interface Redirect {
  section: string; name: string; enabled: boolean; proto: string; src: string; srcDport: string; srcIp: string;
  dest: string; destIp: string; destPort: string; raw: UciSection;
}
export interface Rule {
  section: string; name: string; enabled: boolean; family: string; proto: string; src: string; srcIp: string; srcPort: string;
  dest: string; destIp: string; destPort: string; icmpType: string[]; target: string; raw: UciSection;
}
export interface Defaults { section: string; input: Target; output: Target; forward: Target; synFlood: boolean; raw: UciSection }
export interface Firewall { defaults: Defaults | null; zones: Zone[]; forwardings: Forwarding[]; redirects: Redirect[]; rules: Rule[] }

const tgt = (v: unknown, d: Target): Target => (['ACCEPT', 'REJECT', 'DROP'].includes(String(v)) ? (String(v) as Target) : d);

export function parseFirewall(cfg: UciConfig): Firewall {
  const all = Object.values(cfg);
  const of = (t: string) => all.filter((s) => s['.type'] === t);
  const d = of('defaults')[0];
  return {
    defaults: d ? { section: d['.name'], input: tgt(d.input, 'REJECT'), output: tgt(d.output, 'ACCEPT'), forward: tgt(d.forward, 'REJECT'), synFlood: str(d.syn_flood) === '1', raw: d } : null,
    zones: of('zone').map((s) => ({
      section: s['.name'], name: str(s.name), networks: asList(s.network), input: tgt(s.input, 'REJECT'), output: tgt(s.output, 'ACCEPT'),
      forward: tgt(s.forward, 'REJECT'), masq: str(s.masq) === '1', mtuFix: str(s.mtu_fix) === '1', raw: s,
    })),
    forwardings: of('forwarding').map((s) => ({ section: s['.name'], src: str(s.src), dest: str(s.dest) })),
    redirects: of('redirect').map((s) => ({
      section: s['.name'], name: str(s.name), enabled: str(s.enabled) !== '0', proto: str(s.proto) || 'tcp udp', src: str(s.src), srcDport: str(s.src_dport),
      srcIp: str(s.src_ip), dest: str(s.dest), destIp: str(s.dest_ip), destPort: str(s.dest_port), raw: s,
    })),
    rules: of('rule').map((s) => ({
      section: s['.name'], name: str(s.name), enabled: str(s.enabled) !== '0', family: str(s.family), proto: str(s.proto) || 'tcp udp',
      src: str(s.src), srcIp: str(s.src_ip), srcPort: str(s.src_port), dest: str(s.dest), destIp: str(s.dest_ip), destPort: str(s.dest_port),
      icmpType: asList(s.icmp_type), target: str(s.target) || 'ACCEPT', raw: s,
    })),
  };
}

// ---- validation helpers
export const ipv4Re = /^((25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(25[0-5]|2[0-4]\d|1?\d?\d)$/;
export const cidrRe = /^((25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(25[0-5]|2[0-4]\d|1?\d?\d)(\/(3[0-2]|[12]?\d))?$/;
/** one or more ports / ranges separated by spaces: "80", "8000-8100", "80 443" */
export function validPorts(v: string): boolean {
  if (!v.trim()) return true;
  return v.trim().split(/\s+/).every((t) => {
    const m = /^(\d{1,5})(?:-(\d{1,5}))?$/.exec(t);
    if (!m) return false;
    const a = +m[1], b = m[2] ? +m[2] : a;
    return a >= 1 && b <= 65535 && a <= b;
  });
}

export const PROTOS = [
  { v: 'tcp udp', label: 'TCP + UDP' }, { v: 'tcp', label: 'TCP' }, { v: 'udp', label: 'UDP' }, { v: 'icmp', label: 'ICMP' }, { v: 'all', label: 'Any' },
];
export const protoLabel = (p: string) => PROTOS.find((x) => x.v === p)?.label ?? p.toUpperCase();
