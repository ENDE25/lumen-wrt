<script lang="ts">
  import Icon from '../../components/Icon.svelte';
  import Toggle from '../../components/Toggle.svelte';
  import { getBoard } from '../../lib/api';
  import { fetchVersions, firmwareStatus, findImage, type FirmwareImage, type FirmwareStatus } from '../../lib/firmware';
  import { bytes } from '../../lib/format';
  import * as m from '../../lib/maintenance';

  let { waiting = $bindable(false), status = $bindable<FirmwareStatus | null>(null) }: { waiting?: boolean; status?: FirmwareStatus | null } = $props();

  let hostname = $state(''), board = $state<Awaited<ReturnType<typeof getBoard>> | null>(null);
  let image = $state<FirmwareImage | null | undefined>(undefined);   // undefined = not looked up yet
  let checked = $state(false);
  const current = $derived(board?.release.version ?? '');
  const series = (v: string) => v.split('.').slice(0, 2).join('.');

  getBoard().then(async (b) => {
    board = b; hostname = b.hostname;
    status = firmwareStatus(b.release.version, await fetchVersions());
    checked = true;
    if (status.kind === 'patch' || status.kind === 'series') image = await findImage(status.latest, b.release.target, b.board_name);
  }).catch(() => { checked = true; });

  let busy = $state(''), err = $state(''), note = $state('');
  let step = $state<'' | 'download' | 'upload'>(''), frac = $state(0);
  let fw = $state<m.FirmwareCheck | null>(null), keep = $state(true), fAsk = $state(false);
  const fail = (e: unknown) => { err = e instanceof Error ? e.message : String(e); busy = ''; step = ''; };

  async function backup() {
    err = ''; note = ''; busy = 'backup';
    try { await m.downloadBackup(hostname); note = 'Backup downloaded.'; } catch (e) { return fail(e); }
    busy = '';
  }
  async function getLatest() {
    if (!image) return;
    err = ''; note = ''; fw = null; fAsk = false; busy = 'fw-latest'; frac = 0;
    try {
      step = 'download';
      const blob = await m.downloadBlob(image.url, (x) => (frac = x));
      step = 'upload'; frac = 0;
      fw = await m.stageFirmware(blob, image.sha256, (x) => (frac = x));
      keep = fw.allowBackup;
    } catch (x) { return fail(x); }
    step = ''; busy = '';
  }
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
    waiting = true; busy = '';
    if (!(await m.rebootAndReload('flash'))) { waiting = false; err = 'The router has not come back yet. Give it a few more minutes, then reload this page.'; }
  }
</script>

