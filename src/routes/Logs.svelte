<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import { getLog, type LogLine } from '../lib/api';
  import { call } from '../lib/ubus';

  let lines = $state<LogLine[]>([]);
  let q = $state('');
  let err = $state('');
  let auto = $state(true);

  async function load() {
    try { lines = await getLog(); err = ''; } catch (e) { err = e instanceof Error ? e.message : String(e); }
  }
  onMount(() => { load(); const t = setInterval(() => auto && load(), 5000); return () => clearInterval(t); });

  let clearAsk = $state(false), clearing = $state(false);
  async function clearLog() {
    if (!clearAsk) { clearAsk = true; return; }
    clearAsk = false; clearing = true;
    try { await call('lumen', 'log_clear'); } catch (e) { err = e instanceof Error ? e.message : String(e); }
    await new Promise((r) => setTimeout(r, 2500));   // the log service restarts; give it a moment
    await load(); clearing = false;
  }

  const shown = $derived(q ? lines.filter((l) => l.msg.toLowerCase().includes(q.toLowerCase())) : lines);
  const tone = (m: string) => /\berr|fail|denied|crit|alert/i.test(m) ? 'bad' : /warn/i.test(m) ? 'warn' : '';
</script>

<div class="page">
  <div class="page-head">
    <h1>Logs</h1>
    <div class="tools">
      <div class="search"><Icon name="search" size={16} /><input class="input" placeholder="Filter" bind:value={q} aria-label="Filter logs" /></div>
      <label class="chk"><input type="checkbox" bind:checked={auto} /> Auto-refresh</label>
      <button class="btn" onclick={load}><Icon name="refresh" size={16} />Reload</button>
      {#if clearAsk}
        <span class="muted small">Empties the whole system log. Nothing else changes.</span>
        <button class="btn danger" onclick={clearLog}>Confirm: clear log</button><button class="btn" onclick={() => (clearAsk = false)}>Cancel</button>
      {:else}
        <button class="btn" disabled={clearing || !lines.length} onclick={clearLog}><Icon name={clearing ? 'refresh' : 'trash'} size={16} />{clearing ? 'Clearing…' : 'Clear log'}</button>
      {/if}
    </div>
  </div>
  <div class="card log">
    {#if err}<p class="muted">Could not read the log: {err}</p>{/if}
    {#each shown as l}
      <div class="ln {tone(l.msg)}">{l.msg}</div>
    {:else}
      {#if !err}<p class="muted">No entries.</p>{/if}
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
