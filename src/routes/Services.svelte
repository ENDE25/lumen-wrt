<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import Toggle from '../components/Toggle.svelte';
  import AdminCron from './admin/AdminCron.svelte';
  import { getServices, isFailed } from '../lib/api';
  import { getInitScripts, initAction, ESSENTIAL, type InitScript, type InitAction } from '../lib/admin';
  import type { Service } from '../lib/types';

  // Two views of the same things: the process supervisor knows what is running or has crashed (and why),
  // the init scripts know what starts at boot and can be started, stopped or restarted.
  interface Row { name: string; enabled: boolean; running: boolean; failed: boolean; exit?: number; daemon: boolean }
  let scripts = $state<InitScript[]>([]), procd = $state<Service[]>([]), loaded = $state(false), err = $state(''), busy = $state(''), ask = $state('');

  async function load() {
    try {
      [scripts, procd] = await Promise.all([getInitScripts(), getServices().catch(() => [] as Service[])]);
      err = '';
    } catch (e) { err = e instanceof Error ? e.message : String(e); }
    loaded = true;
  }
  onMount(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); });

  const rows = $derived.by<Row[]>(() => {
    const byName = new Map(procd.map((s) => [s.name, s]));
    const out = scripts.map((s) => {
      const p = byName.get(s.name);
      return { name: s.name, enabled: s.enabled, running: p ? p.running : s.running, failed: !!p && isFailed(p), exit: p?.exitCode, daemon: !!p && p.instances > 0 };
    });
    // failing first, then running, then the rest
    return out.sort((a, b) => +b.failed - +a.failed || +b.running - +a.running || a.name.localeCompare(b.name));
  });
  const failing = $derived(rows.filter((r) => r.failed).length);
  const running = $derived(rows.filter((r) => r.running).length);

  async function run(r: Row, a: InitAction) {
    const risky = ESSENTIAL.has(r.name) && (a === 'stop' || a === 'disable');
    if (risky && ask !== `${r.name}:${a}`) { ask = `${r.name}:${a}`; return; }
    ask = ''; busy = r.name; err = '';
    try { await initAction(r.name, a); } catch (e) { err = e instanceof Error ? e.message : String(e); }
    await new Promise((res) => setTimeout(res, a === 'restart' || a === 'start' ? 900 : 300));
    await load(); busy = '';
  }
</script>

<div class="page">
  <div class="page-head">
    <h1>Services</h1>
    <div class="sum">
      <span class="pill"><i class="dot ok"></i>{running} running</span>
      <span class="pill"><i class="dot" class:bad={failing > 0}></i>{failing} failing</span>
    </div>
  </div>

  {#if err}<p class="alert"><Icon name="alert" size={16} />{err}</p>{/if}
  {#if failing}
    <p class="alert"><Icon name="alert" size={16} />{failing} {failing === 1 ? 'service has' : 'services have'} stopped unexpectedly. The exit code is shown below; the system log usually says why.</p>
  {/if}

  <div class="card tablewrap">
    <p class="muted small head">“Start at boot” decides whether a service launches when the router powers on. Some entries are one-shot scripts (the firewall, for example) and show as stopped when idle.</p>
    <table class="tbl">
      <thead><tr><th>Service</th><th>Status</th><th>Start at boot</th><th class="r">Actions</th></tr></thead>
      <tbody>
        {#each rows as s (s.name)}
          <tr>
            <td><b>{s.name}</b>{#if ESSENTIAL.has(s.name)}<small class="faint"> · essential</small>{/if}</td>
            <td><span class="pill"><i class="dot" class:ok={s.running} class:bad={s.failed}></i>{s.running ? 'Running' : s.failed ? `Failed (exit ${s.exit ?? '?'})` : 'Stopped'}</span></td>
            <td><Toggle checked={s.enabled} disabled={busy === s.name} onchange={(v) => run(s, v ? 'enable' : 'disable')} label="" /></td>
            <td class="r acts">
              {#if ask === `${s.name}:stop` || ask === `${s.name}:disable`}
                <span class="warn">This could make the router unreachable.</span>
                <button class="btn danger sm" onclick={() => run(s, ask.endsWith('stop') ? 'stop' : 'disable')}>Confirm</button>
                <button class="btn sm" onclick={() => (ask = '')}>Cancel</button>
              {:else}
                <button class="btn sm" disabled={busy === s.name || s.running} onclick={() => run(s, 'start')}>Start</button>
                <button class="btn sm" disabled={busy === s.name || !s.running} onclick={() => run(s, 'restart')}>Restart</button>
                <button class="btn sm" disabled={busy === s.name || !s.running} onclick={() => run(s, 'stop')}>Stop</button>
              {/if}
            </td>
          </tr>
        {:else}
          <tr><td colspan="4" class="muted" style="padding:30px;text-align:center">{loaded ? 'No services found.' : 'Loading…'}</td></tr>
        {/each}
      </tbody>
    </table>
  </div>

  <div style="margin-top:16px"><AdminCron /></div>
</div>

<style>
  .sum { display: flex; gap: 8px; }
  .tablewrap { padding: 0; overflow-x: auto; }
  .head { padding: 14px 16px 6px; }
  .r { text-align: right; } .acts { white-space: nowrap; }
  .acts :global(.btn) { margin-left: 6px; }
  .sm { padding: 4px 10px; font-size: 12.5px; }
  .warn { color: var(--bad, #dc2626); font-size: 12.5px; }
  .alert { display: flex; gap: 8px; align-items: center; margin-bottom: 14px; }
</style>
