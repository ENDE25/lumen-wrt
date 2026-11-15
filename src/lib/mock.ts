// Fake router used by `npm run dev:mock`. Mirrors the shape of real ubus replies.
const START = Date.now();
const up = () => Math.floor((Date.now() - START) / 1000);

const counters: Record<string, { rx: number; tx: number; base: [number, number] }> = {
  eth0: { rx: 9.1e10, tx: 1.2e10, base: [4.2e6, 6e5] },
  eth1: { rx: 3e9, tx: 1e11, base: [3e5, 4.4e6] },
  'br-lan': { rx: 1.1e10, tx: 9.8e10, base: [5e5, 4.1e6] },
  'phy0-ap0': { rx: 4e9, tx: 6e10, base: [2e5, 2.6e6] },
  'phy1-ap0': { rx: 1e9, tx: 3e10, base: [1e5, 1.2e6] },
  lan1: { rx: 2e9, tx: 3e10, base: [1.5e5, 9e5] },
  lan2: { rx: 4e8, tx: 5e9, base: [2e4, 1e5] },
  lan3: { rx: 0, tx: 0, base: [0, 0] },
};
let last = Date.now();
let cpuTick = 5e6;
function tick() {
  const dt = (Date.now() - last) / 1000; last = Date.now();
  const burst = 1 + 0.9 * Math.sin(Date.now() / 7000) + Math.random() * 0.8;
  for (const c of Object.values(counters)) {
    c.rx += c.base[0] * burst * dt * (0.6 + Math.random());
    c.tx += c.base[1] * burst * dt * (0.6 + Math.random());
  }
}
const stats = (n: string) => {
  const c = counters[n];
  return { rx_bytes: Math.floor(c.rx), tx_bytes: Math.floor(c.tx), rx_packets: Math.floor(c.rx / 900), tx_packets: Math.floor(c.tx / 900), rx_errors: 0, tx_errors: 0, rx_dropped: 0, tx_dropped: 0 };
};

const dev = (name: string, extra: object = {}) => ({
  external: false, present: true, type: 'Network device', up: true, carrier: true,
  speed: '1000F', macaddr: 'bc:24:11:' + name.split('').map((c) => c.charCodeAt(0).toString(16)).join(':').slice(0, 8),
  mtu: 1500, statistics: stats(name), ...extra,
});

const HOSTS: [string, string, string, string][] = [
  ['A4:83:E7:11:22:01', 'Marta-iPhone', '192.168.1.101', 'phone'],
  ['F0:18:98:0B:3C:02', 'MacBook-Pro', '192.168.1.102', 'laptop'],
  ['DC:A6:32:4F:19:03', 'raspberrypi', '192.168.1.10', 'server'],
  ['3C:5A:B4:77:AA:04', 'Chromecast', '192.168.1.120', 'tv'],
  ['00:11:32:AB:CD:05', 'NAS-Synology', '192.168.1.5', 'server'],
  ['B8:27:EB:90:12:06', 'Printer-HP', '192.168.1.30', 'printer'],
  ['C8:2B:96:33:44:07', 'Shelly-Lounge', '192.168.1.140', 'iot'],
  ['64:16:66:AA:BB:08', 'Galaxy-S23', '192.168.1.103', 'phone'],
  ['9C:B6:D0:12:34:09', 'DESKTOP-GAMING', '192.168.1.50', 'desktop'],
  ['50:DE:06:55:66:0A', 'Apple-TV', '192.168.1.121', 'tv'],
  ['E4:5F:01:01:02:0B', '', '192.168.1.151', 'iot'],
  ['AC:84:C6:99:88:0C', 'Laptop-Dell', '192.168.1.104', 'laptop'],
];

