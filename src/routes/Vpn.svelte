<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import Drawer from '../components/Drawer.svelte';
  import QrCode from '../components/QrCode.svelte';
  import { changes } from '../lib/changes.svelte';
  import { live } from '../lib/live.svelte';
  import { bytes } from '../lib/format';
  import { str } from '../lib/uci';
  import {
    addPeerOps, clientConfText, deletePeerOps, deleteTunnelOps, editPeerOps, hostOf, importOps, isPrivateV4, loadRuntime, loadWg, netOf, newKeyPair, newPsk,
    nextPeerIp, parseTunnels, parseWgConf, peerState, serverOps, tunnelPublicKey, validAllowed, validPort, validTunnelName, NO_RUNTIME,
    type PeerForm, type WgData, type WgImport, type WgPeer, type WgRuntime, type WgTunnel,
  } from '../lib/wireguard';

  let data = $state<WgData | null>(null);
  let runtime = $state<WgRuntime>(NO_RUNTIME);
  let loadErr = $state('');
  async function load() {
    try { data = await loadWg(); runtime = data.runtime; loadErr = ''; } catch (e) { loadErr = e instanceof Error ? e.message : String(e); }
  }
  onMount(() => {
    load();
    const stop = live.start();
    const t = setInterval(async () => { runtime = await loadRuntime(); }, 8000);
    return () => { stop(); clearInterval(t); };
  });
  const parsed = $derived(data ? parseTunnels(data.network, data.firewall, runtime) : { tunnels: [] as WgTunnel[], zones: [] as string[] });
  const tunnels = $derived(parsed.tunnels);
  const upOf = (name: string) => live.interfaces.find((i) => i.interface === name)?.up ?? false;

  // ---- facts about this router that the forms need
  const wanIp = $derived(live.wan?.['ipv4-address']?.[0]?.address ?? '');
  const behindNat = $derived(!!wanIp && isPrivateV4(wanIp));
  // DNS for the devices: the router's LAN address (dnsmasq always answers there); the tunnel address is only a fallback
  const lanIp = $derived(live.interfaces.find((i) => i.interface === 'lan')?.['ipv4-address']?.[0]?.address ?? '');
  const lanNets = $derived(live.interfaces.filter((i) => i.interface === 'lan').flatMap((i) => (i['ipv4-address'] ?? []).map((a) => netOf(`${a.address}/${a.mask}`))));

  // ---- the panel that is open: one at a time
  type Panel = { kind: 'server' } | { kind: 'import' } | { kind: 'addPeer'; t: WgTunnel } | { kind: 'editPeer'; t: WgTunnel; p: WgPeer } | null;
  let panel = $state<Panel>(null);
  const title = $derived(!panel ? '' : panel.kind === 'server' ? 'New remote access server' : panel.kind === 'import' ? 'Import a VPN connection' : panel.kind === 'addPeer' ? `Add a device to ${panel.t.name}` : panel.p.name);
  let busy = $state(false);
  let err = $state('');
  const close = () => { panel = null; err = ''; busy = false; result = null; };

  async function run(ops: Parameters<typeof changes.apply>[0], label: string): Promise<boolean> {
    const ok = await changes.apply(ops, 'manual', label);
    if (ok) await load();
    return ok;
  }

  // ---- new server
  let sf = $state({ name: 'wg0', port: '51820', address: '10.8.0.1/24', zone: 'lan', openWan: true });
  function openServer() {
    const taken = new Set([...live.interfaces.flatMap((i) => (i['ipv4-address'] ?? []).map((a) => netOf(`${a.address}/${a.mask}`)))]);
    let n = 8; while (taken.has(`10.${n}.0.0/24`) && n < 60) n++;
    const used = new Set(tunnels.map((t) => t.name));
    let name = 'wg0', k = 0; while (used.has(name) || live.interfaces.some((i) => i.interface === name)) name = `wg${++k}`;
    sf = { name, port: String(51820 + k), address: `10.${n}.0.1/24`, zone: parsed.zones.includes('lan') ? 'lan' : '', openWan: true };
    err = ''; panel = { kind: 'server' };
  }
  const serverErr = $derived.by(() => {
    if (!validTunnelName(sf.name)) return 'Name: lowercase letters, digits and _ (starting with a letter), up to 15 characters';
    if (live.interfaces.some((i) => i.interface === sf.name) || tunnels.some((t) => t.name === sf.name)) return 'An interface with this name already exists';
    if (!validPort(sf.port)) return 'The port is a number from 1 to 65535';
    if (!/^[\d.]+\/\d{1,2}$/.test(sf.address) || +sf.address.split('/')[1] > 30) return 'The tunnel address needs its prefix, for example 10.8.0.1/24';
    return '';
  });
  async function createServer() {
    if (serverErr) return;
    busy = true; err = '';
    try {
      const k = await newKeyPair();
      if (await run(serverOps(sf, k.private, data!.firewall), `Tunnel “${sf.name}” created`)) close();
    } catch (e) { err = e instanceof Error ? e.message : String(e); }
    busy = false;
  }

  // ---- add a device (peer) to a server
  let pf = $state({ name: '', address: '', keepalive: '25', psk: true, full: true, dns: true, host: '', port: '' });
  let result = $state<{ text: string; name: string } | null>(null);
  let copied = $state(false);
  function openAddPeer(t: WgTunnel) {
    pf = { name: '', address: nextPeerIp(t), keepalive: '25', psk: true, full: true, dns: true, host: behindNat ? '' : wanIp, port: t.port };
    err = ''; result = null; panel = { kind: 'addPeer', t };
  }
  const peerErr = $derived.by(() => {
    if (!pf.name.trim()) return 'Give the device a name';
    if (!/^[\d.]+\/32$/.test(pf.address)) return 'The device address is an IPv4 /32, for example 10.8.0.2/32';
    if (!pf.host.trim()) return 'Say which address the device connects to (this router’s public address or name)';
    if (pf.keepalive && !/^\d{1,5}$/.test(pf.keepalive)) return 'Keepalive is a number of seconds';
    return '';
  });
  async function createPeer(t: WgTunnel) {
    if (peerErr) return;
    busy = true; err = '';
    try {
      const [kp, psk, srvPub] = await Promise.all([newKeyPair(), pf.psk ? newPsk() : Promise.resolve(''), tunnelPublicKey(t)]);
      const form: PeerForm = { name: pf.name, publicKey: kp.public, psk, allowed: pf.address, keepalive: pf.keepalive };
      const tunnelNet = netOf(t.addresses.find((a) => a.includes('.')) ?? '10.8.0.1/24');
      const text = clientConfText({
        privateKey: kp.private, address: pf.address, dns: pf.dns ? lanIp || hostOf(t.addresses[0]) : '', serverPublicKey: srvPub, psk: psk || undefined,
        endpointHost: pf.host.trim(), endpointPort: pf.port || t.port, keepalive: pf.keepalive,
        allowedIps: pf.full ? '0.0.0.0/0, ::/0' : [tunnelNet, ...lanNets].join(', '),
      });
      if (await run(addPeerOps(t.name, form), `“${pf.name}” added to ${t.name}`)) result = { text, name: pf.name };
    } catch (e) { err = e instanceof Error ? e.message : String(e); }
    busy = false;
  }
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); copied = true; setTimeout(() => (copied = false), 1800); } catch { /* clipboard unavailable */ }
  }
  function download(text: string, name: string) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `${name.replace(/[^\w.-]+/g, '_') || 'wireguard'}.conf` });
    a.click(); URL.revokeObjectURL(url);
  }

  // ---- edit / delete a peer
  let ef = $state<PeerForm>({ name: '', publicKey: '', psk: '', allowed: '', keepalive: '' });
  let confirmDel = $state('');
  function openEditPeer(t: WgTunnel, p: WgPeer) {
    ef = { name: p.raw.description ? str(p.raw.description) : '', publicKey: p.publicKey, psk: '', allowed: p.allowed.join('\n'), keepalive: p.keepalive };
    err = ''; confirmDel = ''; panel = { kind: 'editPeer', t, p };
  }
  const editErr = $derived(validAllowed(ef.allowed) || (ef.keepalive && !/^\d{1,5}$/.test(ef.keepalive) ? 'Keepalive is a number of seconds' : ''));
  async function savePeer(p: WgPeer) {
    if (editErr) return;
    busy = true;
    if (await run(editPeerOps(p, ef), `“${ef.name || p.name}” updated`)) close();
    busy = false;
  }
  async function newPskFor() { try { ef.psk = await newPsk(); } catch (e) { err = e instanceof Error ? e.message : String(e); } }
  async function removePeer(p: WgPeer) {
    busy = true;
    if (await run(deletePeerOps(p), `“${p.name}” removed`)) close();
    busy = false;
  }

  // ---- delete a tunnel
  let delTunnel = $state('');
  async function removeTunnel(t: WgTunnel) {
    if (delTunnel !== t.name) { delTunnel = t.name; return; }
    delTunnel = '';
    await run(deleteTunnelOps(t, data!.firewall), `Tunnel “${t.name}” removed`);
  }

  // ---- import a connection from a provider
  let impText = $state(''), impName = $state('vpn'), impZone = $state('wan');
  const imp = $derived<WgImport | { error: string } | null>(impText.trim() ? parseWgConf(impText) : null);
  const impOk = $derived(imp && !('error' in imp) ? imp : null);
  const impErr = $derived(!impText.trim() ? '' : imp && 'error' in imp ? imp.error
    : !validTunnelName(impName) ? 'Name: lowercase letters, digits and _ (starting with a letter), up to 15 characters'
    : live.interfaces.some((i) => i.interface === impName) || tunnels.some((t) => t.name === impName) ? 'An interface with this name already exists' : '');
  const allTraffic = $derived(!!impOk?.peers.some((p) => (p.allowed_ips as string[]).includes('0.0.0.0/0')));
  function openImport() {
    let name = 'vpn', k = 1; while (live.interfaces.some((i) => i.interface === name) || tunnels.some((t) => t.name === name)) name = `vpn${++k}`;
    impText = ''; impName = name; impZone = parsed.zones.includes('wan') ? 'wan' : ''; err = ''; panel = { kind: 'import' };
  }
  async function readFile(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    if (f && f.size < 20000) impText = await f.text();
  }
  async function doImport() {
    if (!impOk || impErr) return;
    busy = true;
    if (await run(importOps(impName, impOk, impZone, data!.firewall), `Connection “${impName}” created`)) close();
    busy = false;
  }

  // ---- display helpers
  const ago = (t: number) => { const d = Math.max(0, Date.now() / 1000 - t); return d < 90 ? `${Math.round(d)} s ago` : d < 5400 ? `${Math.round(d / 60)} min ago` : d < 129600 ? `${Math.round(d / 3600)} h ago` : `${Math.round(d / 86400)} d ago`; };
  const STATE_LABEL = { connected: 'Connected', idle: 'Idle', never: 'Never connected' } as const;
