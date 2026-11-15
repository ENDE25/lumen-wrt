export interface SystemInfo {
  localtime: number;
  uptime: number;
  load: [number, number, number]; // fixed point, divide by 65536
  memory: { total: number; free: number; shared: number; buffered: number; available: number; cached: number };
  root: { total: number; free: number; used: number; avail: number };
  tmp: { total: number; free: number; used: number; avail: number };
  swap: { total: number; free: number };
}

export interface Board {
  kernel: string;
  hostname: string;
  system: string;
  model: string;
  board_name: string;
  release: { distribution: string; version: string; revision: string; target: string; description: string };
}

export interface IfaceAddr { address: string; mask: number }
export interface IfaceRoute { target: string; mask: number; nexthop: string }

export interface NetInterface {
  interface: string;
  up: boolean;
  proto: string;
  uptime?: number;
  l3_device?: string;
  device?: string;
  'ipv4-address'?: IfaceAddr[];
  'ipv6-address'?: IfaceAddr[];
  route?: IfaceRoute[];
  'dns-server'?: string[];
  data?: Record<string, unknown>;
}

export interface DeviceStats {
  rx_bytes: number; tx_bytes: number;
  rx_packets: number; tx_packets: number;
  rx_errors: number; tx_errors: number;
  rx_dropped: number; tx_dropped: number;
}

export interface NetDevice {
  name: string;
  type: string; // 'Network device' | 'Bridge' | 'VLAN' ...
  up: boolean;
  carrier: boolean;
  present: boolean;
  speed?: string;
  macaddr?: string;
  mtu?: number;
  statistics: DeviceStats;
  'bridge-members'?: string[];
}

export interface HostHint {
  mac: string;
  name?: string;
  ipaddrs: string[];
  ip6addrs: string[];
}

export interface Lease {
  expires: number;
  macaddr: string;
  ipaddr: string;
  hostname: string;
  clientid?: string;
}

export interface ClientLink {
  type: 'wifi' | 'wired' | 'unknown';
  dev: string;        // port, wifi interface or bridge the client was seen on
  ssid?: string;
  band?: string;
  signal?: number;    // dBm
  rx?: number;        // kbit/s
  tx?: number;
}

export interface WifiIface {
  ifname: string;
  ssid: string;
  mode: string;
  channel?: number;
  band: string;
  clients: { mac: string; signal?: number; rx?: number; tx?: number }[];
}

export interface NetworkMap {
  clients: Client[];
  wifi: WifiIface[];
  bridges: Record<string, string[]>;
}

export interface Client {
  link?: ClientLink;
  mac: string;
  name: string;
  ip: string;
  ip6: string[];
  kind: ClientKind;
  leaseExpires?: number;
  static: boolean;
}

export type ClientKind = 'phone' | 'laptop' | 'desktop' | 'tv' | 'printer' | 'iot' | 'server' | 'router' | 'unknown';

export interface RatePoint { t: number; rx: number; tx: number } // bytes/s

export interface CpuTimes { busy: number; total: number }
export interface Stats {
  mem: { MemTotal: number; MemFree: number; MemAvailable: number; Buffers: number; Cached: number; SwapTotal: number; SwapFree: number; Shmem: number; SReclaimable: number };
  cpu: { total: CpuTimes | null; cores: CpuTimes[]; model: string | null; count: number };
  temps: { label: string; c: number }[];
  conntrack: { count: number | null; max: number | null };
  procs: number;
  load: [number, number, number];
}

export interface Service { name: string; running: boolean; instances: number; exitCode?: number }