const LOG = [
  'daemon.notice netifd: Interface \'wan\' is now up',
  'daemon.info dnsmasq-dhcp[1234]: DHCPACK(br-lan) 192.168.1.101 a4:83:e7:11:22:01 Marta-iPhone',
  'kern.info kernel: [ 1.2] br-lan: port 2(phy0-ap0) entered forwarding state',
  'daemon.info hostapd: phy0-ap0: STA 64:16:66:aa:bb:08 IEEE 802.11: associated',
  'daemon.notice odhcpd[1100]: Using a RA lifetime of 1800 seconds on br-lan',
  'user.notice firewall: Reloading firewall due to ifup of wan (eth0)',
];

// name -> [attachment, signal dBm]; anything not listed here is wired on lan1/lan2.
const WIFI: Record<string, [string, number]> = {
  'Marta-iPhone': ['phy0-ap0', -52], 'MacBook-Pro': ['phy0-ap0', -47], 'Laptop-Dell': ['phy0-ap0', -63],
  'Apple-TV': ['phy0-ap0', -58], 'Galaxy-S23': ['phy1-ap0', -61], 'Chromecast': ['phy1-ap0', -66],
  'Shelly-Lounge': ['phy1-ap0', -72], '': ['phy1-ap0', -78],
};
const WIRED: Record<string, string> = { raspberrypi: 'lan1', 'NAS-Synology': 'lan1', 'Printer-HP': 'lan2', 'DESKTOP-GAMING': 'lan2' };

// Tiny in-memory UCI so the DHCP/DNS page is fully usable in demo mode.
const UCI: Record<string, Record<string, any>> = {
  wireless: {
    radio0: { '.name': 'radio0', '.type': 'wifi-device', type: 'mac80211', band: '5g', channel: '36', htmode: 'HE80', country: 'ES', txpower: '23' },
    radio1: { '.name': 'radio1', '.type': 'wifi-device', type: 'mac80211', band: '2g', channel: 'auto', htmode: 'HE20', country: 'ES' },
    default_radio0: { '.name': 'default_radio0', '.type': 'wifi-iface', '.anonymous': true, device: 'radio0', network: 'lan', mode: 'ap', ssid: 'Lumen-5G', encryption: 'sae-mixed', key: 'correct-horse-battery', ieee80211w: '1' },
    default_radio1: { '.name': 'default_radio1', '.type': 'wifi-iface', '.anonymous': true, device: 'radio1', network: 'lan', mode: 'ap', ssid: 'Lumen', encryption: 'psk2', key: 'staple-battery-horse' },
    guest_radio1: { '.name': 'guest_radio1', '.type': 'wifi-iface', '.anonymous': true, device: 'radio1', network: 'lan', mode: 'ap', ssid: 'Lumen-Guest', encryption: 'psk2', key: 'welcome-guests', isolate: '1', disabled: '1' },
  },
  firewall: {
    cfg0def: { '.name': 'cfg0def', '.type': 'defaults', '.anonymous': true, syn_flood: '1', input: 'REJECT', output: 'ACCEPT', forward: 'REJECT' },
    cfg0lan: { '.name': 'cfg0lan', '.type': 'zone', '.anonymous': true, name: 'lan', network: ['lan'], input: 'ACCEPT', output: 'ACCEPT', forward: 'ACCEPT' },
    cfg0wan: { '.name': 'cfg0wan', '.type': 'zone', '.anonymous': true, name: 'wan', network: ['wan', 'wan6'], input: 'REJECT', output: 'ACCEPT', forward: 'DROP', masq: '1', mtu_fix: '1' },
    cfg0fwd: { '.name': 'cfg0fwd', '.type': 'forwarding', '.anonymous': true, src: 'lan', dest: 'wan' },
    cfg0r1: { '.name': 'cfg0r1', '.type': 'redirect', '.anonymous': true, name: 'NAS web UI', src: 'wan', src_dport: '5000', dest: 'lan', dest_ip: '192.168.1.5', dest_port: '5000', proto: 'tcp', target: 'DNAT' },
    cfg0r2: { '.name': 'cfg0r2', '.type': 'redirect', '.anonymous': true, name: 'SSH to Raspberry Pi', src: 'wan', src_dport: '2222', dest: 'lan', dest_ip: '192.168.1.10', dest_port: '22', proto: 'tcp', target: 'DNAT', enabled: '0' },
    cfg0u1: { '.name': 'cfg0u1', '.type': 'rule', '.anonymous': true, name: 'Allow-Ping', src: 'wan', proto: 'icmp', icmp_type: ['echo-request'], family: 'ipv4', target: 'ACCEPT' },
    cfg0u2: { '.name': 'cfg0u2', '.type': 'rule', '.anonymous': true, name: 'Allow-IPSec-ESP', src: 'wan', dest: 'lan', proto: 'esp', target: 'ACCEPT' },
    cfg0u3: { '.name': 'cfg0u3', '.type': 'rule', '.anonymous': true, name: 'Block kids tablet at night', src: 'lan', src_ip: '192.168.1.103', dest: 'wan', proto: 'tcp udp', target: 'REJECT', enabled: '0' },
  },
  dhcp: {
    cfg01411c: { '.name': 'cfg01411c', '.type': 'dnsmasq', '.anonymous': true, domain: 'lan', local: '/lan/', cachesize: '1000', rebind_protection: '1', expandhosts: '1', server: ['1.1.1.1', '9.9.9.9'] },
    lan: { '.name': 'lan', '.type': 'dhcp', interface: 'lan', start: '100', limit: '150', leasetime: '12h', dhcpv4: 'server' },
    wan: { '.name': 'wan', '.type': 'dhcp', interface: 'wan', ignore: '1' },
    cfg0a1b2c: { '.name': 'cfg0a1b2c', '.type': 'host', '.anonymous': true, name: 'NAS-Synology', mac: '00:11:32:AB:CD:05', ip: '192.168.1.5' },
    cfg0d3e4f: { '.name': 'cfg0d3e4f', '.type': 'host', '.anonymous': true, name: 'raspberrypi', mac: 'DC:A6:32:4F:19:03', ip: '192.168.1.10' },
  },
};

