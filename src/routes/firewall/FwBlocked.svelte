<script lang="ts">
  import { onMount } from 'svelte';
  import Toggle from '../../components/Toggle.svelte';
  import Icon from '../../components/Icon.svelte';
  import { getBlocks, summarize, PORT_NAME, type FwStats, type LogInfo } from '../../lib/fwlog';
  import { changes } from '../../lib/changes.svelte';
  import { call } from '../../lib/ubus';
  import { bytes } from '../../lib/format';
  import { uciGet, sectionOps, str, type UciOp, type UciSection } from '../../lib/uci';
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

  let info = $state<LogInfo | null>(null), sys = $state<UciSection | null>(null), bufKb = $state(64);
  const load = () => getBlocks().then((b) => { st = summarize(b.blocks); info = b.info; }).catch(() => (st = summarize([])));
  async function loadBuf() {
    try {
      sys = Object.values(await uciGet('system')).find((s) => s['.type'] === 'system') ?? null;
      bufKb = Number(str(sys?.log_buffer_size)) || Number(str(sys?.log_size)) || 64;   // logd's own fallback is 64 KB
    } catch { /* keep default */ }
  }

  // How long the buffer keeps entries: if it is full, the age of its oldest entry; otherwise an estimate from the fill rate.
  const cap = $derived(bufKb * 1024);
  const used = $derived(info ? Math.min(1, info.bytes / cap) : 0);
  const share = $derived(info && info.bytes ? info.fwBytes / info.bytes : 0);
  const span = $derived(info?.oldest ? Math.max(0, Date.now() - info.oldest) : 0);
  const human = (ms: number) => ms < 90e3 ? 'under a minute' : ms < 90 * 60e3 ? `${Math.round(ms / 60e3)} min` : ms < 36 * 3600e3 ? `${Math.round(ms / 3600e3)} h` : `${Math.round(ms / 86400e3)} days`;
  const keeps = $derived.by(() => {
    if (!info || !info.entries) return 'The log is empty.';
    if (used > 0.9) return `The buffer is full: it holds about ${human(span)} of history, and older entries are discarded as new ones arrive.`;
    if (span < 10 * 60e3) return 'Not enough activity yet to estimate how long entries are kept.';
    return `At the current rate the buffer holds about ${human(cap / (info.bytes / span))} of history before the oldest entries start to be discarded.`;
  });

  async function setSize(kb: number) {
    if (!sys || kb === bufKb) return;
    if (await changes.apply(sectionOps('system', sys['.name'], sys, { log_size: String(kb) }), 'auto', `Log memory set to ${kb} KB`)) await loadBuf();
  }
  let clearAsk = $state(false), clearing = $state(false);
  async function clearLog() {
    if (!clearAsk) { clearAsk = true; return; }
    clearAsk = false; clearing = true;
    try { await call('lumen', 'log_clear'); } catch { /* shown by the empty log below */ }
    await new Promise((r) => setTimeout(r, 2500));   // logd restarts, give it a moment
    await load(); clearing = false;
  }
  $effect(() => { on; load(); });
  onMount(() => { loadBuf(); });   // refresh right after logging is switched on or off
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
    <p class="muted small">Connections the firewall dropped or rejected on the internet-facing zone{wanZones.length === 1 ? '' : 's'} {wanZones.map((z) => z.name).join(', ') || '(none found)'}, read from the router's system log. The log lives in memory, so older entries disappear and it starts empty after a reboot.</p>
  </div>
  <Toggle checked={on} label={on ? 'Logging on' : 'Logging off'} disabled={!wanZones.length} onchange={setLogging} />
</div>

{#snippet storage()}
  <div class="card store">
    <div class="card-title"><h2>Log storage</h2>
      <label class="size muted small">Log memory
        <select class="input" value={bufKb} onchange={(e) => setSize(Number((e.target as HTMLSelectElement).value))} disabled={!sys}>
          {#each [...new Set([64, 128, 256, 512, 1024, bufKb])].sort((a, b) => a - b) as kb}<option value={kb}>{kb} KB</option>{/each}
        </select></label>
    </div>
    {#if info}
      <div class="meter" role="img" aria-label="Log buffer usage"><i class="all" style:width="{used * 100}%"></i><i class="fw" style:width="{used * share * 100}%"></i></div>
      <div class="legend small">
        <span><i class="sw fw"></i>Firewall · {bytes(info.fwBytes)} ({info.fwEntries.toLocaleString()} entries)</span>
        <span><i class="sw all"></i>Other system messages · {bytes(info.bytes - info.fwBytes)}</span>
        <span class="faint">{bytes(info.bytes)} of {bufKb} KB in use</span>
      </div>
      <p class="muted small">{keeps} The log is shared by every service and lives in RAM: it never wears the flash, and it is emptied when the router restarts.</p>
      <div class="row">
        {#if clearAsk}
          <span class="muted small">This empties the whole system log, not only the firewall's. Nothing else changes and no service is interrupted.</span>
          <button class="btn danger" onclick={clearLog}>Confirm: clear log</button><button class="btn" onclick={() => (clearAsk = false)}>Cancel</button>
        {:else}
          <button class="btn" disabled={clearing || !info.entries} onclick={clearLog}><Icon name={clearing ? 'refresh' : 'trash'} size={15} />{clearing ? 'Clearing…' : 'Clear log'}</button>
        {/if}
      </div>
    {:else}<p class="muted small">Reading the log…</p>{/if}
  </div>
{/snippet}

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

{@render storage()}

<style>
  .head { display: flex; justify-content: space-between; align-items: center; gap: 20px; margin-bottom: 16px; }
  .head h2 { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
  .head p { max-width: 62ch; }
  .store { margin-top: 16px; display: grid; gap: 12px; }
  .store .card-title { margin-bottom: 0; }
  .size { display: inline-flex; align-items: center; gap: 8px; } .size select { width: auto; padding: 4px 8px; }
  .meter { height: 10px; border-radius: 99px; background: var(--surface-2); position: relative; overflow: hidden; }
  .meter i { position: absolute; inset: 0 auto 0 0; border-radius: 99px; }
  .meter .all { background: color-mix(in srgb, var(--text-3) 55%, transparent); } .meter .fw { background: var(--accent); }
  .legend { display: flex; gap: 18px; flex-wrap: wrap; align-items: center; color: var(--text-2); }
  .sw { display: inline-block; width: 9px; height: 9px; border-radius: 3px; margin-right: 6px; } .sw.fw { background: var(--accent); } .sw.all { background: color-mix(in srgb, var(--text-3) 55%, transparent); }
  .store .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
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
