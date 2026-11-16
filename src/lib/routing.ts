// Routing table (from the kernel, via the lumen rpcd plugin) and small formatting helpers.
import { call } from './ubus';

interface Raw4 { dev: string; dst: string; gw: string; flags: number; metric: number; mask: string }
interface Raw6 { dev: string; dst: string; plen: number; gw: string; metric: number; flags: number }
export interface Route { family: 4 | 6; dst: string; gw: string; dev: string; metric: number; isDefault: boolean }

const v4 = (hex: string) => (hex.match(/../g) ?? []).reverse().map((b) => parseInt(b, 16)).join('.');   // /proc/net/route is little-endian
const prefix = (maskHex: string) => (hex2(maskHex)).toString(2).replace(/0/g, '').length;
const hex2 = (h: string) => parseInt(h.match(/../g)!.reverse().join(''), 16) >>> 0;
function v6(hex: string): string {
  const g = (hex.match(/.{4}/g) ?? []).map((x) => x.replace(/^0+(?=.)/, ''));
  let best = -1, len = 0;                                          // compress the longest run of zero groups
  for (let i = 0; i < g.length;) { if (g[i] !== '0') { i++; continue; } let j = i; while (g[j] === '0') j++; if (j - i > len && j - i > 1) { best = i; len = j - i; } i = j; }
  return best < 0 ? g.join(':') : `${g.slice(0, best).join(':')}::${g.slice(best + len).join(':')}`;
}

export async function getRoutes(): Promise<Route[]> {
  const r = await call<{ v4: Raw4[]; v6: Raw6[] }>('lumen', 'routes');
  const out: Route[] = [];
  for (const x of r.v4 ?? []) {
    if (!(x.flags & 1)) continue;                                   // RTF_UP
    const p = prefix(x.mask), gw = v4(x.gw);
    out.push({ family: 4, dst: p === 0 ? 'default' : `${v4(x.dst)}/${p}`, gw: gw === '0.0.0.0' ? '' : gw, dev: x.dev, metric: x.metric, isDefault: p === 0 });
  }
  for (const x of r.v6 ?? []) {
    if (x.dev === 'lo' || (x.flags & 0x200) || x.dst.startsWith('ff')) continue;   // loopback, rejects, multicast
    const gw = v6(x.gw);
    out.push({ family: 6, dst: x.plen === 0 ? 'default' : `${v6(x.dst)}/${x.plen}`, gw: gw === '::' ? '' : gw, dev: x.dev, metric: x.metric, isDefault: x.plen === 0 });
  }
  return out.sort((a, b) => a.family - b.family || +b.isDefault - +a.isDefault || a.dst.localeCompare(b.dst, undefined, { numeric: true }));
}

const octet = '(25[0-5]|2[0-4]\\d|1?\\d?\\d)';
export const validV4Cidr = (s: string) => new RegExp(`^${octet}(\\.${octet}){3}(/(3[0-2]|[12]?\\d))?$`).test(s);
export const validV4 = (s: string) => new RegExp(`^${octet}(\\.${octet}){3}$`).test(s);
export const validV6Cidr = (s: string) => /^[0-9a-fA-F:]+(\/(12[0-8]|1[01]\d|\d{1,2}))?$/.test(s) && s.includes(':');
