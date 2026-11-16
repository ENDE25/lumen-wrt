// Nearby networks (iwinfo scan) and a simple channel congestion score.
import { call } from './ubus';

export interface Neighbour { ssid: string; bssid: string; channel: number; signal: number; secure: boolean }

export async function scan(device: string): Promise<Neighbour[]> {
  const r = await call<{ results?: any[] }>('iwinfo', 'scan', { device });
  return (r.results ?? []).map((n) => ({
    ssid: String(n.ssid ?? ''), bssid: String(n.bssid ?? ''), signal: Number(n.signal ?? -100),
    channel: Number(n.channel) || chanOf(Number(n.mhz)), secure: !!n.encryption?.enabled,
  })).filter((n) => n.channel > 0).sort((a, b) => b.signal - a.signal);
}

function chanOf(mhz: number): number {
  if (!mhz) return 0;
  if (mhz === 2484) return 14;
  if (mhz < 2484) return Math.round((mhz - 2407) / 5);
  if (mhz >= 5955) return Math.round((mhz - 5950) / 5);        // 6 GHz
  return Math.round((mhz - 5000) / 5);
}

/** Louder neighbours matter more: -30 dBm counts 1, -90 dBm counts about 0.1. */
const weight = (dbm: number) => Math.max(0.1, Math.min(1, (dbm + 95) / 65));

const CH24 = Array.from({ length: 13 }, (_, i) => i + 1);
const CH5 = [36, 40, 44, 48, 52, 56, 60, 64, 100, 104, 108, 112, 116, 120, 124, 128, 132, 136, 140, 144, 149, 153, 157, 161, 165];
export const is24 = (ch: number) => ch <= 14;

export interface ChannelLoad { channel: number; score: number; count: number }
export function loads(nets: Neighbour[], band24: boolean, own?: number): ChannelLoad[] {
  const base = band24 ? CH24 : CH5;
  const chans = [...new Set([...base.filter((c) => band24 || nets.some((n) => n.channel === c) || c === own || [36, 40, 44, 48, 149, 153, 157, 161].includes(c)), ...nets.map((n) => n.channel), ...(own ? [own] : [])])]
    .filter((c) => is24(c) === band24).sort((a, b) => a - b);
  return chans.map((c) => {
    // 2.4 GHz channels are 20 MHz wide but only 5 apart: anything within 4 channels overlaps. 5 GHz: same channel only.
    const hit = nets.filter((n) => (band24 ? Math.abs(n.channel - c) < 5 : n.channel === c));
    return { channel: c, count: nets.filter((n) => n.channel === c).length, score: hit.reduce((s, n) => s + weight(n.signal) * (band24 ? 1 - Math.abs(n.channel - c) * 0.18 : 1), 0) };
  });
}

/** Least crowded sensible choice: 1/6/11 on 2.4 GHz, the usual non-DFS channels on 5 GHz. */
export function best(l: ChannelLoad[], band24: boolean): ChannelLoad | null {
  const ok = l.filter((c) => (band24 ? [1, 6, 11].includes(c.channel) : [36, 40, 44, 48, 149, 153, 157, 161].includes(c.channel)));
  return ok.sort((a, b) => a.score - b.score || a.channel - b.channel)[0] ?? null;
}
