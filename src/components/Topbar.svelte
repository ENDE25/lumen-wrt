<script lang="ts">
  import { live } from '../lib/live.svelte';
  import { MOCK } from '../lib/ubus';
  let { hostname = '' }: { hostname?: string } = $props();
  const ok = $derived(!live.error);
</script>

<header>
  <div class="site"><span class="dot" class:ok class:bad={!ok}></span><strong>{hostname || 'Lumen'}</strong></div>
  <span class="app">Lumen</span>
  <div class="right">
    {#if MOCK}<span class="pill">Modo demo</span>{/if}
    {#if live.error}<span class="pill" style="color:var(--bad)">Sin conexión con el router</span>{/if}
  </div>
</header>

<style>
  header {
    height: 56px; display: flex; align-items: center; gap: 18px; padding: 0 28px;
    border-bottom: 1px solid var(--border); background: var(--surface); position: sticky; top: 0; z-index: 10;
  }
  .site { display: flex; align-items: center; gap: 9px; }
  .app { color: var(--accent); font-weight: 600; padding: 5px 12px; background: var(--accent-soft); border-radius: 8px; font-size: 13px; }
  .right { margin-left: auto; display: flex; gap: 10px; }
  @media (max-width: 760px) { header { padding: 0 14px; } }
</style>
