<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import Glyph from '../components/Glyph.svelte';
  import HistoryChart, { type Bucket } from '../components/HistoryChart.svelte';
  import Drawer from '../components/Drawer.svelte';
  import { getClientSeries, getClientTraffic, getClients, getHistory } from '../lib/api';
  import { clientRows, type ClientRow } from '../lib/clientstats';
  import { live } from '../lib/live.svelte';
  import { bps, bytes, maxOf } from '../lib/format';
  import type { Client, ClientRange, ClientSeries, ClientTraffic, History, HistoryRange } from '../lib/types';

  const RANGES: { v: HistoryRange; label: string; span: number }[] = [
    { v: '1h', label: '1H', span: 3600 }, { v: '24h', label: '24H', span: 86400 }, { v: '7d', label: '7D', span: 604800 },
    { v: '30d', label: '30D', span: 2592000 }, { v: '90d', label: '90D', span: 7776000 },
  ];
  let range = $state<HistoryRange>('24h');
  let h = $state<History | null>(null);
  let dev = $state('');
  let err = $state('');
  let loading = $state(true);

  async function load() {
    try { h = await getHistory(range); err = ''; } catch (e) { err = e instanceof Error ? e.message : String(e); }
    loading = false;
  }
  onMount(() => { load(); getClients().then((c) => (clientList = c)).catch(() => {}); const t = setInterval(() => { load(); loadClients(); }, 30000); const stop = live.start(); return () => { clearInterval(t); stop(); }; });
  $effect(() => { range; loading = true; load(); });

  const span = $derived(RANGES.find((r) => r.v === range)!.span);

  // ---- per-client traffic (hourly data, up to 30 days)
  const C_SPAN: Record<ClientRange, number> = { '24h': 86400, '7d': 604800, '30d': 2592000 };
  const cRange = $derived<ClientRange>(range === '7d' ? '7d' : range === '30d' || range === '90d' ? '30d' : '24h');
  let ct = $state<ClientTraffic | null>(null);
  let clientList = $state<Client[]>([]);
  let selClient = $state<ClientRow | null>(null);
  let series = $state<ClientSeries | null>(null);
  async function loadClients() { try { ct = await getClientTraffic(cRange); } catch { ct = null; } }
  $effect(() => { cRange; loadClients(); });
  const allRows = $derived(clientRows(ct, clientList));

  // The General view lists every device once: per-device counters are not split by interface, so nothing is
  // counted twice. A device that left the network keeps its row while it still has traffic in the period.
  // Small ones (under 1 MB) are folded away unless asked for.
  const MIN = 1048576;
  let view = $state<'general' | 'interfaces'>('general');
  let filter = $state<'all' | 'online' | 'offline'>('all');
  let showAll = $state(false);
  let onlyHere = $state(false);
  // In the By interface view, the list can be narrowed to the devices connected to a Wi-Fi network or port now.
  const devOf = $derived(new Map(clientList.map((c) => [c.mac.toLowerCase(), c.link?.dev])));
  const canScope = $derived(view === 'interfaces' && !!dev && !isWan(dev) && live.devices[dev]?.type !== 'Bridge');
  const scoped = $derived(canScope && onlyHere);
  const pool = $derived(scoped ? allRows.filter((x) => devOf.get(x.mac.toLowerCase()) === dev) : allRows);
  const visible = $derived(showAll ? pool : pool.filter((r) => r.all >= MIN));
  const hiddenCount = $derived(pool.length - pool.filter((r) => r.all >= MIN).length);
  const counts = $derived({ all: visible.length, online: visible.filter((r) => r.online === true).length, offline: visible.filter((r) => r.online === false).length });
  const rows = $derived.by(() => {
    const r = visible.filter((x) => filter === 'all' || (filter === 'online' ? x.online === true : x.online === false));
    const top = Math.max(1, ...r.map((x) => x.all));
    return r.map((x) => ({ ...x, pct: (x.all / top) * 100 }));
  });
  function ago(t: number) {
    const d = Math.max(0, (ct?.now ?? Date.now() / 1000) - t);
    return d < 5400 ? `${Math.max(1, Math.round(d / 60))} min ago` : d < 129600 ? `${Math.round(d / 3600)} h ago` : `${Math.round(d / 86400)} d ago`;
  }
  async function openClient(r: ClientRow) {
    selClient = r; series = null;
    try { series = await getClientSeries(r.mac, cRange); } catch { series = { t: [], rx: [], tx: [] }; }
  }
  const cGrid = $derived.by(() => {
    if (!series?.now) return null;
    const step = 3600, end = Math.ceil(series.now / step) * step, n = Math.ceil(C_SPAN[cRange] / step), start = end - n * step;
    const data: Bucket[] = Array.from({ length: n }, (_, i) => ({ t: start + i * step, rx: 0, tx: 0 }));
    series.t.forEach((t, i) => { const k = Math.floor((t - start) / step); if (k >= 0 && k < n) { data[k].rx += series!.rx[i]; data[k].tx += series!.tx[i]; } });
    return { data, step, start, end, rx: sum(series.rx), tx: sum(series.tx) };
  });
  const cLabel = $derived(({ '24h': 'last 24 hours', '7d': 'last 7 days', '30d': 'last 30 days' } as const)[cRange]);
  const devices = $derived(Object.keys(h?.rx ?? {}));
  // default device: the WAN device when we know it, else the one with most traffic
  $effect(() => {
    if (devices.length && !devices.includes(dev)) {
      const wan = live.wan?.l3_device;
      dev = wan && devices.includes(wan) ? wan : [...devices].sort((a, b) => sum(h!.rx![b]) + sum(h!.tx![b]) - sum(h!.rx![a]) - sum(h!.tx![a]))[0];
    }
  });
  const sum = (a: number[] = []) => a.reduce((x, y) => x + y, 0);

  // Everything is shown from your devices' point of view: Download = data coming in from the Internet.
  // On a WAN link that is what the router receives; on a LAN-side interface (Wi-Fi, ports, the bridge) it is
  // what the router sends to the devices, so received/sent are swapped there.
  const wanDevs = $derived(new Set(live.wans.map((w) => w.iface.l3_device ?? w.dev).filter(Boolean) as string[]));
  function isWan(d: string) { return wanDevs.size ? wanDevs.has(d) : d === live.wan?.l3_device; }
  // General view: everything that crosses the Internet links (each byte crosses exactly one). Otherwise the chosen interface.
  const wanList = $derived(devices.filter((d) => isWan(d)));
  const selDevs = $derived(view === 'general' && wanList.length ? wanList : dev ? [dev] : []);
  // Orientation follows the interface actually plotted: on a LAN-side one, what the router sends is what devices download.
  const flip = $derived(selDevs.length === 1 && !isWan(selDevs[0]));
  const sumSeries = (m: Record<string, number[]> | undefined) => {
    const out: number[] = [];
    for (const d of selDevs) (m?.[d] ?? []).forEach((v, i) => (out[i] = (out[i] ?? 0) + v));
    return out;
  };

  // Resample onto a uniform grid so gaps (collector stopped) show as zero instead of stretching the line.
  // Very fine data (short intervals over long ranges) is merged so the chart never draws more than ~1500 points.
  const MAX_POINTS = 1500;
  const grid = $derived.by(() => {
    if (!h?.step || !h.now) return null;
    const base = h.step, end = Math.ceil(h.now / base) * base, n = Math.ceil(span / base), start = end - n * base;
    const rx0 = new Array(n).fill(0), tx0 = new Array(n).fill(0), R = sumSeries(h.rx), T = sumSeries(h.tx);
    (h.t ?? []).forEach((t, i) => { const k = Math.floor((t - start) / base); if (k >= 0 && k < n) { rx0[k] += R[i]; tx0[k] += T[i]; } });
    const agg = Math.max(1, Math.ceil(n / MAX_POINTS)), step = base * agg, m = Math.ceil(n / agg);
    const rx = new Array(m).fill(0), tx = new Array(m).fill(0);
    for (let i = 0; i < n; i++) { rx[Math.floor(i / agg)] += rx0[i]; tx[Math.floor(i / agg)] += tx0[i]; }
    // Interior gaps (collector was stopped) stay as zeros; only the not-yet-sampled tail is cut so the line
    // doesn't fall off a cliff at the right edge.
    const lastT = maxOf(h.t ?? []);
    const last = Math.min(m - 1, Math.max(0, Math.floor((lastT - start) / step)));
    const data: Bucket[] = [];
    // rx = Download, tx = Upload (see flip)
    for (let i = 0; i <= last; i++) data.push(flip ? { t: start + i * step, rx: tx[i], tx: rx[i] } : { t: start + i * step, rx: rx[i], tx: tx[i] });
    return { data, step, start, end };
  });

  const totals = $derived.by(() => {
    if (!grid) return null;
    const rx = sum(grid.data.map((b) => b.rx)), tx = sum(grid.data.map((b) => b.tx));
    let peakRx = 0, peakTx = 0;
    for (const b of grid.data) { peakRx = Math.max(peakRx, b.rx / grid.step); peakTx = Math.max(peakTx, b.tx / grid.step); }
    const covered = Math.max(1, Math.min(span, (h?.now ?? 0) - (h?.since ?? h?.now ?? 0)));
    return { rx, tx, peakRx, peakTx, avgRx: rx / covered, avgTx: tx / covered };
  });

  const perDevice = $derived.by(() => {
    if (!h?.t || !grid) return [];
    const total = devices.map((d) => {
      let rx = 0, tx = 0;
      h!.t!.forEach((t, i) => { if (t >= grid.start) { rx += h!.rx![d][i]; tx += h!.tx![d][i]; } });
      return isWan(d) ? { d, down: rx, up: tx, all: rx + tx } : { d, down: tx, up: rx, all: rx + tx };
    }).sort((a, b) => b.all - a.all);
    const top = Math.max(1, total[0]?.all ?? 1);
    return total.map((x) => ({ ...x, pct: (x.all / top) * 100 }));
  });
  const since = $derived(h?.since ? new Date(h.since * 1000).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '');
