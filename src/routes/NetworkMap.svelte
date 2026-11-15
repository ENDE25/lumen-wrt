<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import Glyph from '../components/Glyph.svelte';
  import ClientNameEditor from '../components/ClientNameEditor.svelte';
  import Drawer from '../components/Drawer.svelte';
  import SignalBars from '../components/SignalBars.svelte';
  import { live } from '../lib/live.svelte';
  import { getBoard, getNetworkMap } from '../lib/api';
  import { buildGraph, type GNode } from '../lib/netmap';
  import { bytes, cidr, duration } from '../lib/format';
  import type { Board, NetworkMap } from '../lib/types';

  let board = $state<Board | null>(null);
  let map = $state<NetworkMap>({ clients: [], wifi: [], bridges: {} });
  let loaded = $state(false);
  let sel = $state<GNode | null>(null);
  let boxW = $state(1200);

  const reload = () => getNetworkMap().then((m) => { map = m; loaded = true; }).catch(() => (loaded = true));

  onMount(() => {
    const stop = live.start();
    getBoard().then((b) => (board = b)).catch(() => {});
    const go = reload;
    go(); const t = setInterval(go, 6000);
    return () => { stop(); clearInterval(t); };
  });

  const g = $derived(buildGraph({ board, interfaces: live.interfaces, devices: live.devices, ...map }));
  const scale = $derived(Math.min(1, boxW / g.width));
  const byId = $derived(new Map(g.nodes.map((n) => [n.id, n])));
  // Where a link leaves a node: the Internet globe has no box, so it starts next to the globe itself.
  const outPt = (a: GNode) => (a.kind === 'internet' ? { x: a.x + a.w / 2 + 30, y: a.y + 26 } : { x: a.x + a.w, y: a.y + a.h / 2 });
  // Router -> ports/SSIDs: right-angle "bracket" connectors with softly rounded corners (all share one trunk).
  // Ports/SSIDs -> clients: smooth curves.
  function elbow(x1: number, y1: number, x2: number, y2: number, r = 9) {
    const dy = y2 - y1;
    if (Math.abs(dy) < 1) return `M${x1},${y1} H${x2}`;
    const xm = x1 + (x2 - x1) / 2, s = Math.sign(dy), rr = Math.min(r, Math.abs(dy) / 2, (x2 - x1) / 2);
    return `M${x1},${y1} H${xm - rr} Q${xm},${y1} ${xm},${y1 + s * rr} V${y2 - s * rr} Q${xm},${y2} ${xm + rr},${y2} H${x2}`;
  }
  const path = (a: GNode, b: GNode, curve: boolean) => {
    const { x: x1, y: y1 } = outPt(a), x2 = b.x, y2 = b.y + b.h / 2, dx = (x2 - x1) / 2;
    return curve ? `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}` : elbow(x1, y1, x2, y2);
  };
  const cur = $derived(sel ? g.nodes.find((n) => n.id === sel!.id) ?? sel : null);
  const mbps = (k?: number) => (k ? `${Math.round(k / 1000)} Mb/s` : '—');
  const nWifi = $derived(map.clients.filter((c) => c.link?.type === 'wifi').length);
  const nWired = $derived(map.clients.filter((c) => c.link?.type === 'wired').length);
  const open = (n: GNode) => (sel = n);
</script>

