<script lang="ts">
  import { onMount } from 'svelte';
  import Toggle from '../../components/Toggle.svelte';
  import { changes } from '../../lib/changes.svelte';
  import { uciGet, sectionOps, asList, str, type UciOp, type UciSection } from '../../lib/uci';
  import { getTimezones, type Timezone } from '../../lib/admin';

  let sys = $state<UciSection | null>(null), ntp = $state<UciSection | null>(null);
  let zones = $state<Timezone[]>([]);
  let f = $state({ hostname: '', zone: '', ntp: true, serve: false, servers: '' });
  let err = $state('');

  async function load() {
    try {
      const c = await uciGet('system');
      const all = Object.values(c);
      sys = all.find((s) => s['.type'] === 'system') ?? null;
      ntp = all.find((s) => s['.type'] === 'timeserver') ?? null;
      f = { hostname: str(sys?.hostname), zone: str(sys?.zonename) || 'UTC', ntp: str(ntp?.enabled) !== '0', serve: str(ntp?.enable_server) === '1', servers: asList(ntp?.server).join('\n') };
    } catch (e) { err = e instanceof Error ? e.message : String(e); }
  }
  onMount(() => { load(); getTimezones().then((z) => (zones = z)).catch(() => {}); });

  const hostErr = $derived(/^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(f.hostname) ? '' : 'Letters, digits and hyphens only (no spaces), up to 63 characters');
  const tz = $derived(zones.find((z) => z.name === f.zone));

  async function save() {
    if (hostErr || !sys) return;
    const ops: UciOp[] = [
      ...sectionOps('system', sys['.name'], sys, { hostname: f.hostname, zonename: f.zone, timezone: tz?.tz ?? str(sys.timezone) }),
      ...(ntp ? sectionOps('system', ntp['.name'], ntp, { enabled: f.ntp ? '1' : '0', enable_server: f.serve ? '1' : '0', server: f.servers.split(/[\s,]+/).filter(Boolean) }) : []),
    ];
    if (ops.length && (await changes.apply(ops, 'auto', 'System settings saved'))) await load();
  }
  const dirty = $derived(!!sys && (f.hostname !== str(sys.hostname) || f.zone !== (str(sys.zonename) || 'UTC') || f.ntp !== (str(ntp?.enabled) !== '0') || f.serve !== (str(ntp?.enable_server) === '1') || f.servers !== asList(ntp?.server).join('\n')));
</script>

{#if err}<div class="card"><p class="muted">Could not read the system configuration: {err}</p></div>
{:else if !sys}<div class="card"><p class="muted">Loading…</p></div>
{:else}
  <div class="card form">
    <div class="card-title"><h2>Identity &amp; time</h2></div>
    <label><span>Hostname</span><input class="input" bind:value={f.hostname} aria-invalid={!!hostErr} />
      {#if hostErr}<small class="bad">{hostErr}</small>{/if}</label>
    <label><span>Time zone</span>
      {#key zones.length}
        <select class="input" bind:value={f.zone}>
          {#if !zones.some((z) => z.name === f.zone)}<option value={f.zone}>{f.zone || 'Not set'}</option>{/if}
          {#each zones as z}<option value={z.name}>{z.name}</option>{/each}
        </select>
      {/key}</label>
    <div class="line"><Toggle bind:checked={f.ntp} label="Keep the clock in sync (NTP client)" /></div>
    {#if f.ntp}
      <label><span>Time servers <small class="faint">one per line</small></span><textarea class="input" rows="6" bind:value={f.servers}></textarea></label>
      <div class="line"><Toggle bind:checked={f.serve} label="Also serve time to devices on my network" /></div>
    {/if}
    <div class="actions"><button class="btn primary" disabled={!dirty || !!hostErr} onclick={save}>Save</button></div>
  </div>
{/if}

<style>
  .form { display: grid; gap: 16px; align-content: start; }
  label { display: grid; gap: 6px; } label > span { font-size: 13px; color: var(--text-2); }
  textarea.input { font-family: var(--mono, monospace); resize: vertical; height: auto; min-height: 130px; padding: 10px 12px; line-height: 1.5; }
  .bad { color: var(--bad, #dc2626); }
  .actions { display: flex; gap: 10px; }
</style>
