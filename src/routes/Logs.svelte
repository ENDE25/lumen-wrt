<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import { getLog, type LogLine } from '../lib/api';

  let lines = $state<LogLine[]>([]);
  let q = $state('');
  let err = $state('');
  let auto = $state(true);

  async function load() {
    try { lines = await getLog(); err = ''; } catch (e) { err = e instanceof Error ? e.message : String(e); }
  }
  onMount(() => { load(); const t = setInterval(() => auto && load(), 5000); return () => clearInterval(t); });

  const shown = $derived(q ? lines.filter((l) => l.msg.toLowerCase().includes(q.toLowerCase())) : lines);
  const tone = (m: string) => /\berr|fail|denied|crit|alert/i.test(m) ? 'bad' : /warn/i.test(m) ? 'warn' : '';
</script>

<div class="page">
  <div class="page-head">
    <h1>Registros</h1>
    <div class="tools">
      <div class="search"><Icon name="search" size={16} /><input class="input" placeholder="Filtrar" bind:value={q} aria-label="Filtrar registros" /></div>
      <label class="chk"><input type="checkbox" bind:checked={auto} /> Actualizar</label>
      <button class="btn" onclick={load}><Icon name="refresh" size={16} />Recargar</button>
    </div>
  </div>
  <div class="card log">
    {#if err}<p class="muted">No se pudo leer el registro: {err}</p>{/if}
    {#each shown as l}
      <div class="ln {tone(l.msg)}">{l.msg}</div>
    {:else}
      {#if !err}<p class="muted">Sin entradas.</p>{/if}
    {/each}
  </div>
</div>

<style>
  .tools { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .search { position: relative; width: 240px; }
  .search :global(svg) { position: absolute; left: 11px; top: 10px; color: var(--text-3); }
  .search .input { padding-left: 34px; }
  .chk { display: flex; gap: 6px; align-items: center; font-size: 13px; color: var(--text-2); }
  .log { padding: 8px 4px; font-family: var(--mono); font-size: 12.5px; max-height: calc(100vh - 170px); overflow: auto; }
  .ln { padding: 4px 16px; border-radius: 6px; white-space: pre-wrap; word-break: break-all; }
  .ln:hover { background: var(--surface-2); }
  .ln.bad { color: var(--bad); } .ln.warn { color: var(--warn); }
</style>
