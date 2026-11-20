<script lang="ts">
  // Lumen's own panel for luci-app-wol: wake any device Lumen knows about, or a MAC typed by hand.
  // The magic packet is sent by the app's rpcd backend (luci.wol), which runs etherwake or wakeonlan.
  import { onMount } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import Glyph from '../components/Glyph.svelte';
  import { call } from '../lib/ubus';
  import { getClients } from '../lib/api';
  import type { Client } from '../lib/types';

  const ETHERWAKE = '/usr/bin/etherwake', WAKEONLAN = '/usr/bin/wakeonlan';
  let tools = $state<{ etherwake?: boolean; wakeonlan?: boolean } | null>(null);
  let clients = $state<Client[]>([]), iface = $state('br-lan'), filter = $state(''), manual = $state('');
  let sent = $state<Record<string, string>>({}), err = $state(''), loaded = $state(false);

  onMount(async () => {
    const [st, cl, dump] = await Promise.all([
      call('luci.wol', 'stat').catch(() => null),
      getClients().catch(() => [] as Client[]),
      call<{ interface?: { interface: string; l3_device?: string; device?: string }[] }>('network.interface', 'dump').catch(() => null),
    ]);
    tools = st; clients = cl;
    const lan = dump?.interface?.find((i) => i.interface === 'lan');
    if (lan?.l3_device || lan?.device) iface = (lan.l3_device || lan.device)!;
    loaded = true;
  });

  // sleeping machines are the ones worth waking: offline first
  const rows = $derived(clients
    .filter((c) => !filter || `${c.name} ${c.mac} ${c.ip} ${c.vendor ?? ''}`.toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => +a.active - +b.active || (a.name || a.vendor || '~').localeCompare(b.name || b.vendor || '~')));
  const manualMac = $derived(manual.trim().replace(/-/g, ':').toLowerCase());
  const MAC = /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i;

  async function wake(mac: string) {
    err = '';
    const bin = tools?.etherwake ? ETHERWAKE : WAKEONLAN;
    const args = bin === ETHERWAKE ? ['-D', '-i', iface, mac] : [mac];
    sent = { ...sent, [mac]: 'sending' };
    try {
      const r = await call<{ code: number; stdout?: string; stderr?: string }>('luci.wol', 'exec', { name: bin, args });
      if (r.code !== 0) throw new Error((r.stderr || r.stdout || `exit ${r.code}`).trim());
      sent = { ...sent, [mac]: 'sent' };
      setTimeout(() => { if (sent[mac] === 'sent') { const { [mac]: _, ...rest } = sent; sent = rest; } }, 4000);
    } catch (e) {
      const { [mac]: _, ...rest } = sent; sent = rest;
      err = e instanceof Error ? e.message : String(e);
    }
  }
</script>

{#if loaded && !tools?.etherwake && !tools?.wakeonlan}
  <div class="card empty">
    <Icon name="alert" size={22} />
    <p>Wake on LAN needs <b>etherwake</b> or <b>wakeonlan</b> on the router.</p>
    <a class="btn primary" href="#/updates?find=etherwake">Install etherwake</a>
  </div>
{:else}
  <div class="card">
    <div class="card-title">
      <h2>Wake a device</h2>
      <span class="muted small">Sent on <b>{iface}</b> with {tools?.etherwake ? 'etherwake' : 'wakeonlan'}</span>
    </div>
    <p class="muted small lead">The device must be wired and have Wake-on-LAN enabled in its BIOS or network settings. Devices that are offline are listed first.</p>
    {#if err}<p class="alert"><Icon name="alert" size={16} />{err}</p>{/if}
    <div class="bar">
      <div class="search"><Icon name="search" size={16} /><input class="input" placeholder="Filter devices" bind:value={filter} aria-label="Filter devices" /></div>
      <form class="manual" onsubmit={(e) => { e.preventDefault(); if (MAC.test(manualMac)) wake(manualMac); }}>
        <input class="input" placeholder="MAC address, e.g. 00:11:22:33:44:55" bind:value={manual} aria-label="MAC address" />
        <button class="btn" disabled={!MAC.test(manualMac) || !!sent[manualMac]}>{sent[manualMac] === 'sent' ? 'Sent' : sent[manualMac] ? 'Sending…' : 'Wake'}</button>
      </form>
    </div>
    {#if !loaded}<p class="muted pad">Loading devices…</p>
    {:else if !rows.length}<p class="muted pad">{clients.length ? 'No device matches.' : 'Lumen has not seen any devices yet. Type a MAC address above.'}</p>
    {:else}
      <div class="tablewrap"><table class="tbl">
        <thead><tr><th>Device</th><th>MAC</th><th>Status</th><th class="r"></th></tr></thead>
        <tbody>
          {#each rows as c (c.mac)}
            <tr>
              <td><span class="dev"><Glyph brand={c.brand} icon={c.kind} size={18} /><span class="nm"><b>{c.name || c.vendor || 'Unnamed'}</b><small class="faint">{[c.name ? c.vendor : '', c.ip].filter(Boolean).join(' · ')}</small></span></span></td>
              <td class="mono">{c.mac.toLowerCase()}</td>
              <td><span class="pill"><i class="dot" class:ok={c.active}></i>{c.active ? 'Online' : 'Offline'}</span></td>
              <td class="r">
                <button class="btn sm" disabled={!!sent[c.mac]} onclick={() => wake(c.mac)}>
                  {#if sent[c.mac] === 'sent'}<Icon name="check" size={14} /> Sent{:else if sent[c.mac]}Sending…{:else}<Icon name="power" size={14} /> Wake{/if}
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table></div>
    {/if}
  </div>
{/if}

<style>
  .lead { margin: -8px 0 14px; }
  .bar { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
  .search { position: relative; flex: 1 1 220px; }
  .search :global(svg) { position: absolute; left: 11px; top: 10px; color: var(--text-3); }
  .search .input { padding-left: 34px; width: 100%; }
  .manual { display: flex; gap: 8px; flex: 1 1 320px; }
  .manual .input { flex: 1; }
  .dev { display: inline-flex; align-items: center; gap: 10px; }
  .nm { display: grid; } .nm small:empty { display: none; }
  .mono { font-family: var(--mono, ui-monospace, monospace); font-size: 12.5px; }
  .r { text-align: right; }
  .pad { padding: 16px 4px; }
  .empty { display: grid; justify-items: center; gap: 12px; padding: 40px 20px; text-align: center; }
</style>
