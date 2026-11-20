<script lang="ts">
  // A shell on the router in the browser (#/terminal), served by ttyd. Only the `ttyd` package is
  // needed (luci-app-ttyd just adds LuCI pages); its config is read by the rpcd plugin, lumen.terminal.
  // ttyd listens on its own port; the address is built the same way LuCI's terminal page does.
  import { onMount } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import { initAction } from '../lib/admin';
  import { call, MOCK } from '../lib/ubus';
  import { runPackages, getJob, type PkgAction } from '../lib/packages';

  interface Info { installed: boolean; configured?: boolean; port?: string; ssl?: boolean; url_override?: string; running?: boolean; interface?: string; luci_app?: boolean }
  let info = $state<Info | null>(null);
  // Nothing is installed without the user's say-so: both installing and removing ask first.
  let ask = $state<'' | 'install' | 'remove'>('');
  let busy = $state(''), err = $state(''), nonce = $state(0);
  let frame = $state<HTMLIFrameElement>();

  async function load() {
    try { info = await call<Info>('lumen', 'terminal'); err = ''; }
    catch (e) { err = e instanceof Error ? e.message : String(e); info = info ?? { installed: false }; }
  }
  onMount(load);

  const installed = $derived(!!info?.installed);
  const port = $derived(info?.port || '7681');
  const url = $derived(info?.url_override || `${info?.ssl ? 'https' : 'http'}://${location.hostname}:${port}/`);
  // an https panel cannot embed an http terminal: the browser blocks it
  const mixed = $derived(location.protocol === 'https:' && url.startsWith('http:'));

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
  async function remove() {
    busy = 'remove'; err = ''; ask = '';
    try {
      // luci-app-ttyd depends on ttyd, so it has to go too
      const r = await job('del', info?.luci_app ? ['luci-app-ttyd', 'ttyd'] : ['ttyd']);
      if (r.code !== 0) throw new Error(r.log || `apk exited with ${r.code}`);
      await load();
    } catch (e) { err = e instanceof Error ? e.message : String(e); }
    busy = '';
  }

  async function install() {
    busy = 'install'; err = ''; ask = '';
    try {
      let r = await job('add', ['ttyd']);
      // stale package lists are the usual reason for a failure: refresh them once and retry
      if (r.code !== 0) { busy = 'update'; await job('update'); busy = 'install'; r = await job('add', ['ttyd']); }
      if (r.code !== 0) throw new Error(r.log || `apk exited with ${r.code}`);
      await new Promise((res) => setTimeout(res, 1000));
      await load();
      if (info?.installed && !info.running) await start();
    } catch (e) { err = e instanceof Error ? e.message : String(e); }
    busy = '';
  }
</script>

