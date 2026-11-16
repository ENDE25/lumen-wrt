<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '../../components/Icon.svelte';
  import Toggle from '../../components/Toggle.svelte';
  import { changes } from '../../lib/changes.svelte';
  import { live } from '../../lib/live.svelte';
  import { uciGet, str } from '../../lib/uci';
  import { loadNet, validName, buildNewInterface, type NewIf, type NetCfg } from '../../lib/netdevs';
  import { validV4, validV4Cidr } from '../../lib/routing';

  let { ondone }: { ondone: () => void } = $props();

  let net = $state<NetCfg | null>(null), zones = $state<string[]>([]);
  let f = $state<NewIf>({ name: '', proto: 'static', device: '', ipaddr: '', gateway: '', dns: '', username: '', password: '', zone: '', dhcpServer: false });
  onMount(async () => {
    net = await loadNet().catch(() => null);
    zones = Object.values(await uciGet('firewall').catch(() => ({}))).filter((s) => s['.type'] === 'zone').map((s) => str(s.name));
  });

  // Anything the interface could run on: ports, bridges, and VLAN devices of bridges.
  const devices = $derived.by(() => {
    const used = new Map((net?.ifaces ?? []).map((i) => [str(i.device) || str(i.ifname), i['.name']]));
    const names = new Set<string>(Object.keys(live.devices).filter((d) => d !== 'lo' && !d.startsWith('phy') ));
    (net?.bridges ?? []).forEach((b) => names.add(b.name));
    (net?.vlans ?? []).forEach((v) => names.add(`${v.device}.${v.vlan}`));
    return [...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((n) => ({ n, used: used.get(n) }));
  });

  const err = $derived.by(() => {
    if (!validName(f.name)) return 'Name: lowercase letters, digits and _ (starting with a letter), up to 15 characters';
    if (net?.ifaces.some((i) => i['.name'] === f.name)) return 'An interface with this name already exists';
    if (!f.device) return 'Choose the port or bridge it runs on';
    if (f.proto === 'static') {
      if (!f.ipaddr.includes('/') || !validV4Cidr(f.ipaddr)) return 'Address must include its prefix, for example 192.168.20.1/24';
      if (f.gateway && !validV4(f.gateway)) return 'Gateway must be an IPv4 address';
    }
    if (f.proto === 'pppoe' && !f.username.trim()) return 'PPPoE needs the username from your provider';
    if (f.dns.split(/[\s,]+/).filter(Boolean).some((d) => !validV4(d) && !/^[0-9a-fA-F:]+$/.test(d))) return 'DNS servers must be IP addresses';
    return '';
  });
  const usedBy = $derived(devices.find((d) => d.n === f.device)?.used);

  let busy = $state(false);
  async function create() {
    if (err) return;
    busy = true;
    const ops = await buildNewInterface(f);
    const ok = await changes.apply(ops, 'manual', `Interface “${f.name}” created`);
    busy = false;
    if (ok) ondone();
  }
</script>

<div class="form">
  <label><span>Name</span><input class="input" bind:value={f.name} placeholder="guest" autocomplete="off" /></label>
  <label><span>Protocol</span><select class="input" bind:value={f.proto}><option value="static">Static address</option><option value="dhcp">DHCP client</option><option value="pppoe">PPPoE</option></select></label>
  <label><span>Runs on</span>
    <select class="input" bind:value={f.device}><option value="">Choose…</option>{#each devices as d}<option value={d.n}>{d.n}{d.used ? ` (used by ${d.used})` : ''}</option>{/each}</select></label>
  {#if usedBy}<small class="warn">This port or bridge already carries “{usedBy}”. Two interfaces on the same device can conflict; for a separate network, use a bridge VLAN.</small>{/if}

  {#if f.proto === 'static'}
    <label><span>IPv4 address <small class="faint">with prefix</small></span><input class="input" bind:value={f.ipaddr} placeholder="192.168.20.1/24" /></label>
    <label><span>Gateway <small class="faint">optional · leave empty for a local network</small></span><input class="input" bind:value={f.gateway} /></label>
    <div><Toggle bind:checked={f.dhcpServer} label="Hand out addresses to devices here (DHCP server)" /></div>
  {/if}
  {#if f.proto === 'pppoe'}
    <label><span>Username</span><input class="input" bind:value={f.username} autocomplete="off" /></label>
    <label><span>Password</span><input class="input" type="password" bind:value={f.password} autocomplete="new-password" /></label>
  {/if}
  <label><span>DNS servers <small class="faint">optional · one per line</small></span><textarea class="input" rows="2" bind:value={f.dns}></textarea></label>
  <label><span>Firewall zone</span>
    <select class="input" bind:value={f.zone}><option value="">None (traffic is blocked)</option>{#each zones as z}<option>{z}</option>{/each}</select>
    <small class="faint">Pick “lan” for a trusted network, “wan” for an internet uplink. An interface without a zone cannot talk to the router or other networks.</small></label>

  {#if f.name && err}<small class="bad">{err}</small>{/if}
  <p class="alert"><Icon name="alert" size={16} /><span>It is applied with a 30-second safety timer: confirm if everything still works, or it rolls back by itself.</span></p>
  <div class="row"><button class="btn primary" disabled={!!err || busy} onclick={create}>Create interface</button><button class="btn" onclick={ondone}>Cancel</button></div>
</div>

<style>
  .form { display: grid; gap: 14px; }
  label { display: grid; gap: 5px; } label > span { font-size: 13px; color: var(--text-2); }
  textarea.input { font-family: var(--mono, monospace); resize: vertical; }
  .bad { color: var(--bad, #dc2626); } .warn { color: var(--warn, #d97706); }
  .row { display: flex; gap: 10px; } .form :global(.alert) { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; }
</style>