{#if waiting}
  <div class="card wait">
    <Icon name="refresh" size={22} />
    <h2>Installing firmware…</h2>
    <p class="muted">The router is rebooting. <b>Do not unplug it.</b> This can take several minutes. This page reloads when it is back.</p>
  </div>
{:else}
  <div class="card" id="firmware">
    <div class="head">
      <span class="fico"><Icon name="router" size={24} /></span>
      <div class="t">
        <h2>OpenWrt {current || '…'}</h2>
        <p class="muted small">{board?.release.description ?? ''}{board ? ` · ${board.release.target}` : ''}</p>
      </div>
      {#if !checked}<span class="pill">Checking for new releases…</span>
      {:else if status?.kind === 'current'}<span class="pill"><i class="dot ok"></i>Up to date</span>
      {:else if status?.kind === 'patch' || status?.kind === 'series'}<span class="pill warn"><i class="dot warn"></i>{status.latest} is available</span>
      {:else if status?.kind === 'ahead'}<span class="pill">Newer than the latest stable release</span>
      {:else}<span class="pill">Couldn't check for releases</span>{/if}
    </div>

    {#if err}<p class="alert"><Icon name="alert" size={16} /><span>{err}</span></p>{/if}
    {#if note}<p class="ok"><Icon name="check" size={16} />{note}</p>{/if}

    {#if status?.kind === 'current'}<p class="muted">You're running the latest stable release ({status.latest}).</p>
    {:else if status?.kind === 'unknown' && checked}<p class="muted">Your browser couldn't reach <code>downloads.openwrt.org</code>. You can still flash an image you downloaded yourself, below.</p>{/if}

    {#if (status?.kind === 'patch' || status?.kind === 'series') && !fw}
      <div class="latest">
        <div>
          <b>OpenWrt {status.latest} is available</b> <span class="muted">· you run {current}</span>
          {#if image === undefined}<p class="muted small">Looking for the image for your device…</p>
          {:else if image}<p class="muted small">Official image <span class="mono">{image.name}</span>. Lumen downloads it in your browser, checks its checksum and sends it to the router. Nothing is flashed until you confirm.</p>
          {:else}<p class="muted small">No ready-made image was found for this device. Use the <a href="https://firmware-selector.openwrt.org/?version={status.latest}&target={board?.release.target ?? ''}" target="_blank" rel="noreferrer">firmware selector</a> and upload the file below.</p>{/if}
          <p class="small"><a href="https://openwrt.org/releases/{series(status.latest)}/notes-{status.latest}" target="_blank" rel="noreferrer">Release notes</a></p>
          {#if status.kind === 'series'}<p class="alert"><Icon name="alert" size={16} /><span>This is a new release series. Read the release notes and download a backup first; settings may not carry over cleanly.</span></p>{/if}
        </div>
        {#if image}
          {#if busy === 'fw-latest'}
            <div class="prog"><span class="small">{step === 'download' ? 'Downloading' : 'Sending to the router'}… {Math.round(frac * 100)}%</span><i><b style:width="{frac * 100}%"></b></i></div>
          {:else}
            <div class="row"><button class="btn" disabled={!!busy} onclick={backup}><Icon name="down" size={15} />Download backup first</button><button class="btn primary" disabled={!!busy} onclick={getLatest}>Prepare {status.latest}</button></div>
          {/if}
        {/if}
      </div>
    {/if}

    {#if !fw}<p class="muted small">Or upload a <b>sysupgrade</b> image for this exact device (from openwrt.org or your own build). The router checks the image before anything is written.</p>{/if}
    {#if fw}
      {#if fw.valid}
        <p class="ok"><Icon name="check" size={16} />Image accepted · {bytes(fw.size)}{fw.sha256 ? ' · sha256 ' + fw.sha256.slice(0, 16) + '…' : ''}</p>
        <div class="row"><Toggle bind:checked={keep} disabled={!fw.allowBackup} label="Keep my settings" /></div>
        {#if !fw.allowBackup}<p class="muted small">This image cannot keep settings; the router will start with defaults.</p>{/if}
        {#if fAsk}
          <p class="alert"><Icon name="alert" size={16} /><span>The router will reboot into the new firmware and be unreachable for a few minutes. Do not power it off meanwhile.</span></p>
          <div class="row"><button class="btn danger" disabled={!!busy} onclick={doFlash}>Confirm: flash firmware</button><button class="btn" onclick={() => (fAsk = false)}>Cancel</button></div>
        {:else}
          <div class="row"><button class="btn danger" onclick={() => (fAsk = true)}>Flash firmware…</button><button class="btn" onclick={() => (fw = null)}>Discard</button></div>
        {/if}
      {:else}
        <p class="alert"><Icon name="alert" size={16} /><span>This image is not valid for this device, so it will not be flashed. Make sure it is the <b>sysupgrade</b> file for your exact model.</span></p>
        <div class="row"><button class="btn" onclick={() => (fw = null)}>Choose another</button></div>
      {/if}
    {:else}
      <label class="btn file"><Icon name="up" size={16} />{busy === 'fw-check' ? 'Uploading and checking…' : 'Choose firmware image…'}<input type="file" accept=".bin,.img,.itb,.gz,.ubi,.fit" disabled={!!busy} onchange={pickFirmware} /></label>
    {/if}
  </div>
{/if}

<style>
  .card { display: grid; gap: 14px; }
  .head { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
  .t { flex: 1; min-width: 200px; } .t h2 { font-size: 16px; font-weight: 600; }
  .fico { width: 46px; height: 46px; border-radius: 12px; background: var(--accent-soft); color: var(--accent); display: grid; place-items: center; }
  .card p { margin: 0; max-width: 72ch; }
  .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .file { position: relative; cursor: pointer; display: inline-flex; gap: 8px; align-items: center; justify-self: start; }
  .file input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .ok { display: flex; gap: 8px; align-items: center; color: var(--ok, #16a34a); }
  .alert { display: flex; gap: 8px; align-items: flex-start; }
  .latest { display: grid; gap: 12px; padding: 14px 16px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface-2); }
  .latest p { margin-top: 6px; }
  .prog { display: grid; gap: 6px; max-width: 420px; } .prog i { height: 8px; border-radius: 99px; background: var(--border); overflow: hidden; } .prog b { display: block; height: 100%; background: var(--accent); transition: width .2s; }
  .wait { text-align: center; padding: 48px 20px; } .wait h2 { margin: 10px 0 6px; } .wait p { margin: 6px auto; }
  .wait :global(svg) { animation: spin 1.4s linear infinite; color: var(--accent); }
  .pill.warn { background: color-mix(in srgb, var(--warn) 16%, transparent); color: var(--warn); }
  code { background: var(--surface-2); padding: 1px 6px; border-radius: 5px; font-size: 12px; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
