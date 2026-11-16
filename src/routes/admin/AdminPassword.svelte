<script lang="ts">
  import Icon from '../../components/Icon.svelte';
  import { setPassword } from '../../lib/admin';

  let pw = $state(''), pw2 = $state(''), msg = $state(''), err = $state(''), busy = $state(false);
  const problem = $derived(pw.length < 6 ? 'At least 6 characters' : pw !== pw2 ? 'The two passwords differ' : '');
  async function change() {
    if (problem) return;
    busy = true; err = ''; msg = '';
    try { await setPassword(pw); msg = 'Password changed. It applies to Lumen, LuCI and SSH.'; pw = pw2 = ''; }
    catch (e) { err = e instanceof Error ? e.message : String(e); }
    busy = false;
  }
</script>

<div class="card form">
  <div class="card-title"><h2>Router password</h2></div>
  <p class="muted small">The <b>root</b> password protects this panel, LuCI and SSH.</p>
  <label><span>New password</span><input class="input" type="password" autocomplete="new-password" bind:value={pw} /></label>
  <label><span>Repeat it</span><input class="input" type="password" autocomplete="new-password" bind:value={pw2} /></label>
  {#if pw && problem}<small class="bad">{problem}</small>{/if}
  {#if err}<p class="alert"><Icon name="alert" size={16} />{err}</p>{/if}
  {#if msg}<p class="ok"><Icon name="check" size={16} />{msg}</p>{/if}
  <div><button class="btn primary" disabled={!!problem || busy} onclick={change}>Change password</button></div>
</div>

<style>
  .form { display: grid; gap: 14px; align-content: start; }
  label { display: grid; gap: 6px; } label > span { font-size: 13px; color: var(--text-2); }
  .bad { color: var(--bad, #dc2626); }
  .ok { display: flex; gap: 8px; align-items: center; color: var(--ok, #16a34a); }
  .form :global(.alert) { display: flex; gap: 8px; align-items: center; }
</style>
