<script lang="ts">
  import Icon from '../../components/Icon.svelte';
  import Toggle from '../../components/Toggle.svelte';
  import Drawer from '../../components/Drawer.svelte';
  import { sectionOps, type UciOp } from '../../lib/uci';
  import { PROTOS, ipv4Re, protoLabel, validPorts, type Firewall, type Redirect } from '../../lib/firewall';
  import type { Client } from '../../lib/types';

  let { fw, clients, onapply }: { fw: Firewall; clients: Client[]; onapply: (ops: UciOp[], label: string) => void } = $props();

  interface Form { section: string | null; name: string; enabled: boolean; proto: string; src: string; srcDport: string; srcIp: string; dest: string; destIp: string; destPort: string }
  let form = $state<Form | null>(null);
  let confirmDel = $state('');

  const zoneNames = $derived(fw.zones.map((z) => z.name));
  const blank = (): Form => ({ section: null, name: '', enabled: true, proto: 'tcp udp', src: zoneNames.includes('wan') ? 'wan' : zoneNames[0] ?? '', srcDport: '', srcIp: '', dest: zoneNames.includes('lan') ? 'lan' : zoneNames[0] ?? '', destIp: '', destPort: '' });
  const edit = (r: Redirect): Form => ({ section: r.section, name: r.name, enabled: r.enabled, proto: r.proto, src: r.src, srcDport: r.srcDport, srcIp: r.srcIp, dest: r.dest, destIp: r.destIp, destPort: r.destPort });

  const errs = $derived.by(() => {
    const e: Record<string, string> = {};
    if (!form) return e;
    if (!form.name.trim()) e.name = 'Give it a name';
    if (!form.srcDport.trim() || !validPorts(form.srcDport)) e.srcDport = 'Port or range, e.g. 80 or 8000-8100';
    if (!ipv4Re.test(form.destIp)) e.destIp = 'Enter an IPv4 address';
    if (!validPorts(form.destPort)) e.destPort = 'Port or range';
    if (form.srcIp && !/^[0-9./]+$/.test(form.srcIp)) e.srcIp = 'IPv4 address or CIDR';
    return e;
  });

  function save() {
    if (!form || Object.keys(errs).length) return;
    const f = form, orig = f.section ? fw.redirects.find((r) => r.section === f.section)!.raw : null;
    onapply(sectionOps('firewall', f.section ?? '', orig, {
      name: f.name.trim(), enabled: f.enabled ? undefined : '0', proto: f.proto, src: f.src, src_dport: f.srcDport.trim(), src_ip: f.srcIp.trim(),
      dest: f.dest, dest_ip: f.destIp, dest_port: f.destPort.trim(), target: 'DNAT',
    }, 'redirect'), f.section ? `Port forward “${f.name}” updated` : `Port forward “${f.name}” added`);
    form = null;
  }
  const toggle = (r: Redirect) => onapply(sectionOps('firewall', r.section, r.raw, { enabled: r.enabled ? '0' : undefined }), `Port forward “${r.name}” ${r.enabled ? 'disabled' : 'enabled'}`);
  function remove(r: Redirect) {
    if (confirmDel !== r.section) { confirmDel = r.section; return; }
    confirmDel = ''; onapply([{ op: 'del', config: 'firewall', section: r.section }], `Port forward “${r.name}” deleted`);
  }
  const who = (ip: string) => clients.find((c) => c.ip === ip)?.name;
</script>

<div class="card tw0">
  <div class="card-title">
    <h2>Port forwards <span class="faint">{fw.redirects.length}</span></h2>
    <button class="btn primary" onclick={() => (form = blank())}><Icon name="plus" size={16} />Add port forward</button>
  </div>
  {#if fw.redirects.length}
    <div class="tw"><table class="tbl">
      <thead><tr><th></th><th>Name</th><th>Incoming</th><th>Forwarded to</th><th></th></tr></thead>
      <tbody>
        {#each fw.redirects as r (r.section)}
          <tr class:off-row={!r.enabled}>
            <td><Toggle checked={r.enabled} onchange={() => toggle(r)} /></td>
            <td><b>{r.name || '(unnamed)'}</b></td>
            <td class="num">{r.src} · {protoLabel(r.proto)} <b>:{r.srcDport || '*'}</b>{#if r.srcIp}<span class="faint"> from {r.srcIp}</span>{/if}</td>
            <td class="num">{r.destIp}<b>:{r.destPort || r.srcDport}</b> <span class="faint">({r.dest}{who(r.destIp) ? ` · ${who(r.destIp)}` : ''})</span></td>
            <td><div class="row-actions">
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
  {:else}
    <p class="muted">No port forwards. A port forward sends traffic arriving on one of the router's ports to a device on your network.</p>
  {/if}
</div>

<Drawer open={!!form} title={form?.section ? 'Edit port forward' : 'New port forward'} onclose={() => (form = null)}>
  {#if form}
    <form class="form" onsubmit={(e) => { e.preventDefault(); save(); }}>
      <label class="fld">Name<input class="input" bind:value={form.name} placeholder="e.g. Web server" aria-invalid={!!errs.name} />{#if errs.name}<small class="err">{errs.name}</small>{/if}</label>
      <Toggle bind:checked={form.enabled} label="Enabled" />
      <div class="two">
        <label class="fld">Protocol<select class="input" bind:value={form.proto}>{#each PROTOS.slice(0, 3) as p}<option value={p.v}>{p.label}</option>{/each}</select></label>
        <label class="fld">Incoming zone<select class="input" bind:value={form.src}>{#each zoneNames as z}<option>{z}</option>{/each}</select></label>
      </div>
      <label class="fld">External port<input class="input" bind:value={form.srcDport} placeholder="80 or 8000-8100" aria-invalid={!!errs.srcDport} />{#if errs.srcDport}<small class="err">{errs.srcDport}</small>{/if}</label>
      <label class="fld">Only from source IP <span class="hint">(optional)</span><input class="input" bind:value={form.srcIp} placeholder="any" aria-invalid={!!errs.srcIp} />{#if errs.srcIp}<small class="err">{errs.srcIp}</small>{/if}</label>
      <div class="two">
        <label class="fld">Internal zone<select class="input" bind:value={form.dest}>{#each zoneNames as z}<option>{z}</option>{/each}</select></label>
        <label class="fld">Internal port <span class="hint">(blank = same)</span><input class="input" bind:value={form.destPort} aria-invalid={!!errs.destPort} /></label>
      </div>
      <label class="fld">Internal IP
        <input class="input" list="fw-clients" bind:value={form.destIp} placeholder="192.168.1.50" aria-invalid={!!errs.destIp} />
        <datalist id="fw-clients">{#each clients.filter((c) => c.ip) as c}<option value={c.ip}>{c.name || c.mac}</option>{/each}</datalist>
        {#if errs.destIp}<small class="err">{errs.destIp}</small>{/if}
      </label>
      <div class="form-actions"><button type="button" class="btn" onclick={() => (form = null)}>Cancel</button><button class="btn primary" disabled={Object.keys(errs).length > 0}>Save &amp; apply</button></div>
    </form>
  {/if}
</Drawer>
