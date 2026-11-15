<script lang="ts">
  import Icon from '../../components/Icon.svelte';
  import Toggle from '../../components/Toggle.svelte';
  import Drawer from '../../components/Drawer.svelte';
  import { live } from '../../lib/live.svelte';
  import { sectionOps, type UciOp } from '../../lib/uci';
  import type { Firewall, Zone, Target } from '../../lib/firewall';

  let { fw, onapply }: { fw: Firewall; onapply: (ops: UciOp[], label: string) => void } = $props();

  const T: Target[] = ['ACCEPT', 'REJECT', 'DROP'];
  interface ZForm { section: string | null; name: string; networks: string[]; input: Target; output: Target; forward: Target; masq: boolean; mtuFix: boolean }
  let zf = $state<ZForm | null>(null);
  let def = $state({ input: 'REJECT' as Target, output: 'ACCEPT' as Target, forward: 'REJECT' as Target, synFlood: true });
  let nf = $state({ src: '', dest: '' });
  let confirmDel = $state('');

  $effect(() => { if (fw.defaults) def = { input: fw.defaults.input, output: fw.defaults.output, forward: fw.defaults.forward, synFlood: fw.defaults.synFlood }; });

  const defDirty = $derived(!!fw.defaults && (def.input !== fw.defaults.input || def.output !== fw.defaults.output || def.forward !== fw.defaults.forward || def.synFlood !== fw.defaults.synFlood));
  const ifaces = $derived([...new Set([...live.interfaces.map((i) => i.interface).filter((n) => n !== 'loopback'), ...fw.zones.flatMap((z) => z.networks)])]);
  const used = (name: string) => fw.forwardings.some((f) => f.src === name || f.dest === name) || fw.rules.some((r) => r.src === name || r.dest === name) || fw.redirects.some((r) => r.src === name || r.dest === name);
  const zoneErr = $derived.by(() => {
    if (!zf) return '';
    if (!/^[A-Za-z][A-Za-z0-9_]{0,10}$/.test(zf.name)) return 'Up to 11 letters, digits or _ (starting with a letter)';
    if (!zf.section && fw.zones.some((z) => z.name === zf!.name)) return 'A zone with this name already exists';
    return '';
  });

  const newZone = (): ZForm => ({ section: null, name: '', networks: [], input: 'REJECT', output: 'ACCEPT', forward: 'REJECT', masq: false, mtuFix: false });
  const editZone = (z: Zone): ZForm => ({ section: z.section, name: z.name, networks: [...z.networks], input: z.input, output: z.output, forward: z.forward, masq: z.masq, mtuFix: z.mtuFix });

  function saveZone() {
    if (!zf || zoneErr) return;
    const f = zf, orig = f.section ? fw.zones.find((z) => z.section === f.section)!.raw : null;
    onapply(sectionOps('firewall', f.section ?? '', orig, { name: f.name, network: f.networks, input: f.input, output: f.output, forward: f.forward, masq: f.masq ? '1' : undefined, mtu_fix: f.mtuFix ? '1' : undefined }, 'zone'),
      f.section ? `Zone “${f.name}” updated` : `Zone “${f.name}” added`);
    zf = null;
  }
  function removeZone(z: Zone) {
    if (confirmDel !== z.section) { confirmDel = z.section; return; }
    confirmDel = ''; onapply([{ op: 'del', config: 'firewall', section: z.section }], `Zone “${z.name}” deleted`);
  }
  const saveDefaults = () => fw.defaults && onapply(sectionOps('firewall', fw.defaults.section, fw.defaults.raw, { input: def.input, output: def.output, forward: def.forward, syn_flood: def.synFlood ? '1' : '0' }), 'Default policies updated');
  const addForwarding = () => { onapply([{ op: 'add', config: 'firewall', type: 'forwarding', values: { src: nf.src, dest: nf.dest } }], `Forwarding ${nf.src} → ${nf.dest} added`); nf = { src: '', dest: '' }; };
  const delForwarding = (s: string, a: string, b: string) => onapply([{ op: 'del', config: 'firewall', section: s }], `Forwarding ${a} → ${b} removed`);
  const dupFwd = $derived(fw.forwardings.some((f) => f.src === nf.src && f.dest === nf.dest));
</script>