<div class="page">
  <div class="page-head">
    <h1>Network Map</h1>
    <div class="leg">
      <span><i class="ln"></i>Wired · {nWired}</span>
      <span><i class="ln dash"></i>Wi-Fi · {nWifi}</span>
      <span class="faint">{map.clients.length} clients</span>
    </div>
  </div>

  <div class="card wrap" bind:clientWidth={boxW}>
    {#if !loaded}
      <p class="muted pad">Loading network map…</p>
    {:else}
      <div class="sizer" style:height="{g.height * scale}px">
        <div class="canvas" style:width="{g.width}px" style:height="{g.height}px" style:left="{Math.max(0, (boxW - g.width * scale) / 2)}px" style:transform="scale({scale})">
          <svg width={g.width} height={g.height} aria-hidden="true">
            {#each g.links as l (l.id)}
              {@const a = byId.get(l.from)} {@const b = byId.get(l.to)}
              {#if a && b}
                <path d={path(a, b, l.curve)} class="link" class:wifi={l.wifi} class:down={!l.up} class:hub={l.from === 'router' || l.to === 'router'} />
                {#if l.label}<text x={(outPt(a).x + b.x) / 2} y={outPt(a).y - 8} text-anchor="middle">{l.label}</text>{/if}
              {/if}
            {/each}
          </svg>
          {#each g.nodes as n (n.id)}
            <button class="node {n.kind}" class:off={!n.up} class:active={cur?.id === n.id}
              style:left="{n.x}px" style:top="{n.y}px" style:width="{n.w}px" style:height="{n.h}px" onclick={() => open(n)}>
              <span class="ico"><Glyph brand={n.brand} icon={n.icon} size={n.kind === 'internet' ? 46 : n.kind === 'router' ? 26 : 18} /></span>
              <span class="txt"><b>{n.title}</b>{#if n.sub}<small>{n.sub}</small>{/if}{#if n.sub2}<small class="mac">{n.sub2}</small>{/if}</span>
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
      {#key c.mac}<ClientNameEditor client={c} onsaved={reload} />{/key}
      <div class="stat-row"><span>Vendor</span><b>{c.vendor ?? (c.randomMac ? 'Private address' : 'Unknown')}</b></div>
      <div class="stat-row"><span>IP address</span><b class="num">{c.ip || '—'}</b></div>
      <div class="stat-row"><span>MAC</span><b class="mono">{c.mac}</b></div>
      <div class="stat-row"><span>Connection</span><b>{c.link ? (c.link.type === 'wifi' ? 'Wi-Fi' : 'Wired') : 'Unknown'}</b></div>
      {#if c.link?.type === 'wifi'}
        <div class="stat-row"><span>Network</span><b>{c.link.ssid} · {c.link.band}</b></div>
        <div class="stat-row"><span>Signal</span><b class="num"><SignalBars dbm={c.link.signal} /> {c.link.signal} dBm</b></div>
        <div class="stat-row"><span>Speed ↓ / ↑</span><b class="num">{mbps(c.link.tx)} / {mbps(c.link.rx)}</b></div>
      {:else if c.link}
        <div class="stat-row"><span>Port</span><b class="mono">{c.link.dev}</b></div>
      {/if}
      {#if c.leaseExpires !== undefined}<div class="stat-row"><span>DHCP lease</span><b>{duration(c.leaseExpires)}</b></div>{/if}
    {:else if cur.kind === 'port' && cur.port}
      {@const d = cur.port}
      <div class="stat-row"><span>Status</span><b>{d.carrier ? 'Linked' : 'No link'}</b></div>
      <div class="stat-row"><span>Speed</span><b>{d.speed ?? '—'}</b></div>
      <div class="stat-row"><span>Clients</span><b class="num">{cur.count}</b></div>
      <div class="stat-row"><span>Received</span><b class="num">{bytes(d.statistics?.rx_bytes ?? 0)}</b></div>
      <div class="stat-row"><span>Sent</span><b class="num">{bytes(d.statistics?.tx_bytes ?? 0)}</b></div>
    {:else if cur.kind === 'ssid' && cur.wifi}
      {@const w = cur.wifi}
      <div class="stat-row"><span>SSID</span><b>{w.ssid}</b></div>
      <div class="stat-row"><span>Interface</span><b class="mono">{w.ifname}</b></div>
      <div class="stat-row"><span>Band / channel</span><b>{w.band} · {w.channel ?? '—'}</b></div>
      <div class="stat-row"><span>Clients</span><b class="num">{w.clients.length}</b></div>
    {:else if cur.kind === 'internet'}
      {@const w = cur.iface}
      {#if w}
        <div class="stat-row"><span>Interface</span><b>{w.interface} · {w.l3_device}</b></div>
        <div class="stat-row"><span>Protocol</span><b>{w.proto.toUpperCase()}</b></div>
        {#if w['ipv4-address']?.[0]}<div class="stat-row"><span>Public IP</span><b class="num">{cidr(w['ipv4-address'][0])}</b></div>{/if}
        <div class="stat-row"><span>Gateway</span><b class="num">{w.route?.find((r) => r.target === '0.0.0.0')?.nexthop ?? '—'}</b></div>
        <div class="stat-row"><span>DNS</span><b class="num">{w['dns-server']?.join(', ') ?? '—'}</b></div>
      {:else}<p class="muted">No Internet connection.</p>{/if}
    {:else if cur.kind === 'router'}
      <div class="stat-row"><span>Host</span><b>{board?.hostname}</b></div>
      <div class="stat-row"><span>Model</span><b>{board?.model}</b></div>
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
  .link { fill: none; stroke: var(--text-3); stroke-opacity: .55; stroke-width: 1.6; stroke-linejoin: round; }
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
    .node.router { background: var(--accent); border-color: var(--accent); color: #fff; gap: 14px; padding: 0 18px;
    box-shadow: 0 10px 30px color-mix(in srgb, var(--accent) 38%, transparent); }
  .node.router::before { content: ''; position: absolute; inset: -7px; border-radius: 19px; border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent); pointer-events: none; }
  .node.router:hover, .node.router.active { border-color: var(--accent); filter: brightness(1.07); }
  .router .ico, .internet .ico { width: 46px; height: 46px; border-radius: 12px; }
  .router .ico { background: rgba(255, 255, 255, .2); color: #fff; }
  .internet .ico { background: var(--accent-soft); color: var(--accent); }
  .router .txt b { font-size: 15px; } .router .txt small { color: rgba(255, 255, 255, .82); }
  .link.hub { stroke: var(--accent); stroke-opacity: .55; stroke-width: 2; }
  .link.hub.wifi { stroke-opacity: .75; }
  .ssid .ico { color: var(--accent); background: var(--accent-soft); }
  .txt { display: grid; min-width: 0; flex: 1; line-height: 1.25; }
  .txt b { font-weight: 600; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .txt small { color: var(--text-2); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .count { flex: none; min-width: 22px; height: 22px; padding: 0 6px; display: grid; place-items: center; border-radius: 99px; background: var(--surface-2); font-size: 12px; font-weight: 600; color: var(--text-2); }
  .sig { flex: none; display: grid; }
  /* Internet is drawn as a globe over the word, with no box */
  .node.internet { flex-direction: column; justify-content: flex-start; align-items: center; gap: 5px; padding: 0; text-align: center; background: none; border: 0; box-shadow: none; }
  .node.internet:hover { background: none; box-shadow: none; }
  .node.internet:hover .ico { color: color-mix(in srgb, var(--accent) 80%, var(--text)); }
  .node.internet.active .ico { filter: drop-shadow(0 0 8px color-mix(in srgb, var(--accent) 45%, transparent)); }
  .node.internet .ico { width: 52px; height: 52px; background: none; color: var(--accent); border-radius: 0; }
  .node.internet .txt { flex: none; justify-items: center; }
  .node.internet .txt b { font-size: 15px; }
  .txt .mac { font-family: var(--mono); font-size: 11.5px; color: var(--text-3); }

  .leg { display: flex; gap: 18px; align-items: center; font-size: 13px; color: var(--text-2); }
  .leg i.ln { display: inline-block; width: 22px; height: 0; border-top: 2px solid var(--text-3); margin-right: 8px; vertical-align: middle; }
  .leg i.dash { border-top: 2px dashed var(--accent); }
</style>
