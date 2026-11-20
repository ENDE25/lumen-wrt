// Add-on apps: the LuCI apps (luci-app-*) installed on the router, read from LuCI's own menu files
// by the rpcd plugin. An app opens in a panel of its own when Lumen has one (src/apps), otherwise
// its LuCI pages are shown inside Lumen.
import { call } from './ubus';

export interface AppTab { path: string; title: string }
export interface App {
  id: string;
  pkg: string;
  title: string;
  path: string;        // LuCI menu path, e.g. admin/services/wol
  section: string;     // LuCI menu section: services, system, network, statistics...
  tabs: AppTab[];      // LuCI sub-pages, in menu order
  version?: string;
  description?: string;
  service: string;     // init script of its daemon, '' when it has none
}

export async function getApps(): Promise<{ apps: App[]; luci: boolean }> {
  const r = await call<{ apps?: App[]; luci?: boolean }>('lumen', 'apps');
  return { apps: r.apps ?? [], luci: !!r.luci };
}

export const luciUrl = (path: string) => `/cgi-bin/luci/${path}`;

/** A glyph for the cards; anything unknown gets the package icon. */
const ICONS: Record<string, string> = {
  wol: 'power', ttyd: 'terminal', statistics: 'stats', ddns: 'globe', upnp: 'network',
  attendedsysupgrade: 'package', adblock: 'shield', 'adblock-fast': 'shield', banip: 'shield',
  wireguard: 'shield', openvpn: 'shield', sqm: 'stats', nlbwmon: 'stats', vnstat2: 'stats',
  'https-dns-proxy': 'dns', dnscrypt: 'dns', samba4: 'server', ksmbd: 'server', minidlna: 'tv',
  mwan3: 'network', 'travelmate': 'wifi', commands: 'terminal', acme: 'shield',
};
export const appIcon = (a: App) => ICONS[a.id] ?? ICONS[a.pkg.replace(/^luci-app-/, '')] ?? 'package';

/** Short description without the "LuCI support for" boilerplate most packages carry. */
export function appBlurb(a: App): string {
  const d = (a.description ?? '').replace(/^LuCI\s+(support|application)\s+(for\s+)?/i, '').replace(/^LuCI\s+/i, '').trim();
  return d ? d[0].toUpperCase() + d.slice(1) : '';
}
