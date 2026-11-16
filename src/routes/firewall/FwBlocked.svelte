<script lang="ts">
  import { onMount } from 'svelte';
  import Toggle from '../../components/Toggle.svelte';
  import { getBlocks, summarize, PORT_NAME, type FwStats } from '../../lib/fwlog';
  import { sectionOps, type UciOp } from '../../lib/uci';
  import type { Firewall } from '../../lib/firewall';

  let { fw, onapply }: { fw: Firewall; onapply: (ops: UciOp[], label: string) => void } = $props();

  let st = $state<FwStats | null>(null);
  let hover = $state<number | null>(null);

  // Logging is optional: it is switched on per zone, only for zones that face the internet (NAT zones, or one called "wan").
  const wanZones = $derived(fw.zones.filter((z) => z.masq || z.name === 'wan'));
  const on = $derived(wanZones.length > 0 && wanZones.every((z) => String(z.raw.log ?? '') === '1'));

  function setLogging(v: boolean) {
    const ops = wanZones.flatMap((z) => sectionOps('firewall', z.section, z.raw, v ? { log: '1', log_limit: '10/minute' } : { log: undefined, log_limit: undefined }, 'zone'));
    onapply(ops, v ? 'Blocked-traffic logging enabled' : 'Blocked-traffic logging disabled');
  }

  const load = () => getBlocks().then((b) => (st = summarize(b))).catch(() => (st = summarize([])));
  $effect(() => { on; load(); });   // refresh right after logging is switched on or off
  onMount(() => { const t = setInterval(load, 15000); return () => clearInterval(t); });

  const W = 800, H = 150;
  const max = $derived(Math.max(4, ...(st?.buckets ?? [0])));
  const bw = $derived(W / (st?.buckets.length ?? 24));
  const hhmm = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const label = (k: string) => { const n = PORT_NAME[parseInt(k)]; return n ? `${k} · ${n}` : k; };
  const topN = (l: [string, number][]) => Math.max(1, l[0]?.[1] ?? 1);
</script>

<div class="card head">
  <div>
    <h2>Blocked traffic</h2>
    <p class="muted small">Connections your firewall dropped or rejected on the internet-facing zone{wanZones.length === 1 ? '' : 's'} {wanZones.map((z) => z.name).join(', ') || '(none found)'}. Counted from the system log only while this page is open, so nothing runs in the background.</p>
  </div>
  <Toggle checked={on} label={on ? 'Logging on' : 'Logging off'} disabled={!wanZones.length} onchange={setLogging} />
</div>

{#if !on && !st?.total}
  <div class="card empty">
    <p><b>Logging is off.</b></p>
    <p class="muted">Turn it on to see who is knocking at your router: blocked attempts per hour, top sources and most targeted ports. It is limited to 10 entries per minute to keep the log small. You can turn it off at any time.</p>
  </div>
{:else if st}
  <div class="grid g3 kpis">
    <div class="card k"><span>Blocked (last 24 h)</span><b class="num">{st.total.toLocaleString()}</b></div>
    <div class="card k"><span>Different sources</span><b class="num">{st.unique.toLocaleString()}</b></div>
    <div class="card k"><span>Most targeted port</span><b>{st.ports[0] ? label(st.ports[0][0]) : '—'}</b></div>
  </div>

  <div class="card">
    <div class="card-title"><h2>Blocked over time</h2><span class="faint small">{st.total ? `since ${hhmm(st.since)}` : 'nothing blocked yet'}{hover !== null ? ` · ${hhmm(st.start + hover * st.bucketMs)}: ${st.buckets[hover]}` : ''}</span></div>
    <svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" style="width:100%;height:{H}px" role="img" aria-label="Blocked connections over time">
      {#each st.buckets as v, i}
        <rect x={i * bw + 2} y={H - (v / max) * (H - 6) - 2} width={bw - 4} height={Math.max(2, (v / max) * (H - 6))} rx="3" class="bar" class:hot={hover === i}
          onmouseenter={() => (hover = i)} onmouseleave={() => (hover = null)} role="presentation" />
      {/each}
    </svg>
  </div>

  <div class="grid g2">
    <div class="card">
      <div class="card-title"><h2>Top sources</h2></div>
      {#each st.sources as [ip, n]}
        <div class="row"><span class="mono">{ip}</span><i style:width="{(n / topN(st.sources)) * 100}%"></i><b class="num">{n}</b></div>
      {:else}<p class="muted small">No data yet.</p>{/each}
    </div>
    <div class="card">
      <div class="card-title"><h2>Top ports</h2></div>
      {#each st.ports as [p, n]}
        <div class="row"><span>{label(p)}</span><i style:width="{(n / topN(st.ports)) * 100}%"></i><b class="num">{n}</b></div>
      {:else}<p class="muted small">No data yet.</p>{/each}
    </div>
  </div>
{/if}

<style>
  .head { display: flex; justify-content: space-between; align-items: center; gap: 20px; margin-bottom: 16px; }
  .head h2 { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
  .head p { max-width: 62ch; }
  .empty { text-align: center; padding: 36px 20px; }
  .empty p { margin: 4px auto; max-width: 56ch; }
  .g3 { grid-template-columns: repeat(3, 1fr); margin-bottom: 16px; }
  .g2 { grid-template-columns: repeat(2, 1fr); margin-top: 16px; }
  .k { display: grid; gap: 4px; } .k span { color: var(--text-2); font-size: 12.5px; } .k b { font-size: 22px; font-weight: 600; }
  .bar { fill: var(--accent); opacity: .55; transition: opacity .1s; }
  .bar.hot { opacity: 1; }
  .row { position: relative; display: flex; justify-content: space-between; gap: 12px; padding: 7px 8px; border-radius: 6px; margin-bottom: 3px; overflow: hidden; }
  .row i { position: absolute; inset: 0 auto 0 0; background: var(--accent-soft); z-index: 0; border-radius: 6px; }
  .row > span, .row > b { position: relative; z-index: 1; }
  @media (max-width: 700px) { .g2, .g3 { grid-template-columns: 1fr; } .head { flex-direction: column; align-items: flex-start; } }
</style>