<div class="page">
  <div class="page-head">
    <h1>Terminal</h1>
    {#if info?.installed}
      <div class="acts">
        {#if info.running && !mixed}<button class="btn sm" onclick={() => nonce++}><Icon name="refresh" size={14} /> New session</button>{/if}
        {#if info.running}<a class="btn sm" href={url} target="_blank" rel="noopener">Open in a new window</a>{/if}
        <button class="btn sm danger" disabled={!!busy} onclick={() => (ask = 'remove')}>{busy === 'remove' ? 'Removing…' : 'Remove the terminal'}</button>
      </div>
    {/if}
  </div>
  {#if err}<p class="alert"><Icon name="alert" size={16} />{err}</p>{/if}
  {#if ask === 'remove'}
    <div class="card confirm">
      <p><b>Remove the web terminal?</b> This uninstalls <code>ttyd</code>{#if info?.luci_app} and <code>luci-app-ttyd</code>{/if} and closes port {port}. SSH is not affected. You can install it again here at any time.</p>
      <div class="row"><button class="btn danger" onclick={remove}>Remove</button><button class="btn" onclick={() => (ask = '')}>Cancel</button></div>
    </div>
  {/if}

  {#if !info}
    <p class="muted">Loading…</p>
  {:else if !installed}
    <div class="card empty">
      <Icon name="terminal" size={28} />
      <p><b>The web terminal is not installed</b></p>
      <p class="muted">A shell on the router right here, without SSH. Lumen does not install it on its own: it is optional and only added if you choose to.</p>
      {#if ask === 'install'}
        <div class="risk">
          <p><b>Before you install it</b></p>
          <ul>
            <li>It installs the <code>ttyd</code> package, a small web server that opens <b>port 7681 on your local network</b> (not on the Internet).</li>
            <li>Anyone on your local network can reach its <b>root login prompt</b>. It is protected by the router password, which travels <b>unencrypted (HTTP)</b> unless you enable SSL for it.</li>
            <li>Only install it if you trust the devices on your network. You can remove it here at any time; uninstalling Lumen does not remove it.</li>
          </ul>
          <div class="row"><button class="btn primary" onclick={install}>I understand, install it</button><button class="btn" onclick={() => (ask = '')}>Cancel</button></div>
        </div>
      {:else}
        <button class="btn primary" disabled={!!busy} onclick={() => (ask = 'install')}>{busy === 'update' ? 'Refreshing package lists…' : busy ? 'Installing…' : 'Install the terminal…'}</button>
      {/if}
    </div>
  {:else if port === '0' && !info.url_override}
    <div class="card empty"><Icon name="alert" size={22} /><p class="muted">The terminal is set to a random port. Set a fixed <code>port</code> in <code>/etc/config/ttyd</code>.</p></div>
  {:else if !info.running}
    <div class="card empty">
      <Icon name="terminal" size={28} />
      <p><b>The terminal service is stopped</b></p>
      <button class="btn primary" disabled={!!busy} onclick={start}><Icon name="power" size={14} /> {busy ? 'Starting…' : 'Start it'}</button>
    </div>
  {:else if mixed}
    <div class="card empty"><Icon name="alert" size={22} /><p class="muted">Lumen is open over HTTPS but the terminal only speaks HTTP, so the browser will not show it here. <a href={url} target="_blank" rel="noopener">Open it in a new window</a>, or enable SSL for it (<code>ssl</code>, <code>ssl_cert</code> and <code>ssl_key</code> in <code>/etc/config/ttyd</code>).</p></div>
  {:else if MOCK}
    <div class="term mock"><span>root@lumen-demo:~# <i></i></span></div>
  {:else}
    {#key nonce}
      <iframe class="term" bind:this={frame} src={url} title="Router terminal" onload={() => frame?.focus()}></iframe>
    {/key}
  {/if}
</div>

<style>
  .acts { display: flex; gap: 8px; flex-wrap: wrap; }
  .confirm { margin-bottom: 16px; display: grid; gap: 12px; }
  .row { display: flex; gap: 8px; justify-content: center; }
  .confirm .row { justify-content: flex-start; }
  .risk { text-align: left; max-width: 560px; display: grid; gap: 10px; padding: 16px 18px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface-2); }
  .risk ul { margin: 0; padding-left: 18px; display: grid; gap: 6px; color: var(--text-2); }
  /* fills the window under the page head (html is zoomed to 88%, hence the division) */
  .term { display: block; width: 100%; height: calc(100vh / .88 - 150px); min-height: 420px; border: 1px solid var(--border); border-radius: var(--radius); background: #2b2b2b; }
  .mock { padding: 12px 14px; font: 13px ui-monospace, monospace; color: #e8e8e8; }
  .mock i { display: inline-block; width: 8px; height: 15px; background: #e8e8e8; vertical-align: text-bottom; animation: blink 1s steps(1) infinite; }
  @keyframes blink { 50% { opacity: 0; } }
  .empty { display: grid; justify-items: center; gap: 10px; padding: 40px 20px; text-align: center; }
  .empty p { max-width: 520px; }
</style>
