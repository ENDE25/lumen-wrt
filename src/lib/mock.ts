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
  ['A4:83:E7:11:22:01', 'iPhone-de-Marta', '192.168.1.101', 'phone'],
  ['F0:18:98:0B:3C:02', 'MacBook-Pro', '192.168.1.102', 'laptop'],
  ['DC:A6:32:4F:19:03', 'raspberrypi', '192.168.1.10', 'server'],
  ['3C:5A:B4:77:AA:04', 'Chromecast', '192.168.1.120', 'tv'],
  ['00:11:32:AB:CD:05', 'NAS-Synology', '192.168.1.5', 'server'],
  ['B8:27:EB:90:12:06', 'Impresora-HP', '192.168.1.30', 'printer'],
  ['C8:2B:96:33:44:07', 'Shelly-Salon', '192.168.1.140', 'iot'],
  ['64:16:66:AA:BB:08', 'Galaxy-S23', '192.168.1.103', 'phone'],
  ['9C:B6:D0:12:34:09', 'DESKTOP-GAMING', '192.168.1.50', 'desktop'],
  ['50:DE:06:55:66:0A', 'Apple-TV', '192.168.1.121', 'tv'],
  ['E4:5F:01:01:02:0B', '', '192.168.1.151', 'iot'],
  ['AC:84:C6:99:88:0C', 'Portatil-Dell', '192.168.1.104', 'laptop'],
];

const LOG = [
  'daemon.notice netifd: Interface \'wan\' is now up',
  'daemon.info dnsmasq-dhcp[1234]: DHCPACK(br-lan) 192.168.1.101 a4:83:e7:11:22:01 iPhone-de-Marta',
  'kern.info kernel: [ 1.2] br-lan: port 2(phy0-ap0) entered forwarding state',
  'daemon.info hostapd: phy0-ap0: STA 64:16:66:aa:bb:08 IEEE 802.11: associated',
  'daemon.notice odhcpd[1100]: Using a RA lifetime of 1800 seconds on br-lan',
  'user.notice firewall: Reloading firewall due to ifup of wan (eth0)',
];

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
      return { radio0: { up: true, interfaces: [{ ifname: 'phy0-ap0', config: { ssid: 'Lumen-5G', mode: 'ap' } }] }, radio1: { up: true, interfaces: [{ ifname: 'phy1-ap0', config: { ssid: 'Lumen', mode: 'ap' } }] } };
    case 'log.read':
      return { log: LOG.map((l, i) => ({ msg: l, id: i, priority: 6, source: 3, time: Date.now() - (LOG.length - i) * 60000 })) };
    case 'system.reboot':
    case 'uci.get':
      return { values: {} };
  }
  if (obj === 'file' && method === 'exec') return { code: 0, stdout: '' };
  console.warn('[mock] unhandled', k, args);
  throw new Error('mock: unhandled ' + k);
}
