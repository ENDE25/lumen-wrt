<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import Toggle from '../components/Toggle.svelte';
  import Drawer from '../components/Drawer.svelte';
  import SignalBars from '../components/SignalBars.svelte';
  import WifiScan from './wifi/WifiScan.svelte';
  import { changes } from '../lib/changes.svelte';
  import { live } from '../lib/live.svelte';
  import { call, UbusError } from '../lib/ubus';
  import { getNetworkMap } from '../lib/api';
  import { sectionOps, uciGet, type UciOp } from '../lib/uci';
  import { BAND_LABEL, ENCRYPTION, FALLBACK_CHANNELS, HTMODES, encLabel, needsKey, parseWireless, validKey, validSsid, type Radio, type Ssid, type Wireless } from '../lib/wifi';
  import type { NetworkMap } from '../lib/types';

  let wl = $state<Wireless | null>(null);
  let err = $state('');
  let map = $state<NetworkMap>({ clients: [], wifi: [], bridges: {} });
  let confirmDel = $state('');
  let kicking = $state('');

  async function load() {
    try { wl = parseWireless(await uciGet('wireless')); err = ''; }
    catch (e) {
      // no /etc/config/wireless at all = router without Wi-Fi hardware (ubus "not found")
      if (e instanceof UbusError && e.code === 4) { wl = { radios: [], ssids: [] }; err = ''; }
      else err = e instanceof Error ? e.message : String(e);
    }
  }
  onMount(() => {
    load();
    const poll = () => getNetworkMap().then((m) => (map = m)).catch(() => {});
    poll(); const t = setInterval(poll, 6000);
    const stop = live.start();
    return () => { clearInterval(t); stop(); };
  });

  let prev = changes.phase;
  $effect(() => { const p = changes.phase; if (p !== prev) { prev = p; load(); } });
  // Wi-Fi changes can cut off a client connected over Wi-Fi (maybe you), so confirmation is always manual.
  async function apply(ops: UciOp[], label: string) { if (await changes.apply(ops, 'manual', label)) await load(); }

  // ---------- live data helpers
  const liveFor = (radio: string) => map.wifi.filter((w) => w.radio === radio);
  const clientsOf = (ssid: Ssid) => map.wifi.find((w) => w.section === ssid.section)?.clients.length ?? 0;
  const wifiClients = $derived(map.clients.filter((c) => c.link?.type === 'wifi'));
  const ifnameOfSsid = (ssid: string) => map.wifi.find((w) => w.ssid === ssid)?.ifname;

  // ---------- radio form
  interface RForm { section: string; band: string; channel: string; htmode: string; country: string; txpower: string; enabled: boolean; channels: number[] }
  let rf = $state<RForm | null>(null);
  let countries = $state<{ code: string; name: string }[]>([]);

  async function openRadio(r: Radio) {
    rf = { section: r.section, band: r.band, channel: r.channel, htmode: r.htmode, country: r.country, txpower: r.txpower, enabled: !r.disabled, channels: FALLBACK_CHANNELS[r.band] ?? [] };
    // Ask the driver for the channels this country actually allows; keep the static list if it can't say.
    try {
      const phy = (await call<{ name: string }>('iwinfo', 'phyname', { section: r.section })).name;
      const fl = await call<{ results: { channel: number; restricted?: boolean }[] }>('iwinfo', 'freqlist', { device: phy });
      const list = fl.results.filter((c) => !c.restricted).map((c) => c.channel);
      if (list.length && rf?.section === r.section) rf.channels = list;
    } catch { /* fallback list stays */ }
    if (!countries.length) call<{ results: { code: string; name: string }[] }>('iwinfo', 'countrylist', { device: ifnameOfRadio(r.section) ?? '' }).then((c) => (countries = c.results ?? [])).catch(() => {});
  }
  const ifnameOfRadio = (radio: string) => liveFor(radio)[0]?.ifname;

  const rErr = $derived.by(() => {
    const e: Record<string, string> = {};
    if (!rf) return e;
    if (rf.country && !/^[A-Z]{2}$/.test(rf.country)) e.country = 'Two letters, e.g. ES';
    if (rf.txpower && !(/^\d+$/.test(rf.txpower) && +rf.txpower >= 1 && +rf.txpower <= 30)) e.txpower = '1–30 dBm, or blank for maximum';
    return e;
  });
  function saveRadio() {
    if (!rf || Object.keys(rErr).length || !wl) return;
    const f = rf, orig = wl.radios.find((r) => r.section === f.section)!;
    apply(sectionOps('wireless', f.section, orig.raw, { channel: f.channel, htmode: f.htmode, country: f.country, txpower: f.txpower, disabled: f.enabled ? undefined : '1' }), `Radio ${f.section} updated`);
    rf = null;
  }
  const htOptions = $derived(rf ? [...new Set([...(HTMODES[rf.band] ?? []), ...(rf.htmode ? [rf.htmode] : [])])] : []);
  const chOptions = $derived(rf ? [...new Set([...rf.channels, ...(/^\d+$/.test(rf.channel) ? [+rf.channel] : [])])].sort((a, b) => a - b) : []);

  // ---------- SSID form
  interface SForm { section: string | null; device: string; ssid: string; enabled: boolean; encryption: string; key: string; network: string; hidden: boolean; isolate: boolean; ieee80211w: string; showKey: boolean }
  let sf = $state<SForm | null>(null);
  const networks = $derived([...new Set(live.interfaces.map((i) => i.interface).filter((n) => n !== 'loopback'))]);

  const newSsid = (device: string): SForm => ({ section: null, device, ssid: '', enabled: true, encryption: 'sae-mixed', key: genKey(), network: networks.includes('lan') ? 'lan' : networks[0] ?? 'lan', hidden: false, isolate: false, ieee80211w: '', showKey: true });
  const editSsid = (s: Ssid): SForm => ({ section: s.section, device: s.device, ssid: s.ssid, enabled: !s.disabled, encryption: s.encryption, key: s.key, network: s.network, hidden: s.hidden, isolate: s.isolate, ieee80211w: s.ieee80211w, showKey: false });
  function genKey() {
    const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const buf = crypto.getRandomValues(new Uint32Array(16));
    return Array.from(buf, (n) => chars[n % chars.length]).join('');
  }
  const sErr = $derived.by(() => {
    const e: Record<string, string> = {};
    if (!sf) return e;
    if (!validSsid(sf.ssid)) e.ssid = 'Between 1 and 32 bytes';
    if (needsKey(sf.encryption) && !validKey(sf.key)) e.key = 'Passphrase of 8–63 characters (or 64 hex digits)';
    if (!sf.network) e.network = 'Choose a network';
    return e;
  });
  function saveSsid() {
    if (!sf || Object.keys(sErr).length || !wl) return;
    const f = sf, orig = f.section ? wl.ssids.find((s) => s.section === f.section)!.raw : null;
    const open = !needsKey(f.encryption);
    apply(sectionOps('wireless', f.section ?? '', orig, {
      device: f.device, mode: 'ap', ssid: f.ssid, encryption: f.encryption, key: open ? undefined : f.key, network: f.network,
      hidden: f.hidden ? '1' : undefined, isolate: f.isolate ? '1' : undefined, ieee80211w: open ? undefined : f.ieee80211w, disabled: f.enabled ? undefined : '1',
    }, 'wifi-iface'), f.section ? `SSID “${f.ssid}” updated` : `SSID “${f.ssid}” added`);
    sf = null;
  }
  const toggleSsid = (s: Ssid) => apply(sectionOps('wireless', s.section, s.raw, { disabled: s.disabled ? undefined : '1' }), `SSID “${s.ssid}” ${s.disabled ? 'enabled' : 'disabled'}`);
  function removeSsid(s: Ssid) {
    if (confirmDel !== s.section) { confirmDel = s.section; return; }
    confirmDel = ''; apply([{ op: 'del', config: 'wireless', section: s.section }], `SSID “${s.ssid}” deleted`);
  }

  // ---------- connected clients
  async function kick(mac: string, ifname: string) {
    kicking = mac;
    try { await call(`hostapd.${ifname}`, 'del_client', { addr: mac, reason: 5, deauth: true, ban_time: 0 }); }
    catch (e) { changes.error = `Could not disconnect ${mac}: ${e instanceof Error ? e.message : e}`; }
    kicking = '';
    getNetworkMap().then((m) => (map = m)).catch(() => {});
  }
  const rate = (k?: number) => (k ? `${Math.round(k / 1000)} Mb/s` : '—');