export async function mockCall(obj: string, method: string, args: any = {}): Promise<any> {
  await new Promise((r) => setTimeout(r, 40 + Math.random() * 60));
  tick();
  const k = `${obj}.${method}`;
  switch (k) {
    case 'system.info': {
      const total = 8095211520, avail = total * (0.42 + 0.05 * Math.sin(Date.now() / 20000));
      return {
        localtime: Math.floor(Date.now() / 1000), uptime: 324217 + up(),
        load: [20000 + Math.random() * 9000, 14000, 11000],
        memory: { total, free: avail * 0.8, shared: 1.1e8, buffered: 5.9e8, available: avail, cached: 4e8 },
        root: { total: 1992552, free: 1977552, used: 15000, avail: 1856312 },
        tmp: { total: 3952740, free: 3952612, used: 128, avail: 3952612 }, swap: { total: 0, free: 0 },
      };
    }
    case 'system.board':
      return { kernel: '6.12.71', hostname: 'lumen-demo', system: 'MediaTek MT7986', model: 'Demo Router AX6000', board_name: 'demo,ax6000',
        release: { distribution: 'OpenWrt', version: '25.12.6', revision: 'r33311-981c978eff', target: 'mediatek/filogic', description: 'OpenWrt 25.12.6 r33311-981c978eff' } };
    case 'network.interface.dump':
      return { interface: [
        { interface: 'wan', up: true, proto: 'dhcp', uptime: 86400 + up(), l3_device: 'eth0', device: 'eth0', 'ipv4-address': [{ address: '85.62.14.201', mask: 24 }], route: [{ target: '0.0.0.0', mask: 0, nexthop: '85.62.14.1' }], 'dns-server': ['1.1.1.1', '9.9.9.9'] },
        { interface: 'lan', up: true, proto: 'static', uptime: 324000 + up(), l3_device: 'br-lan', device: 'br-lan', 'ipv4-address': [{ address: '192.168.1.1', mask: 24 }] },
        { interface: 'wan6', up: false, proto: 'dhcpv6', device: 'eth0' },
      ] };
    case 'network.device.status': {
      tick();
      return {
        eth0: dev('eth0', { speed: '1000F' }),
        eth1: dev('eth1', { speed: '2500F' }),
        'br-lan': dev('br-lan', { type: 'Bridge', 'bridge-members': ['lan1', 'lan2', 'phy0-ap0', 'phy1-ap0'] }),
        lan1: dev('lan1', { speed: '1000F' }), lan2: dev('lan2', { speed: '100F' }),
        lan3: dev('lan3', { carrier: false, speed: undefined, statistics: { rx_bytes: 0, tx_bytes: 0, rx_packets: 0, tx_packets: 0, rx_errors: 0, tx_errors: 0, rx_dropped: 0, tx_dropped: 0 } }),
        'phy0-ap0': dev('phy0-ap0', { speed: '1201F' }), 'phy1-ap0': dev('phy1-ap0', { speed: '286F' }),
      };
    }
    case 'luci-rpc.getHostHints': {
      const o: Record<string, any> = {};
      HOSTS.forEach(([mac, name, ip]) => { o[mac] = { name: name || undefined, ipaddrs: [ip], ip6addrs: ['fe80::' + mac.slice(-5).replace(':', '')] }; });
      return o;
    }
    case 'luci-rpc.getDHCPLeases':
      return { dhcp_leases: HOSTS.filter((h) => !['192.168.1.5', '192.168.1.10'].includes(h[2])).map(([mac, name, ip], i) => ({ expires: 40000 - i * 3000, macaddr: mac.toLowerCase(), ipaddr: ip, hostname: name || '*' })), dhcp6_leases: [] };
    case 'luci-rpc.getWirelessDevices':
      return { radio0: { up: true, interfaces: [{ section: 'default_radio0', ifname: 'phy0-ap0', config: { ssid: 'Lumen-5G', mode: 'ap' } }] }, radio1: { up: true, interfaces: [{ section: 'default_radio1', ifname: 'phy1-ap0', config: { ssid: 'Lumen', mode: 'ap' } }] } };
    case 'lumen.topology':
      return {
        bridges: { 'br-lan': ['lan1', 'lan2', 'phy0-ap0', 'phy1-ap0'] },
        fdb: { 'br-lan': HOSTS.map(([mac, name]) => ({ mac: mac.toLowerCase(), port: WIFI[name]?.[0] ?? WIRED[name] ?? 'lan1', local: false })) },
        neigh: HOSTS.map(([mac, , ip]) => ({ ip, mac: mac.toLowerCase(), dev: 'br-lan' })),
      };
    case 'iwinfo.info':
      return args.device === 'phy0-ap0'
        ? { ssid: 'Lumen-5G', mode: 'Master', channel: 36, frequency: 5180, signal: 0 }
        : { ssid: 'Lumen', mode: 'Master', channel: 6, frequency: 2437, signal: 0 };
    case 'iwinfo.assoclist':
      return { results: HOSTS.filter(([, n]) => WIFI[n]?.[0] === args.device).map(([mac, n]) => ({
        mac, signal: WIFI[n][1], noise: -95, rx: { rate: args.device === 'phy0-ap0' ? 866000 : 144000 }, tx: { rate: args.device === 'phy0-ap0' ? 780000 : 130000 },
      })) };
    case 'lumen.clients': {
      const mult = ({ '24h': 1, '7d': 6.2, '30d': 24 } as Record<string, number>)[args.range] ?? 1;
      const base: Record<string, number> = { 'A4:83:E7:11:22:01': 3.2, 'F0:18:98:0B:3C:02': 7.5, 'DC:A6:32:4F:19:03': 1.1, '3C:5A:B4:77:AA:04': 5.1, '00:11:32:AB:CD:05': 11.8, 'B8:27:EB:90:12:06': 0.05, 'C8:2B:96:33:44:07': 0.02, '64:16:66:AA:BB:08': 2.4, '9C:B6:D0:12:34:09': 14.6, '50:DE:06:55:66:0A': 6.3, 'AC:84:C6:99:88:0C': 1.9 };
      const totals: Record<string, [number, number]> = {};
      for (const [m, gb] of Object.entries(base)) totals[m.toLowerCase()] = [Math.round(gb * 1e9 * mult), Math.round(gb * 1e9 * mult * (0.06 + (m.charCodeAt(3) % 7) / 40))];
      totals['?'] = [Math.round(0.4e9 * mult), Math.round(0.03e9 * mult)];
      return { enabled: true, offload: false, running: true, now: Math.floor(Date.now() / 1000), since: Math.floor(Date.now() / 1000) - 40 * 86400, totals };
    }
    case 'lumen.client': {
      const span = ({ '24h': 86400, '7d': 604800, '30d': 2592000 } as Record<string, number>)[args.range] ?? 86400;
      const now = Math.floor(Date.now() / 1000), n = Math.floor(span / 3600), t: number[] = [], rx: number[] = [], tx: number[] = [];
      let seed = 0; for (const ch of String(args.mac)) seed += ch.charCodeAt(0);
      for (let i = 0; i < n; i++) {
        const ts = now - (n - i) * 3600; t.push(ts);
        const hour = ((ts % 86400) / 3600 + 1) % 24, on = Math.max(0, Math.sin(((hour - 7) / 16) * Math.PI)) * (0.4 + ((seed + i * 7) % 10) / 10);
        rx.push(Math.round(on * 600e6 * (0.3 + Math.random()))); tx.push(Math.round(on * 40e6 * (0.3 + Math.random())));
      }
      return { now, step: 3600, t, rx, tx };
    }
    case 'lumen.history': {
      const span = ({ '1h': 3600, '24h': 86400, '7d': 604800, '30d': 2592000, '90d': 7776000 } as Record<string, number>)[args.range] ?? 86400;
      const fine = span <= 604800, step = fine ? 300 : 3600, now = Math.floor(Date.now() / 1000);
      const n = Math.floor(span / step), t: number[] = [], rx: Record<string, number[]> = {}, tx: Record<string, number[]> = {};
      const devs: [string, number, number][] = [['eth0', 4.2e6, 6e5], ['br-lan', 5e5, 4.1e6], ['phy0-ap0', 2e5, 2.6e6], ['phy1-ap0', 1e5, 1.2e6], ['lan1', 1.5e5, 9e5]];
      for (const [d] of devs) { rx[d] = []; tx[d] = []; }
      for (let i = 0; i < n; i++) {
        const ts = now - (n - i) * step; t.push(ts);
        const hour = ((ts % 86400) / 3600 + 1) % 24;                      // pseudo local hour
        const day = 0.25 + 0.75 * Math.max(0, Math.sin(((hour - 7) / 16) * Math.PI)); // quiet at night, busy evenings
        const evening = hour > 19 && hour < 23 ? 1.8 : 1;
        const weekend = new Date(ts * 1000).getDay() % 6 === 0 ? 1.4 : 1;
        for (const [d, r, w] of devs) {
          const k = day * evening * weekend * (0.6 + Math.random() * 0.8);
          rx[d].push(Math.round(r * k * step)); tx[d].push(Math.round(w * k * step));
        }
      }
      return { running: true, step, tier: fine ? 'fine' : 'hour', now, since: t[0], t, rx, tx };
    }
    case 'lumen.stats': {
      const t = Date.now() / 1000;
      cpuTick += 1000 * (2 + Math.sin(t / 9) + Math.random());
      const cores = [0, 1, 2, 3].map((i) => ({ busy: Math.floor(cpuTick * (0.7 + i * 0.12)), total: Math.floor(cpuTick * 2.4 + 1e6 + t * 100) }));
      const total = cores.reduce((a, c) => ({ busy: a.busy + c.busy, total: a.total + c.total }), { busy: 0, total: 0 });
      const memTotal = 1073741824, avail = memTotal * (0.58 + 0.04 * Math.sin(t / 25));
      return {
        mem: { MemTotal: memTotal, MemFree: avail * 0.45, MemAvailable: avail, Buffers: 0, Cached: avail * 0.5, SwapTotal: 0, SwapFree: 0, Shmem: 1e6, SReclaimable: 8e6 },
        cpu: { total, cores, model: 'ARMv8 Processor rev 4 (v8l)', count: 4 },
        temps: [{ label: 'cpu-thermal', c: 52 + 3 * Math.sin(t / 30) }, { label: 'wifi-phy0', c: 58 }],
        conntrack: { count: 1840 + Math.floor(Math.random() * 60), max: 65536 }, procs: 112, load: [0.62, 0.48, 0.41],
      };
    }
    case 'service.list':
      return {
        dnsmasq: { instances: { cfg01411c: { running: true } } }, dropbear: { instances: { instance1: { running: true } } },
        firewall: { instances: { main: { running: true } } }, odhcpd: { instances: { odhcpd: { running: true } } },
        uhttpd: { instances: { main: { running: true } } }, rpcd: { instances: { rpcd: { running: true } } },
        sqm: { instances: { wan: { running: false, exit_code: 1 } } }, sysntpd: { instances: { instance1: { running: true } } },
        cron: {}, hostapd: { instances: { hostapd: { running: true } } }, odhcp6c: { instances: { wan6: { running: true } } },
      };
    case 'iwinfo.phyname': return { name: args.section === 'radio0' ? 'phy0' : 'phy1' };
    case 'iwinfo.freqlist': {
      const five = args.device === 'phy0';
      const ch = five ? [36, 40, 44, 48, 52, 56, 60, 64, 100, 104, 149, 153, 157, 161, 165] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
      return { results: ch.map((c) => ({ mhz: five ? 5000 + c * 5 : 2407 + c * 5, channel: c, restricted: five && c >= 52 && c <= 64 })) };
    }
    case 'iwinfo.countrylist': return { results: [{ code: 'ES', name: 'Spain' }, { code: 'US', name: 'United States' }, { code: 'DE', name: 'Germany' }, { code: 'GB', name: 'United Kingdom' }, { code: 'FR', name: 'France' }] };
    case 'log.read':
      return { log: LOG.map((l, i) => ({ msg: l, id: i, priority: 6, source: 3, time: Date.now() - (LOG.length - i) * 60000 })) };
    case 'system.reboot':
      return {};
    case 'uci.get':
      return { values: JSON.parse(JSON.stringify(UCI[args.config] ?? {})) };
    case 'uci.set': {
      const sec = UCI[args.config]?.[args.section];
      if (!sec) throw new Error('section not found');
      Object.assign(sec, args.values);
      return {};
    }
    case 'uci.add': {
      const name = 'cfg' + Math.random().toString(16).slice(2, 8);
      (UCI[args.config] ??= {})[name] = { '.name': name, '.type': args.type, '.anonymous': true, ...args.values };
      return { section: name };
    }
    case 'uci.delete':
      if (args.option) delete UCI[args.config]?.[args.section]?.[args.option]; else delete UCI[args.config]?.[args.section];
      return {};
    case 'uci.order': {
      const c = UCI[args.config]; const keep = Object.entries(c).filter(([k]) => !args.sections.includes(k));
      const first = Object.entries(c).findIndex(([k]) => args.sections.includes(k));
      const ord = args.sections.map((k: string) => [k, c[k]]);
      const all = [...keep.slice(0, Math.max(0, first)), ...ord, ...keep.slice(Math.max(0, first))];
      UCI[args.config] = Object.fromEntries(all);
      return {};
    }
    case 'uci.apply': case 'uci.confirm': case 'uci.rollback': case 'uci.revert':
      return {};
  }
  if (obj.startsWith('hostapd.') && method === 'del_client') return {};
  if (obj === 'file' && method === 'exec') return { code: 0, stdout: '' };
  console.warn('[mock] unhandled', k, args);
  throw new Error('mock: unhandled ' + k);
}
