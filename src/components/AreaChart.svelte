<script lang="ts">
  import type { RatePoint } from '../lib/types';
  import { bps } from '../lib/format';

  let { data = [], height = 220 }: { data: RatePoint[]; height?: number } = $props();

  const W = 800;
  let hover = $state<number | null>(null);

  // "nice" ceiling so the axis doesn't jitter every tick
  const max = $derived.by(() => {
    const m = Math.max(1e6, ...data.map((p) => Math.max(p.rx, p.tx) * 8)); // bits/s, 1 Mbps floor
    const pow = 10 ** Math.floor(Math.log10(m));
    const n = [1, 2, 2.5, 5, 10].find((k) => k * pow >= m) ?? 10;
    return (n * pow) / 8;
  });

  const x = (i: number) => (data.length < 2 ? 0 : (i / (data.length - 1)) * W);
  const y = (v: number) => height - (v / max) * (height - 8) - 2;
  const line = (k: 'rx' | 'tx') => data.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(' ');
  const area = (k: 'rx' | 'tx') => data.length > 1 ? `${line(k)} L${W},${height} L0,${height} Z` : '';

  const ticks = $derived([0, 0.25, 0.5, 0.75, 1].map((f) => ({ f, label: bps(max * f) })));

  function move(e: PointerEvent) {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const f = (e.clientX - r.left) / r.width;
    hover = data.length ? Math.min(data.length - 1, Math.max(0, Math.round(f * (data.length - 1)))) : null;
  }
  const hp = $derived(hover !== null ? data[hover] : null);
</script>

<div class="chart" style:height="{height}px">
  <div class="axis">
    {#each ticks as t}<span style:bottom="{t.f * 100}%">{t.label}</span>{/each}
  </div>
  <svg viewBox="0 0 {W} {height}" preserveAspectRatio="none" role="img" aria-label="Live traffic"
    onpointermove={move} onpointerleave={() => (hover = null)}>
    <defs>
      <linearGradient id="grx" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--rx)" stop-opacity=".32"/><stop offset="1" stop-color="var(--rx)" stop-opacity="0"/></linearGradient>
      <linearGradient id="gtx" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--tx)" stop-opacity=".28"/><stop offset="1" stop-color="var(--tx)" stop-opacity="0"/></linearGradient>
    </defs>
    {#each ticks as t}<line x1="0" x2={W} y1={height - t.f * (height - 8) - 2} y2={height - t.f * (height - 8) - 2} stroke="var(--border)" stroke-dasharray={t.f ? '3 4' : ''} vector-effect="non-scaling-stroke" />{/each}
    <path d={area('rx')} fill="url(#grx)" />
    <path d={area('tx')} fill="url(#gtx)" />
    <path d={line('rx')} fill="none" stroke="var(--rx)" stroke-width="1.8" vector-effect="non-scaling-stroke" stroke-linejoin="round" />
    <path d={line('tx')} fill="none" stroke="var(--tx)" stroke-width="1.8" vector-effect="non-scaling-stroke" stroke-linejoin="round" />
    {#if hover !== null}<line x1={x(hover)} x2={x(hover)} y1="0" y2={height} stroke="var(--text-3)" vector-effect="non-scaling-stroke" />{/if}
  </svg>
  {#if hp && hover !== null}
    <div class="tip" style:left="{(hover / Math.max(1, data.length - 1)) * 100}%" class:flip={hover > data.length * 0.65}>
      <time>{new Date(hp.t).toLocaleTimeString()}</time>
      <div><i style="background:var(--rx)"></i>Download <b class="num">{bps(hp.rx)}</b></div>
      <div><i style="background:var(--tx)"></i>Upload <b class="num">{bps(hp.tx)}</b></div>
    </div>
  {/if}
  {#if data.length < 2}<p class="empty muted">Collecting data…</p>{/if}
</div>

<style>
  .chart { position: relative; padding-left: 62px; }
  svg { width: 100%; height: 100%; display: block; touch-action: none; }
  .axis { position: absolute; left: 0; top: 0; bottom: 0; width: 56px; font-size: 11px; color: var(--text-3); }
  .axis span { position: absolute; right: 8px; transform: translateY(50%); white-space: nowrap; font-variant-numeric: tabular-nums; }
  .tip {
    position: absolute; top: 6px; transform: translateX(12px); margin-left: 62px; pointer-events: none;
    background: var(--surface); border: 1px solid var(--border); box-shadow: var(--shadow-lg);
    border-radius: 8px; padding: 8px 11px; font-size: 12px; min-width: 150px;
  }
  .tip.flip { transform: translateX(calc(-100% - 12px)); }
  .tip time { display: block; color: var(--text-3); margin-bottom: 4px; }
  .tip div { display: flex; align-items: center; gap: 7px; }
  .tip b { margin-left: auto; font-weight: 600; }
  .tip i { width: 8px; height: 8px; border-radius: 2px; display: inline-block; }
  .empty { position: absolute; inset: 0; display: grid; place-items: center; }
</style>
