<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import Drawer from '../components/Drawer.svelte';
  import SignalBars from '../components/SignalBars.svelte';
  import { live } from '../lib/live.svelte';
  import { getBoard, getNetworkMap } from '../lib/api';
  import { buildGraph, type GNode } from '../lib/topology';
  import { bytes, cidr, duration } from '../lib/format';
  import type { Board, NetworkMap } from '../lib/types';

  let board = $state<Board | null>(null);
  let map = $state<NetworkMap>({ clients: [], wifi: [], bridges: {} });
  let loaded = $state(false);
  let sel = $state<GNode | null>(null);
  let boxW = $state(1200);

  onMount(() => {
    const stop = live.start();
    getBoard().then((b) => (board = b)).catch(() => {});
    const go = () => getNetworkMap().then((m) => { map = m; loaded = true; }).catch(() => (loaded = true));
    go(); const t = setInterval(go, 6000);
    return () => { stop(); clearInterval(t); };
  });

  const g = $derived(buildGraph({ board, interfaces: live.interfaces, devices: live.devices, ...map }));
  const scale = $derived(Math.min(1, boxW / g.width));
  const byId = $derived(new Map(g.nodes.map((n) => [n.id, n])));
  const path = (a: GNode, b: GNode) => {
    const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2, dx = (x2 - x1) / 2;
    return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
  };
  const cur = $derived(sel ? g.nodes.find((n) => n.id === sel!.id) ?? sel : null);
  const mbps = (k?: number) => (k ? `${Math.round(k / 1000)} Mb/s` : '—');
  const nWifi = $derived(map.clients.filter((c) => c.link?.type === 'wifi').length);
  const nWired = $derived(map.clients.filter((c) => c.link?.type === 'wired').length);
  const open = (n: GNode) => (sel = n);
</script>

