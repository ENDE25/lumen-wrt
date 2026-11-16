<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import Toggle from '../components/Toggle.svelte';
  import { getBoard } from '../lib/api';
  import { bytes } from '../lib/format';
  import * as m from '../lib/maintenance';

  let hostname = $state('');
  getBoard().then((b) => (hostname = b.hostname)).catch(() => {});

  let busy = $state(''), err = $state(''), note = $state('');
  // 'waiting' = the router is rebooting; the page polls until it answers again.
  let waiting = $state<'' | 'restore' | 'flash' | 'reset'>('');
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

  // ---- firmware
  let fw = $state<m.FirmwareCheck | null>(null), keep = $state(true), fAsk = $state(false);
  async function pickFirmware(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0]; (e.target as HTMLInputElement).value = '';
    if (!f) return;
    err = ''; note = ''; fw = null; fAsk = false; busy = 'fw-check';
    try { fw = await m.stageFirmware(f); keep = fw.allowBackup; } catch (x) { return fail(x); }
    busy = '';
  }
  async function doFlash() {
    busy = 'flash';
    await m.flashFirmware(keep);
    await finish('flash');
  }

  // ---- factory reset
  let resetAsk = $state(false), resetText = $state('');
  async function doReset() {
    busy = 'reset'; err = '';
    try { await m.factoryReset(); } catch (e) { return fail(e); }
    await finish('reset');
  }

  async function finish(kind: 'restore' | 'flash' | 'reset') {
    waiting = kind; busy = '';
    if (await m.waitForReboot(kind === 'flash' ? 900000 : 300000)) {
      try { sessionStorage.clear(); } catch { /* ignore */ }
      if (kind === 'reset') location.href = '/cgi-bin/luci/';   // a reset router has no Lumen and no password
      else location.reload();
    } else { waiting = ''; err = 'The router has not come back yet. Give it a few more minutes, then reload this page.'; }
  }
</script>

<div class="page">
  <div class="page-head"><h1>Backup &amp; Firmware</h1></div>

  {#if waiting}
    <div class="card wait">
      <Icon name="refresh" size={22} />
      <h2>{waiting === 'flash' ? 'Installing firmware…' : waiting === 'reset' ? 'Resetting to factory defaults…' : 'Restoring backup…'}</h2>
      <p class="muted">The router is rebooting. <b>Do not unplug it.</b> {waiting === 'flash' ? 'This can take several minutes.' : 'It takes about a minute.'} This page reloads when it is back.</p>
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
      <div class="card-title"><h2>Flash new firmware</h2></div>
      <p class="muted">Upload a <b>sysupgrade</b> image for this exact device (from openwrt.org or your own build). The router checks the image before anything is written.</p>
      {#if fw}
        {#if fw.valid}
          <p class="ok"><Icon name="check" size={16} />Image accepted · {bytes(fw.size)}{fw.sha256 ? ' · sha256 ' + fw.sha256.slice(0, 16) + '…' : ''}</p>
          <div class="row"><Toggle bind:checked={keep} disabled={!fw.allowBackup} label="Keep my settings" /></div>
          {#if !fw.allowBackup}<p class="muted small">This image cannot keep settings; the router will start with defaults.</p>{/if}
          {#if fAsk}
            <p class="alert"><Icon name="alert" size={16} />The router will reboot into the new firmware and be unreachable for a few minutes. Do not power it off meanwhile.</p>
            <div class="row"><button class="btn danger" disabled={!!busy} onclick={doFlash}>Confirm: flash firmware</button><button class="btn" onclick={() => (fAsk = false)}>Cancel</button></div>
          {:else}
            <div class="row"><button class="btn danger" onclick={() => (fAsk = true)}>Flash firmware…</button><button class="btn" onclick={() => (fw = null)}>Discard</button></div>
          {/if}
        {:else}
          <p class="alert"><Icon name="alert" size={16} />This image is not valid for this device, so it will not be flashed. Make sure it is the <b>sysupgrade</b> file for your exact model.</p>
          <div class="row"><button class="btn" onclick={() => (fw = null)}>Choose another</button></div>
        {/if}
      {:else}
        <label class="btn file"><Icon name="up" size={16} />{busy === 'fw-check' ? 'Uploading and checking…' : 'Choose firmware image…'}<input type="file" accept=".bin,.img,.itb,.gz,.ubi,.fit" disabled={!!busy} onchange={pickFirmware} /></label>
      {/if}
    </div>

    <div class="card">
      <div class="card-title"><h2>Reset to factory defaults</h2></div>
      <p class="muted">Erases all settings (not the firmware) and reboots. Download a backup first. Lumen itself is part of the settings area, so you will need to reinstall it afterwards.</p>
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
