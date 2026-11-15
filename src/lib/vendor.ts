// MAC -> vendor lookup. The IEEE table (public/oui.bin, ~250 KB gzipped) is fetched once, on first use.
import type { ClientKind } from './types';
import { LOGOS } from './logos';

export interface VendorInfo {
  vendor: string | null;       // display name ("Apple", "Raspberry Pi Foundation"...)
  brand?: string;              // logo key when we have one
  kind?: ClientKind;           // category hint, only used when the hostname told us nothing
  randomized: boolean;         // locally-administered ("private") address: no vendor information
}

interface Brand { re: RegExp; name?: string; logo?: string; kind?: ClientKind }

// Order matters: first match wins. `name` overrides the registry's wording.
const BRANDS: Brand[] = [
  { re: /^proxmox/i, name: 'Proxmox', logo: 'proxmox', kind: 'server' },
  { re: /^raspberry pi/i, name: 'Raspberry Pi', logo: 'raspberrypi', kind: 'server' },
  { re: /^synology/i, name: 'Synology', logo: 'synology', kind: 'server' },
  { re: /^qnap/i, name: 'QNAP', logo: 'qnap', kind: 'server' },
  { re: /^nabu casa/i, name: 'Home Assistant', logo: 'homeassistant', kind: 'server' },
  { re: /^vmware/i, name: 'VMware', logo: 'vmware', kind: 'server' },
  { re: /^espressif/i, name: 'Espressif', logo: 'espressif', kind: 'iot' },
  { re: /^allterco/i, name: 'Shelly', logo: 'shelly', kind: 'iot' },
  { re: /^(signify|philips lighting)/i, name: 'Philips Hue', logo: 'philipshue', kind: 'iot' },
  { re: /^ikea/i, name: 'IKEA', logo: 'ikea', kind: 'iot' },
  { re: /^lifx/i, name: 'LIFX', logo: 'lifx', kind: 'iot' },
  { re: /^tado/i, name: 'tado°', logo: 'tado', kind: 'iot' },
  { re: /^(tuya|itead|sonoff|lumi united|aqara)/i, kind: 'iot' },
  { re: /^sony interactive/i, name: 'PlayStation', logo: 'playstation', kind: 'console' },
  { re: /^nintendo/i, kind: 'console' },
  { re: /^valve/i, name: 'Valve', logo: 'steam', kind: 'console' },
  { re: /^razer/i, name: 'Razer', logo: 'razer' },
  { re: /^sonos/i, name: 'Sonos', logo: 'sonos', kind: 'speaker' },
  { re: /^bose/i, name: 'Bose', logo: 'bose', kind: 'speaker' },
  { re: /^ring\b/i, name: 'Ring', logo: 'ring', kind: 'camera' },
  { re: /^wyze/i, name: 'Wyze', logo: 'wyze', kind: 'camera' },
  { re: /^arlo/i, name: 'Arlo', logo: 'arlo', kind: 'camera' },
  { re: /^(hangzhou hikvision|hikvision|zhejiang dahua|dahua|reolink|axis comm|amcrest|foscam|ezviz)/i, kind: 'camera' },
  { re: /^roku/i, name: 'Roku', logo: 'roku', kind: 'tv' },
  { re: /^(tcl|hisense|vizio)/i, kind: 'tv' },
  { re: /^(brother|canon|xerox|lexmark|ricoh|kyocera|konica)/i, kind: 'printer' },
  { re: /^seiko epson|^epson/i, name: 'Epson', logo: 'epson', kind: 'printer' },
  { re: /^ubiquiti/i, name: 'Ubiquiti', logo: 'ubiquiti', kind: 'router' },
  { re: /^netgear/i, name: 'Netgear', logo: 'netgear', kind: 'router' },
  { re: /^(cisco|meraki)/i, name: 'Cisco', logo: 'cisco', kind: 'router' },
  { re: /^(mikrotik|routerboard)/i, name: 'MikroTik', logo: 'mikrotik', kind: 'router' },
  { re: /^(d-?link|zyxel|juniper|aruba|ruckus)/i, kind: 'router' },
  { re: /^tp-?link/i, name: 'TP-Link', logo: 'tplink' },
  { re: /^apple/i, name: 'Apple', logo: 'apple' },
  { re: /^samsung/i, name: 'Samsung', logo: 'samsung' },
  { re: /^google/i, name: 'Google', logo: 'google' },
  { re: /^(xiaomi|beijing xiaomi)/i, name: 'Xiaomi', logo: 'xiaomi' },
  { re: /^huawei/i, name: 'Huawei', logo: 'huawei' },
  { re: /^oneplus/i, name: 'OnePlus', logo: 'oneplus', kind: 'phone' },
  { re: /^(guangdong oppo|oppo)/i, name: 'OPPO', logo: 'oppo', kind: 'phone' },
  { re: /^vivo/i, name: 'vivo', logo: 'vivo', kind: 'phone' },
  { re: /^honor/i, name: 'HONOR', logo: 'honor', kind: 'phone' },
  { re: /^motorola/i, name: 'Motorola', logo: 'motorola', kind: 'phone' },
  { re: /^nokia/i, name: 'Nokia', logo: 'nokia' },
  { re: /^intel/i, name: 'Intel', logo: 'intel' },
  { re: /^(asustek|asus)/i, name: 'ASUS', logo: 'asus' },
  { re: /^dell/i, name: 'Dell', logo: 'dell' },
  { re: /^(hewlett|hp\b)/i, name: 'HP', logo: 'hp' },
  { re: /^lenovo/i, name: 'Lenovo', logo: 'lenovo' },
  { re: /^acer/i, name: 'Acer', logo: 'acer' },
  { re: /^(lg electronics|lg innotek)/i, name: 'LG', logo: 'lg' },
  { re: /^sony/i, name: 'Sony', logo: 'sony' },
  { re: /^nvidia/i, name: 'NVIDIA', logo: 'nvidia' },
  { re: /^(advanced micro devices|amd\b)/i, name: 'AMD', logo: 'amd' },
  { re: /^(meta platforms|facebook|oculus)/i, name: 'Meta', logo: 'meta' },
  { re: /^tesla/i, name: 'Tesla', logo: 'tesla' },
  { re: /^garmin/i, name: 'Garmin', logo: 'garmin' },
  { re: /^fitbit/i, name: 'Fitbit', logo: 'fitbit' },
];

