<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '../../components/Icon.svelte';
  import Toggle from '../../components/Toggle.svelte';
  import { changes } from '../../lib/changes.svelte';
  import { loadIf, validate, buildOps, PROTOS, isEditable, type IfCfg, type IfForm } from '../../lib/netconf';
  import type { NetInterface } from '../../lib/types';

  let { iface, ondone }: { iface: NetInterface; ondone: () => void } = $props();

  let cfg = $state<IfCfg | null>(null), f = $state<IfForm | null>(null), missing = $state(false);
  onMount(async () => {
    const c = await loadIf(iface.interface).catch(() => null);
    if (!c) { missing = true; return; }
    cfg = c; f = { ...c.form };
  });

  const err = $derived(cfg && f ? validate(f, cfg.canVlan) : '');
  const dirty = $derived(!!cfg && !!f && JSON.stringify(f) !== JSON.stringify(cfg.form));

  // Is the browser talking to the router through this very interface, and is its address about to change?
  const viaThis = $derived((iface['ipv4-address'] ?? []).some((a) => a.address === location.hostname));
  const newIp = $derived(f?.proto === 'static' ? f.ipaddr.split('/')[0] : '');
  const moving = $derived(viaThis && cfg?.form.proto === 'static' && f?.proto === 'static' && !!newIp && newIp !== cfg.form.ipaddr.split('/')[0]);
  const losing = $derived(viaThis && !!f && !!cfg && (f.proto !== cfg.form.proto || f.vlan !== cfg.form.vlan));

  let busy = $state(false);
  async function save() {
    if (!cfg || !f || err || !dirty) return;
    busy = true;
    const ops = buildOps(iface.interface, cfg, f);
    const ok = await changes.apply(ops, 'manual', `Interface “${iface.interface}” updated`, moving ? 90 : 30);
    busy = false;
    if (!ok) return;
    if (moving) {
      // The router now answers on the new address: continue there, where the confirmation is asked.
      const until = Date.now() + 85000;
      setTimeout(() => { location.href = `http://${newIp}${location.pathname}#/network?confirm=${until}`; }, 6000);
    }
    ondone();
  }
</script>

{#if missing}
  <p class="muted">This interface is not defined in the network configuration, so it cannot be edited here.</p>
{:else if !f || !cfg}
  <p class="muted">Loading…</p>
{:else}
  <div class="form">
    <label><span>Protocol</span>
      <select class="input" bind:value={f.proto}>{#each PROTOS as [id, label]}<option value={id}>{label}</option>{/each}</select></label>

    {#if f.proto === 'static'}
      <label><span>IPv4 address <small class="faint">with prefix</small></span><input class="input" bind:value={f.ipaddr} placeholder="192.168.1.1/24" /></label>
      <label><span>Gateway <small class="faint">optional</small></span><input class="input" bind:value={f.gateway} placeholder="192.168.1.254" /></label>
    {/if}
    {#if f.proto === 'pppoe'}
      <label><span>Username</span><input class="input" bind:value={f.username} autocomplete="off" /></label>
      <label><span>Password</span><input class="input" type="password" bind:value={f.password} autocomplete="new-password" /></label>
    {/if}
    {#if f.proto !== 'static'}
      <div><Toggle bind:checked={f.useIspDns} label="Use the DNS servers my provider gives me" /></div>
    {/if}
    {#if f.proto === 'static' || !f.useIspDns}
      <label><span>DNS servers <small class="faint">one per line</small></span><textarea class="input" rows="3" bind:value={f.dns} placeholder={'1.1.1.1\n9.9.9.9'}></textarea></label>
    {/if}
    {#if cfg.canVlan}
      <label><span>VLAN ID <small class="faint">optional · some providers need one on the internet port</small></span><input class="input" style="max-width:120px" inputmode="numeric" bind:value={f.vlan} placeholder="none" /></label>
    {/if}
    <label><span>Metric <small class="faint">optional · lower wins when several uplinks exist</small></span><input class="input" style="max-width:120px" bind:value={f.metric} /></label>

    {#if err}<small class="bad">{err}</small>{/if}
    {#if moving}
      <p class="alert"><Icon name="alert" size={16} />You are connected through this interface. After applying, Lumen opens <b>{newIp}</b> and asks you to confirm there within about a minute. If that does not work, the router goes back to the old address by itself.</p>
    {:else if losing}
      <p class="alert"><Icon name="alert" size={16} />You are connected through this interface. This change can cut this connection. If you cannot confirm it, it is rolled back automatically in 30 seconds.</p>
    {/if}
    <div class="row"><button class="btn primary" disabled={!dirty || !!err || busy} onclick={save}>Apply</button><button class="btn" onclick={ondone}>Cancel</button></div>
  </div>
{/if}

<style>
  .form { display: grid; gap: 14px; }
  label { display: grid; gap: 5px; } label > span { font-size: 13px; color: var(--text-2); }
  textarea.input { font-family: var(--mono, monospace); resize: vertical; }
  .bad { color: var(--bad, #dc2626); } .row { display: flex; gap: 10px; }
  .form :global(.alert) { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; }
</style>
