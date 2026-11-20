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
  /** Whether the dark palette is showing right now. */
  get dark() { return this.mode === 'dark' || (this.mode === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches); }
  toggle() {
    const dark = this.dark;
    this.mode = dark ? 'light' : 'dark';
    try { localStorage.setItem(KEY, this.mode); } catch { /* ignore */ }
    this.apply();
  }
}
export const theme = new Theme();
