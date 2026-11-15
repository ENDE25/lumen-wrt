<script lang="ts">
  import Icon from '../../components/Icon.svelte';
  import Toggle from '../../components/Toggle.svelte';
  import Drawer from '../../components/Drawer.svelte';
  import { sectionOps, type UciOp } from '../../lib/uci';
  import { PROTOS, cidrRe, protoLabel, validPorts, type Firewall, type Rule } from '../../lib/firewall';

  let { fw, onapply }: { fw: Firewall; onapply: (ops: UciOp[], label: string) => void } = $props();

  interface Form { section: string | null; name: string; enabled: boolean; family: string; proto: string; src: string; srcIp: string; srcPort: string; dest: string; destIp: string; destPort: string; icmpType: string; target: string }
  let form = $state<Form | null>(null);
  let confirmDel = $state('');

  const zoneNames = $derived(fw.zones.map((z) => z.name));
  const blank = (): Form => ({ section: null, name: '', enabled: true, family: '', proto: 'tcp udp', src: zoneNames.includes('lan') ? 'lan' : '*', srcIp: '', srcPort: '', dest: zoneNames.includes('wan') ? 'wan' : '*', destIp: '', destPort: '', icmpType: '', target: 'REJECT' });
  const edit = (r: Rule): Form => ({ section: r.section, name: r.name, enabled: r.enabled, family: r.family, proto: r.proto, src: r.src, srcIp: r.srcIp, srcPort: r.srcPort, dest: r.dest, destIp: r.destIp, destPort: r.destPort, icmpType: r.icmpType.join(' '), target: r.target });

  const errs = $derived.by(() => {
    const e: Record<string, string> = {};
    if (!form) return e;
    if (!form.name.trim()) e.name = 'Give it a name';
    for (const k of ['srcIp', 'destIp'] as const) if (form[k] && !cidrRe.test(form[k])) e[k] = 'IPv4 address or CIDR';
    for (const k of ['srcPort', 'destPort'] as const) if (!validPorts(form[k])) e[k] = 'Port or range, e.g. 80 or 8000-8100';
    if (!form.src && !form.dest) e.dest = 'Choose a source or a destination zone';
    return e;
  });
  const showPorts = $derived(form ? ['tcp udp', 'tcp', 'udp'].includes(form.proto) : false);

  function save() {
    if (!form || Object.keys(errs).length) return;
    const f = form, orig = f.section ? fw.rules.find((r) => r.section === f.section)!.raw : null;
    onapply(sectionOps('firewall', f.section ?? '', orig, {
      name: f.name.trim(), enabled: f.enabled ? undefined : '0', family: f.family, proto: f.proto === 'tcp udp' ? 'tcp udp' : f.proto,
      src: f.src, src_ip: f.srcIp.trim(), src_port: showPorts ? f.srcPort.trim() : '', dest: f.dest, dest_ip: f.destIp.trim(), dest_port: showPorts ? f.destPort.trim() : '',
      icmp_type: f.proto === 'icmp' ? f.icmpType.split(/\s+/).filter(Boolean) : [], target: f.target,
    }, 'rule'), f.section ? `Rule “${f.name}” updated` : `Rule “${f.name}” added`);
    form = null;
  }
  const toggle = (r: Rule) => onapply(sectionOps('firewall', r.section, r.raw, { enabled: r.enabled ? '0' : undefined }), `Rule “${r.name}” ${r.enabled ? 'disabled' : 'enabled'}`);
  function remove(r: Rule) {
    if (confirmDel !== r.section) { confirmDel = r.section; return; }
    confirmDel = ''; onapply([{ op: 'del', config: 'firewall', section: r.section }], `Rule “${r.name}” deleted`);
  }
  function move(i: number, d: -1 | 1) {
    const ids = fw.rules.map((r) => r.section), j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    onapply([{ op: 'order', config: 'firewall', sections: ids }], 'Rule order changed');
  }
  const zone = (z: string, router: string) => (z === '' ? router : z === '*' ? 'any zone' : z);
  const match = (r: Rule) => {
    const parts = [protoLabel(r.proto)];
    if (r.proto === 'icmp' && r.icmpType.length) parts.push(r.icmpType.slice(0, 2).join(', ') + (r.icmpType.length > 2 ? '…' : ''));
    if (r.srcIp) parts.push(`from ${r.srcIp}`);
    if (r.srcPort) parts.push(`sport ${r.srcPort}`);
    if (r.destIp) parts.push(`to ${r.destIp}`);
    if (r.destPort) parts.push(`dport ${r.destPort}`);
    if (r.family) parts.push(r.family);
    return parts.join(' · ');
  };
</script>

