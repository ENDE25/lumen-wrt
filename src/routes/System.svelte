<script lang="ts">
  import { onMount } from 'svelte';
  import { getBoard, reboot } from '../lib/api';
  import { memory, tempTone } from '../lib/derive';
  import { live } from '../lib/live.svelte';
  import { bytes, duration } from '../lib/format';
  import type { Board } from '../lib/types';
  import Icon from '../components/Icon.svelte';

  let board = $state<Board | null>(null);
  let confirming = $state(false);
  let rebooting = $state(false);

  onMount(() => {
    getBoard().then((b) => (board = b));
    return live.start();
  });
  const sys = $derived(live.system);
  const st = $derived(live.stats);
  const mem = $derived(memory(st, sys));

  async function doReboot() {
    rebooting = true;
    try { await reboot(); } catch { /* connection drops while rebooting */ }
  }
</script>

<div class="page">
  <div class="page-head"><h1>System</h1></div>
  <div class="grid cols">
    <div class="card">
      <div class="card-title"><h2>Device</h2></div>
      <div class="stat-row"><span>Hostname</span><b>{board?.hostname ?? '—'}</b></div>
      <div class="stat-row"><span>Model</span><b>{board?.model ?? '—'}</b></div>
      <div class="stat-row"><span>Processor</span><b>{board?.system ?? '—'}</b></div>
      <div class="stat-row"><span>Plataforma</span><b>{board?.release.target ?? '—'}</b></div>
      <div class="stat-row"><span>Firmware</span><b>{board?.release.description ?? '—'}</b></div>
      <div class="stat-row"><span>Kernel</span><b class="num">{board?.kernel ?? '—'}</b></div>
    </div>
    <div class="card">
      <div class="card-title"><h2>Recursos</h2></div>
      <div class="stat-row"><span>Uptime</span><b class="num">{sys ? duration(sys.uptime) : '—'}</b></div>
      <div class="stat-row"><span>Router time</span><b class="num">{sys ? new Date(sys.localtime * 1000).toLocaleString() : '—'}</b></div>
      <div class="stat-row"><span>Free storage</span><b class="num">{sys ? bytes(sys.root.avail * 1024) : '—'}</b></div>
      <div class="stat-row"><span>Temporary storage (/tmp)</span><b class="num">{sys ? `${bytes(sys.tmp.used * 1024)} / ${bytes(sys.tmp.total * 1024)}` : '—'}</b></div>
      <div class="stat-row"><span>Processes</span><b class="num">{st?.procs ?? '—'}</b></div>
      <div class="stat-row"><span>Connections (conntrack)</span><b class="num">{st?.conntrack.count ?? '—'}{st?.conntrack.max ? ` / ${st.conntrack.max.toLocaleString()}` : ''}</b></div>
    </div>
    <div class="card">
      <div class="card-title"><h2>Processor &amp; memory</h2></div>
      <div class="stat-row"><span>Model</span><b>{st?.cpu.model ?? '—'}</b></div>
      <div class="stat-row"><span>Visible cores</span><b class="num">{st?.cpu.count ?? '—'}</b></div>
      <div class="stat-row"><span>Load (1/5/15)</span><b class="num">{st ? st.load.map((v) => v.toFixed(2)).join(' · ') : '—'}</b></div>
      <div class="stat-row"><span>Total memory</span><b class="num">{mem ? bytes(mem.total) : '—'}</b></div>
      <div class="stat-row"><span>In use</span><b class="num">{mem ? `${bytes(mem.used)} (${mem.pct}%)` : '—'}</b></div>
      <div class="stat-row"><span>Cache</span><b class="num">{mem ? bytes(mem.cache) : '—'}</b></div>
      <div class="stat-row"><span>Free</span><b class="num">{mem ? bytes(mem.free) : '—'}</b></div>
      {#if mem?.swapTotal}<div class="stat-row"><span>Swap</span><b class="num">{bytes(mem.swapUsed)} / {bytes(mem.swapTotal)}</b></div>{/if}
    </div>
    {#if st?.temps.length}
      <div class="card">
        <div class="card-title"><h2>Temperatures</h2></div>
        {#each st.temps as t}<div class="stat-row"><span>{t.label}</span><b class="num t-{tempTone(t.c)}">{Math.round(t.c)} °C</b></div>{/each}
      </div>
    {/if}
    <div class="card">
      <div class="card-title"><h2>Power</h2></div>
      <p class="muted" style="margin-bottom:14px">Reboots the router. You will lose connection for about a minute.</p>
      {#if rebooting}
        <p><Icon name="refresh" size={16} /> Rebooting… reload the page in a moment.</p>
      {:else if confirming}
        <div class="row">
          <button class="btn danger" onclick={doReboot}><Icon name="power" size={16} />Confirm reboot</button>
          <button class="btn" onclick={() => (confirming = false)}>Cancel</button>
        </div>
      {:else}
        <button class="btn danger" onclick={() => (confirming = true)}><Icon name="power" size={16} />Reboot</button>
      {/if}
    </div>
  </div>

</div>

<style>
  .cols { grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); align-items: start; }
  .row { display: flex; gap: 8px; }
  .t-ok { color: var(--ok); } .t-warn { color: var(--warn); } .t-bad { color: var(--bad); }
</style>
