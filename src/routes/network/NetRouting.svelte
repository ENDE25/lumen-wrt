<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '../../components/Icon.svelte';
  import { changes } from '../../lib/changes.svelte';
  import { live } from '../../lib/live.svelte';
  import { uciGet, str, type UciOp } from '../../lib/uci';
  import { call } from '../../lib/ubus';
  import { getClients } from '../../lib/api';
  import { getRoutes, validV4Cidr, validV4, validV6Cidr, type Route } from '../../lib/routing';
  import type { Client } from '../../lib/types';

  interface Static { section: string; family: 4 | 6; iface: string; target: string; gateway: string; metric: string }
  let routes = $state<Route[]>([]), statics = $state<Static[]>([]), neigh = $state<{ ip: string; mac: string; dev: string }[]>([]);
  let clients = $state<Client[]>([]), loaded = $state(false);

  async function load() {
    const [r, cfg, topo] = await Promise.all([getRoutes().catch(() => []), uciGet('network').catch(() => ({})), call('lumen', 'topology').catch(() => ({ neigh: [] }))]);
    routes = r; neigh = (topo as any).neigh ?? [];
    statics = Object.values(cfg).filter((s) => s['.type'] === 'route' || s['.type'] === 'route6').map((s) => ({
      section: s['.name'], family: s['.type'] === 'route6' ? 6 : 4, iface: str(s.interface),
      target: str(s.target) + (str(s.netmask) ? '/' + str(s.netmask) : ''), gateway: str(s.gateway), metric: str(s.metric),
    }));
    loaded = true;
  }
  onMount(() => { load(); getClients().then((c) => (clients = c)).catch(() => {}); const t = setInterval(load, 10000); return () => clearInterval(t); });
  $effect(() => { const p = changes.phase; void p; load(); });

  const nameOf = (mac: string) => clients.find((c) => c.mac.toLowerCase() === mac.toLowerCase())?.name ?? '';
  const ifaces = $derived(live.interfaces.map((i) => i.interface).filter((n) => n !== 'loopback'));

  let f = $state({ family: 4 as 4 | 6, iface: '', target: '', gateway: '', metric: '' }), adding = $state(false);
  const fErr = $derived.by(() => {
    if (!f.iface) return 'Choose an interface';
    if (f.family === 4) {
      if (!validV4Cidr(f.target)) return 'Destination must be an IPv4 network such as 10.0.0.0/24';
      if (f.gateway && !validV4(f.gateway)) return 'Gateway must be an IPv4 address';
    } else {
      if (!validV6Cidr(f.target)) return 'Destination must be an IPv6 network such as fd00::/64';
      if (f.gateway && !/^[0-9a-fA-F:]+$/.test(f.gateway)) return 'Gateway must be an IPv6 address';
    }
    if (f.metric && !/^\d{1,5}$/.test(f.metric)) return 'Metric is a number';
    return '';
  });
  async function add() {
    if (fErr) return;
    const values: Record<string, string> = { interface: f.iface, target: f.target };
    if (f.gateway) values.gateway = f.gateway;
    if (f.metric) values.metric = f.metric;
    const ops: UciOp[] = [{ op: 'add', config: 'network', type: f.family === 6 ? 'route6' : 'route', values }];
    if (await changes.apply(ops, 'manual', `Route to ${f.target} added`)) { adding = false; f = { ...f, target: '', gateway: '', metric: '' }; await load(); }
  }
  let delAsk = $state('');
  async function del(s: Static) {
    if (delAsk !== s.section) { delAsk = s.section; return; }
    delAsk = '';
    if (await changes.apply([{ op: 'del', config: 'network', section: s.section }], 'manual', `Route to ${s.target} removed`)) await load();
  }
</script>

