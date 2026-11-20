<script lang="ts">
  // A shell on the router in the browser (#/terminal), served by ttyd (package luci-app-ttyd).
  // ttyd listens on its own port; the address is built the same way LuCI's terminal page does.
  import { onMount } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import { uciGet, type UciSection } from '../lib/uci';
  import { getInitScripts, initAction } from '../lib/admin';
  import { MOCK } from '../lib/ubus';

  let cfg = $state<UciSection | null>(null), installed = $state(true), running = $state(true);
  let loaded = $state(false), busy = $state(false), err = $state(''), nonce = $state(0);
  let frame = $state<HTMLIFrameElement>();

  async function load() {
    try {
      const c = await uciGet('ttyd');
      cfg = Object.values(c).find((s) => s['.type'] === 'ttyd') ?? null;
      installed = !!cfg;
    } catch { installed = false; }
    const rc = await getInitScripts().catch(() => []);
    running = rc.find((s) => s.name === 'ttyd')?.running ?? false;
    loaded = true;
  }
  onMount(load);

  const opt = (k: string) => (typeof cfg?.[k] === 'string' ? (cfg[k] as string) : '');
  const port = $derived(opt('port') || '7681');
  const url = $derived(opt('url_override') || `${opt('ssl') === '1' ? 'https' : 'http'}://${location.hostname}:${port}/`);
  // an https panel cannot embed an http terminal: the browser blocks it
  const mixed = $derived(location.protocol === 'https:' && url.startsWith('http:'));

  async function start() {
    busy = true; err = '';
    try { await initAction('ttyd', 'start'); await new Promise((r) => setTimeout(r, 1200)); await load(); nonce++; }
    catch (e) { err = e instanceof Error ? e.message : String(e); }
    busy = false;
  }
</script>

<div class="page">
  <div class="page-head">
    <h1>Terminal</h1>
    {#if loaded && installed && running}
      <div class="acts">
        <button class="btn sm" onclick={() => nonce++}><Icon name="refresh" size={14} /> New session</button>
        <a class="btn sm" href={url} target="_blank" rel="noopener">Open in a new window</a>
      </div>
    {/if}
  </div>
  {#if err}<p class="alert"><Icon name="alert" size={16} />{err}</p>{/if}

  {#if !loaded}
    <p class="muted">Loading…</p>
  {:else if !installed}
    <div class="card empty">
      <Icon name="terminal" size={28} />
      <p><b>The web terminal is not installed</b></p>
      <p class="muted">It gives you a shell on the router right here, without SSH. It needs the <code>luci-app-ttyd</code> package.</p>
      <a class="btn primary" href="#/updates?find=luci-app-ttyd">Install the terminal</a>
    </div>
  {:else if port === '0' && !opt('url_override')}
    <div class="card empty"><Icon name="alert" size={22} /><p class="muted">The terminal is set to a random port. Choose a fixed one in <a href="#/apps/ttyd">Apps → Terminal → Config</a>.</p></div>
  {:else if !running}
    <div class="card empty">
      <Icon name="terminal" size={28} />
      <p><b>The terminal service is stopped</b></p>
      <button class="btn primary" disabled={busy} onclick={start}><Icon name="power" size={14} /> {busy ? 'Starting…' : 'Start it'}</button>
    </div>
  {:else if mixed}
    <div class="card empty"><Icon name="alert" size={22} /><p class="muted">Lumen is open over HTTPS but the terminal only speaks HTTP, so the browser will not show it here. <a href={url} target="_blank" rel="noopener">Open it in a new window</a>, or enable SSL for it in Apps → Terminal → Config.</p></div>
  {:else if MOCK}
    <div class="term mock"><span>root@lumen-demo:~# <i></i></span></div>
  {:else}
    {#key nonce}
      <iframe class="term" bind:this={frame} src={url} title="Router terminal" onload={() => frame?.focus()}></iframe>
    {/key}
  {/if}
</div>

<style>
  .acts { display: flex; gap: 8px; }
  /* fills the window under the page head (html is zoomed to 88%, hence the division) */
  .term { display: block; width: 100%; height: calc(100vh / .88 - 150px); min-height: 420px; border: 1px solid var(--border); border-radius: var(--radius); background: #2b2b2b; }
  .mock { padding: 12px 14px; font: 13px ui-monospace, monospace; color: #e8e8e8; }
  .mock i { display: inline-block; width: 8px; height: 15px; background: #e8e8e8; vertical-align: text-bottom; animation: blink 1s steps(1) infinite; }
  @keyframes blink { 50% { opacity: 0; } }
  .empty { display: grid; justify-items: center; gap: 10px; padding: 40px 20px; text-align: center; }
  .empty p { max-width: 520px; }
</style>
