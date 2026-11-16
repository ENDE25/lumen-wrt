<script lang="ts">
  import { onMount } from 'svelte';
  import Toggle from '../../components/Toggle.svelte';
  import { getInitScripts, initAction, ESSENTIAL, type InitScript, type InitAction } from '../../lib/admin';

  let items = $state<InitScript[]>([]), loaded = $state(false), err = $state(''), busy = $state(''), ask = $state('');
  const load = () => getInitScripts().then((l) => { items = l; loaded = true; }).catch((e) => { err = String(e?.message ?? e); loaded = true; });
  onMount(() => { load(); });

  async function run(s: InitScript, a: InitAction) {
    const risky = ESSENTIAL.has(s.name) && (a === 'stop' || a === 'disable');
    if (risky && ask !== `${s.name}:${a}`) { ask = `${s.name}:${a}`; return; }
    ask = ''; busy = s.name; err = '';
    try { await initAction(s.name, a); } catch (e) { err = e instanceof Error ? e.message : String(e); }
    await new Promise((r) => setTimeout(r, a === 'restart' || a === 'start' ? 900 : 300));
    await load(); busy = '';
  }
</script>

<div class="card tablewrap">
  <p class="muted small head">Startup scripts that come with the system and installed packages. “Start at boot” decides whether a service launches when the router powers on.</p>
  {#if err}<p class="alert" style="margin:0 16px 12px">{err}</p>{/if}
  <table class="tbl">
    <thead><tr><th>Service</th><th>Status</th><th>Start at boot</th><th class="r">Actions</th></tr></thead>
    <tbody>
      {#each items as s (s.name)}
        <tr>
          <td><b>{s.name}</b>{#if ESSENTIAL.has(s.name)}<small class="faint"> · essential</small>{/if}</td>
          <td><span class="pill"><i class="dot" class:ok={s.running}></i>{s.running ? 'Running' : 'Stopped'}</span></td>
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
        <tr><td colspan="4" class="muted" style="padding:30px;text-align:center">{loaded ? 'No startup scripts found.' : 'Loading…'}</td></tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .tablewrap { padding: 0; overflow-x: auto; }
  .head { padding: 14px 16px 6px; }
  .r { text-align: right; } .acts { white-space: nowrap; display: table-cell; }
  .acts :global(.btn) { margin-left: 6px; }
  .sm { padding: 4px 10px; font-size: 12.5px; }
  .warn { color: var(--bad, #dc2626); font-size: 12.5px; }
</style>
