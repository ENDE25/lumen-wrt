<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import { getBoard } from '../lib/api';
  import * as m from '../lib/maintenance';

  let hostname = $state('');
  getBoard().then((b) => (hostname = b.hostname)).catch(() => {});

  let busy = $state(''), err = $state(''), note = $state('');
  // 'waiting' = the router is rebooting; the page polls until it answers again.
  let waiting = $state<'' | 'restore' | 'reset'>('');
  const fail = (e: unknown) => { err = e instanceof Error ? e.message : String(e); busy = ''; };

  async function backup() {
    err = ''; note = ''; busy = 'backup';
    try { await m.downloadBackup(hostname); note = 'Backup downloaded.'; } catch (e) { return fail(e); }
    busy = '';
  }

  // ---- restore
  let rFiles = $state<string[] | null>(null), rAsk = $state(false);
  async function pickBackup(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0]; (e.target as HTMLInputElement).value = '';
    if (!f) return;
    err = ''; note = ''; rFiles = null; rAsk = false; busy = 'restore-check';
    try { rFiles = await m.stageBackup(f); } catch (x) { return fail(x); }
    busy = '';
  }
  async function doRestore() {
    busy = 'restore'; err = '';
    try { await m.restoreBackup(); } catch (e) { return fail(e); }
    await finish('restore');
  }

  // ---- factory reset
  let resetAsk = $state(false), resetText = $state('');
  async function doReset() {
    busy = 'reset'; err = '';
    try { await m.factoryReset(); } catch (e) { return fail(e); }
    await finish('reset');
  }

  async function finish(kind: 'restore' | 'reset') {
    waiting = kind; busy = '';
    if (!(await m.rebootAndReload(kind))) { waiting = ''; err = 'The router has not come back yet. Give it a few more minutes, then reload this page.'; }
  }
</script>

<div class="page">
  <div class="page-head"><h1>Backup</h1></div>

  {#if waiting}
    <div class="card wait">
      <Icon name="refresh" size={22} />
      <h2>{waiting === 'reset' ? 'Resetting to factory defaults…' : 'Restoring backup…'}</h2>
      <p class="muted">The router is rebooting. <b>Do not unplug it.</b> It takes about a minute. This page reloads when it is back.</p>
      {#if waiting === 'reset'}<p class="muted">After a reset the router uses its default address and has no password.</p>{/if}
    </div>
  {:else}
    {#if err}<p class="alert"><Icon name="alert" size={16} />{err}</p>{/if}
    {#if note}<p class="ok"><Icon name="check" size={16} />{note}</p>{/if}

    <div class="grid g2">
      <div class="card">
        <div class="card-title"><h2>Backup</h2></div>
        <p class="muted">Downloads your router's configuration (network, Wi-Fi, firewall, passwords, installed settings) as a single file. Keep it somewhere safe: it contains your Wi-Fi password and keys.</p>
        <div class="row"><button class="btn primary" disabled={!!busy} onclick={backup}><Icon name="down" size={16} />{busy === 'backup' ? 'Preparing…' : 'Download backup'}</button></div>
      </div>

      <div class="card">
        <div class="card-title"><h2>Restore</h2></div>
        <p class="muted">Upload a backup made with Lumen or LuCI. The router restores it and reboots.</p>
        {#if rFiles}
          <p class="small"><b>{rFiles.length} files</b> in this backup, for example <span class="mono">{rFiles.slice(0, 3).join(', ')}</span>.</p>
          {#if rAsk}
            <div class="row"><button class="btn danger" disabled={!!busy} onclick={doRestore}>Confirm: restore and reboot</button><button class="btn" onclick={() => (rAsk = false)}>Cancel</button></div>
          {:else}
            <div class="row"><button class="btn danger" onclick={() => (rAsk = true)}>Restore and reboot…</button><button class="btn" onclick={() => (rFiles = null)}>Discard</button></div>
          {/if}
        {:else}
          <label class="btn file"><Icon name="up" size={16} />{busy === 'restore-check' ? 'Checking…' : 'Choose backup file…'}<input type="file" accept=".tar.gz,.gz,application/gzip" disabled={!!busy} onchange={pickBackup} /></label>
        {/if}
      </div>
    </div>

    <div class="card">
      <div class="card-title"><h2>Reset to factory defaults</h2></div>
      <p class="muted">Erases all settings (not the firmware) and reboots. Download a backup first. Lumen is stored with the settings, so you will need to reinstall it afterwards.</p>
      {#if resetAsk}
        <div class="row"><input class="input" style="max-width:200px" placeholder="Type RESET to confirm" bind:value={resetText} /><button class="btn danger" disabled={resetText !== 'RESET' || !!busy} onclick={doReset}>Reset router</button><button class="btn" onclick={() => { resetAsk = false; resetText = ''; }}>Cancel</button></div>
      {:else}
        <button class="btn danger" onclick={() => (resetAsk = true)}>Reset to defaults…</button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .card { margin-bottom: 16px; } .g2 .card { margin-bottom: 0; } .g2 { margin-bottom: 16px; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); align-items: start; }
  .card p { margin-bottom: 12px; max-width: 70ch; }
  .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .file { position: relative; cursor: pointer; display: inline-flex; gap: 8px; align-items: center; }
  .file input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .card :global(.alert) { display: flex; gap: 8px; align-items: center; margin: 10px 0; }
  .ok { display: flex; gap: 8px; align-items: center; color: var(--ok, #16a34a); }
  .wait { text-align: center; padding: 48px 20px; } .wait h2 { margin: 10px 0 6px; } .wait p { margin: 6px auto; }
  .wait :global(svg) { animation: spin 1.4s linear infinite; color: var(--accent); }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