// Well-known virtual NIC prefixes that are "locally administered" but not random
const VIRTUAL: Record<string, string> = { '525400': 'QEMU/KVM virtual NIC', '0242': 'Docker' };

interface Tier { keys: Float64Array; owners: Uint32Array }
let tiers: { l: Tier; m: Tier; s: Tier } | null = null, names: string[] = [];
let loading: Promise<void> | null = null;

const decode = (t: { p: number[]; i: number[] }): Tier => {
  const keys = new Float64Array(t.p.length);
  let acc = 0;
  t.p.forEach((x, k) => (keys[k] = acc += x));
  return { keys, owners: Uint32Array.from(t.i) };
};

/** Fetches and decodes the vendor table once. Never rejects: without it we simply show no vendors. */
export function loadVendors(): Promise<void> {
  return (loading ??= (async () => {
    try {
      if (typeof DecompressionStream === 'undefined') return;
      const res = await fetch(new URL('oui.bin', document.baseURI));
      if (!res.ok || !res.body) return;
      const d = await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).json();
      if (d.v !== 2) return;
      tiers = { l: decode(d.l), m: decode(d.m), s: decode(d.s) };
      names = d.vendors;
    } catch { /* offline or old browser */ }
  })());
}

function find(t: Tier, n: number): number {
  let lo = 0, hi = t.keys.length - 1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (t.keys[m] === n) return t.owners[m];
    if (t.keys[m] < n) lo = m + 1; else hi = m - 1;
  }
  return -1;
}

export const vendorsReady = () => tiers !== null;

/** A MAC is "private" when the locally-administered bit (0x02 of the first byte) is set. */
export const isRandomized = (mac: string) => (parseInt(mac.slice(0, 2), 16) & 0x02) !== 0;

export function lookup(mac: string): VendorInfo {
  const hex = mac.replace(/[^0-9a-f]/gi, '').toLowerCase();
  if (hex.length < 9) return { vendor: null, randomized: false };
  const virt = VIRTUAL[hex.slice(0, 6)] ?? VIRTUAL[hex.slice(0, 4)];
  if (virt) return { vendor: virt, kind: 'server', randomized: false };
  if (isRandomized(hex)) return { vendor: null, randomized: true };
  if (!tiers) return { vendor: null, randomized: false };
  // most specific assignment wins: 36-bit block, then 28-bit, then the 24-bit OUI
  let id = find(tiers.s, parseInt(hex.slice(0, 9), 16));
  if (id < 0) id = find(tiers.m, parseInt(hex.slice(0, 7), 16));
  if (id < 0) id = find(tiers.l, parseInt(hex.slice(0, 6), 16));
  if (id >= 0) {
    const raw = names[id];
    const b = BRANDS.find((x) => x.re.test(raw));
    return { vendor: b?.name ?? raw, brand: b?.logo && LOGOS[b.logo] ? b.logo : undefined, kind: b?.kind, randomized: false };
  }
  return { vendor: null, randomized: false };
}