<div class="card">
  <div class="card-title">
    <h2>Traffic rules <span class="faint">{fw.rules.length}</span></h2>
    <button class="btn primary" onclick={() => (form = blank())}><Icon name="plus" size={16} />Add rule</button>
  </div>
  <p class="muted note">Rules are evaluated top to bottom; the first match wins. Use the arrows to change the order.</p>
  <div class="tw"><table class="tbl">
    <thead><tr><th></th><th>Name</th><th>From → To</th><th>Match</th><th>Action</th><th></th></tr></thead>
    <tbody>
      {#each fw.rules as r, i (r.section)}
        <tr class:off-row={!r.enabled}>
          <td><Toggle checked={r.enabled} onchange={() => toggle(r)} /></td>
          <td><b>{r.name || '(unnamed)'}</b></td>
          <td class="num">{zone(r.src, 'Router')} → {zone(r.dest, 'Router')}</td>
          <td class="muted">{match(r)}</td>
          <td><span class="tag {r.target}">{r.target}</span></td>
          <td><div class="row-actions">
            <button class="btn icon" aria-label="Move up" disabled={i === 0} onclick={() => move(i, -1)}><Icon name="up" size={14} /></button>
            <button class="btn icon" aria-label="Move down" disabled={i === fw.rules.length - 1} onclick={() => move(i, 1)}><Icon name="down" size={14} /></button>
            <button class="btn icon" aria-label="Edit" onclick={() => (form = edit(r))}><Icon name="settings" size={15} /></button>
            {#if confirmDel === r.section}
              <button class="btn sm danger" onclick={() => remove(r)} onblur={() => (confirmDel = '')}>Confirm delete</button>
            {:else}
              <button class="btn icon danger" aria-label="Delete" onclick={() => remove(r)}><Icon name="trash" size={15} /></button>
            {/if}
          </div></td>
        </tr>
      {/each}
    </tbody>
  </table></div>
</div>

<Drawer open={!!form} title={form?.section ? 'Edit rule' : 'New rule'} onclose={() => (form = null)}>
  {#if form}
    <form class="form" onsubmit={(e) => { e.preventDefault(); save(); }}>
      <label class="fld">Name<input class="input" bind:value={form.name} placeholder="e.g. Block guest to NAS" aria-invalid={!!errs.name} />{#if errs.name}<small class="err">{errs.name}</small>{/if}</label>
      <Toggle bind:checked={form.enabled} label="Enabled" />
      <div class="two">
        <label class="fld">Action<select class="input" bind:value={form.target}><option>ACCEPT</option><option>REJECT</option><option>DROP</option></select></label>
        <label class="fld">Address family<select class="input" bind:value={form.family}><option value="">IPv4 + IPv6</option><option value="ipv4">IPv4 only</option><option value="ipv6">IPv6 only</option></select></label>
      </div>
      <label class="fld">Protocol<select class="input" bind:value={form.proto}>{#each PROTOS as p}<option value={p.v}>{p.label}</option>{/each}</select></label>
      {#if form.proto === 'icmp'}<label class="fld">ICMP types <span class="hint">(space separated, blank = all)</span><input class="input" bind:value={form.icmpType} placeholder="echo-request" /></label>{/if}
      <div class="two">
        <label class="fld">Source zone<select class="input" bind:value={form.src}><option value="">Router (output)</option><option value="*">Any zone</option>{#each zoneNames as z}<option>{z}</option>{/each}</select></label>
        <label class="fld">Destination zone<select class="input" bind:value={form.dest}><option value="">Router (input)</option><option value="*">Any zone</option>{#each zoneNames as z}<option>{z}</option>{/each}</select>{#if errs.dest}<small class="err">{errs.dest}</small>{/if}</label>
      </div>
      <div class="two">
        <label class="fld">Source IP <span class="hint">(optional)</span><input class="input" bind:value={form.srcIp} placeholder="any" aria-invalid={!!errs.srcIp} />{#if errs.srcIp}<small class="err">{errs.srcIp}</small>{/if}</label>
        <label class="fld">Destination IP <span class="hint">(optional)</span><input class="input" bind:value={form.destIp} placeholder="any" aria-invalid={!!errs.destIp} />{#if errs.destIp}<small class="err">{errs.destIp}</small>{/if}</label>
      </div>
      {#if showPorts}
        <div class="two">
          <label class="fld">Source port<input class="input" bind:value={form.srcPort} placeholder="any" aria-invalid={!!errs.srcPort} />{#if errs.srcPort}<small class="err">{errs.srcPort}</small>{/if}</label>
          <label class="fld">Destination port<input class="input" bind:value={form.destPort} placeholder="any" aria-invalid={!!errs.destPort} />{#if errs.destPort}<small class="err">{errs.destPort}</small>{/if}</label>
        </div>
      {/if}
      <div class="form-actions"><button type="button" class="btn" onclick={() => (form = null)}>Cancel</button><button class="btn primary" disabled={Object.keys(errs).length > 0}>Save &amp; apply</button></div>
    </form>
  {/if}
</Drawer>

<style> .note { margin: -6px 0 12px; font-size: 13px; } </style>