<div class="page">
  <div class="page-head">
    <h1>Topología</h1>
    <div class="leg">
      <span><i class="ln"></i>Cable · {nWired}</span>
      <span><i class="ln dash"></i>Wi-Fi · {nWifi}</span>
      <span class="faint">{map.clients.length} clientes</span>
    </div>
  </div>

  <div class="card wrap" bind:clientWidth={boxW}>
    {#if !loaded}
      <p class="muted pad">Cargando topología…</p>
    {:else}
      <div class="sizer" style:height="{g.height * scale}px">
        <div class="canvas" style:width="{g.width}px" style:height="{g.height}px" style:left="{Math.max(0, (boxW - g.width * scale) / 2)}px" style:transform="scale({scale})">
          <svg width={g.width} height={g.height} aria-hidden="true">
            {#each g.links as l (l.id)}
              {@const a = byId.get(l.from)} {@const b = byId.get(l.to)}
              {#if a && b}
                <path d={path(a, b)} class="link" class:wifi={l.wifi} class:down={!l.up} />
                {#if l.label}<text x={(a.x + a.w + b.x) / 2} y={a.y + a.h / 2 - 8} text-anchor="middle">{l.label}</text>{/if}
              {/if}
            {/each}
          </svg>
          {#each g.nodes as n (n.id)}
            <button class="node {n.kind}" class:off={!n.up} class:active={cur?.id === n.id}
              style:left="{n.x}px" style:top="{n.y}px" style:width="{n.w}px" style:height="{n.h}px" onclick={() => open(n)}>
              <span class="ico"><Icon name={n.icon} size={n.kind === 'router' || n.kind === 'internet' ? 26 : 18} /></span>
              <span class="txt"><b>{n.title}</b><small>{n.sub}</small></span>
              {#if n.kind === 'client' && n.client?.link?.type === 'wifi'}<span class="sig"><SignalBars dbm={n.client.link.signal} /></span>{/if}
              {#if (n.kind === 'port' || n.kind === 'ssid')}<span class="count">{n.count}</span>{/if}
            </button>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>

<Drawer open={!!cur} title={cur?.title ?? ''} onclose={() => (sel = null)}>
  {#if cur}
    {#if cur.kind === 'client' && cur.client}
      {@const c = cur.client}
      <div class="stat-row"><span>Dirección IP</span><b class="num">{c.ip || '—'}</b></div>
      <div class="stat-row"><span>MAC</span><b class="mono">{c.mac}</b></div>
      <div class="stat-row"><span>Conexión</span><b>{c.link ? (c.link.type === 'wifi' ? 'Wi-Fi' : 'Cable') : 'Desconocida'}</b></div>
      {#if c.link?.type === 'wifi'}
        <div class="stat-row"><span>Red</span><b>{c.link.ssid} · {c.link.band}</b></div>
        <div class="stat-row"><span>Señal</span><b class="num"><SignalBars dbm={c.link.signal} /> {c.link.signal} dBm</b></div>
        <div class="stat-row"><span>Velocidad ↓ / ↑</span><b class="num">{mbps(c.link.tx)} / {mbps(c.link.rx)}</b></div>
      {:else if c.link}
        <div class="stat-row"><span>Puerto</span><b class="mono">{c.link.dev}</b></div>
      {/if}
      {#if c.leaseExpires !== undefined}<div class="stat-row"><span>Concesión DHCP</span><b>{duration(c.leaseExpires)}</b></div>{/if}
    {:else if cur.kind === 'port' && cur.port}
      {@const d = cur.port}
      <div class="stat-row"><span>Estado</span><b>{d.carrier ? 'Con enlace' : 'Sin enlace'}</b></div>
      <div class="stat-row"><span>Velocidad</span><b>{d.speed ?? '—'}</b></div>
      <div class="stat-row"><span>Clientes</span><b class="num">{cur.count}</b></div>
      <div class="stat-row"><span>Recibido</span><b class="num">{bytes(d.statistics?.rx_bytes ?? 0)}</b></div>
      <div class="stat-row"><span>Enviado</span><b class="num">{bytes(d.statistics?.tx_bytes ?? 0)}</b></div>
    {:else if cur.kind === 'ssid' && cur.wifi}
      {@const w = cur.wifi}
      <div class="stat-row"><span>SSID</span><b>{w.ssid}</b></div>
      <div class="stat-row"><span>Interfaz</span><b class="mono">{w.ifname}</b></div>
      <div class="stat-row"><span>Banda / canal</span><b>{w.band} · {w.channel ?? '—'}</b></div>
      <div class="stat-row"><span>Clientes</span><b class="num">{w.clients.length}</b></div>
    {:else if cur.kind === 'internet'}
      {@const w = cur.iface}
      {#if w}
        <div class="stat-row"><span>Interfaz</span><b>{w.interface} · {w.l3_device}</b></div>
        <div class="stat-row"><span>Protocolo</span><b>{w.proto.toUpperCase()}</b></div>
        {#if w['ipv4-address']?.[0]}<div class="stat-row"><span>IP pública</span><b class="num">{cidr(w['ipv4-address'][0])}</b></div>{/if}
        <div class="stat-row"><span>Puerta de enlace</span><b class="num">{w.route?.find((r) => r.target === '0.0.0.0')?.nexthop ?? '—'}</b></div>
        <div class="stat-row"><span>DNS</span><b class="num">{w['dns-server']?.join(', ') ?? '—'}</b></div>
      {:else}<p class="muted">Sin conexión a Internet.</p>{/if}
    {:else if cur.kind === 'router'}
      <div class="stat-row"><span>Host</span><b>{board?.hostname}</b></div>
      <div class="stat-row"><span>Modelo</span><b>{board?.model}</b></div>
      <div class="stat-row"><span>Firmware</span><b>{board?.release.description}</b></div>
    {/if}
  {/if}
</Drawer>

<style>
  .wrap { padding: 0; overflow-x: auto; overflow-y: hidden; }
  .pad { padding: 32px; }
  .sizer { position: relative; }
  .canvas { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
  svg { position: absolute; inset: 0; overflow: visible; }
  .link { fill: none; stroke: var(--text-3); stroke-opacity: .55; stroke-width: 1.6; }
  .link.wifi { stroke: var(--accent); stroke-opacity: .7; stroke-dasharray: 5 5; animation: flow 1.2s linear infinite; }
  .link.down { stroke-opacity: .2; animation: none; }
  svg text { font-size: 11px; fill: var(--text-3); }
  @keyframes flow { to { stroke-dashoffset: -10; } }

  .node {
    position: absolute; display: flex; align-items: center; gap: 11px; padding: 0 14px; text-align: left;
    background: var(--surface); border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--shadow);
    transition: border-color .12s, box-shadow .12s, transform .12s;
  }
  .node:hover { border-color: var(--accent); box-shadow: 0 4px 16px rgba(0, 111, 255, .12); }
  .node.active { border-color: var(--accent); background: var(--accent-soft); }
  .node.off { opacity: .55; }
  .ico { flex: none; width: 34px; height: 34px; border-radius: 9px; background: var(--surface-2); color: var(--text-2); display: grid; place-items: center; }
  .router .ico, .internet .ico { width: 46px; height: 46px; border-radius: 12px; background: var(--accent-soft); color: var(--accent); }
  .ssid .ico { color: var(--accent); background: var(--accent-soft); }
  .txt { display: grid; min-width: 0; flex: 1; line-height: 1.25; }
  .txt b { font-weight: 600; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .txt small { color: var(--text-2); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .count { flex: none; min-width: 22px; height: 22px; padding: 0 6px; display: grid; place-items: center; border-radius: 99px; background: var(--surface-2); font-size: 12px; font-weight: 600; color: var(--text-2); }
  .sig { flex: none; display: grid; }
  .internet { border-style: dashed; }

  .leg { display: flex; gap: 18px; align-items: center; font-size: 13px; color: var(--text-2); }
  .leg i.ln { display: inline-block; width: 22px; height: 0; border-top: 2px solid var(--text-3); margin-right: 8px; vertical-align: middle; }
  .leg i.dash { border-top: 2px dashed var(--accent); }
</style>
