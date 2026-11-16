<script lang="ts">
  import { onMount } from 'svelte';
  import { changes } from '../../lib/changes.svelte';
  import { live } from '../../lib/live.svelte';
  import { uciGet, sectionOps, str, type UciSection } from '../../lib/uci';
  import { getLeds, type Led } from '../../lib/admin';

  interface Row { section: string | null; name: string; sysfs: string; trigger: string; dev: string; link: boolean; tx: boolean; rx: boolean; delayon: string; delayoff: string; on: boolean }
  let leds = $state<Led[]>([]), cfg = $state<Record<string, UciSection>>({}), loaded = $state(false);
  let form = $state<Row | null>(null), delAsk = $state('');

  const rows = $derived(Object.values(cfg).filter((s) => s['.type'] === 'led'));
  async function load() { cfg = await uciGet('system').catch(() => ({})); loaded = true; }
  onMount(() => { load(); getLeds().then((l) => (leds = l)).catch(() => {}); return live.start(); });

  const toRow = (s: UciSection): Row => {
    const m = str(s.mode).split(/\s+/);
    return { section: s['.name'], name: str(s.name), sysfs: str(s.sysfs), trigger: str(s.trigger) || 'none', dev: str(s.dev), link: m.includes('link'), tx: m.includes('tx'), rx: m.includes('rx'), delayon: str(s.delayon), delayoff: str(s.delayoff), on: str(s.default) === '1' };
  };
  const blank = (): Row => ({ section: null, name: '', sysfs: leds[0]?.sysfs ?? '', trigger: 'none', dev: '', link: true, tx: false, rx: false, delayon: '500', delayoff: '500', on: false });
  const triggersOf = (sysfs: string) => leds.find((l) => l.sysfs === sysfs)?.triggers ?? [];
  const devices = $derived(Object.keys(live.devices).filter((d) => d !== 'lo').sort());

  const err = $derived.by(() => {
    if (!form) return '';
    if (!form.name.trim()) return 'Give this action a name';
    if (!form.sysfs) return 'Choose a LED';
    if (form.trigger === 'netdev' && !form.dev) return 'Choose the network device to follow';
    if (form.trigger === 'netdev' && !(form.link || form.tx || form.rx)) return 'Pick at least one of link, transmit or receive';
    if (form.trigger === 'timer' && !/^\d+$/.test(form.delayon + form.delayoff)) return 'Delays are numbers in milliseconds';
    return '';
  });

  async function save() {
    if (!form || err) return;
    const f = form, orig = f.section ? cfg[f.section] : null, net = f.trigger === 'netdev', tm = f.trigger === 'timer';
    const ops = sectionOps('system', f.section ?? '', orig, {
      name: f.name.trim(), sysfs: f.sysfs, trigger: f.trigger, default: f.trigger === 'none' && f.on ? '1' : undefined,
      dev: net ? f.dev : undefined, mode: net ? [f.link && 'link', f.tx && 'tx', f.rx && 'rx'].filter(Boolean).join(' ') : undefined,
      delayon: tm ? f.delayon : undefined, delayoff: tm ? f.delayoff : undefined,
    }, 'led');
    if (await changes.apply(ops, 'auto', `LED “${f.name}” saved`)) { form = null; await load(); }
  }
  async function remove(s: UciSection) {
    if (delAsk !== s['.name']) { delAsk = s['.name']; return; }
    delAsk = '';
    if (await changes.apply([{ op: 'del', config: 'system', section: s['.name'] }], 'auto', 'LED action removed')) await load();
  }
  const describe = (s: UciSection) => { const t = str(s.trigger) || 'none'; return t === 'netdev' ? `follows ${str(s.dev)} (${str(s.mode)})` : t === 'timer' ? `blinks ${str(s.delayon)} ms on / ${str(s.delayoff)} ms off` : t; };
</script>

<div class="card tw">
  <div class="card-title" style="padding:20px 20px 0"><h2>LEDs</h2>{#if !form && leds.length}<button class="btn" onclick={() => (form = blank())}>Add LED action</button>{/if}</div>
  <p class="muted small pad">Decide what each LED on the device shows: network activity, a blinking pattern, or always on.{#if loaded && !leds.length} This device does not expose any controllable LEDs.{/if}</p>

  {#if form}
    <div class="form pad">
      <label><span>Name</span><input class="input" bind:value={form.name} placeholder="WAN activity" /></label>
      <label><span>LED</span><select class="input" bind:value={form.sysfs}>{#each leds as l}<option value={l.sysfs}>{l.sysfs}</option>{/each}</select></label>
      <label><span>Shows</span><select class="input" bind:value={form.trigger}>{#each triggersOf(form.sysfs) as t}<option>{t}</option>{/each}</select></label>
      {#if form.trigger === 'none'}<label class="chk"><input type="checkbox" bind:checked={form.on} /> Keep this LED lit</label>{/if}
      {#if form.trigger === 'netdev'}
        <label><span>Network device</span><select class="input" bind:value={form.dev}><option value="">Choose…</option>{#each devices as d}<option>{d}</option>{/each}</select></label>
        <div class="chk"><label><input type="checkbox" bind:checked={form.link} /> Link up</label><label><input type="checkbox" bind:checked={form.tx} /> Transmit</label><label><input type="checkbox" bind:checked={form.rx} /> Receive</label></div>
      {/if}
      {#if form.trigger === 'timer'}
        <div class="chk"><label>On (ms) <input class="input" style="width:90px" bind:value={form.delayon} /></label><label>Off (ms) <input class="input" style="width:90px" bind:value={form.delayoff} /></label></div>
      {/if}
      {#if err}<small class="bad">{err}</small>{/if}
      <div class="row"><button class="btn primary" disabled={!!err} onclick={save}>Save</button><button class="btn" onclick={() => (form = null)}>Cancel</button></div>
    </div>
  {/if}

  <table class="tbl">
    <thead><tr><th>Action</th><th>LED</th><th>Shows</th><th></th></tr></thead>
    <tbody>
      {#each rows as s (s['.name'])}
        <tr><td><b>{str(s.name) || s['.name']}</b></td><td class="mono">{str(s.sysfs)}</td><td class="muted">{describe(s)}</td>
          <td class="r"><button class="btn sm" onclick={() => (form = toRow(s))}>Edit</button> <button class="btn danger sm" onclick={() => remove(s)}>{delAsk === s['.name'] ? 'Confirm' : 'Remove'}</button></td></tr>
      {:else}<tr><td colspan="4" class="muted c">{loaded ? 'No LED actions are configured.' : 'Loading…'}</td></tr>{/each}
    </tbody>
  </table>
</div>

<style>
  .tw { padding: 0; overflow-x: auto; } .pad { padding: 0 20px; margin: 8px 0 14px; }
  .c { text-align: center; padding: 24px; } .r { text-align: right; white-space: nowrap; }
  .form { display: grid; gap: 12px; max-width: 460px; padding-bottom: 16px; }
  label { display: grid; gap: 5px; } label > span { font-size: 13px; color: var(--text-2); }
  .chk { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; } .chk label { display: flex; gap: 6px; align-items: center; }
  .row { display: flex; gap: 10px; } .bad { color: var(--bad, #dc2626); }
  .sm { padding: 4px 10px; font-size: 12.5px; }
</style>
