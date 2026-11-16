<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '../../components/Icon.svelte';
  import Toggle from '../../components/Toggle.svelte';
  import { changes } from '../../lib/changes.svelte';
  import { uciGet, sectionOps, str, type UciSection } from '../../lib/uci';
  import { readFile, writeFile, setPassword, parseKeys, validKey, type SshKey } from '../../lib/admin';

  // ---- password
  let pw = $state(''), pw2 = $state(''), pwMsg = $state(''), pwErr = $state(''), pwBusy = $state(false);
  const pwProblem = $derived(pw.length < 6 ? 'At least 6 characters' : pw !== pw2 ? 'The two passwords differ' : '');
  async function changePw() {
    if (pwProblem) return;
    pwBusy = true; pwErr = ''; pwMsg = '';
    try { await setPassword(pw); pwMsg = 'Password changed. It applies to Lumen, LuCI and SSH.'; pw = pw2 = ''; }
    catch (e) { pwErr = e instanceof Error ? e.message : String(e); }
    pwBusy = false;
  }

  // ---- SSH keys
  let keys = $state<SshKey[]>([]), newKey = $state(''), keyErr = $state(''), keysLoaded = $state(false);
  const loadKeys = async () => { keys = parseKeys(await readFile('/etc/dropbear/authorized_keys')); keysLoaded = true; };
  const saveKeys = (lines: string[]) => writeFile('/etc/dropbear/authorized_keys', lines.join('\n') + (lines.length ? '\n' : ''), 0o600);
  async function addKey() {
    const l = newKey.trim();
    if (!validKey(l)) { keyErr = 'This does not look like a public key (it should start with ssh-ed25519, ssh-rsa or ecdsa-…).'; return; }
    if (keys.some((k) => k.line === l)) { keyErr = 'This key is already there.'; return; }
    keyErr = '';
    try { await saveKeys([...keys.map((k) => k.line), l]); newKey = ''; await loadKeys(); } catch (e) { keyErr = e instanceof Error ? e.message : String(e); }
  }
  let delAsk = $state('');
  async function delKey(k: SshKey) {
    if (delAsk !== k.line) { delAsk = k.line; return; }
    delAsk = '';
    try { await saveKeys(keys.filter((x) => x.line !== k.line).map((x) => x.line)); await loadKeys(); } catch (e) { keyErr = e instanceof Error ? e.message : String(e); }
  }

  // ---- SSH server (dropbear)
  let db = $state<UciSection | null>(null);
  let d = $state({ port: '22', pass: true, rootPass: true });
  async function loadDb() {
    const c = await uciGet('dropbear');
    db = Object.values(c).find((s) => s['.type'] === 'dropbear') ?? null;
    if (db) d = { port: str(db.Port) || '22', pass: str(db.PasswordAuth) !== 'off', rootPass: str(db.RootPasswordAuth) !== 'off' };
  }
  const dbErr = $derived.by(() => {
    const p = Number(d.port);
    if (!Number.isInteger(p) || p < 1 || p > 65535) return 'Port must be 1–65535';
    if ((!d.pass || !d.rootPass) && keys.length === 0) return 'Add an SSH key first, or you would lock yourself out of SSH';
    return '';
  });
  const dbDirty = $derived(!!db && (d.port !== (str(db.Port) || '22') || d.pass !== (str(db.PasswordAuth) !== 'off') || d.rootPass !== (str(db.RootPasswordAuth) !== 'off')));
  async function saveDb() {
    if (!db || dbErr) return;
    const ops = sectionOps('dropbear', db['.name'], db, { Port: d.port, PasswordAuth: d.pass ? 'on' : 'off', RootPasswordAuth: d.rootPass ? 'on' : 'off' });
    if (await changes.apply(ops, 'manual', 'SSH server settings saved')) await loadDb();
  }

  onMount(() => { loadKeys(); loadDb().catch(() => {}); });
</script>

<div class="grid g2">
  <div class="card form">
    <div class="card-title"><h2>Router password</h2></div>
    <p class="muted small">The <b>root</b> password protects this panel, LuCI and SSH.</p>
    <label><span>New password</span><input class="input" type="password" autocomplete="new-password" bind:value={pw} /></label>
    <label><span>Repeat it</span><input class="input" type="password" autocomplete="new-password" bind:value={pw2} /></label>
    {#if pw && pwProblem}<small class="bad">{pwProblem}</small>{/if}
    {#if pwErr}<p class="alert"><Icon name="alert" size={16} />{pwErr}</p>{/if}
    {#if pwMsg}<p class="ok"><Icon name="check" size={16} />{pwMsg}</p>{/if}
    <div><button class="btn primary" disabled={!!pwProblem || pwBusy} onclick={changePw}>Change password</button></div>
  </div>

  <div class="card form">
    <div class="card-title"><h2>SSH access</h2></div>
    {#if db}
      <label><span>Port</span><input class="input" style="max-width:120px" inputmode="numeric" bind:value={d.port} /></label>
      <div><Toggle bind:checked={d.pass} label="Allow password login" /></div>
      <div><Toggle bind:checked={d.rootPass} label="Allow root to log in with a password" /></div>
      {#if dbErr}<small class="bad">{dbErr}</small>{/if}
      <div><button class="btn primary" disabled={!dbDirty || !!dbErr} onclick={saveDb}>Save</button></div>
    {:else}<p class="muted">The SSH server is not configured on this router.</p>{/if}
  </div>
</div>

<div class="card form" style="margin-top:16px">
  <div class="card-title"><h2>SSH keys</h2></div>
  <p class="muted small">Public keys allowed to log in as root without a password.</p>
  {#each keys as k (k.line)}
    <div class="key">
      <div><b>{k.comment}</b><small class="faint">{k.type} · …{k.fingerprintHint}</small></div>
      <button class="btn danger sm" onclick={() => delKey(k)}>{delAsk === k.line ? 'Confirm' : 'Remove'}</button>
    </div>
  {:else}{#if keysLoaded}<p class="muted small">No keys yet.</p>{/if}{/each}
  <label><span>Add a key <small class="faint">paste the contents of your .pub file</small></span><textarea class="input" rows="3" bind:value={newKey} placeholder="ssh-ed25519 AAAA… you@laptop"></textarea></label>
  {#if keyErr}<small class="bad">{keyErr}</small>{/if}
  <div><button class="btn" disabled={!newKey.trim()} onclick={addKey}>Add key</button></div>
</div>

<style>
  .form { display: grid; gap: 14px; align-content: start; }
  .g2 { grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); align-items: start; }
  label { display: grid; gap: 6px; } label > span { font-size: 13px; color: var(--text-2); }
  textarea.input { font-family: var(--mono, monospace); font-size: 12px; resize: vertical; }
  .bad { color: var(--bad, #dc2626); }
  .ok { display: flex; gap: 8px; align-items: center; color: var(--ok, #16a34a); }
  .form :global(.alert) { display: flex; gap: 8px; align-items: center; }
  .key { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; }
  .key div { display: grid; } .key small { font-family: var(--mono, monospace); }
  .sm { padding: 5px 10px; font-size: 12.5px; }
</style>
