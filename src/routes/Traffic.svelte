<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import HistoryChart, { type Bucket } from '../components/HistoryChart.svelte';
  import { getHistory } from '../lib/api';
  import { live } from '../lib/live.svelte';
  import { bps, bytes, maxOf } from '../lib/format';
  import type { History, HistoryRange } from '../lib/types';

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
  onMount(() => { load(); const t = setInterval(load, 30000); const stop = live.start(); return () => { clearInterval(t); stop(); }; });
  $effect(() => { range; loading = true; load(); });

  const span = $derived(RANGES.find((r) => r.v === range)!.span);
  const devices = $derived(Object.keys(h?.rx ?? {}));
  // default device: the WAN device when we know it, else the one with most traffic
  $effect(() => {
    if (devices.length && !devices.includes(dev)) {
      const wan = live.wan?.l3_device;
      dev = wan && devices.includes(wan) ? wan : [...devices].sort((a, b) => sum(h!.rx![b]) + sum(h!.tx![b]) - sum(h!.rx![a]) - sum(h!.tx![a]))[0];
    }
  });
  const sum = (a: number[] = []) => a.reduce((x, y) => x + y, 0);

  // Resample onto a uniform grid so gaps (collector stopped) show as zero instead of stretching the line.
  // Very fine data (short intervals over long ranges) is merged so the chart never draws more than ~1500 points.
  const MAX_POINTS = 1500;
  const grid = $derived.by(() => {
    if (!h?.step || !h.now) return null;
    const base = h.step, end = Math.ceil(h.now / base) * base, n = Math.ceil(span / base), start = end - n * base;
    const rx0 = new Array(n).fill(0), tx0 = new Array(n).fill(0), R = h.rx?.[dev] ?? [], T = h.tx?.[dev] ?? [];
    (h.t ?? []).forEach((t, i) => { const k = Math.floor((t - start) / base); if (k >= 0 && k < n) { rx0[k] += R[i]; tx0[k] += T[i]; } });
    const agg = Math.max(1, Math.ceil(n / MAX_POINTS)), step = base * agg, m = Math.ceil(n / agg);
    const rx = new Array(m).fill(0), tx = new Array(m).fill(0);
    for (let i = 0; i < n; i++) { rx[Math.floor(i / agg)] += rx0[i]; tx[Math.floor(i / agg)] += tx0[i]; }
    // Interior gaps (collector was stopped) stay as zeros; only the not-yet-sampled tail is cut so the line
    // doesn't fall off a cliff at the right edge.
    const lastT = maxOf(h.t ?? []);
    const last = Math.min(m - 1, Math.max(0, Math.floor((lastT - start) / step)));
    const data: Bucket[] = [];
    for (let i = 0; i <= last; i++) data.push({ t: start + i * step, rx: rx[i], tx: tx[i] });
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
      return { d, rx, tx, all: rx + tx };
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
      {#if devices.length}<select class="input sel" bind:value={dev} aria-label="Interface">{#each devices as d}<option value={d}>{d}{d === live.wan?.l3_device ? ' (Internet)' : ''}</option>{/each}</select>{/if}
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
      <div class="card"><span class="k">Received</span><b class="v num" style="color:var(--rx)"><Icon name="down" size={18} />{bytes(totals.rx)}</b><small class="faint">peak {bps(totals.peakRx)}</small></div>
      <div class="card"><span class="k">Sent</span><b class="v num" style="color:var(--tx)"><Icon name="up" size={18} />{bytes(totals.tx)}</b><small class="faint">peak {bps(totals.peakTx)}</small></div>
      <div class="card"><span class="k">Average</span><b class="v num">{bps(totals.avgRx + totals.avgTx)}</b><small class="faint">↓ {bps(totals.avgRx)} · ↑ {bps(totals.avgTx)}</small></div>
      <div class="card"><span class="k">Recording since</span><b class="v sm">{since || '—'}</b><small class="faint">{h?.running ? 'collector running' : 'collector stopped'}</small></div>
    </div>

    <div class="card" style="margin-top:16px" class:dim={loading}>
      <div class="card-title">
        <h2>{dev} <span class="faint">· {RANGES.find((r) => r.v === range)!.label}</span></h2>
        <span class="legend"><i style="background:var(--rx)"></i>Received <i style="background:var(--tx)"></i>Sent</span>
      </div>
      <HistoryChart data={grid.data} step={grid.step} start={grid.start} end={grid.end} />
    </div>

    <div class="card" style="margin-top:16px">
      <div class="card-title"><h2>By interface</h2></div>
      <div class="tw"><table class="tbl">
        <thead><tr><th>Interface</th><th>Received</th><th>Sent</th><th>Total</th><th class="bar"></th></tr></thead>
        <tbody>
          {#each perDevice as p (p.d)}
            <tr class="click" class:sel={p.d === dev} tabindex="0" onclick={() => (dev = p.d)} onkeydown={(e) => e.key === 'Enter' && (dev = p.d)}>
              <td class="mono"><b>{p.d}</b></td><td class="num">{bytes(p.rx)}</td><td class="num">{bytes(p.tx)}</td><td class="num"><b>{bytes(p.all)}</b></td>
              <td class="bar"><i style:width="{p.pct}%"></i></td>
            </tr>
          {/each}
        </tbody>
      </table></div>
    </div>
  {:else}
    <div class="card"><p class="muted">Loading…</p></div>
  {/if}
</div>

<style>
  .tools { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  .sel { width: auto; min-width: 150px; }
  .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
  .stats .card { display: grid; gap: 4px; }
  .k { color: var(--text-2); font-size: 13px; }
  .v { font-size: 24px; font-weight: 650; display: inline-flex; align-items: center; gap: 4px; }
  .v.sm { font-size: 16px; line-height: 1.5; }
  .legend { font-size: 13px; color: var(--text-2); display: inline-flex; align-items: center; gap: 6px; }
  .legend i { width: 9px; height: 9px; border-radius: 3px; display: inline-block; margin-left: 10px; }
  .dim { opacity: .7; transition: opacity .15s; }
  .empty { display: grid; justify-items: center; text-align: center; gap: 10px; padding: 48px 24px; color: var(--text-2); }
  .empty code { background: var(--surface-2); padding: 1px 6px; border-radius: 5px; font-size: 12.5px; }
  .empty p { max-width: 560px; }
  td.bar, th.bar { width: 32%; } td.bar i { display: block; height: 6px; border-radius: 99px; background: var(--accent); opacity: .75; }
  @media (max-width: 900px) { .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
