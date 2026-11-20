import { mount } from 'svelte';
import './styles/tokens.css';
import './styles/base.css';
import App from './App.svelte';
import { MOCK } from './lib/ubus';

if (MOCK) document.title = 'Lumen demo';

// Never run inside another site's frame (clickjacking): uhttpd sends no X-Frame-Options for static files.
// The demo build is exempt so the website can embed it.
let framed = false;
try { framed = window.self !== window.top; } catch { framed = true; }

let app: ReturnType<typeof mount> | undefined;
if (framed && !MOCK) {
  const el = document.getElementById('app')!;
  el.textContent = 'For your security, Lumen cannot be shown inside another page. ';
  const a = document.createElement('a');
  a.href = location.href; a.target = '_top'; a.rel = 'noopener'; a.textContent = 'Open Lumen';
  el.appendChild(a);
  el.style.cssText = 'padding:40px;font:15px system-ui,sans-serif;text-align:center';
} else {
  app = mount(App, { target: document.getElementById('app')! });
}

export default app;
