<script lang="ts">
  import { login } from '../lib/ubus';
  let { onok }: { onok: () => void } = $props();
  let user = $state('root'), pass = $state(''), err = $state(''), busy = $state(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault(); busy = true; err = '';
    try { await login(user, pass); onok(); }
    catch (x) { err = x instanceof Error ? x.message : 'No se pudo iniciar sesión'; }
    busy = false;
  }
</script>

<main>
  <form class="card" onsubmit={submit}>
    <svg width="48" height="48" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="var(--accent)"/><circle cx="16" cy="16" r="6" fill="none" stroke="#fff" stroke-width="2.4"/><circle cx="16" cy="16" r="1.8" fill="#fff"/></svg>
    <h1>Lumen</h1>
    <p class="muted">Inicia sesión para administrar tu router</p>
    <label>Usuario<input class="input" bind:value={user} autocomplete="username" required /></label>
    <label>Contraseña<input class="input" type="password" bind:value={pass} autocomplete="current-password" required /></label>
    {#if err}<p class="err" role="alert">{err}</p>{/if}
    <button class="btn primary" disabled={busy}>{busy ? 'Entrando…' : 'Iniciar sesión'}</button>
  </form>
</main>

<style>
  main { min-height: 100vh; display: grid; place-items: center; padding: 20px; }
  form { width: min(380px, 100%); display: flex; flex-direction: column; gap: 14px; padding: 32px; box-shadow: var(--shadow-lg); }
  h1 { font-size: 24px; margin-top: 6px; }
  label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 500; }
  .err { color: var(--bad); font-size: 13px; }
  .btn { justify-content: center; height: 40px; margin-top: 4px; }
</style>
