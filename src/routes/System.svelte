<script lang="ts">
  import { onMount } from 'svelte';
  import { getBoard, reboot } from '../lib/api';
  import { live } from '../lib/live.svelte';
  import { bytes, duration } from '../lib/format';
  import type { Board } from '../lib/types';
  import Icon from '../components/Icon.svelte';

  let board = $state<Board | null>(null);
  let confirming = $state(false);
  let rebooting = $state(false);

  onMount(() => { getBoard().then((b) => (board = b)); return live.start(); });
  const sys = $derived(live.system);

  async function doReboot() {
    rebooting = true;
    try { await reboot(); } catch { /* connection drops while rebooting */ }
  }
</script>

<div class="page">
  <div class="page-head"><h1>Sistema</h1></div>
  <div class="grid cols">
    <div class="card">
      <div class="card-title"><h2>Dispositivo</h2></div>
      <div class="stat-row"><span>Nombre de host</span><b>{board?.hostname ?? '—'}</b></div>
      <div class="stat-row"><span>Modelo</span><b>{board?.model ?? '—'}</b></div>
      <div class="stat-row"><span>Procesador</span><b>{board?.system ?? '—'}</b></div>
      <div class="stat-row"><span>Plataforma</span><b>{board?.release.target ?? '—'}</b></div>
      <div class="stat-row"><span>Firmware</span><b>{board?.release.description ?? '—'}</b></div>
      <div class="stat-row"><span>Kernel</span><b class="num">{board?.kernel ?? '—'}</b></div>
    </div>
    <div class="card">
      <div class="card-title"><h2>Recursos</h2></div>
      <div class="stat-row"><span>Tiempo activo</span><b class="num">{sys ? duration(sys.uptime) : '—'}</b></div>
      <div class="stat-row"><span>Memoria total</span><b class="num">{sys ? bytes(sys.memory.total) : '—'}</b></div>
      <div class="stat-row"><span>Memoria disponible</span><b class="num">{sys ? bytes(sys.memory.available) : '—'}</b></div>
      <div class="stat-row"><span>Almacenamiento libre</span><b class="num">{sys ? bytes(sys.root.avail * 1024) : '—'}</b></div>
      <div class="stat-row"><span>Hora del router</span><b class="num">{sys ? new Date(sys.localtime * 1000).toLocaleString() : '—'}</b></div>
    </div>
    <div class="card">
      <div class="card-title"><h2>Energía</h2></div>
      <p class="muted" style="margin-bottom:14px">Reinicia el router. Perderás la conexión durante un minuto aproximadamente.</p>
      {#if rebooting}
        <p><Icon name="refresh" size={16} /> Reiniciando… recarga la página en un momento.</p>
      {:else if confirming}
        <div class="row">
          <button class="btn danger" onclick={doReboot}><Icon name="power" size={16} />Confirmar reinicio</button>
          <button class="btn" onclick={() => (confirming = false)}>Cancelar</button>
        </div>
      {:else}
        <button class="btn danger" onclick={() => (confirming = true)}><Icon name="power" size={16} />Reiniciar</button>
      {/if}
    </div>
  </div>
</div>

<style>
  .cols { grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); align-items: start; }
  .row { display: flex; gap: 8px; }
</style>