</script>

<div class="page">
  <div class="page-head"><h1>Wi-Fi</h1></div>

  {#if err}
    <div class="card"><p class="muted">Could not read the wireless configuration: {err}</p></div>
  {:else if !wl}
    <div class="card"><p class="muted">Loading…</p></div>
  {:else if !wl.radios.length}
    <div class="card empty">
      <Icon name="wifi" size={34} />
      <h2>No Wi-Fi radios found</h2>
      <p class="muted">This router has no <code>/etc/config/wireless</code>. If it has Wi-Fi hardware, install the driver and
        <code>wpad</code> packages and run <code>wifi config</code>; the radios will show up here.</p>
    </div>
  {:else}
    {#each wl.radios as r (r.section)}
      {@const lv = liveFor(r.section)}
      <div class="card radio" class:dim={r.disabled}>
        <div class="rhead">
          <span class="ico"><Icon name="wifi" size={22} /></span>
          <div class="rt">
            <h2>{BAND_LABEL[r.band]} <span class="faint">· {r.section}</span></h2>
            <p class="muted num">
              {r.channel === 'auto' ? 'Auto channel' : `Channel ${r.channel}`}{r.htmode ? ` · ${r.htmode}` : ''}{r.country ? ` · ${r.country}` : ''}{r.txpower ? ` · ${r.txpower} dBm` : ''}
              {#if lv[0]?.channel && r.channel === 'auto'} <span class="faint">(now ch {lv[0].channel})</span>{/if}
            </p>
          </div>
          <span class="pill"><i class="dot" class:ok={!r.disabled && lv.length > 0} class:warn={!r.disabled && !lv.length}></i>{r.disabled ? 'Disabled' : lv.length ? 'Up' : 'Configured'}</span>
          <button class="btn" onclick={() => openRadio(r)}><Icon name="settings" size={16} />Radio settings</button>
        </div>

        <div class="tw"><table class="tbl">
          <thead><tr><th></th><th>SSID</th><th>Security</th><th>Network</th><th>Clients</th><th></th></tr></thead>
          <tbody>
            {#each wl.ssids.filter((s) => s.device === r.section) as s (s.section)}
              <tr class:off-row={s.disabled}>
                <td><Toggle checked={!s.disabled} onchange={() => toggleSsid(s)} /></td>
                <td><b>{s.ssid || '(no name)'}</b>{#if s.hidden}<span class="tag">hidden</span>{/if}{#if s.isolate}<span class="tag">isolated</span>{/if}{#if s.mode !== 'ap'}<span class="tag">{s.mode}</span>{/if}</td>
                <td class="muted">{encLabel(s.encryption)}</td>
                <td class="num">{s.network}</td>
                <td class="num">{s.disabled ? '—' : clientsOf(s)}</td>
                <td><div class="row-actions">
                  <button class="btn icon" aria-label="Edit SSID" onclick={() => (sf = editSsid(s))}><Icon name="settings" size={15} /></button>
                  {#if confirmDel === s.section}
                    <button class="btn sm danger" onclick={() => removeSsid(s)} onblur={() => (confirmDel = '')}>Confirm delete</button>
                  {:else}
                    <button class="btn icon danger" aria-label="Delete SSID" onclick={() => removeSsid(s)}><Icon name="trash" size={15} /></button>
                  {/if}
                </div></td>
              </tr>
            {:else}
              <tr><td colspan="6" class="muted">No networks on this radio yet.</td></tr>
            {/each}
          </tbody>
        </table></div>
        <div class="rfoot"><button class="btn" onclick={() => (sf = newSsid(r.section))}><Icon name="plus" size={16} />Add SSID</button></div>
      </div>
    {/each}

    <div class="card">
      <div class="card-title"><h2>Connected clients <span class="faint">{wifiClients.length}</span></h2></div>
      {#if wifiClients.length}
        <div class="tw"><table class="tbl">
          <thead><tr><th>Name</th><th>MAC</th><th>SSID</th><th>Signal</th><th>Rate ↓ / ↑</th><th></th></tr></thead>
          <tbody>
            {#each wifiClients as c (c.mac)}
              <tr>
                <td><b>{c.name || c.ip || 'Unnamed'}</b>{#if c.name}<span class="faint"> {c.ip}</span>{/if}</td>
                <td class="mono muted">{c.mac}</td>
                <td>{c.link?.ssid} <span class="faint">{c.link?.band}</span></td>
                <td class="num"><span class="sig"><SignalBars dbm={c.link?.signal} />{c.link?.signal ?? '—'} dBm</span></td>
                <td class="num">{rate(c.link?.tx)} / {rate(c.link?.rx)}</td>
                <td><div class="row-actions"><button class="btn sm" disabled={kicking === c.mac} onclick={() => kick(c.mac.toLowerCase(), c.link!.dev)}>{kicking === c.mac ? '…' : 'Disconnect'}</button></div></td>
              </tr>
            {/each}
          </tbody>
        </table></div>
      {:else}<p class="muted">No devices are connected over Wi-Fi right now.</p>{/if}
    </div>
    <WifiScan ifaces={map.wifi} />
  {/if}
</div>

<Drawer open={!!rf} title={rf ? `Radio ${rf.section}` : ''} onclose={() => (rf = null)}>
  {#if rf}
    <form class="form" onsubmit={(e) => { e.preventDefault(); saveRadio(); }}>
      <Toggle bind:checked={rf.enabled} label={rf.enabled ? 'Radio enabled' : 'Radio disabled'} />
      <div class="two">
        <label class="fld">Channel<select class="input" bind:value={rf.channel}><option value="auto">Auto</option>{#each chOptions as c}<option value={String(c)}>{c}</option>{/each}</select></label>
        <label class="fld">Channel width<select class="input" bind:value={rf.htmode}>{#if !rf.htmode}<option value="">Default</option>{/if}{#each htOptions as h}<option>{h}</option>{/each}</select></label>
      </div>
      <div class="two">
        <label class="fld">Country<input class="input" list="countries" bind:value={rf.country} oninput={(e) => (rf!.country = e.currentTarget.value.toUpperCase())} maxlength="2" placeholder="ES" aria-invalid={!!rErr.country} />
          <datalist id="countries">{#each countries as c}<option value={c.code}>{c.name}</option>{/each}</datalist>{#if rErr.country}<small class="err">{rErr.country}</small>{/if}</label>
        <label class="fld">TX power (dBm)<input class="input" bind:value={rf.txpower} inputmode="numeric" placeholder="maximum" aria-invalid={!!rErr.txpower} />{#if rErr.txpower}<small class="err">{rErr.txpower}</small>{/if}</label>
      </div>
      <p class="hint note">Changing channel, width or country restarts the radio and briefly disconnects every client on it.</p>
      <div class="form-actions"><button type="button" class="btn" onclick={() => (rf = null)}>Cancel</button><button class="btn primary" disabled={Object.keys(rErr).length > 0}>Save &amp; apply</button></div>
    </form>
  {/if}
</Drawer>

<Drawer open={!!sf} title={sf?.section ? 'Edit SSID' : 'New SSID'} onclose={() => (sf = null)}>
  {#if sf}
    <form class="form" onsubmit={(e) => { e.preventDefault(); saveSsid(); }}>
      <label class="fld">Network name (SSID)<input class="input" bind:value={sf.ssid} aria-invalid={!!sErr.ssid} />{#if sErr.ssid}<small class="err">{sErr.ssid}</small>{/if}</label>
      <Toggle bind:checked={sf.enabled} label="Enabled" />
      <label class="fld">Security<select class="input" bind:value={sf.encryption}>
        {#each ENCRYPTION as e}<option value={e.v}>{e.label}</option>{/each}
        {#if !ENCRYPTION.some((e) => e.v === sf!.encryption)}<option value={sf.encryption}>{sf.encryption} (existing)</option>{/if}
      </select></label>
      {#if needsKey(sf.encryption)}
        <label class="fld">Passphrase
          <div class="keyrow">
            <input class="input mono" type={sf.showKey ? 'text' : 'password'} bind:value={sf.key} autocomplete="off" aria-invalid={!!sErr.key} />
            <button type="button" class="btn" onclick={() => (sf!.showKey = !sf!.showKey)}>{sf.showKey ? 'Hide' : 'Show'}</button>
            <button type="button" class="btn" onclick={() => { sf!.key = genKey(); sf!.showKey = true; }}>Generate</button>
          </div>
          {#if sErr.key}<small class="err">{sErr.key}</small>{/if}
        </label>
        <label class="fld">Protected management frames
          <select class="input" bind:value={sf.ieee80211w}><option value="">Automatic</option><option value="0">Disabled</option><option value="1">Optional</option><option value="2">Required</option></select>
        </label>
      {/if}
      <label class="fld">Network<select class="input" bind:value={sf.network}>{#each networks as n}<option>{n}</option>{/each}{#if sf.network && !networks.includes(sf.network)}<option>{sf.network}</option>{/if}</select>
        <small class="hint">The interface clients of this SSID are attached to (use a separate one for guests).</small></label>
      <Toggle bind:checked={sf.hidden} label="Hide network name" />
      <Toggle bind:checked={sf.isolate} label="Client isolation (clients can't see each other)" />
      <div class="form-actions"><button type="button" class="btn" onclick={() => (sf = null)}>Cancel</button><button class="btn primary" disabled={Object.keys(sErr).length > 0}>Save &amp; apply</button></div>
    </form>
  {/if}
</Drawer>

<style>
  .empty { display: grid; justify-items: center; text-align: center; gap: 10px; padding: 48px 24px; color: var(--text-2); }
  .empty code { background: var(--surface-2); padding: 1px 6px; border-radius: 5px; font-size: 12.5px; }
  .empty p { max-width: 520px; }
  .radio { margin-bottom: 16px; padding: 0; overflow: hidden; }
  .radio.dim .rhead { opacity: .7; }
  .rhead { display: flex; align-items: center; gap: 14px; padding: 18px 20px; flex-wrap: wrap; }
  .ico { width: 44px; height: 44px; border-radius: 12px; background: var(--accent-soft); color: var(--accent); display: grid; place-items: center; flex: none; }
  .rt { flex: 1; min-width: 200px; } .rt h2 { font-size: 16px; font-weight: 600; } .rt p { font-size: 13px; }
  .radio .tbl th:first-child, .radio .tbl td:first-child { padding-left: 20px; }
  .rfoot { padding: 12px 20px 16px; }
  .tag { margin-left: 8px; font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: .03em; }
  .sig { display: inline-flex; align-items: center; gap: 8px; }
  .keyrow { display: flex; gap: 8px; } .keyrow .input { flex: 1; }
  .note { margin: 0; line-height: 1.4; }
</style>
