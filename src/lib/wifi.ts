import { asList, str, type UciConfig, type UciSection } from './uci';

export interface Radio {
  section: string; type: string; band: '2g' | '5g' | '6g' | '60g' | ''; channel: string; htmode: string; country: string; txpower: string; disabled: boolean; raw: UciSection;
}
export interface Ssid {
  section: string; device: string; mode: string; ssid: string; encryption: string; key: string; network: string;
  hidden: boolean; isolate: boolean; disabled: boolean; ieee80211w: string; raw: UciSection;
}
export interface Wireless { radios: Radio[]; ssids: Ssid[] }

function bandOf(s: UciSection): Radio['band'] {
  const b = str(s.band);
  if (b === '2g' || b === '5g' || b === '6g' || b === '60g') return b;
  const hw = str(s.hwmode);                     // legacy option
  if (hw === '11a') return '5g';
  if (hw === '11g' || hw === '11b') return '2g';
  return '';
}

export function parseWireless(cfg: UciConfig): Wireless {
  const all = Object.values(cfg);
  return {
    radios: all.filter((s) => s['.type'] === 'wifi-device').map((s) => ({
      section: s['.name'], type: str(s.type), band: bandOf(s), channel: str(s.channel) || 'auto', htmode: str(s.htmode), country: str(s.country),
      txpower: str(s.txpower), disabled: str(s.disabled) === '1', raw: s,
    })),
    ssids: all.filter((s) => s['.type'] === 'wifi-iface').map((s) => ({
      section: s['.name'], device: str(s.device), mode: str(s.mode) || 'ap', ssid: str(s.ssid) || str(s.mesh_id), encryption: str(s.encryption) || 'none', key: str(s.key),
      network: asList(s.network).join(' '), hidden: str(s.hidden) === '1', isolate: str(s.isolate) === '1', disabled: str(s.disabled) === '1',
      ieee80211w: str(s.ieee80211w), raw: s,
    })),
  };
}

export const BAND_LABEL: Record<string, string> = { '2g': '2.4 GHz', '5g': '5 GHz', '6g': '6 GHz', '60g': '60 GHz', '': 'Radio' };

export const ENCRYPTION = [
  { v: 'sae', label: 'WPA3-Personal (SAE)', key: true },
  { v: 'sae-mixed', label: 'WPA2/WPA3-Personal (mixed)', key: true },
  { v: 'psk2', label: 'WPA2-Personal (PSK)', key: true },
  { v: 'owe', label: 'Enhanced Open (OWE)', key: false },
  { v: 'none', label: 'Open (no encryption)', key: false },
];
export const encLabel = (v: string) => ENCRYPTION.find((e) => e.v === v)?.label ?? v;
export const needsKey = (v: string) => ENCRYPTION.find((e) => e.v === v)?.key ?? true;

const H = (p: string, w: number[]) => w.map((x) => `${p}${x}`);
export const HTMODES: Record<string, string[]> = {
  '2g': ['HT20', 'HT40', ...H('HE', [20, 40]), ...H('EHT', [20, 40])],
  '5g': ['HT20', 'HT40', ...H('VHT', [20, 40, 80, 160]), ...H('HE', [20, 40, 80, 160]), ...H('EHT', [20, 40, 80, 160])],
  '6g': [...H('HE', [20, 40, 80, 160]), ...H('EHT', [20, 40, 80, 160, 320])],
};
/** Channels used when the router can't tell us (radio is down). Real lists come from iwinfo freqlist. */
export const FALLBACK_CHANNELS: Record<string, number[]> = {
  '2g': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
  '5g': [36, 40, 44, 48, 52, 56, 60, 64, 100, 104, 108, 112, 116, 120, 124, 128, 132, 136, 140, 144, 149, 153, 157, 161, 165],
  '6g': [1, 5, 9, 13, 17, 21, 25, 29, 33, 37, 41, 45, 49, 53, 57, 61, 65, 69, 73, 77, 81, 85, 89, 93],
};

/** WPA passphrase: 8-63 printable chars, or exactly 64 hex digits. */
export const validKey = (k: string) => (k.length >= 8 && k.length <= 63) || /^[0-9a-fA-F]{64}$/.test(k);
export const validSsid = (s: string) => new TextEncoder().encode(s).length >= 1 && new TextEncoder().encode(s).length <= 32;
