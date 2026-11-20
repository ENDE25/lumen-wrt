<script lang="ts">
  // Shows a LuCI page inside Lumen. Same origin, so the page can be restyled once loaded: LuCI's own
  // header, menu and tabs are hidden (Lumen draws its own) and its dark mode follows Lumen's theme.
  // When the LuCI session is missing or expired, the password is asked here and LuCI is signed in again.
  import Icon from './Icon.svelte';
  import { luciLogin } from '../lib/ubus';
  import { luciUrl } from '../lib/apps';
  import { theme } from '../lib/theme.svelte';

  let { path }: { path: string } = $props();

  let frame = $state<HTMLIFrameElement>();
  let loading = $state(true), needLogin = $state(false), pass = $state(''), err = $state(''), busy = $state(false);
  let nonce = $state(0);
  const src = $derived(luciUrl(path) + (nonce ? `?_=${nonce}` : ''));

  $effect(() => { void src; loading = true; });

  const CSS = `
    header .brand, header #topmenu, header .nav, footer, #tabmenu { display: none !important; }
    header { position: static !important; min-height: 0 !important; height: auto !important; background: none !important; box-shadow: none !important; border: 0 !important; }
    header .fill, header .container { background: none !important; box-shadow: none !important; min-height: 0 !important; padding: 0 !important; }
    #indicators { position: fixed; top: 10px; right: 16px; z-index: 10; }
    body { padding-top: 0 !important; background: var(--lumen-bg) !important; font-family: var(--lumen-font) !important; }
    #maincontent { max-width: none !important; width: auto !important; margin: 0 !important; padding: 4px 20px 24px !important; }
    #maincontent > h2:first-of-type, #view > div > h2:first-child { margin-top: 4px; }
  `;

  function style() {
    const doc = frame?.contentDocument;
    if (!doc?.documentElement) return;
    const root = getComputedStyle(document.documentElement);
    doc.documentElement.setAttribute('data-darkmode', theme.dark ? 'true' : 'false');
    doc.documentElement.style.setProperty('--lumen-bg', root.getPropertyValue('--bg'));
    doc.documentElement.style.setProperty('--lumen-font', root.getPropertyValue('--font'));
    if (!doc.getElementById('lumen-skin')) {
      const s = doc.createElement('style');
      s.id = 'lumen-skin';
      s.textContent = CSS;
      doc.head?.appendChild(s);
    }
  }

  function onload() {
    loading = false;
    try {
      style();
      needLogin = !!frame?.contentDocument?.querySelector('input[name="luci_password"]');
    } catch { /* not same origin: leave it as it is */ }
  }

  // follow the Lumen theme switch while the page is open
  $effect(() => { void theme.mode; try { style(); } catch { /* ignore */ } });

  async function signin(e: SubmitEvent) {
    e.preventDefault();
    busy = true; err = '';
    try {
      if (await luciLogin('root', pass)) { pass = ''; needLogin = false; nonce = Date.now(); }
      else err = 'Wrong password';
    } catch (x) { err = x instanceof Error ? x.message : String(x); }
    busy = false;
  }
</script>

<div class="wrap card">
  {#if needLogin}
    <form class="login" onsubmit={signin}>
      <Icon name="shield" size={28} />
      <h2>Confirm your password</h2>
      <p class="muted">This app's settings come from LuCI, which needs its own sign-in. Lumen does it for you each time you log in; it has expired or was not done yet.</p>
      <input class="input" type="password" placeholder="Router password" bind:value={pass} autocomplete="current-password" aria-label="Router password" />
      {#if err}<p class="bad">{err}</p>{/if}
      <button class="btn primary" disabled={busy || !pass}>{busy ? 'Signing in…' : 'Continue'}</button>
    </form>
  {/if}
  <iframe bind:this={frame} {src} title="App settings" onload={onload} class:hidden={needLogin}></iframe>
  {#if loading && !needLogin}<div class="spin muted">Loading…</div>{/if}
</div>

<style>
  .wrap { position: relative; padding: 0; overflow: hidden; }
  /* fills the window below the page head (html is zoomed by --zoom, hence the division) */
  iframe { display: block; width: 100%; height: calc(100vh / var(--zoom) - 200px); min-height: 480px; border: 0; background: var(--bg); }
  iframe.hidden { display: none; }
  .spin { position: absolute; inset: 0; display: grid; place-items: center; background: var(--surface); }
  .login { display: grid; gap: 12px; justify-items: center; text-align: center; max-width: 380px; margin: 0 auto; padding: 56px 20px; color: var(--text); }
  .login h2 { font-size: 17px; font-weight: 600; }
  .login .input { width: 100%; }
  .bad { color: var(--bad); }
</style>
