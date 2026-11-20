// Tiny hash router: #/clients, #/network ... (no server-side rewrites needed on uhttpd)
// #/apps/wol -> path 'apps', sub 'wol'
class R {
  path = $state(parse());
  sub = $state(parseSub());
  constructor() { window.addEventListener('hashchange', () => { this.path = parse(); this.sub = parseSub(); }); }
}
// Pages that were renamed or merged keep working from old bookmarks.
const ALIAS: Record<string, string> = { software: 'updates', system: 'settings', admin: 'settings' };
const segs = () => location.hash.replace(/^#\/?/, '').split('?')[0].split('/');
function parse() { const p = segs()[0] || 'dashboard'; return ALIAS[p] ?? p; }
function parseSub() { return segs().slice(1).join('/'); }
export const router = new R();
export const go = (p: string) => { location.hash = '/' + p; };