<div class="card tw">
  <div class="card-title" style="padding:20px 20px 0"><h2>Active routes</h2><span class="faint small">{routes.length}</span></div>
  <table class="tbl">
    <thead><tr><th>Destination</th><th>Via</th><th>Device</th><th>Metric</th></tr></thead>
    <tbody>
      {#each routes as r}
        <tr><td class="mono"><b>{r.dst}</b>{#if r.family === 6}<small class="faint"> · IPv6</small>{/if}</td><td class="mono">{r.gw || 'directly connected'}</td><td class="mono">{r.dev}</td><td class="num">{r.metric}</td></tr>
      {:else}<tr><td colspan="4" class="muted c">{loaded ? 'No routes.' : 'Loading…'}</td></tr>{/each}
    </tbody>
  </table>
</div>

<div class="card tw" style="margin-top:16px">
  <div class="card-title" style="padding:20px 20px 0"><h2>Static routes</h2>{#if !adding}<button class="btn" onclick={() => (adding = true)}><Icon name="plus" size={15} />Add route</button>{/if}</div>
  <p class="muted small pad">Send traffic for a network through a specific gateway, for example another router or a VPN. Changes ask for confirmation and roll back on their own if you lose access.</p>
  {#if adding}
    <div class="form pad">
      <label><span>Type</span><select class="input" bind:value={f.family}><option value={4}>IPv4</option><option value={6}>IPv6</option></select></label>
      <label><span>Interface</span><select class="input" bind:value={f.iface}><option value="">Choose…</option>{#each ifaces as n}<option>{n}</option>{/each}</select></label>
      <label><span>Destination network</span><input class="input" bind:value={f.target} placeholder={f.family === 4 ? '10.0.0.0/24' : 'fd00::/64'} /></label>
      <label><span>Gateway <small class="faint">optional</small></span><input class="input" bind:value={f.gateway} placeholder={f.family === 4 ? '192.168.1.2' : 'fe80::1'} /></label>
      <label><span>Metric <small class="faint">optional</small></span><input class="input" style="max-width:100px" bind:value={f.metric} /></label>
      {#if f.target && fErr}<small class="bad">{fErr}</small>{/if}
      <div class="row"><button class="btn primary" disabled={!!fErr} onclick={add}>Add route</button><button class="btn" onclick={() => (adding = false)}>Cancel</button></div>
    </div>
  {/if}
  <table class="tbl">
    <thead><tr><th>Destination</th><th>Gateway</th><th>Interface</th><th>Metric</th><th></th></tr></thead>
    <tbody>
      {#each statics as s (s.section)}
        <tr><td class="mono"><b>{s.target}</b>{#if s.family === 6}<small class="faint"> · IPv6</small>{/if}</td><td class="mono">{s.gateway || '—'}</td><td>{s.iface}</td><td class="num">{s.metric || '—'}</td>
          <td class="r"><button class="btn danger sm" onclick={() => del(s)}>{delAsk === s.section ? 'Confirm' : 'Remove'}</button></td></tr>
      {:else}<tr><td colspan="5" class="muted c">{loaded ? 'No static routes.' : 'Loading…'}</td></tr>{/each}
    </tbody>
  </table>
</div>

<div class="card tw" style="margin-top:16px">
  <div class="card-title" style="padding:20px 20px 0"><h2>Neighbours (ARP)</h2><span class="faint small">{neigh.length}</span></div>
  <table class="tbl">
    <thead><tr><th>IP address</th><th>MAC</th><th>Name</th><th>Device</th></tr></thead>
    <tbody>
      {#each neigh as n}
        <tr><td class="num">{n.ip}</td><td class="mono muted">{n.mac}</td><td>{nameOf(n.mac) || '—'}</td><td class="mono">{n.dev}</td></tr>
      {:else}<tr><td colspan="4" class="muted c">{loaded ? 'No neighbours.' : 'Loading…'}</td></tr>{/each}
    </tbody>
  </table>
</div>

<style>
  .tw { padding: 0; overflow-x: auto; } .pad { padding: 0 20px; margin: 8px 0 14px; }
  .c { text-align: center; padding: 24px; } .r { text-align: right; }
  .form { display: grid; gap: 12px; max-width: 460px; padding-bottom: 14px; }
  label { display: grid; gap: 5px; } label > span { font-size: 13px; color: var(--text-2); }
  .row { display: flex; gap: 10px; } .bad { color: var(--bad, #dc2626); }
  .sm { padding: 4px 10px; font-size: 12.5px; }
</style>
