<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import Toggle from '../components/Toggle.svelte';
  import { changes } from '../lib/changes.svelte';
  import { uciGet, str, asList, type UciConfig, type UciOp, type UciValue } from '../lib/uci';
  import { getClients } from '../lib/api';
  import type { Client } from '../lib/types';

  interface Pool { name: string; iface: string; enabled: boolean; start: string; limit: string; leasetime: string }
  interface Dns { section: string; domain: string; local: string; cachesize: string; rebind: boolean; noresolv: boolean; servers: string }
  interface Host { id: string; name: string; mac: string; ip: string; leasetime: string; del?: boolean }

  let loaded = $state(false);
  let loadErr = $state('');
  let orig = $state<{ pools: Pool[]; dns: Dns | null; hosts: Host[] }>({ pools: [], dns: null, hosts: [] });
  let pools = $state<Pool[]>([]);
  let dns = $state<Dns | null>(null);
  let hosts = $state<Host[]>([]);
  let clients = $state<Client[]>([]);
  let n = 0;

  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

  function parse(c: UciConfig) {
    const all = Object.values(c);
    const p: Pool[] = all.filter((s) => s['.type'] === 'dhcp' && s.interface).map((s) => ({
      name: s['.name'], iface: str(s.interface), enabled: str(s.ignore) !== '1',
      start: str(s.start) || '100', limit: str(s.limit) || '150', leasetime: str(s.leasetime) || '12h',
    }));
    const d = all.find((s) => s['.type'] === 'dnsmasq');
    const dn: Dns | null = d ? {
      section: d['.name'], domain: str(d.domain), local: str(d.local), cachesize: str(d.cachesize) || '150',
      rebind: str(d.rebind_protection) !== '0', noresolv: str(d.noresolv) === '1', servers: asList(d.server).join('\n'),
    } : null;
    const h: Host[] = all.filter((s) => s['.type'] === 'host').map((s) => ({
      id: s['.name'], name: str(s.name), mac: str(s.mac), ip: str(s.ip), leasetime: str(s.leasetime),
    }));
    return { pools: p, dns: dn, hosts: h };
  }

  async function load() {
    try {
      const r = parse(await uciGet('dhcp'));
      orig = clone(r); pools = clone(r.pools); dns = clone(r.dns); hosts = clone(r.hosts);
      loadErr = '';
    } catch (e) { loadErr = e instanceof Error ? e.message : String(e); }
    loaded = true;
  }
  onMount(() => { load(); getClients().then((c) => (clients = c)).catch(() => {}); });

  // ---------- validation
  const ipRe = /^((25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(25[0-5]|2[0-4]\d|1?\d?\d)$/;
  const macRe = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i;
  const leaseRe = /^(\d+[smhdw]?|infinite)$/i;
  const int = (v: string, lo: number, hi: number) => /^\d+$/.test(v) && +v >= lo && +v <= hi;

  const errs = $derived.by(() => {
    const e: Record<string, string> = {};
    pools.forEach((p, i) => {
      if (!int(p.start, 1, 254)) e[`p${i}.start`] = 'Entre 1 y 254';
      if (!int(p.limit, 1, 1024)) e[`p${i}.limit`] = 'Entre 1 y 1024';
      if (!leaseRe.test(p.leasetime)) e[`p${i}.leasetime`] = 'Ej.: 12h, 30m, infinite';
    });
    if (dns) {
      if (!int(dns.cachesize, 0, 10000)) e['dns.cachesize'] = 'Entre 0 y 10000';
      for (const l of dns.servers.split('\n').map((x) => x.trim()).filter(Boolean))
        if (!ipRe.test(l) && !/^[0-9a-f:]+$/i.test(l) && !/^\/.+\/.+$/.test(l)) { e['dns.servers'] = `Servidor no válido: ${l}`; break; }
    }
    hosts.forEach((h, i) => {
      if (h.del) return;
      if (!macRe.test(h.mac)) e[`h${i}.mac`] = 'MAC no válida';
      if (!ipRe.test(h.ip)) e[`h${i}.ip`] = 'IP no válida';
      if (h.leasetime && !leaseRe.test(h.leasetime)) e[`h${i}.leasetime`] = 'No válido';
      if (hosts.some((o, j) => j < i && !o.del && o.mac.toLowerCase() === h.mac.toLowerCase())) e[`h${i}.mac`] = 'MAC duplicada';
      if (hosts.some((o, j) => j < i && !o.del && o.ip === h.ip)) e[`h${i}.ip`] = 'IP duplicada';
    });
    return e;
  });

  // ---------- diff -> uci ops
  const ops = $derived.by(() => {
    const out: UciOp[] = [];
    pools.forEach((p, i) => {
      const o = orig.pools[i]; if (!o) return;
      const v: Record<string, UciValue> = {};
      if (p.start !== o.start) v.start = p.start;
      if (p.limit !== o.limit) v.limit = p.limit;
      if (p.leasetime !== o.leasetime) v.leasetime = p.leasetime;
      if (Object.keys(v).length) out.push({ op: 'set', config: 'dhcp', section: p.name, values: v });
      if (p.enabled !== o.enabled) {
        if (p.enabled) out.push({ op: 'del-option', config: 'dhcp', section: p.name, option: 'ignore' });
        else out.push({ op: 'set', config: 'dhcp', section: p.name, values: { ignore: '1' } });
      }
    });
    if (dns && orig.dns) {
      const o = orig.dns, v: Record<string, UciValue> = {};
      if (dns.domain !== o.domain) v.domain = dns.domain;
      if (dns.local !== o.local) v.local = dns.local;
      if (dns.cachesize !== o.cachesize) v.cachesize = dns.cachesize;
      if (dns.rebind !== o.rebind) v.rebind_protection = dns.rebind ? '1' : '0';
      if (dns.noresolv !== o.noresolv) v.noresolv = dns.noresolv ? '1' : '0';
      const list = (t: string) => t.split('\n').map((x) => x.trim()).filter(Boolean);
      if (list(dns.servers).join() !== list(o.servers).join()) {
        if (list(dns.servers).length) v.server = list(dns.servers);
        else out.push({ op: 'del-option', config: 'dhcp', section: dns.section, option: 'server' });
      }
      if (Object.keys(v).length) out.push({ op: 'set', config: 'dhcp', section: dns.section, values: v });
    }
    for (const h of hosts) {
      const o = orig.hosts.find((x) => x.id === h.id);
      const vals = (): Record<string, UciValue> => {
        const r: Record<string, UciValue> = { name: h.name.trim(), mac: h.mac.toUpperCase(), ip: h.ip };
        if (h.leasetime) r.leasetime = h.leasetime;
        return r;
      };
      if (!o) { if (!h.del) out.push({ op: 'add', config: 'dhcp', type: 'host', values: vals() }); continue; }
      if (h.del) { out.push({ op: 'del', config: 'dhcp', section: h.id }); continue; }
      if (h.name !== o.name || h.mac !== o.mac || h.ip !== o.ip || h.leasetime !== o.leasetime) {
        out.push({ op: 'set', config: 'dhcp', section: h.id, values: vals() });
        if (!h.leasetime && o.leasetime) out.push({ op: 'del-option', config: 'dhcp', section: h.id, option: 'leasetime' });
      }
    }
    return out;
  });

  const dirty = $derived(ops.length > 0);
  const invalid = $derived(Object.keys(errs).length > 0);
  const busy = $derived(changes.phase !== 'idle');

  function addHost(from?: Client) {
    hosts.push({ id: `new${++n}`, name: from?.name ?? '', mac: from?.mac.toUpperCase() ?? '', ip: from?.ip ?? '', leasetime: '' });
  }
  function removeHost(h: Host) {
    if (h.id.startsWith('new')) hosts = hosts.filter((x) => x !== h); else h.del = true;
  }
  function discard() { pools = clone(orig.pools); dns = clone(orig.dns); hosts = clone(orig.hosts); }
  async function save() {
    if (invalid || !dirty) return;
    const ok = await changes.apply(ops, 'auto', 'Configuración DHCP/DNS aplicada');
    if (ok) await load();
  }
  const free = $derived(clients.filter((c) => c.ip && !hosts.some((h) => !h.del && h.mac.toLowerCase() === c.mac.toLowerCase())));
  const shownHosts = $derived(hosts.map((h, i) => ({ h, i })).filter(({ h }) => !h.del));
</script>

<div class="page">
  <div class="page-head">
    <h1>DHCP y DNS</h1>
    <div class="actions">
      {#if dirty}<span class="muted">{ops.length} {ops.length === 1 ? 'cambio' : 'cambios'} sin aplicar</span>{/if}
      <button class="btn" onclick={discard} disabled={!dirty || busy}>Descartar</button>
      <button class="btn primary" onclick={save} disabled={!dirty || invalid || busy}>Guardar y aplicar</button>
    </div>
  </div>

  {#if loadErr}
    <div class="card"><p class="muted">No se pudo leer la configuración: {loadErr}</p></div>
  {:else if !loaded}
    <div class="card"><p class="muted">Cargando…</p></div>
  {:else}
    <div class="grid cols">
      <div class="card">
        <div class="card-title"><h2>Servidor DHCP</h2></div>
        {#each pools as p, i (p.name)}
          <fieldset>
            <legend>Interfaz <b>{p.iface}</b></legend>
            <Toggle bind:checked={p.enabled} label={p.enabled ? 'Habilitado' : 'Deshabilitado'} />
            <div class="f3" class:off={!p.enabled}>
              <label>Primera IP (offset)<input class="input" bind:value={p.start} inputmode="numeric" disabled={!p.enabled} aria-invalid={!!errs[`p${i}.start`]} />{#if errs[`p${i}.start`]}<small class="err">{errs[`p${i}.start`]}</small>{/if}</label>
              <label>Nº de direcciones<input class="input" bind:value={p.limit} inputmode="numeric" disabled={!p.enabled} aria-invalid={!!errs[`p${i}.limit`]} />{#if errs[`p${i}.limit`]}<small class="err">{errs[`p${i}.limit`]}</small>{/if}</label>
              <label>Tiempo de concesión<input class="input" bind:value={p.leasetime} disabled={!p.enabled} aria-invalid={!!errs[`p${i}.leasetime`]} />{#if errs[`p${i}.leasetime`]}<small class="err">{errs[`p${i}.leasetime`]}</small>{/if}</label>
            </div>
          </fieldset>
        {:else}
          <p class="muted">No hay servidores DHCP configurados.</p>
        {/each}
      </div>

      {#if dns}
        <div class="card">
          <div class="card-title"><h2>DNS</h2></div>
          <div class="f2">
            <label>Dominio local<input class="input" bind:value={dns.domain} placeholder="lan" /></label>
            <label>Resolver local<input class="input" bind:value={dns.local} placeholder="/lan/" /></label>
            <label>Tamaño de caché<input class="input" bind:value={dns.cachesize} inputmode="numeric" aria-invalid={!!errs['dns.cachesize']} />{#if errs['dns.cachesize']}<small class="err">{errs['dns.cachesize']}</small>{/if}</label>
          </div>
          <label class="full">Servidores DNS ascendentes <span class="faint">(uno por línea)</span>
            <textarea class="input ta" rows="3" bind:value={dns.servers} placeholder="1.1.1.1&#10;9.9.9.9" aria-invalid={!!errs['dns.servers']}></textarea>
            {#if errs['dns.servers']}<small class="err">{errs['dns.servers']}</small>{/if}
          </label>
          <div class="tgs">
            <Toggle bind:checked={dns.rebind} label="Protección contra DNS rebinding" />
            <Toggle bind:checked={dns.noresolv} label="Ignorar DNS del proveedor (usar solo los de arriba)" />
          </div>
        </div>
      {/if}
    </div>

    <div class="card" style="margin-top:16px">
      <div class="card-title">
        <h2>Reservas de IP estáticas <span class="faint">{shownHosts.length}</span></h2>
        <div class="actions">
          {#if free.length}
            <select class="input pick" aria-label="Añadir desde un cliente conocido" onchange={(e) => { const c = free.find((x) => x.mac === e.currentTarget.value); if (c) addHost(c); e.currentTarget.value = ''; }}>
              <option value="">Añadir desde un cliente…</option>
              {#each free as c}<option value={c.mac}>{c.name || c.mac} — {c.ip}</option>{/each}
            </select>
          {/if}
          <button class="btn" onclick={() => addHost()}><Icon name="plus" size={16} />Añadir</button>
        </div>
      </div>
      {#if shownHosts.length}
        <div class="tw"><table class="tbl">
          <thead><tr><th>Nombre</th><th>MAC</th><th>IP</th><th>Concesión</th><th></th></tr></thead>
          <tbody>
            {#each shownHosts as { h, i } (h.id)}
              <tr>
                <td><input class="input" bind:value={h.name} placeholder="nombre" aria-label="Nombre" /></td>
                <td><input class="input mono" bind:value={h.mac} placeholder="AA:BB:CC:DD:EE:FF" aria-label="MAC" aria-invalid={!!errs[`h${i}.mac`]} />{#if errs[`h${i}.mac`]}<small class="err">{errs[`h${i}.mac`]}</small>{/if}</td>
                <td><input class="input" bind:value={h.ip} placeholder="192.168.1.50" aria-label="IP" aria-invalid={!!errs[`h${i}.ip`]} />{#if errs[`h${i}.ip`]}<small class="err">{errs[`h${i}.ip`]}</small>{/if}</td>
                <td><input class="input narrow" bind:value={h.leasetime} placeholder="por defecto" aria-label="Concesión" aria-invalid={!!errs[`h${i}.leasetime`]} /></td>
                <td><button class="btn icon danger" onclick={() => removeHost(h)} aria-label="Eliminar reserva"><Icon name="trash" size={16} /></button></td>
              </tr>
            {/each}
          </tbody>
        </table></div>
      {:else}
        <p class="muted">No hay reservas. Una reserva asigna siempre la misma IP a un dispositivo.</p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .cols { grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); align-items: start; }
  fieldset { border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 14px 16px 16px; margin: 0 0 12px; }
  legend { padding: 0 6px; color: var(--text-2); font-size: 13px; }
  .f3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 14px; }
  .f2 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 14px; }
  .f3.off { opacity: .5; }
  label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 500; }
  label.full { margin-bottom: 14px; }
  .ta { height: auto; padding: 9px 12px; font-family: var(--mono); font-size: 12.5px; resize: vertical; }
  .tgs { display: grid; gap: 12px; }
  .err { color: var(--bad); font-size: 12px; font-weight: 400; }
  [aria-invalid='true'] { border-color: var(--bad); }
  .tw { overflow-x: auto; margin: 0 -20px -8px; }
  .tbl td { vertical-align: top; padding: 8px 10px; }
  .tbl th:first-child, .tbl td:first-child { padding-left: 20px; }
  .narrow { width: 110px; } .pick { width: 230px; }
  .btn.icon { padding: 0; width: 34px; justify-content: center; }
  @media (max-width: 640px) { .f3, .f2 { grid-template-columns: 1fr; } }
</style>
