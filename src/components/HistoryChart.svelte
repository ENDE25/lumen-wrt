<script lang="ts">
  import { bps, bytes, maxOf } from '../lib/format';

  export interface Bucket { t: number; rx: number; tx: number }   // bytes in the bucket
  let { data = [], step, start, end, height = 260, labels = ['Received', 'Sent'] }: { data: Bucket[]; step: number; start: number; end: number; height?: number; labels?: [string, string] } = $props();

  const W = 900;
  let hover = $state<number | null>(null);
  const span = $derived(Math.max(1, end - start));

  const max = $derived.by(() => {
    let m = 1e6;
    for (const b of data) m = Math.max(m, (Math.max(b.rx, b.tx) * 8) / step);
    const pow = 10 ** Math.floor(Math.log10(m));
    return ((([1, 2, 2.5, 5, 10].find((k) => k * pow >= m) ?? 10) * pow) / 8);
  });
  const x = (t: number) => ((t - start) / span) * W;
  const y = (bytesPerBucket: number) => height - (bytesPerBucket / step / max) * (height - 8) - 2;
  const line = (k: 'rx' | 'tx') => data.map((b, i) => `${i ? 'L' : 'M'}${x(b.t).toFixed(1)},${y(b[k]).toFixed(1)}`).join(' ');
  const area = (k: 'rx' | 'tx') => (data.length > 1 ? `${line(k)} L${x(data[data.length - 1].t).toFixed(1)},${height} L${x(data[0].t).toFixed(1)},${height} Z` : '');

  const ticks = $derived([0, 0.25, 0.5, 0.75, 1].map((f) => ({ f, label: bps(max * f) })));
  const long = $derived(span > 2 * 86400);
  const xt = $derived([0, 0.25, 0.5, 0.75, 1].map((f) => {
    const d = new Date((start + span * f) * 1000);
    return { f, label: long ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
  }));

  function move(e: PointerEvent) {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const t = start + ((e.clientX - r.left) / r.width) * span;
    let best = -1, bd = Infinity;
    data.forEach((b, i) => { const d = Math.abs(b.t - t); if (d < bd) { bd = d; best = i; } });
    hover = best >= 0 && bd <= step * 1.5 ? best : null;
  }
  const hp = $derived(hover !== null ? data[hover] : null);
  const when = (t: number) => new Date(t * 1000).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
</script>

<div class="hc" style:height="{height + 26}px">
  <div class="axis">{#each ticks as t}<span style:bottom="{26 + t.f * (height - 8) + 2}px">{t.label}</span>{/each}</div>
  <svg viewBox="0 0 {W} {height}" preserveAspectRatio="none" role="img" aria-label="Traffic history" onpointermove={move} onpointerleave={() => (hover = null)} style:height="{height}px">
    <defs>
      <linearGradient id="hrx" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--rx)" stop-opacity=".32"/><stop offset="1" stop-color="var(--rx)" stop-opacity="0"/></linearGradient>
      <linearGradient id="htx" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--tx)" stop-opacity=".28"/><stop offset="1" stop-color="var(--tx)" stop-opacity="0"/></linearGradient>
    </defs>
    {#each ticks as t}<line x1="0" x2={W} y1={height - t.f * (height - 8) - 2} y2={height - t.f * (height - 8) - 2} stroke="var(--border)" stroke-dasharray={t.f ? '3 4' : ''} vector-effect="non-scaling-stroke" />{/each}
    <path d={area('rx')} fill="url(#hrx)" /><path d={area('tx')} fill="url(#htx)" />
    <path d={line('rx')} fill="none" stroke="var(--rx)" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round" />
    <path d={line('tx')} fill="none" stroke="var(--tx)" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round" />
    {#if hp}<line x1={x(hp.t)} x2={x(hp.t)} y1="0" y2={height} stroke="var(--text-3)" vector-effect="non-scaling-stroke" />{/if}
  </svg>
  <div class="xaxis">{#each xt as t}<span style:left="{t.f * 100}%">{t.label}</span>{/each}</div>
  {#if hp}
    <div class="tip" style:left="{(x(hp.t) / W) * 100}%" class:flip={x(hp.t) / W > 0.65}>
      <time>{when(hp.t)}</time>
      <div><i style="background:var(--rx)"></i>{labels[0]} <b class="num">{bytes(hp.rx)}</b> <span class="faint">{bps(hp.rx / step)}</span></div>
      <div><i style="background:var(--tx)"></i>{labels[1]} <b class="num">{bytes(hp.tx)}</b> <span class="faint">{bps(hp.tx / step)}</span></div>
    </div>
  {/if}
  {#if !data.length}<p class="empty muted">No data in this range yet</p>{/if}
</div>

<style>
  .hc { position: relative; padding-left: 66px; margin-top: 12px; }
  svg { width: 100%; display: block; touch-action: none; }
  .axis { position: absolute; left: 0; top: 0; bottom: 0; width: 60px; font-size: 11px; color: var(--text-3); }
  .axis span { position: absolute; right: 8px; transform: translateY(50%); white-space: nowrap; font-variant-numeric: tabular-nums; }
  .xaxis { position: relative; height: 26px; font-size: 11px; color: var(--text-3); }
  .xaxis span { position: absolute; top: 8px; transform: translateX(-50%); white-space: nowrap; }
  .xaxis span:first-child { transform: none; } .xaxis span:last-child { transform: translateX(-100%); }
  .tip { position: absolute; top: 6px; transform: translateX(12px); margin-left: 66px; pointer-events: none; background: var(--surface); border: 1px solid var(--border); box-shadow: var(--shadow-lg); border-radius: 8px; padding: 8px 11px; font-size: 12px; min-width: 200px; z-index: 2; }
  .tip.flip { transform: translateX(calc(-100% - 12px)); }
  .tip time { display: block; color: var(--text-3); margin-bottom: 4px; }
  .tip div { display: flex; align-items: center; gap: 7px; } .tip b { margin-left: auto; font-weight: 600; } .tip i { width: 8px; height: 8px; border-radius: 2px; display: inline-block; }
  .empty { position: absolute; inset: 0 0 26px 66px; display: grid; place-items: center; }
</style>