<div class="grid g2">
  <div class="card">
    <div class="card-title"><h2>Default policies</h2><button class="btn primary sm" disabled={!defDirty} onclick={saveDefaults}>Save &amp; apply</button></div>
    <div class="form">
      <div class="two3">
        <label class="fld">Input<select class="input" bind:value={def.input}>{#each T as t}<option>{t}</option>{/each}</select></label>
        <label class="fld">Output<select class="input" bind:value={def.output}>{#each T as t}<option>{t}</option>{/each}</select></label>
        <label class="fld">Forward<select class="input" bind:value={def.forward}>{#each T as t}<option>{t}</option>{/each}</select></label>
      </div>
      <Toggle bind:checked={def.synFlood} label="SYN flood protection" />
    </div>
  </div>

  <div class="card">
    <div class="card-title"><h2>Zone forwarding</h2></div>
    <div class="tw"><table class="tbl"><tbody>
      {#each fw.forwardings as f (f.section)}
        <tr><td><b>{f.src}</b> <span class="faint">→</span> <b>{f.dest}</b></td><td><div class="row-actions"><button class="btn icon danger" aria-label="Remove forwarding" onclick={() => delForwarding(f.section, f.src, f.dest)}><Icon name="trash" size={15} /></button></div></td></tr>
      {:else}<tr><td class="muted">No forwardings: zones cannot reach each other.</td></tr>{/each}
    </tbody></table></div>
    <div class="addrow">
      <select class="input" bind:value={nf.src} aria-label="From zone"><option value="" disabled>From…</option>{#each fw.zones as z}<option>{z.name}</option>{/each}</select>
      <Icon name="chevron" size={16} />
      <select class="input" bind:value={nf.dest} aria-label="To zone"><option value="" disabled>To…</option>{#each fw.zones as z}<option>{z.name}</option>{/each}</select>
      <button class="btn" disabled={!nf.src || !nf.dest || nf.src === nf.dest || dupFwd} onclick={addForwarding}><Icon name="plus" size={16} />Add</button>
    </div>
  </div>
</div>

<div class="card" style="margin-top:16px">
  <div class="card-title"><h2>Zones <span class="faint">{fw.zones.length}</span></h2><button class="btn primary" onclick={() => (zf = newZone())}><Icon name="plus" size={16} />Add zone</button></div>
  <div class="tw"><table class="tbl">
    <thead><tr><th>Zone</th><th>Networks</th><th>Input</th><th>Output</th><th>Forward</th><th>Masquerading</th><th></th></tr></thead>
    <tbody>
      {#each fw.zones as z (z.section)}
        <tr>
          <td><b>{z.name}</b></td><td class="muted">{z.networks.join(', ') || '—'}</td>
          <td><span class="tag {z.input}">{z.input}</span></td><td><span class="tag {z.output}">{z.output}</span></td><td><span class="tag {z.forward}">{z.forward}</span></td>
          <td>{z.masq ? 'Yes' : 'No'}</td>
          <td><div class="row-actions">
            <button class="btn icon" aria-label="Edit zone" onclick={() => (zf = editZone(z))}><Icon name="settings" size={15} /></button>
            {#if used(z.name)}
              <button class="btn icon" disabled title="In use by forwardings, rules or port forwards"><Icon name="trash" size={15} /></button>
            {:else if confirmDel === z.section}
              <button class="btn sm danger" onclick={() => removeZone(z)} onblur={() => (confirmDel = '')}>Confirm delete</button>
            {:else}
              <button class="btn icon danger" aria-label="Delete zone" onclick={() => removeZone(z)}><Icon name="trash" size={15} /></button>
            {/if}
          </div></td>
        </tr>
      {/each}
    </tbody>
  </table></div>
</div>

<Drawer open={!!zf} title={zf?.section ? `Edit zone ${zf.name}` : 'New zone'} onclose={() => (zf = null)}>
  {#if zf}
    <form class="form" onsubmit={(e) => { e.preventDefault(); saveZone(); }}>
      <label class="fld">Name<input class="input" bind:value={zf.name} disabled={!!zf.section} aria-invalid={!!zoneErr} />
        {#if zf.section}<small class="hint">Zones can't be renamed because other rules refer to them.</small>{/if}{#if zoneErr}<small class="err">{zoneErr}</small>{/if}</label>
      <div class="two3">
        <label class="fld">Input<select class="input" bind:value={zf.input}>{#each T as t}<option>{t}</option>{/each}</select></label>
        <label class="fld">Output<select class="input" bind:value={zf.output}>{#each T as t}<option>{t}</option>{/each}</select></label>
        <label class="fld">Forward<select class="input" bind:value={zf.forward}>{#each T as t}<option>{t}</option>{/each}</select></label>
      </div>
      <Toggle bind:checked={zf.masq} label="Masquerading (NAT)" />
      <Toggle bind:checked={zf.mtuFix} label="MSS clamping" />
      <fieldset class="nets"><legend>Networks in this zone</legend>
        {#each ifaces as n}<label class="chk"><input type="checkbox" checked={zf.networks.includes(n)} onchange={(e) => { const on = e.currentTarget.checked; zf!.networks = on ? [...zf!.networks, n] : zf!.networks.filter((x) => x !== n); }} /> {n}</label>{/each}
      </fieldset>
      <div class="form-actions"><button type="button" class="btn" onclick={() => (zf = null)}>Cancel</button><button class="btn primary" disabled={!!zoneErr || !zf.name}>Save &amp; apply</button></div>
    </form>
  {/if}
</Drawer>

<style>
  .g2 { grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); align-items: start; }
  .two3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .addrow { display: flex; align-items: center; gap: 8px; margin-top: 12px; color: var(--text-3); }
  .addrow .input { flex: 1; }
  .nets { border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px 14px 12px; display: flex; flex-wrap: wrap; gap: 6px 18px; }
  .nets legend { padding: 0 6px; color: var(--text-2); font-size: 13px; }
  .chk { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; }
</style>
