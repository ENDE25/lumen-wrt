<script lang="ts">
  // A shell on the router in the browser (#/terminal), served by ttyd. Optional: nothing is installed
  // unless the user says so here, and it can be removed here too.
  // Lumen sets ttyd up to fit the router (rpcd lumen.terminal_setup):
  //   proxy  nginx routers: behind the panel's own web server at /lumen-terminal/, no port opened
  //   ssl    uhttpd + panel over HTTPS: ttyd on port 7681 with the router's certificate
  //   plain  uhttpd + panel over HTTP: ttyd on port 7681
  // Opening it from Lumen uses a one-time ticket (lumen.terminal_ticket), so there is no second login.
  import { onMount } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import { initAction } from '../lib/admin';
  import { call, MOCK } from '../lib/ubus';
  import { runPackages, getJob, type PkgAction } from '../lib/packages';

  type Mode = 'proxy' | 'ssl' | 'plain';
  interface Info {
    installed: boolean; server: 'nginx' | 'uhttpd'; mode?: Mode | 'custom'; configured?: boolean; port?: string; ssl?: boolean;
    url_override?: string; running?: boolean; interface?: string; luci_app?: boolean;
  }
  let info = $state<Info | null>(null);
  // Nothing is installed or changed without the user's say-so: install, set up and remove all ask first.
  let ask = $state<'' | 'install' | 'remove'>('');
  let busy = $state(''), err = $state(''), nonce = $state(0), src = $state('');
  let frame = $state<HTMLIFrameElement>();

  async function load() {
    try { info = await call<Info>('lumen', 'terminal'); err = ''; }
    catch (e) { err = e instanceof Error ? e.message : String(e); info = info ?? { installed: false, server: 'uhttpd' }; }
  }
  onMount(load);

  // what this router and this way of opening the panel need
  const want = $derived<Mode>(info?.server === 'nginx' ? 'proxy' : location.protocol === 'https:' ? 'ssl' : 'plain');
  const ready = $derived(!!info?.installed && info.mode === want);
  const port = $derived(info?.port || '7681');
  const base = $derived(info?.mode === 'proxy' ? `${location.origin}/lumen-terminal/` : `${info?.mode === 'ssl' ? 'https' : 'http'}://${location.hostname}:${port}/`);

  // a fresh ticket for every session the page opens; without one ttyd simply asks for the password
  $effect(() => {
    if (!ready || !info?.running || MOCK) { src = ''; return; }
    void nonce;
    const b = base;
    call<{ ticket?: string }>('lumen', 'terminal_ticket')
      .then((r) => { src = r.ticket ? `${b}?arg=${r.ticket}` : b; })
      .catch(() => { src = b; });
  });

  async function setup(mode: Mode | 'none') {
    const r = await call<{ ok?: boolean; error?: string }>('lumen', 'terminal_setup', { mode });
    if (r.error) throw new Error(r.error);
  }
  async function configure() {
    busy = 'setup'; err = '';
    try { await setup(want); await new Promise((res) => setTimeout(res, 1500)); await load(); nonce++; }
    catch (e) { err = e instanceof Error ? e.message : String(e); }
    busy = '';
  }

  async function start() {
    busy = 'start'; err = '';
    try { await initAction('ttyd', 'start'); await new Promise((r) => setTimeout(r, 1200)); await load(); nonce++; }
    catch (e) { err = e instanceof Error ? e.message : String(e); }
    busy = '';
  }

  // apk job on the router; resolves with the exit code and the end of its log
  async function job(action: PkgAction, pkgs: string[] = []) {
    const r = await runPackages(action, pkgs);
    if (r.error) throw new Error(r.error);
    for (;;) {
      await new Promise((res) => setTimeout(res, 1500));
      const j = await getJob();
      if (j.state !== 'running') return { code: j.code ?? 1, log: (j.log ?? '').trim().split('\n').slice(-3).join(' ') };
    }
  }
  async function install() {
    busy = 'install'; err = ''; ask = '';
    try {
      let r = await job('add', ['ttyd']);
      // stale package lists are the usual reason for a failure: refresh them once and retry
      if (r.code !== 0) { busy = 'update'; await job('update'); busy = 'install'; r = await job('add', ['ttyd']); }
      if (r.code !== 0) throw new Error(r.log || `apk exited with ${r.code}`);
      busy = 'setup';
      await setup(want);
      await new Promise((res) => setTimeout(res, 1500));
      await load();
      if (info?.installed && !info.running) await start();
    } catch (e) { err = e instanceof Error ? e.message : String(e); }
    busy = '';
  }
  async function remove() {
    busy = 'remove'; err = ''; ask = '';
    try {
      await setup('none');
      // luci-app-ttyd depends on ttyd, so it has to go too
      const r = await job('del', info?.luci_app ? ['luci-app-ttyd', 'ttyd'] : ['ttyd']);
      if (r.code !== 0) throw new Error(r.log || `apk exited with ${r.code}`);
      await load();
    } catch (e) { err = e instanceof Error ? e.message : String(e); }
    busy = '';
  }

  const label = (b: string) => ({ update: 'Refreshing package lists…', install: 'Installing…', setup: 'Setting it up…', remove: 'Removing…', start: 'Starting…' } as Record<string, string>)[b] ?? b;