</script>

<div class="page">
  <div class="page-head">
    <h1>Traffic</h1>
    <div class="tools">
      <div class="seg" role="tablist" aria-label="View">
        <button role="tab" aria-selected={view === 'general'} class:on={view === 'general'} onclick={() => (view = 'general')}>General</button>
        <button role="tab" aria-selected={view === 'interfaces'} class:on={view === 'interfaces'} onclick={() => (view = 'interfaces')}>By interface</button>
      </div>
      {#if view === 'interfaces' && devices.length}<select class="input sel" bind:value={dev} aria-label="Interface">{#each devices as d}<option value={d}>{d}{d === live.wan?.l3_device ? ' (Internet)' : ''}</option>{/each}</select>{/if}
      <div class="seg" role="tablist">{#each RANGES as r}<button role="tab" aria-selected={range === r.v} class:on={range === r.v} onclick={() => (range = r.v)}>{r.label}</button>{/each}</div>
    </div>
  </div>

  {#if err}
    <div class="card"><p class="muted">Could not read traffic history: {err}</p></div>
  {:else if h && !h.running && !h.t}
    <div class="card empty">
      <Icon name="stats" size={34} /><h2>The history collector isn't running</h2>
      <p class="muted">Lumen records traffic with a tiny background service. Install it by running <code>npm run deploy</code>, or on the router: <code>/etc/init.d/lumen-history enable &amp;&amp; /etc/init.d/lumen-history start</code>.</p>
    </div>
  {:else if h && h.running && !h.t?.length}
    <div class="card empty">
      <Icon name="refresh" size={34} /><h2>Collecting the first data points</h2>
      <p class="muted">The history collector is running and samples traffic every {Math.round((h.step ?? 300) / 60)} min. The first point appears shortly; charts fill in as time goes by.</p>
    </div>
  {:else if grid && totals}
    <div class="stats">
      <div class="card"><span class="k">Download</span><b class="v num" style="color:var(--rx)"><Icon name="down" size={18} />{bytes(totals.rx)}</b><small class="faint">peak {bps(totals.peakRx)} · {flip ? 'sent to devices' : 'received from the Internet'}</small></div>
      <div class="card"><span class="k">Upload</span><b class="v num" style="color:var(--tx)"><Icon name="up" size={18} />{bytes(totals.tx)}</b><small class="faint">peak {bps(totals.peakTx)} · {flip ? 'sent by devices' : 'sent to the Internet'}</small></div>
      <div class="card"><span class="k">Average</span><b class="v num">{bps(totals.avgRx + totals.avgTx)}</b><small class="faint">↓ {bps(totals.avgRx)} · ↑ {bps(totals.avgTx)}</small></div>
      <div class="card"><span class="k">Recording since</span><b class="v sm">{since || '—'}</b><small class="faint">{h?.running ? 'collector running' : 'collector stopped'}</small></div>
    </div>

    <div class="card" style="margin-top:16px" class:dim={loading}>
      <div class="card-title">
        <h2>{view === 'general' ? (wanList.length ? `Internet · ${wanList.join(', ')}` : `${dev} (no Internet link found)`) : dev} <span class="faint">· {RANGES.find((r) => r.v === range)!.label}</span></h2>
        <span class="legend"><i style="background:var(--rx)"></i>Download <i style="background:var(--tx)"></i>Upload</span>
      </div>
      <HistoryChart data={grid.data} step={grid.step} start={grid.start} end={grid.end} labels={['Download', 'Upload']} />
    </div>

    <div class="card" style="margin-top:16px">
      <div class="card-title"><h2>Devices{scoped ? ` on ${dev}` : ''} <span class="faint">· {cLabel}</span></h2>{#if range === '90d'}<span class="faint small">per-device data is kept for 30 days</span>{/if}</div>
      {#if ct?.offload}
        <p class="warn"><Icon name="alert" size={16} />Flow offloading is enabled on this router: established connections bypass the counters, so these numbers are lower than reality.</p>
      {/if}
      {#if !ct}
        <p class="muted">Per-device data is unavailable. Deploy the latest collector (<code>npm run deploy</code>).</p>
      {:else if !ct.enabled}
        <p class="muted">Per-device accounting is turned off (<code>option clients '0'</code> in <code>/etc/config/lumen</code>).</p>
      {:else if !allRows.length}
        <p class="muted">No device traffic recorded yet. Lumen counts what LAN devices send and receive <em>through</em> the router (mostly Internet use); it appears here a few minutes after the first connections.</p>
      {:else}
        <div class="filters">
          <div class="seg" role="tablist" aria-label="Show devices">
            <button role="tab" aria-selected={filter === 'all'} class:on={filter === 'all'} onclick={() => (filter = 'all')}>All <span class="cnt">{counts.all}</span></button>
            <button role="tab" aria-selected={filter === 'online'} class:on={filter === 'online'} onclick={() => (filter = 'online')}>Connected now <span class="cnt">{counts.online}</span></button>
            <button role="tab" aria-selected={filter === 'offline'} class:on={filter === 'offline'} onclick={() => (filter = 'offline')}>Not connected <span class="cnt">{counts.offline}</span></button>
          </div>
          {#if canScope}<label class="opt"><input type="checkbox" bind:checked={onlyHere} />Only devices connected to {dev} now</label>{/if}
          {#if hiddenCount > 0 || showAll}<button class="linkbtn" onclick={() => (showAll = !showAll)}>{showAll ? 'Hide devices under 1 MB' : `Show ${hiddenCount} more under 1 MB`}</button>{/if}
        </div>
        {#if !rows.length}
          <p class="muted">{scoped ? `No device connected to ${dev} right now has recorded traffic in this period.` : 'No devices match this filter.'}</p>
        {:else}
          <div class="tw"><table class="tbl">
            <thead><tr><th>Device</th><th>Download</th><th>Upload</th><th>Total</th><th class="bar"></th></tr></thead>
            <tbody>
              {#each rows as r (r.mac)}
                <tr class="click" class:gone={r.online === false} tabindex="0" onclick={() => openClient(r)} onkeydown={(e) => e.key === 'Enter' && openClient(r)}>
                  <td><span class="who"><span class="cico"><Glyph brand={r.brand} icon={r.kind} size={16} /></span><span class="nm"><b>{r.name}</b><small class="faint">{r.sub}</small></span>{#if r.online === false}<span class="away">{r.last ? `Active ${ago(r.last)}` : 'Not connected'}</span>{/if}</span></td>
                  <td class="num" style="color:var(--rx)">{bytes(r.rx)}</td><td class="num" style="color:var(--tx)">{bytes(r.tx)}</td><td class="num"><b>{bytes(r.all)}</b></td>
                  <td class="bar"><i style:width="{r.pct}%"></i></td>
                </tr>
              {/each}
            </tbody>
          </table></div>
        {/if}
      {/if}
    </div>

    {#if view === 'interfaces'}
    <div class="card" style="margin-top:16px">
      <div class="card-title"><h2>By interface</h2></div>
      <div class="tw"><table class="tbl">
        <thead><tr><th>Interface</th><th>Download</th><th>Upload</th><th>Total</th><th class="bar"></th></tr></thead>
        <tbody>
          {#each perDevice as p (p.d)}
            <tr class="click" class:sel={p.d === dev} tabindex="0" onclick={() => (dev = p.d)} onkeydown={(e) => e.key === 'Enter' && (dev = p.d)}>
              <td class="mono"><b>{p.d}</b>{#if isWan(p.d)}<small class="faint tagi">Internet</small>{/if}</td><td class="num">{bytes(p.down)}</td><td class="num">{bytes(p.up)}</td><td class="num"><b>{bytes(p.all)}</b></td>
              <td class="bar"><i style:width="{p.pct}%"></i></td>
            </tr>
          {/each}
        </tbody>
      </table></div>
    </div>
    {/if}
  {:else}
    <div class="card"><p class="muted">Loading…</p></div>
  {/if}
</div>

<Drawer open={!!selClient} title={selClient?.name ?? ''} onclose={() => { selClient = null; series = null; }}>
  {#if selClient}
    <p class="muted" style="margin-bottom:14px">{selClient.sub}</p>
    {#if cGrid}
      <HistoryChart data={cGrid.data} step={cGrid.step} start={cGrid.start} end={cGrid.end} height={170} labels={['Download', 'Upload']} />
      <div style="margin-top:18px">
        <div class="stat-row"><span>Downloaded</span><b class="num" style="color:var(--rx)">{bytes(cGrid.rx)}</b></div>
        <div class="stat-row"><span>Uploaded</span><b class="num" style="color:var(--tx)">{bytes(cGrid.tx)}</b></div>
        <div class="stat-row"><span>Period</span><b>{cLabel}</b></div>
        {#if selClient.mac !== '?'}<div class="stat-row"><span>MAC</span><b class="mono">{selClient.mac}</b></div>{/if}
      </div>
    {:else}<p class="muted">Loading…</p>{/if}
  {/if}
</Drawer>

<style>
  .tools { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  .sel { width: auto; min-width: 150px; }
  .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
  .stats .card { display: grid; gap: 4px; }
  .k { color: var(--text-2); font-size: 13px; }
  .v { font-size: 24px; font-weight: 650; display: inline-flex; align-items: center; gap: 4px; }
  .v.sm { font-size: 16px; line-height: 1.5; }
  .small { font-size: 12px; }
  .filters { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; margin: 0 0 12px; }
  .cnt { color: var(--text-3); font-weight: 400; margin-left: 4px; }
  .opt { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-2); }
  tr.gone .who, tr.gone .num, tr.gone td.bar i { opacity: .62; }
  .away { margin-left: 4px; font-size: 12px; color: var(--text-3); background: var(--surface-2); border-radius: 999px; padding: 2px 9px; white-space: nowrap; }
  .tagi { margin-left: 8px; font-family: var(--font); }
  .linkbtn { background: none; border: 0; padding: 0; color: var(--accent); font: inherit; cursor: pointer; }
  .warn { display: flex; gap: 8px; align-items: center; background: color-mix(in srgb, var(--warn) 14%, transparent); border-radius: 8px; padding: 9px 12px; font-size: 13px; margin: -4px 0 12px; }
  .warn :global(svg) { color: var(--warn); flex: none; }
  .who { display: inline-flex; align-items: center; gap: 12px; }
  .cico { width: 30px; height: 30px; border-radius: 8px; background: var(--surface-2); color: var(--text-2); display: grid; place-items: center; flex: none; }
  .nm { display: grid; line-height: 1.25; } .nm small { font-size: 12px; }
  code { background: var(--surface-2); padding: 1px 6px; border-radius: 5px; font-size: 12.5px; }
  .legend { font-size: 13px; color: var(--text-2); display: inline-flex; align-items: center; gap: 6px; }
  .legend i { width: 9px; height: 9px; border-radius: 3px; display: inline-block; margin-left: 10px; }
  .dim { opacity: .7; transition: opacity .15s; }
  .empty { display: grid; justify-items: center; text-align: center; gap: 10px; padding: 48px 24px; color: var(--text-2); }
  .empty code { background: var(--surface-2); padding: 1px 6px; border-radius: 5px; font-size: 12.5px; }
  .empty p { max-width: 560px; }
  td.bar, th.bar { width: 32%; } td.bar i { display: block; height: 6px; border-radius: 99px; background: var(--accent); opacity: .75; }
  @media (max-width: 900px) { .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