</script>

<div class="page">
  <div class="page-head">
    <h1>VPN</h1>
    <div class="tools">
      <button class="btn" disabled={!runtime.installed} onclick={openImport}>Import a connection</button>
      <button class="btn primary" disabled={!runtime.installed} onclick={openServer}><Icon name="vpn" size={16} />New server</button>
    </div>
  </div>

  {#if loadErr}
    <div class="card"><p class="muted">Could not read the network configuration: {loadErr}</p></div>
  {:else if !data}
    <div class="card"><p class="muted">Loading…</p></div>
  {:else}
    {#if !runtime.installed}
      <div class="card notice">
        <Icon name="alert" size={20} />
        <div>
          <b>WireGuard is not installed on this router</b>
          <p class="muted">Lumen manages WireGuard tunnels with the <code>wireguard-tools</code> package, which also generates the keys. {#if tunnels.length}The tunnels below are read from the configuration, but their live status needs it too.{/if}</p>
          <a class="btn" href="#/updates?find=wireguard-tools">Install wireguard-tools</a>
        </div>
      </div>
    {/if}

    {#if !tunnels.length}
      <div class="card empty">
        <Icon name="vpn" size={34} /><h2>No VPN tunnels yet</h2>
        <p class="muted">A <b>server</b> lets your phone or laptop reach your home network from anywhere, through an encrypted tunnel. <b>Importing a connection</b> sends your network’s traffic through a VPN provider.</p>
        <p class="faint small">Only WireGuard is supported for now.</p>
      </div>
    {/if}

    {#each tunnels as t (t.name)}
      {@const up = upOf(t.name)}
      <div class="card tun">
        <div class="card-title">
          <h2><b>{t.name}</b> <span class="role">{t.role === 'server' ? 'Server' : 'Connection to a provider'}</span></h2>
          <div class="acts">
            {#if t.role === 'server'}<button class="btn" disabled={!runtime.installed} onclick={() => openAddPeer(t)}><Icon name="plus" size={15} />Add device</button>{/if}
            <button class="btn" class:danger={delTunnel === t.name} onclick={() => removeTunnel(t)} onblur={() => (delTunnel = '')}>{delTunnel === t.name ? 'Confirm delete' : 'Delete'}</button>
          </div>
        </div>
        <div class="facts">
          <span class="pill"><i class="dot" class:ok={up} class:bad={!up}></i>{up ? 'Up' : 'Down'}</span>
          {#if t.addresses[0]}<span><span class="faint">Address</span> <span class="mono">{t.addresses.join(', ')}</span></span>{/if}
          {#if t.role === 'server' && t.port}<span><span class="faint">Port</span> <span class="mono">UDP {t.port}</span></span>{/if}
          <span><span class="faint">Firewall zone</span> {t.zone || 'none'}</span>
          {#if t.publicKey}<span class="key" title={t.publicKey}><span class="faint">Public key</span> <span class="mono">{t.publicKey.slice(0, 12)}…</span></span>{/if}
        </div>
        {#if !t.zone}<p class="warn small">This tunnel is in no firewall zone, so its traffic is blocked. Add it to a zone in Firewall &gt; Zones.</p>{/if}

        {#if t.peers.length}
          <div class="tw"><table class="tbl">
            <thead><tr><th>{t.role === 'server' ? 'Device' : 'Peer'}</th><th>Allowed IPs</th><th>{t.role === 'server' ? 'Connects from' : 'Endpoint'}</th><th>Last handshake</th><th>↓ / ↑</th></tr></thead>
            <tbody>
              {#each t.peers as p (p.section)}
                {@const st = peerState(p)}
                <tr class="click" tabindex="0" onclick={() => openEditPeer(t, p)} onkeydown={(e) => e.key === 'Enter' && openEditPeer(t, p)}>
                  <td><b>{p.name}</b>{#if p.hasPsk}<small class="faint tagi">preshared key</small>{/if}</td>
                  <td class="mono small">{p.allowed.join(', ') || '—'}</td>
                  <td class="mono small">{p.live?.endpoint ?? (p.endpointHost ? `${p.endpointHost}:${p.endpointPort}` : '—')}</td>
                  <td><span class="pill"><i class="dot" class:ok={st === 'connected'} class:warn={st === 'idle'}></i>{STATE_LABEL[st]}</span>{#if p.live?.handshake}<small class="faint tagi">{ago(p.live.handshake)}</small>{/if}</td>
                  <td class="num small">{#if p.live}{bytes(t.role === 'server' ? p.live.tx : p.live.rx)} / {bytes(t.role === 'server' ? p.live.rx : p.live.tx)}{:else}—{/if}</td>
                </tr>
              {/each}
            </tbody>
          </table></div>
        {:else}
          <p class="muted pad">{t.role === 'server' ? 'No devices yet. Add one to get its configuration and a QR code to scan.' : 'This tunnel has no peers.'}</p>
        {/if}
      </div>
    {/each}
  {/if}
</div>

<Drawer open={!!panel} {title} onclose={close}>
  {#if panel?.kind === 'server'}
    <div class="form">
      <p class="muted">Lets devices outside connect to this router and reach your network through an encrypted WireGuard tunnel. Lumen generates the router’s keys.</p>
      <label><span>Name</span><input class="input" bind:value={sf.name} autocomplete="off" /></label>
      <label><span>Port <small class="faint">UDP</small></span><input class="input" inputmode="numeric" bind:value={sf.port} /></label>
      <label><span>Tunnel address <small class="faint">the router’s own address inside the tunnel</small></span><input class="input" bind:value={sf.address} /></label>
      <label><span>Firewall zone</span>
        <select class="input" bind:value={sf.zone}><option value="">None (traffic is blocked)</option>{#each parsed.zones as z}<option>{z}</option>{/each}</select>
        <small class="faint">In “lan”, connected devices can reach the same things as devices on your network, and the Internet through this router.</small></label>
      <label class="chk"><input type="checkbox" bind:checked={sf.openWan} />Open UDP {sf.port} on the Internet side of the firewall</label>
      {#if behindNat}<p class="warn small">This router’s Internet address ({wanIp}) is a private one, so it sits behind another router. Devices outside will not reach it until that router forwards UDP {sf.port} here.</p>{/if}
      {#if sf.name && serverErr}<small class="bad">{serverErr}</small>{/if}
      {#if err}<p class="alert"><Icon name="alert" size={16} /><span>{err}</span></p>{/if}
      <p class="alert"><Icon name="alert" size={16} /><span>It is applied with a 30-second safety timer: confirm if everything still works, or it rolls back by itself.</span></p>
      <div class="row"><button class="btn primary" disabled={!!serverErr || busy} onclick={createServer}>Create server</button><button class="btn" onclick={close}>Cancel</button></div>
    </div>

  {:else if panel?.kind === 'addPeer' && result}
    <div class="form">
      <p class="ok"><Icon name="check" size={16} />“{result.name}” was added to {panel.t.name}.</p>
      <p class="warn small"><b>Save this configuration now.</b> It contains the device’s private key, which Lumen does not keep: it cannot be shown again.</p>
      <div class="qr"><QrCode text={result.text} size={240} label="WireGuard configuration for {result.name}" /></div>
      <p class="faint small center">On a phone: WireGuard app &gt; add a tunnel &gt; scan a QR code.</p>
      <pre class="conf">{result.text}</pre>
      <div class="row"><button class="btn" onclick={() => copy(result!.text)}>{copied ? 'Copied' : 'Copy'}</button><button class="btn" onclick={() => download(result!.text, result!.name)}>Download .conf</button><button class="btn primary" onclick={close}>Done</button></div>
    </div>

  {:else if panel?.kind === 'addPeer'}
    {@const t = panel.t}
    <div class="form">
      <p class="muted">Lumen makes a key pair for the device and gives you its configuration, as a file and as a QR code to scan.</p>
      <label><span>Device name</span><input class="input" bind:value={pf.name} placeholder="Marta’s phone" autocomplete="off" /></label>
      <label><span>Its address in the tunnel</span><input class="input" bind:value={pf.address} /></label>
      <label><span>What should the device send through the VPN?</span>
        <select class="input" bind:value={pf.full}><option value={true}>Everything (all its Internet traffic goes through your router)</option><option value={false}>Only my home network</option></select></label>
      <label class="chk"><input type="checkbox" bind:checked={pf.dns} />Use this router as the device’s DNS server</label>
      <label><span>Address the device connects to <small class="faint">this router’s public address or name</small></span><input class="input" bind:value={pf.host} placeholder="vpn.example.com" /></label>
      {#if behindNat}<p class="warn small">This router’s Internet address ({wanIp}) is a private one: it sits behind another router. Use the public address of that router, and forward UDP {t.port} to this one.</p>{/if}
      <label class="chk"><input type="checkbox" bind:checked={pf.psk} />Add a preshared key <small class="faint">an extra layer of protection</small></label>
      <label><span>Keepalive <small class="faint">seconds · keeps the tunnel open behind NAT</small></span><input class="input" inputmode="numeric" bind:value={pf.keepalive} /></label>
      {#if pf.name && peerErr}<small class="bad">{peerErr}</small>{/if}
      {#if err}<p class="alert"><Icon name="alert" size={16} /><span>{err}</span></p>{/if}
      <div class="row"><button class="btn primary" disabled={!!peerErr || busy} onclick={() => createPeer(t)}>Add device</button><button class="btn" onclick={close}>Cancel</button></div>
    </div>

  {:else if panel?.kind === 'editPeer'}
    {@const p = panel.p}
    <div class="form">
      <label><span>Name</span><input class="input" bind:value={ef.name} /></label>
      <label><span>Allowed IPs <small class="faint">one per line</small></span><textarea class="input" rows="3" bind:value={ef.allowed}></textarea></label>
      <label><span>Keepalive <small class="faint">seconds</small></span><input class="input" inputmode="numeric" bind:value={ef.keepalive} /></label>
      <label><span>Preshared key <small class="faint">{p.hasPsk ? 'one is set · leave empty to keep it' : 'none set'}</small></span>
        <div class="row"><input class="input" bind:value={ef.psk} placeholder={p.hasPsk ? '••••••••' : ''} autocomplete="off" /><button class="btn" onclick={newPskFor}>Generate</button></div>
        {#if ef.psk}<small class="faint">The device must use this same key: change it on the device as well.</small>{/if}</label>
      <div class="stat-row"><span>Public key</span><b class="mono small brk">{p.publicKey}</b></div>
      {#if editErr}<small class="bad">{editErr}</small>{/if}
      {#if err}<p class="alert"><Icon name="alert" size={16} /><span>{err}</span></p>{/if}
      <div class="row">
        <button class="btn primary" disabled={!!editErr || busy} onclick={() => savePeer(p)}>Save</button>
        <button class="btn" class:danger={confirmDel === p.section} disabled={busy} onclick={() => (confirmDel === p.section ? removePeer(p) : (confirmDel = p.section))} onblur={() => (confirmDel = '')}>{confirmDel === p.section ? 'Confirm remove' : 'Remove device'}</button>
      </div>
    </div>

  {:else if panel?.kind === 'import'}
    <div class="form">
      <p class="muted">Paste or open the configuration file your VPN provider gave you (a <code>.conf</code> file). Your network’s traffic will go through it.</p>
      <label><span>Configuration</span><textarea class="input mono" rows="9" bind:value={impText} placeholder={'[Interface]\nPrivateKey = …\nAddress = …\n\n[Peer]\nPublicKey = …\nEndpoint = …'} spellcheck="false"></textarea></label>
      <label><span>…or open the file</span><input type="file" accept=".conf,text/plain" onchange={readFile} /></label>
      <label><span>Name</span><input class="input" bind:value={impName} autocomplete="off" /></label>
      <label><span>Firewall zone</span>
        <select class="input" bind:value={impZone}><option value="">None (traffic is blocked)</option>{#each parsed.zones as z}<option>{z}</option>{/each}</select>
        <small class="faint">Use “wan”: it shares the connection with your network and hides your devices behind the VPN address.</small></label>
      {#if impOk}
        <div class="sum">
          <div class="stat-row"><span>Peers</span><b>{impOk.peers.length}</b></div>
          <div class="stat-row"><span>Endpoint</span><b class="mono small">{impOk.peers[0].endpoint_host ?? '—'}:{impOk.peers[0].endpoint_port ?? ''}</b></div>
          <div class="stat-row"><span>Address</span><b class="mono small">{(impOk.iface.addresses as string[]).join(', ')}</b></div>
        </div>
        {#if allTraffic}<p class="warn small">This connection routes <b>all</b> traffic. Once it is up, everything from your network goes through it. If the provider is unreachable, devices lose their Internet access.</p>{/if}
      {/if}
      {#if impErr}<small class="bad">{impErr}</small>{/if}
      {#if err}<p class="alert"><Icon name="alert" size={16} /><span>{err}</span></p>{/if}
      <p class="alert"><Icon name="alert" size={16} /><span>The 30-second safety timer protects your access to the router, not your Internet connection: if the tunnel itself does not work, undo it here.</span></p>
      <div class="row"><button class="btn primary" disabled={!impOk || !!impErr || busy} onclick={doImport}>Create connection</button><button class="btn" onclick={close}>Cancel</button></div>
    </div>
  {/if}
</Drawer>

<style>
  .tools { display: flex; gap: 10px; flex-wrap: wrap; }
  .tun { margin-bottom: 16px; }
  .role { font-size: 12px; font-weight: 500; color: var(--text-2); background: var(--surface-2); padding: 2px 9px; border-radius: 999px; margin-left: 8px; }
  .acts { display: flex; gap: 8px; }
  .facts { display: flex; flex-wrap: wrap; gap: 8px 22px; align-items: center; font-size: 13.5px; margin: 2px 0 14px; }
  .key { cursor: help; }
  .pad { padding: 4px 0 6px; }
  .tagi { margin-left: 8px; font-family: var(--font); }
  .small { font-size: 12.5px; }
  .notice { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 16px; }
  .notice :global(svg) { color: var(--warn); flex: none; margin-top: 2px; }
  .notice p { margin: 4px 0 10px; }
  .empty { display: grid; justify-items: center; text-align: center; gap: 10px; padding: 44px 24px; color: var(--text-2); }
  .empty p { max-width: 560px; }
  code { background: var(--surface-2); padding: 1px 6px; border-radius: 5px; font-size: 12.5px; }
  .form { display: grid; gap: 14px; }
  label { display: grid; gap: 5px; } label > span { font-size: 13px; color: var(--text-2); }
  label.chk { display: flex; align-items: center; gap: 8px; font-size: 14px; }
  textarea.input { resize: vertical; }
  .row { display: flex; gap: 10px; flex-wrap: wrap; } .row .input { flex: 1; min-width: 0; }
  .bad { color: var(--bad, #dc2626); } .warn { color: var(--warn, #d97706); }
  .ok { display: flex; gap: 8px; align-items: center; color: var(--ok, #16a34a); }
  .form :global(.alert) { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; }
  .qr { display: grid; justify-items: center; }
  .center { text-align: center; margin-top: -6px; }
  .conf { margin: 0; padding: 12px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px; font: 12px/1.5 var(--mono, monospace); white-space: pre-wrap; word-break: break-all; max-height: 240px; overflow: auto; }
  .brk { word-break: break-all; text-align: right; }
  .sum { border-top: 1px solid var(--border); }
</style>
