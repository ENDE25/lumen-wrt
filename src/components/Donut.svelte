<script lang="ts">
  export interface Seg { label: string; value: number; color: string }
  let { segs, size = 150, thickness = 16, center = '', sub = '' }:
    { segs: Seg[]; size?: number; thickness?: number; center?: string; sub?: string } = $props();

  const r = $derived((size - thickness) / 2);
  const C = $derived(2 * Math.PI * r);
  const total = $derived(segs.reduce((a, s) => a + s.value, 0));
  const arcs = $derived.by(() => {
    let off = 0;
    return segs.map((s) => {
      const len = total ? (s.value / total) * C : 0;
      const a = { ...s, len, off };
      off += len;
      return a;
    });
  });
</script>

<div class="donut" style:width="{size}px" style:height="{size}px">
  <svg width={size} height={size} viewBox="0 0 {size} {size}" role="img" aria-label={center}>
    <circle cx={size / 2} cy={size / 2} {r} fill="none" stroke="var(--surface-2)" stroke-width={thickness} />
    <g transform="rotate(-90 {size / 2} {size / 2})">
      {#each arcs as a}
        {#if a.len > 0}
          <circle cx={size / 2} cy={size / 2} {r} fill="none" stroke={a.color} stroke-width={thickness}
            stroke-dasharray="{Math.max(0, a.len - 2)} {C}" stroke-dashoffset={-a.off} />
        {/if}
      {/each}
    </g>
  </svg>
  <div class="mid"><b class="num">{center}</b>{#if sub}<span>{sub}</span>{/if}</div>
</div>

<style>
  .donut { position: relative; flex: none; }
  svg { display: block; }
  circle { transition: stroke-dasharray .4s, stroke-dashoffset .4s; }
  .mid { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; }
  .mid b { font-size: 22px; font-weight: 650; line-height: 1.1; }
  .mid span { font-size: 12px; color: var(--text-2); }
</style>
