<script lang="ts">
  import { onMount } from 'svelte';
  import AreaChart from '../components/AreaChart.svelte';
  import Drawer from '../components/Drawer.svelte';
  import { live } from '../lib/live.svelte';
  import { bps, bytes, cidr, duration } from '../lib/format';
  import type { NetDevice, NetInterface } from '../lib/types';

  onMount(() => live.start());

  let selIf = $state<NetInterface | null>(null);
  let selDev = $state<NetDevice | null>(null);
  const devs = $derived(Object.values(live.devices).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })));
  const ifs = $derived(live.interfaces.filter((i) => i.interface !== 'loopback'));
  const cur = $derived(selDev ? live.devices[selDev.name] ?? selDev : null);
  const curIf = $derived(selIf ? live.interfaces.find((i) => i.interface === selIf!.interface) ?? selIf : null);
</script>

<div class="page">
  <div class="page-head"><h1>Network</h1></div>

  <div class="card tw">
    <div class="card-title" style="padding:20px 20px 0"><h2>Interfaces</h2></div>
    <table class="tbl">
      <thead><tr><th>Name</th><th>Status</th><th>Protocol</th><th>Device</th><th>IPv4</th><th>Uptime</th><th>↓ / ↑</th></tr></thead>
      <tbody>
        {#each ifs as i (i.interface)}
          {@const r = live.rate(i.l3_device ?? i.device)}
          <tr class="click" tabindex="0" onclick={() => (selIf = i)} onkeydown={(e) => e.key === 'Enter' && (selIf = i)}>
            <td><b>{i.interface}</b></td>
            <td><span class="pill"><i class="dot" class:ok={i.up} class:bad={!i.up}></i>{i.up ? 'Up' : 'Down'}</span></td>
            <td>{i.proto}</td>
            <td class="mono">{i.l3_device ?? i.device ?? '—'}</td>
            <td class="num">{i['ipv4-address']?.[0] ? cidr(i['ipv4-address'][0]) : '—'}</td>
            <td class="muted">{i.uptime ? duration(i.uptime) : '—'}</td>
            <td class="num muted">{r ? `${bps(r.rx)} / ${bps(r.tx)}` : '—'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <div class="card tw" style="margin-top:16px">
    <div class="card-title" style="padding:20px 20px 0"><h2>Devices</h2></div>
    <table class="tbl">
      <thead><tr><th>Name</th><th>Type</th><th>Link</th><th>Speed</th><th>MTU</th><th>Received</th><th>Sent</th></tr></thead>
      <tbody>
        {#each devs as d (d.name)}
          <tr class="click" tabindex="0" onclick={() => (selDev = d)} onkeydown={(e) => e.key === 'Enter' && (selDev = d)}>
            <td class="mono"><b>{d.name}</b></td>
            <td class="muted">{d.type}</td>
            <td><span class="pill"><i class="dot" class:ok={d.carrier} class:bad={!d.carrier}></i>{d.carrier ? 'Up' : 'No link'}</span></td>
            <td class="num">{d.speed ? d.speed.replace('F', ' Mb/s FD').replace('H', ' Mb/s HD') : '—'}</td>
            <td class="num">{d.mtu ?? '—'}</td>
            <td class="num">{bytes(d.statistics?.rx_bytes ?? 0)}</td>
            <td class="num">{bytes(d.statistics?.tx_bytes ?? 0)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<Drawer open={!!curIf} title={curIf ? `Interface ${curIf.interface}` : ''} onclose={() => (selIf = null)}>
  {#if curIf}
    <div class="stat-row"><span>Status</span><b>{curIf.up ? 'Up' : 'Down'}</b></div>
    <div class="stat-row"><span>Protocol</span><b>{curIf.proto}</b></div>
    <div class="stat-row"><span>Device</span><b class="mono">{curIf.l3_device ?? curIf.device ?? '—'}</b></div>
    {#each curIf['ipv4-address'] ?? [] as a}<div class="stat-row"><span>IPv4</span><b class="num">{cidr(a)}</b></div>{/each}
    {#each curIf['ipv6-address'] ?? [] as a}<div class="stat-row"><span>IPv6</span><b class="mono">{cidr(a)}</b></div>{/each}
    {#each curIf.route ?? [] as r}<div class="stat-row"><span>Route</span><b class="num">{r.target}/{r.mask} → {r.nexthop}</b></div>{/each}
    {#if curIf['dns-server']?.length}<div class="stat-row"><span>DNS</span><b class="num">{curIf['dns-server'].join(', ')}</b></div>{/if}
  {/if}
</Drawer>

<Drawer open={!!cur} title={cur?.name ?? ''} onclose={() => (selDev = null)}>
  {#if cur}
    <AreaChart data={live.history[cur.name] ?? []} height={160} />
    <div style="margin-top:18px">
      <div class="stat-row"><span>Type</span><b>{cur.type}</b></div>
      <div class="stat-row"><span>MAC</span><b class="mono">{cur.macaddr ?? '—'}</b></div>
      <div class="stat-row"><span>Packets RX / TX</span><b class="num">{cur.statistics?.rx_packets ?? 0} / {cur.statistics?.tx_packets ?? 0}</b></div>
      <div class="stat-row"><span>Errors RX / TX</span><b class="num">{cur.statistics?.rx_errors ?? 0} / {cur.statistics?.tx_errors ?? 0}</b></div>
      <div class="stat-row"><span>Drops RX / TX</span><b class="num">{cur.statistics?.rx_dropped ?? 0} / {cur.statistics?.tx_dropped ?? 0}</b></div>
      {#if cur['bridge-members']?.length}<div class="stat-row"><span>Members</span><b class="mono">{cur['bridge-members'].join(', ')}</b></div>{/if}
    </div>
  {/if}
</Drawer>

<style>
  .tw { padding: 0; overflow-x: auto; }
</style>