</script>

<div class="page">
  <div class="page-head">
    <h1>Terminal</h1>
    {#if info?.installed}
      <div class="acts">
        {#if ready && info.running}
          <button class="btn sm" onclick={() => nonce++}><Icon name="refresh" size={14} /> New session</button>
          {#if src}<a class="btn sm" href={src} target="_blank" rel="noopener" onclick={() => setTimeout(() => nonce++, 500)}>Open in a new window</a>{/if}
        {/if}
        <button class="btn sm danger" disabled={!!busy} onclick={() => (ask = 'remove')}>{busy === 'remove' ? 'Removing…' : 'Remove the terminal'}</button>
      </div>
    {/if}
  </div>
  {#if err}<p class="alert"><Icon name="alert" size={16} />{err}</p>{/if}
  {#if ask === 'remove'}
    <div class="card confirm">
      <p><b>Remove the web terminal?</b> This uninstalls <code>ttyd</code>{#if info?.luci_app} and <code>luci-app-ttyd</code>{/if}{#if info?.mode !== 'proxy'} and closes port {port}{/if}. SSH is not affected. You can install it again here at any time.</p>
      <div class="row"><button class="btn danger" onclick={remove}>Remove</button><button class="btn" onclick={() => (ask = '')}>Cancel</button></div>
    </div>
  {/if}

  {#if !info}
    <p class="muted">Loading…</p>

  {:else if !info.installed}
    <div class="card empty">
      <Icon name="terminal" size={28} />
      <p><b>The web terminal is not installed</b></p>
      <p class="muted">A shell on the router right here, without SSH. Lumen does not install it on its own: it is optional and only added if you choose to.</p>
      {#if ask === 'install'}
        <div class="risk">
          <p><b>Before you install it</b></p>
          <ul>
            <li>It installs <code>ttyd</code>, a small program that gives a <b>root shell</b> in the browser.</li>
            {#if want === 'proxy'}
              <li>It is reached <b>only through this panel</b> (at <code>/lumen-terminal/</code> on this router's web server): <b>no new port is opened</b> on your network, and it is encrypted whenever the panel is opened over HTTPS.</li>
            {:else}
              <li>It listens on <b>port 7681 of your local network</b> (not the Internet), {want === 'ssl' ? "encrypted with the router's certificate" : 'over plain HTTP, unencrypted'}. Anyone there who opens that port gets a login prompt and needs the router password.</li>
            {/if}
            <li>Opening it from Lumen signs you in automatically with a one-time ticket, so you are not asked for the password again.</li>
            <li>Only install it if you trust the devices on your network. You can remove it here at any time.</li>
          </ul>
          <div class="row"><button class="btn primary" onclick={install}>I understand, install it</button><button class="btn" onclick={() => (ask = '')}>Cancel</button></div>
        </div>
      {:else}
        <button class="btn primary" disabled={!!busy} onclick={() => (ask = 'install')}>{busy ? label(busy) : 'Install the terminal…'}</button>
      {/if}
    </div>

  {:else if !ready}
    <div class="card empty">
      <Icon name="settings" size={26} />
      {#if info.mode === 'custom'}
        <p><b>Set up the terminal for Lumen</b></p>
        <p class="muted">The terminal is installed but was set up outside Lumen. Lumen can adjust it so it opens here in one click, without a second password{#if want === 'proxy'}, through this panel's web server and with no port open on your network{:else if want === 'ssl'}, encrypted with the router's certificate{/if}. Your other ttyd settings are kept.</p>
      {:else}
        <p><b>The terminal needs a quick fix</b></p>
        <p class="muted">
          {#if want === 'proxy'}This router now uses nginx as its web server, so the terminal can move behind it: no port open on your network, and it works over HTTPS.
          {:else if want === 'ssl'}You opened Lumen over HTTPS, so the terminal has to use HTTPS too or the browser will not show it.
          {:else}You opened Lumen over HTTP, and the terminal is set up for {info.mode === 'ssl' ? 'HTTPS' : 'another web server'}.{/if}
        </p>
      {/if}
      <button class="btn primary" disabled={!!busy} onclick={configure}>{busy === 'setup' ? 'Setting it up…' : info.mode === 'custom' ? 'Set it up' : 'Fix it'}</button>
    </div>

  {:else if !info.running}
    <div class="card empty">
      <Icon name="terminal" size={28} />
      <p><b>The terminal service is stopped</b></p>
      <button class="btn primary" disabled={!!busy} onclick={start}><Icon name="power" size={14} /> {busy ? label(busy) : 'Start it'}</button>
    </div>

  {:else if MOCK}
    <div class="term mock"><span>root@lumen-demo:~# <i></i></span></div>

  {:else}
    {#if info.mode === 'ssl'}
      <p class="muted small hint">Blank terminal? Your browser has not accepted the router's certificate for the terminal yet: <a href={base} target="_blank" rel="noopener">open it once</a>, accept the warning, then press New session.</p>
    {/if}
    {#if src}
      {#key src}
        <iframe class="term" bind:this={frame} {src} title="Router terminal" onload={() => frame?.focus()}></iframe>
      {/key}
    {:else}
      <div class="term"></div>
    {/if}
  {/if}
</div>

<style>
  .acts { display: flex; gap: 8px; flex-wrap: wrap; }
  .confirm { margin-bottom: 16px; display: grid; gap: 12px; }
  .row { display: flex; gap: 8px; justify-content: center; }
  .confirm .row { justify-content: flex-start; }
  .risk { text-align: left; max-width: 560px; display: grid; gap: 10px; padding: 16px 18px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface-2); }
  .risk ul { margin: 0; padding-left: 18px; display: grid; gap: 6px; color: var(--text-2); }
  .hint { margin: -8px 0 10px; }
  /* the shell is shown at the browser's own size: the panel's zoom would shrink the terminal font */
  iframe.term { zoom: calc(1 / var(--zoom)); height: calc(100vh - 150px * var(--zoom)); }
  /* fills the window under the page head (html is zoomed by --zoom, hence the division) */
  .term { display: block; width: 100%; height: calc(100vh / var(--zoom) - 150px); min-height: 420px; border: 1px solid var(--border); border-radius: var(--radius); background: #2b2b2b; }
  .mock { padding: 12px 14px; font: 13px ui-monospace, monospace; color: #e8e8e8; }
  .mock i { display: inline-block; width: 8px; height: 15px; background: #e8e8e8; vertical-align: text-bottom; animation: blink 1s steps(1) infinite; }
  @keyframes blink { 50% { opacity: 0; } }
  .empty { display: grid; justify-items: center; gap: 10px; padding: 40px 20px; text-align: center; }
  .empty p { max-width: 560px; }
</style>
