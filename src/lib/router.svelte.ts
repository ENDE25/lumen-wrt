// Tiny hash router: #/clients, #/network ... (no server-side rewrites needed on uhttpd)
class R {
  path = $state(parse());
  constructor() { window.addEventListener('hashchange', () => (this.path = parse())); }
}
function parse() { return location.hash.replace(/^#\/?/, '').split('?')[0] || 'dashboard'; }
export const router = new R();
export const go = (p: string) => { location.hash = '/' + p; };
