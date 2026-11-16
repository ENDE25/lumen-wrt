// Tiny hash router: #/clients, #/network ... (no server-side rewrites needed on uhttpd)
class R {
  path = $state(parse());
  constructor() { window.addEventListener('hashchange', () => (this.path = parse())); }
}
// Pages that were renamed or merged keep working from old bookmarks.
const ALIAS: Record<string, string> = { software: 'updates', system: 'settings', admin: 'settings' };
function parse() { const p = location.hash.replace(/^#\/?/, '').split('?')[0] || 'dashboard'; return ALIAS[p] ?? p; }
export const router = new R();
export const go = (p: string) => { location.hash = '/' + p; };
