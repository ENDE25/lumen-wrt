<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '../../components/Icon.svelte';
  import Drawer from '../../components/Drawer.svelte';
  import { call } from '../../lib/ubus';
  import { updates } from '../../lib/updates.svelte';

  // ---- Lumen itself: update / uninstall (jobs run on the router, see openwrt/bin/lumen-manage.sh)
  let askUpdate = $state(false), askRemove = $state(false), purge = $state(false);
  let selfJob = $state<{ state: string; log?: string; code?: number | null } | null>(null);
  let selfErr = $state(''), removing = $state(false), alive = true;
  onMount(() => () => { alive = false; });
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function runSelf(action: 'update' | 'uninstall') {
    selfErr = '';
    try {
      const r = await call<{ started?: boolean; error?: string }>('lumen', 'self_run', { action, purge: purge ? '1' : '0' });
      if (r.error) { selfErr = r.error; return; }
    } catch (e) { selfErr = e instanceof Error ? e.message : String(e); return; }
    try { sessionStorage.setItem('lumen.pending', JSON.stringify({ action, to: updates.latest?.version })); } catch { /* ignore */ }
    askUpdate = askRemove = false;
    selfJob = { state: 'running', log: '' };
    if (action === 'uninstall') { removing = true; setTimeout(() => { location.href = '/cgi-bin/luci/'; }, 8000); return; }
    // An update usually restarts rpcd, which ends this session: the app then returns to the sign-in screen.
    while (alive) {
      try { selfJob = await call('lumen', 'self_status'); } catch { /* rpcd restarting */ }
      if (selfJob?.state === 'done') break;
      await sleep(1500);
    }
    if (alive) await updates.refresh();
  }
  const upToDate = $derived(updates.checked && updates.latest && !updates.available);
</script>

<div class="card" id="lumen">
  <div class="card-title">
    <h2>Lumen <span class="faint num">v{updates.current}</span></h2>
    {#if updates.checking}<span class="pill">Checking…</span>
    {:else if updates.available}<span class="pill upd"><i class="dot warn"></i>v{updates.latest?.version} available</span>
    {:else if upToDate}<span class="pill"><i class="dot ok"></i>Up to date</span>
    {:else if updates.checked}<span class="pill">Can't check</span>{/if}
  </div>
  {#if !updates.info?.managed}
    <p class="muted" style="margin-bottom:12px">This copy was deployed from source (<code>npm run deploy</code>), so it is not managed by the installer. To get managed updates, install it with the one-line installer from the README.</p>
  {:else}
    <div class="stat-row"><span>Installed</span><b class="num">v{updates.current}</b></div>
    <div class="stat-row"><span>Latest</span><b class="num">{updates.latest ? `v${updates.latest.version}` : '—'}</b></div>
    <div class="stat-row"><span>Source</span><b class="srcurl">{updates.base}</b></div>
  {/if}
  {#if updates.error}<p class="muted small" style="margin-top:10px">{updates.error}</p>{/if}
  {#if selfErr}<p class="errtxt">{selfErr}</p>{/if}
  {#if selfJob}
    <pre class="selflog">{selfJob.state === 'done' ? (selfJob.code === 0 ? '' : `Failed (exit ${selfJob.code})\n`) : ''}{selfJob.log || 'Working…'}</pre>
  {/if}
  <div class="row" style="margin-top:14px; flex-wrap:wrap">
    <button class="btn" disabled={updates.checking} onclick={() => updates.refresh()}><Icon name="refresh" size={16} />Check for updates</button>
    {#if updates.info?.managed && updates.available}<button class="btn primary" disabled={selfJob?.state === 'running'} onclick={() => (askUpdate = true)}>Update to v{updates.latest?.version}</button>{/if}
    {#if updates.info?.managed}<button class="btn danger" disabled={selfJob?.state === 'running'} onclick={() => (askRemove = true)}>Uninstall…</button>{/if}
  </div>
</div>

<Drawer open={askUpdate} title="Update Lumen" onclose={() => (askUpdate = false)}>
  <p class="muted" style="margin-bottom:10px">From <b>v{updates.current}</b> to <b>v{updates.latest?.version}</b>.</p>
  {#if updates.latest?.notes}<p class="notes">{updates.latest.notes}</p>{/if}
  <p class="faint small">The download is checked against its SHA-256 and the Lumen release signature before anything changes. If the new version doesn't start properly it is rolled back automatically. You will be asked to sign in again.</p>
  <div class="form-actions"><button class="btn" onclick={() => (askUpdate = false)}>Cancel</button><button class="btn primary" onclick={() => runSelf('update')}>Update now</button></div>
</Drawer>

<Drawer open={askRemove} title="Uninstall Lumen" onclose={() => (askRemove = false)}>
  <p class="muted" style="margin-bottom:12px">This removes the panel, its router-side components and the traffic collector. LuCI and the rest of OpenWrt are not touched.</p>
  <label class="chk"><input type="checkbox" bind:checked={purge} /> Also delete my settings <span class="faint">(device names and types, history interval)</span></label>
  <p class="faint small" style="margin-top:8px">Without this, your settings stay in <code>/etc/config/lumen</code> and come back if you reinstall.</p>
  <div class="form-actions"><button class="btn" onclick={() => (askRemove = false)}>Cancel</button><button class="btn danger" onclick={() => runSelf('uninstall')}>Uninstall Lumen</button></div>
</Drawer>

{#if removing}
  <div class="veil" role="alertdialog"><div class="card"><h2>Removing Lumen…</h2><p class="muted">This page will stop working in a moment. You will be taken to LuCI (<code>/cgi-bin/luci/</code>) if it is installed.</p><a class="btn primary" href="/cgi-bin/luci/">Go to LuCI now</a></div></div>
{/if}


<style>
  .row { display: flex; gap: 8px; }
  .srcurl { font-size: 12px; font-weight: 500; word-break: break-all; text-align: right; }
  .selflog { margin: 12px 0 0; padding: 10px 12px; max-height: 180px; overflow: auto; background: var(--surface-2); border-radius: 8px; font-family: var(--mono); font-size: 12px; white-space: pre-wrap; }
  .notes { background: var(--surface-2); border-radius: 8px; padding: 10px 12px; margin: 0 0 12px; font-size: 13px; }
  .chk { display: flex; gap: 8px; align-items: center; font-size: 14px; }
  .errtxt { color: var(--bad); margin-top: 8px; font-size: 13px; }
  .small { font-size: 12.5px; }
  code { background: var(--surface-2); padding: 1px 6px; border-radius: 5px; font-size: 12px; }
  .pill.upd { background: var(--accent-soft); color: var(--accent); }
  .veil { position: fixed; inset: 0; background: rgba(10, 14, 20, .55); display: grid; place-items: center; z-index: 60; padding: 20px; }
  .veil .card { max-width: 440px; display: grid; gap: 12px; text-align: center; justify-items: center; }
</style>
