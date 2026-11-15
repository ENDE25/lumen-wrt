<script lang="ts">
  import { onMount } from 'svelte';
  import { getBoard, getServices, isFailed, reboot } from '../lib/api';
  import { memory, tempTone } from '../lib/derive';
  import { live } from '../lib/live.svelte';
  import { bytes, duration } from '../lib/format';
  import type { Board, Service } from '../lib/types';
  import Icon from '../components/Icon.svelte';

  let board = $state<Board | null>(null);
  let confirming = $state(false);
  let rebooting = $state(false);
  let services = $state<Service[]>([]);

  onMount(() => {
    getBoard().then((b) => (board = b));
    const svc = () => getServices().then((x) => (services = x)).catch(() => {});
    svc(); const t = setInterval(svc, 8000);
    const stop = live.start();
    return () => { stop(); clearInterval(t); };
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
      <div class="stat-row"><span>Hora del router</span><b class="num">{sys ? new Date(sys.localtime * 1000).toLocaleString() : '—'}</b></div>
      <div class="stat-row"><span>Almacenamiento libre</span><b class="num">{sys ? bytes(sys.root.avail * 1024) : '—'}</b></div>
      <div class="stat-row"><span>Almacenamiento temporal (/tmp)</span><b class="num">{sys ? `${bytes(sys.tmp.used * 1024)} / ${bytes(sys.tmp.total * 1024)}` : '—'}</b></div>
      <div class="stat-row"><span>Procesos</span><b class="num">{st?.procs ?? '—'}</b></div>
      <div class="stat-row"><span>Conexiones (conntrack)</span><b class="num">{st?.conntrack.count ?? '—'}{st?.conntrack.max ? ` / ${st.conntrack.max.toLocaleString()}` : ''}</b></div>
    </div>
    <div class="card">
      <div class="card-title"><h2>Procesador y memoria</h2></div>
      <div class="stat-row"><span>Modelo</span><b>{st?.cpu.model ?? '—'}</b></div>
      <div class="stat-row"><span>Núcleos visibles</span><b class="num">{st?.cpu.count ?? '—'}</b></div>
      <div class="stat-row"><span>Carga (1/5/15)</span><b class="num">{st ? st.load.map((v) => v.toFixed(2)).join(' · ') : '—'}</b></div>
      <div class="stat-row"><span>Memoria total</span><b class="num">{mem ? bytes(mem.total) : '—'}</b></div>
      <div class="stat-row"><span>En uso</span><b class="num">{mem ? `${bytes(mem.used)} (${mem.pct}%)` : '—'}</b></div>
      <div class="stat-row"><span>Caché</span><b class="num">{mem ? bytes(mem.cache) : '—'}</b></div>
      <div class="stat-row"><span>Libre</span><b class="num">{mem ? bytes(mem.free) : '—'}</b></div>
      {#if mem?.swapTotal}<div class="stat-row"><span>Swap</span><b class="num">{bytes(mem.swapUsed)} / {bytes(mem.swapTotal)}</b></div>{/if}
    </div>
    {#if st?.temps.length}
      <div class="card">
        <div class="card-title"><h2>Temperaturas</h2></div>
        {#each st.temps as t}<div class="stat-row"><span>{t.label}</span><b class="num t-{tempTone(t.c)}">{Math.round(t.c)} °C</b></div>{/each}
      </div>
    {/if}
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

  <div class="card" style="margin-top:16px">
    <div class="card-title"><h2>Servicios <span class="faint">{services.length}</span></h2></div>
    <div class="tw"><table class="tbl">
      <thead><tr><th>Servicio</th><th>Estado</th><th>Instancias</th></tr></thead>
      <tbody>
        {#each services as sv (sv.name)}
          <tr><td><b>{sv.name}</b></td>
            <td><span class="pill"><i class="dot" class:ok={sv.running} class:bad={isFailed(sv)}></i>{sv.running ? 'En marcha' : sv.instances ? `Con fallos (código ${sv.exitCode ?? '?'})` : 'Sin demonio'}</span></td>
            <td class="num muted">{sv.instances}</td></tr>
        {/each}
      </tbody>
    </table></div>
  </div>
</div>

<style>
  .cols { grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); align-items: start; }
  .row { display: flex; gap: 8px; }
  .tw { overflow-x: auto; margin: 0 -20px -8px; }
  .tbl th:first-child, .tbl td:first-child { padding-left: 20px; }
  .t-ok { color: var(--ok); } .t-warn { color: var(--warn); } .t-bad { color: var(--bad); }
</style>
