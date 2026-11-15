<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import { getServices, isFailed } from '../lib/api';
  import type { Service } from '../lib/types';

  let services = $state<Service[]>([]);
  let loaded = $state(false);
  let err = $state('');

  async function load() {
    try { services = await getServices(); err = ''; } catch (e) { err = e instanceof Error ? e.message : String(e); }
    loaded = true;
  }
  onMount(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); });

  const failed = $derived(services.filter(isFailed).length);
  const running = $derived(services.filter((s) => s.running).length);
  const idle = $derived(services.length - failed - running);
</script>

<div class="page">
  <div class="page-head">
    <h1>Services</h1>
    <div class="sum">
      <span class="pill"><i class="dot ok"></i>{running} running</span>
      <span class="pill"><i class="dot" class:bad={failed > 0}></i>{failed} failing</span>
      <span class="pill"><i class="dot"></i>{idle} without a daemon</span>
    </div>
  </div>

  {#if err}
    <div class="card"><p class="muted">Could not read the service list: {err}</p></div>
  {:else if !loaded}
    <div class="card"><p class="muted">Loading…</p></div>
  {:else}
    {#if failed}
      <p class="alert"><Icon name="alert" size={16} />{failed} {failed === 1 ? 'service has' : 'services have'} stopped unexpectedly. The exit code is shown below; the system log usually says why.</p>
    {/if}
    <div class="card tw0">
      <div class="tw"><table class="tbl">
        <thead><tr><th>Service</th><th>Status</th><th>Instances</th></tr></thead>
        <tbody>
          {#each services as sv (sv.name)}
            <tr>
              <td class="mono"><b>{sv.name}</b></td>
              <td><span class="pill"><i class="dot" class:ok={sv.running} class:bad={isFailed(sv)}></i>{sv.running ? 'Running' : sv.instances ? `Failed (exit ${sv.exitCode ?? '?'})` : 'No daemon'}</span></td>
              <td class="num muted">{sv.instances}</td>
            </tr>
          {/each}
        </tbody>
      </table></div>
    </div>
    <p class="faint small">“No daemon” means the service is a one-shot script (for example the firewall or cron entries) rather than a program that keeps running.</p>
  {/if}
</div>

<style>
  .sum { display: flex; gap: 8px; flex-wrap: wrap; }
  .alert { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 10px; margin: 0 0 14px; background: color-mix(in srgb, var(--bad) 12%, transparent); }
  .alert :global(svg) { color: var(--bad); flex: none; }
  .tw0 { padding: 0; } .tw { overflow-x: auto; }
  .tbl th:first-child, .tbl td:first-child { padding-left: 20px; }
  .small { font-size: 12.5px; margin-top: 12px; }
</style>
