type Mode = 'light' | 'dark' | 'auto';
const KEY = 'lumen.theme';
let initial: Mode = 'auto';
try { initial = (localStorage.getItem(KEY) as Mode) || 'auto'; } catch { /* ignore */ }

class Theme {
  mode = $state<Mode>(initial);
  constructor() { this.apply(); }
  apply() {
    const root = document.documentElement;
    if (this.mode === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', this.mode);
  }
  toggle() {
    const dark = this.mode === 'dark' || (this.mode === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    this.mode = dark ? 'light' : 'dark';
    try { localStorage.setItem(KEY, this.mode); } catch { /* ignore */ }
    this.apply();
  }
}
export const theme = new Theme();
