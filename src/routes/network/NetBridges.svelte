<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '../../components/Icon.svelte';
  import Toggle from '../../components/Toggle.svelte';
  import { changes } from '../../lib/changes.svelte';
  import { live } from '../../lib/live.svelte';
  import { str, sectionOps, type UciOp } from '../../lib/uci';
  import { loadNet, validBridgeName, fmtPort, type NetCfg, type Bridge, type BVlan } from '../../lib/netdevs';

  let net = $state<NetCfg | null>(null), err = $state('');
  async function load() { try { net = await loadNet(); err = ''; } catch (e) { err = e instanceof Error ? e.message : String(e); } }
  onMount(() => { load(); return live.start(); });
  let prev = changes.phase;
  $effect(() => { const p = changes.phase; if (p !== prev) { prev = p; load(); } });
  async function apply(ops: UciOp[], label: string) { if (await changes.apply(ops, 'manual', label)) { await load(); return true; } return false; }

  // Ports a bridge can take: real network devices, not wireless (those join through the Wi-Fi settings) and not bridges.
  const candidates = $derived(Object.keys(live.devices).filter((d) => d !== 'lo' && !d.startsWith('phy') && !d.startsWith('wlan') && !d.startsWith('br-') && !d.includes('.') && live.devices[d].type === 'Network device').sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));
  const usedIn = (port: string, except?: string) => net?.bridges.find((b) => b.name !== except && b.ports.includes(port))?.name;
  const ifacesOn = (dev: string) => (net?.ifaces ?? []).filter((i) => str(i.device) === dev || str(i.device).startsWith(dev + '.')).map((i) => i['.name']);

  // ---- bridges
  interface BForm { section: string | null; name: string; ports: string[]; filtering: boolean }
  let bf = $state<BForm | null>(null), delB = $state('');
  const bErr = $derived.by(() => {
    if (!bf) return '';
    if (!validBridgeName(bf.name)) return 'Name: letters, digits, “_”, “-” or “.”, starting with a letter (for example br-iot)';
    if (!bf.section && (net?.bridges.some((b) => b.name === bf!.name) || Object.keys(live.devices).includes(bf.name))) return 'A device with this name already exists';
    return '';
  });
  const editB = (b: Bridge): BForm => ({ section: b.section, name: b.name, ports: [...b.ports], filtering: b.vlanFiltering });
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  async function saveBridge() {
    if (!bf || bErr) return;
    const f = bf, orig = net?.bridges.find((b) => b.section === f.section)?.raw ?? null;
    const ops = sectionOps('network', f.section ?? '', orig, { name: f.name, type: 'bridge', ports: f.ports, vlan_filtering: f.filtering ? '1' : undefined }, 'device');
    if (await apply(ops, f.section ? `Bridge “${f.name}” updated` : `Bridge “${f.name}” created`)) bf = null;
  }
  async function removeBridge(b: Bridge) {
    if (ifacesOn(b.name).length) return;
    if (delB !== b.section) { delB = b.section; return; }
    delB = '';
    const ops: UciOp[] = [{ op: 'del', config: 'network', section: b.section }, ...(net?.vlans ?? []).filter((v) => v.device === b.name).map((v) => ({ op: 'del', config: 'network', section: v.section }) as UciOp)];
    await apply(ops, `Bridge “${b.name}” deleted`);
  }

  // ---- VLANs
  type Mode = '' | 't' | 'u' | 'u*';
  interface VForm { section: string | null; device: string; vlan: string; modes: Record<string, Mode>; local: boolean }
  let vf = $state<VForm | null>(null), delV = $state('');
  const filtered = $derived((net?.bridges ?? []).filter((b) => b.vlanFiltering));
  const portsOf = (dev: string) => net?.bridges.find((b) => b.name === dev)?.ports ?? [];
  const newV = (): VForm => ({ section: null, device: filtered[0]?.name ?? '', vlan: '', modes: {}, local: true });
  const editV = (v: BVlan): VForm => ({ section: v.section, device: v.device, vlan: v.vlan, local: v.local, modes: Object.fromEntries(v.ports.map((p) => [p.port, (p.tagged ? 't' : p.pvid ? 'u*' : 'u') as Mode])) });
  const vErr = $derived.by(() => {
    if (!vf) return '';
    const id = Number(vf.vlan);
    if (!Number.isInteger(id) || id < 1 || id > 4094) return 'VLAN ID must be 1–4094';
    if ((net?.vlans ?? []).some((v) => v.device === vf!.device && v.vlan === vf!.vlan && v.section !== vf!.section)) return 'This VLAN already exists on that bridge';
    const members = Object.entries(vf.modes).filter(([, m]) => m);
    if (!members.length) return 'Add at least one port to this VLAN';
    for (const [p, m] of members) if (m === 'u*' && (net?.vlans ?? []).some((v) => v.device === vf!.device && v.section !== vf!.section && v.ports.some((x) => x.port === p && x.pvid && !x.tagged)))
      return `Port ${p} is already the default (untagged) VLAN in another VLAN. A port can only have one.`;
    return '';
  });
  async function saveVlan() {
    if (!vf || vErr) return;
    const f = vf, orig = net?.vlans.find((v) => v.section === f.section)?.raw ?? null;
    const ports = portsOf(f.device).filter((p) => f.modes[p]).map((p) => fmtPort({ port: p, tagged: f.modes[p] === 't', pvid: f.modes[p] === 'u*' }));
    const ops = sectionOps('network', f.section ?? '', orig, { device: f.device, vlan: f.vlan, ports, local: f.local ? undefined : '0' }, 'bridge-vlan');
    if (await apply(ops, `VLAN ${f.vlan} saved`)) vf = null;
  }
  async function removeVlan(v: BVlan) {
    if (delV !== v.section) { delV = v.section; return; }
    delV = '';
    await apply([{ op: 'del', config: 'network', section: v.section }], `VLAN ${v.vlan} deleted`);
  }
  const portText = (v: BVlan) => v.ports.map((p) => `${p.port} ${p.tagged ? '(tagged)' : p.pvid ? '(untagged · default)' : '(untagged)'}`).join(', ') || '—';
