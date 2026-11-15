<script lang="ts">
  // Small single-series area chart for percentages (CPU, memory).
  let { data = [], color = 'var(--accent)', height = 110, max = 100, unit = '%' }:
    { data: number[]; color?: string; height?: number; max?: number; unit?: string } = $props();
  const W = 600, id = `g${Math.random().toString(36).slice(2, 7)}`;
  let hover = $state<number | null>(null);
  const x = (i: number) => (data.length < 2 ? 0 : (i / (data.length - 1)) * W);
  const y = (v: number) => height - (Math.min(v, max) / max) * (height - 6) - 2;
  const line = $derived(data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' '));
  function move(e: PointerEvent) {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    hover = data.length ? Math.min(data.length - 1, Math.max(0, Math.round(((e.clientX - r.left) / r.width) * (data.length - 1)))) : null;
  }
</script>
<div class="lc" style:height="{height}px">
  <svg viewBox="0 0 {W} {height}" preserveAspectRatio="none" role="img" onpointermove={move} onpointerleave={() => (hover = null)}>
    <defs><linearGradient {id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color={color} stop-opacity=".3"/><stop offset="1" stop-color={color} stop-opacity="0"/></linearGradient></defs>
    {#each [0, 0.5, 1] as f}<line x1="0" x2={W} y1={height - f * (height - 6) - 2} y2={height - f * (height - 6) - 2} stroke="var(--border)" stroke-dasharray={f ? '3 4' : ''} vector-effect="non-scaling-stroke" />{/each}
    {#if data.length > 1}
      <path d="{line} L{W},{height} L0,{height} Z" fill="url(#{id})" />
      <path d={line} fill="none" stroke={color} stroke-width="1.8" vector-effect="non-scaling-stroke" stroke-linejoin="round" />
    {/if}
    {#if hover !== null}<line x1={x(hover)} x2={x(hover)} y1="0" y2={height} stroke="var(--text-3)" vector-effect="non-scaling-stroke" />{/if}
  </svg>
  {#if hover !== null && data[hover] !== undefined}
    <div class="tip num" style:left="{(hover / Math.max(1, data.length - 1)) * 100}%" class:flip={hover > data.length * 0.7}>{data[hover]}{unit}</div>
  {/if}
</div>
<style>
  .lc { position: relative; }
  svg { width: 100%; height: 100%; display: block; touch-action: none; }
  .tip { position: absolute; top: 2px; transform: translateX(8px); background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 2px 7px; font-size: 12px; font-weight: 600; pointer-events: none; box-shadow: var(--shadow); }
  .tip.flip { transform: translateX(calc(-100% - 8px)); }
</style>
