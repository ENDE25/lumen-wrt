<script lang="ts">
  import Icon from '../../components/Icon.svelte';
  import SignalBars from '../../components/SignalBars.svelte';
  import { scan, loads, best, is24, type Neighbour } from '../../lib/wifiscan';
  import type { WifiIface } from '../../lib/types';

  let { ifaces }: { ifaces: WifiIface[] } = $props();
  const aps = $derived(ifaces.filter((w) => w.mode.toLowerCase().includes('ap') || w.mode === 'Master'));

  let pick = $state(''), nets = $state<Neighbour[] | null>(null), busy = $state(false), err = $state('');
  const cur = $derived(aps.find((w) => w.ifname === pick) ?? aps[0]);
  const band24 = $derived(cur ? cur.band.startsWith('2.4') : true);
  const own = $derived(cur?.channel);
  const l = $derived(nets ? loads(nets, band24, own) : []);
  const rec = $derived(nets ? best(l, band24) : null);
  const max = $derived(Math.max(1, ...l.map((c) => c.score)));
  const mine = $derived(l.find((c) => c.channel === own));

  async function run() {
    if (!cur) return;
    busy = true; err = ''; nets = null;
    try { nets = (await scan(cur.ifname)).filter((n) => is24(n.channel) === band24); }
    catch (e) { err = e instanceof Error ? e.message : String(e); }
    busy = false;
  }
</script>

{#if aps.length}
  <div class="card">
    <div class="card-title"><h2>Channel analysis</h2>
      <div class="ctl">
        {#if aps.length > 1}<select class="input" bind:value={pick} onchange={() => (nets = null)}>{#each aps as w}<option value={w.ifname}>{w.band || 'Radio'} · {w.ssid || w.ifname}</option>{/each}</select>{/if}
        <button class="btn" disabled={busy} onclick={run}><Icon name="refresh" size={15} />{busy ? 'Scanning…' : 'Scan nearby networks'}</button>
      </div>
    </div>
    <p class="muted small">Lists the Wi-Fi networks around you and how crowded each channel is, to help pick a clear one. Scanning takes a few seconds and can briefly slow Wi-Fi on this radio.</p>
    {#if err}<p class="alert"><Icon name="alert" size={16} /><span>{err}</span></p>{/if}

    {#if nets}
      {#if rec}
        <p class="rec"><Icon name="check" size={16} /><span>
          {#if own && rec.channel === own}Your channel <b>{own}</b> is already the least crowded of the usual choices.
          {:else}Channel <b>{rec.channel}</b> looks the clearest of the usual choices{#if mine}{' '}(yours, <b>{own}</b>, is {mine.score > rec.score * 1.5 + 0.3 ? 'noticeably' : 'slightly'} busier){/if}. Change it from the radio's settings above.{/if}
        </span></p>
      {/if}
      <div class="chart" role="img" aria-label="Channel congestion">
        {#each l as c}
          <div class="col" title="Channel {c.channel}: {c.count} network{c.count === 1 ? '' : 's'}">
            <i class="bar" class:own={c.channel === own} class:rec={rec?.channel === c.channel} style:height="{Math.max(3, (c.score / max) * 100)}%"></i>
            <span class="ch" class:own={c.channel === own}>{c.channel}</span>
          </div>
        {/each}
      </div>
      <p class="faint small legend"><i class="sw own"></i>your channel <i class="sw rec"></i>suggested <i class="sw"></i>others · taller = more crowded</p>

      <div class="tw"><table class="tbl">
        <thead><tr><th>Network</th><th>Channel</th><th>Signal</th><th>Security</th><th>BSSID</th></tr></thead>
        <tbody>
          {#each nets as n}
            <tr><td><b>{n.ssid || '(hidden)'}</b></td><td class="num">{n.channel}</td><td><span class="sig"><SignalBars dbm={n.signal} /> <span class="muted num">{n.signal} dBm</span></span></td><td class="muted">{n.secure ? 'Protected' : 'Open'}</td><td class="mono muted">{n.bssid}</td></tr>
          {:else}<tr><td colspan="5" class="muted c">No other networks found on this band.</td></tr>{/each}
        </tbody>
      </table></div>
    {/if}
  </div>
{/if}

<style>
  .card { margin-top: 16px; } .card-title { flex-wrap: wrap; }
  .ctl { display: flex; gap: 10px; align-items: center; } .ctl select { width: auto; }
  .rec { display: flex; gap: 8px; align-items: flex-start; margin: 14px 0 6px; color: var(--ok, #16a34a); } .rec span { color: var(--text); }
  .chart { display: flex; align-items: flex-end; gap: 5px; height: 150px; margin: 14px 0 4px; }
  .col { flex: 1; min-width: 0; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 5px; }
  .bar { display: block; width: 100%; border-radius: 5px 5px 2px 2px; background: color-mix(in srgb, var(--text-3) 45%, transparent); }
  .bar.own { background: var(--accent); } .bar.rec { background: var(--ok, #16a34a); }
  .ch { font-size: 11px; color: var(--text-3); } .ch.own { color: var(--accent); font-weight: 600; }
  .legend { display: flex; align-items: center; gap: 6px; margin-bottom: 14px; } .legend .sw { margin-left: 10px; }
  .sw { width: 9px; height: 9px; border-radius: 3px; display: inline-block; background: color-mix(in srgb, var(--text-3) 45%, transparent); }
  .sw.own { background: var(--accent); } .sw.rec { background: var(--ok, #16a34a); }
  .tw { overflow-x: auto; margin: 0 -20px -20px; } .c { text-align: center; padding: 20px; }
  .sig { display: inline-flex; gap: 8px; align-items: center; }
  .alert { display: flex; gap: 8px; align-items: center; }
</style>