</script>

{#if err}<div class="card"><p class="muted">Could not read the network configuration: {err}</p></div>
{:else if !net}<div class="card"><p class="muted">Loading…</p></div>
{:else}
  <div class="card tw">
    <div class="card-title" style="padding:20px 20px 0"><h2>Bridges</h2>{#if !bf}<button class="btn" onclick={() => (bf = { section: null, name: '', ports: [], filtering: false })}><Icon name="plus" size={15} />Add bridge</button>{/if}</div>
    <p class="muted small pad">A bridge joins several ports into one network. Turn on <b>VLAN filtering</b> to split it into VLANs below.</p>
    {#if bf}
      <div class="form pad">
        <label><span>Name</span><input class="input" bind:value={bf.name} disabled={!!bf.section} placeholder="br-iot" /></label>
        <div><span class="lbl">Ports</span>
          <div class="chk">{#each candidates as p}{@const other = usedIn(p, bf.section ? bf.name : undefined)}
            <label class:dis={!!other}><input type="checkbox" checked={bf.ports.includes(p)} disabled={!!other} onchange={() => bf && (bf.ports = toggle(bf.ports, p))} /> {p}{other ? ` (in ${other})` : ''}</label>{/each}</div></div>
        <div><Toggle bind:checked={bf.filtering} label="VLAN filtering" /></div>
        {#if bErr}<small class="bad">{bErr}</small>{/if}
        <p class="alert"><Icon name="alert" size={16} /><span>Changing ports can cut the connection you are using. It rolls back by itself in 30 seconds unless you confirm.</span></p>
        <div class="row"><button class="btn primary" disabled={!!bErr} onclick={saveBridge}>Save</button><button class="btn" onclick={() => (bf = null)}>Cancel</button></div>
      </div>
    {/if}
    <table class="tbl">
      <thead><tr><th>Bridge</th><th>Ports</th><th>VLAN filtering</th><th>Used by</th><th></th></tr></thead>
      <tbody>
        {#each net.bridges as b (b.section)}
          {@const users = ifacesOn(b.name)}
          <tr><td class="mono"><b>{b.name}</b></td><td class="mono">{b.ports.join(', ') || '—'}</td>
            <td><span class="pill"><i class="dot" class:ok={b.vlanFiltering}></i>{b.vlanFiltering ? 'On' : 'Off'}</span></td>
            <td>{users.join(', ') || '—'}</td>
            <td class="r"><button class="btn sm" onclick={() => (bf = editB(b))}>Edit</button>
              <button class="btn danger sm" disabled={users.length > 0} title={users.length ? `In use by ${users.join(', ')}` : ''} onclick={() => removeBridge(b)}>{delB === b.section ? 'Confirm' : 'Delete'}</button></td></tr>
        {:else}<tr><td colspan="5" class="muted c">No bridges are defined in the configuration.</td></tr>{/each}
      </tbody>
    </table>
  </div>

  <div class="card tw" style="margin-top:16px">
    <div class="card-title" style="padding:20px 20px 0"><h2>VLANs</h2>{#if !vf && filtered.length}<button class="btn" onclick={() => (vf = newV())}><Icon name="plus" size={15} />Add VLAN</button>{/if}</div>
    <p class="muted small pad">
      {#if filtered.length}For each VLAN, choose how every port takes part. A device plugged in <b>untagged</b> belongs to the VLAN marked <b>default</b>; <b>tagged</b> ports (links to other switches or access points) carry several VLANs. Then add an interface that runs on <span class="mono">bridge.VLAN-ID</span> (for example br-lan.30) from the Overview tab.
      {:else}Turn on VLAN filtering on a bridge above to manage VLANs.{/if}</p>
    {#if vf}
      <div class="form pad">
        <label><span>Bridge</span><select class="input" bind:value={vf.device} disabled={!!vf.section} onchange={() => vf && (vf.modes = {})}>{#each filtered as b}<option>{b.name}</option>{/each}</select></label>
        <label><span>VLAN ID</span><input class="input" style="max-width:120px" inputmode="numeric" bind:value={vf.vlan} placeholder="30" /></label>
        <div><span class="lbl">Ports</span>
          <div class="pgrid">{#each portsOf(vf.device) as p}
            <span class="mono">{p}</span>
            <select class="input" bind:value={vf.modes[p]}><option value="">Not in this VLAN</option><option value="t">Tagged</option><option value="u">Untagged</option><option value="u*">Untagged · default</option></select>{/each}</div></div>
        <div><Toggle bind:checked={vf.local} label="The router itself is on this VLAN" /></div>
        {#if vf.vlan && vErr}<small class="bad">{vErr}</small>{/if}
        <p class="alert"><Icon name="alert" size={16} /><span>A mistake here can lock you out of the router. If you cannot confirm within 30 seconds, it rolls back by itself.</span></p>
        <div class="row"><button class="btn primary" disabled={!!vErr} onclick={saveVlan}>Save</button><button class="btn" onclick={() => (vf = null)}>Cancel</button></div>
      </div>
    {/if}
    {#if filtered.length}
      <table class="tbl">
        <thead><tr><th>VLAN</th><th>Bridge</th><th>Ports</th><th>Router</th><th></th></tr></thead>
        <tbody>
          {#each net.vlans.filter((v) => filtered.some((b) => b.name === v.device)) as v (v.section)}
            <tr><td class="num"><b>{v.vlan}</b></td><td class="mono">{v.device}</td><td class="small">{portText(v)}</td><td>{v.local ? 'Yes' : 'No'}</td>
              <td class="r"><button class="btn sm" onclick={() => (vf = editV(v))}>Edit</button> <button class="btn danger sm" onclick={() => removeVlan(v)}>{delV === v.section ? 'Confirm' : 'Delete'}</button></td></tr>
          {:else}<tr><td colspan="5" class="muted c">No VLANs yet.</td></tr>{/each}
        </tbody>
      </table>
    {/if}
  </div>
{/if}

<style>
  .tw { padding: 0; overflow-x: auto; } .pad { padding: 0 20px; margin: 8px 0 14px; }
  .c { text-align: center; padding: 24px; } .r { text-align: right; white-space: nowrap; }
  .form { display: grid; gap: 14px; max-width: 520px; padding-bottom: 16px; }
  label { display: grid; gap: 5px; } label > span, .lbl { font-size: 13px; color: var(--text-2); }
  .chk { display: flex; gap: 8px 18px; flex-wrap: wrap; margin-top: 6px; } .chk label { display: flex; gap: 6px; align-items: center; } .chk .dis { opacity: .5; }
  .pgrid { display: grid; grid-template-columns: 90px minmax(0, 220px); gap: 8px 12px; align-items: center; margin-top: 6px; }
  .row { display: flex; gap: 10px; } .bad { color: var(--bad, #dc2626); }
  .sm { padding: 4px 10px; font-size: 12.5px; }
  .form :global(.alert) { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; }
</style>
