<script lang="ts">
  import { live } from '../lib/live.svelte';
  import { updates } from '../lib/updates.svelte';
  import { MOCK } from '../lib/ubus';
  let { hostname = '' }: { hostname?: string } = $props();
  const ok = $derived(!live.error);
</script>

<header>
  <div class="site"><span class="dot" class:ok class:bad={!ok}></span><strong>{hostname || 'Lumen'}</strong></div>
  <span class="app">Lumen</span>
  <div class="right">
    {#if updates.available}<a class="pill upd" href="#/updates" title="A new version of Lumen is available">Update available · v{updates.latest?.version}</a>{/if}
    {#if MOCK}<span class="pill">Demo mode</span>{/if}
    {#if live.error}<span class="pill" style="color:var(--bad)">Router unreachable</span>{/if}
  </div>
</header>

<style>
  header {
    height: 56px; display: flex; align-items: center; gap: 18px; padding: 0 28px;
    border-bottom: 1px solid var(--border); background: var(--surface); position: sticky; top: 0; z-index: 10;
  }
  .site { display: flex; align-items: center; gap: 9px; }
  .app { color: var(--accent); font-weight: 600; padding: 5px 12px; background: var(--accent-soft); border-radius: 8px; font-size: 13px; }
  .upd { background: var(--accent-soft); color: var(--accent); font-weight: 600; text-decoration: none; }
  .upd:hover { text-decoration: none; filter: brightness(.96); }
  .right { margin-left: auto; display: flex; gap: 10px; }
  @media (max-width: 760px) { header { padding: 0 14px; } }
</style>
