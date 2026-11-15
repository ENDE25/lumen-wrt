<script lang="ts">
  import { changes } from '../lib/changes.svelte';
  import Icon from './Icon.svelte';
  let shown = $state('');
  $effect(() => {
    if (changes.phase === 'idle' && changes.note) {
      shown = changes.note;
      const t = setTimeout(() => { shown = ''; changes.note = ''; }, 3500);
      return () => clearTimeout(t);
    }
  });
</script>

{#if changes.phase === 'pending'}
  <div class="bar warn" role="alertdialog" aria-live="assertive">
    <Icon name="alert" size={20} />
    <div class="msg"><b>{changes.note}</b><span>Confirma que todo funciona. Se revertirá solo en <b class="num">{changes.remaining} s</b>.</span></div>
    <button class="btn" onclick={() => changes.rollback()}>Revertir</button>
    <button class="btn primary" onclick={() => changes.confirm()}>Confirmar</button>
  </div>
{:else if changes.phase === 'applying'}
  <div class="bar"><Icon name="refresh" size={18} /><span>Aplicando cambios…</span></div>
{:else if changes.error}
  <div class="bar bad" role="alert"><Icon name="alert" size={18} /><span>{changes.error}</span><button class="btn" onclick={() => (changes.error = '')}>Cerrar</button></div>
{:else if shown}
  <div class="bar ok" role="status"><Icon name="check" size={18} /><span>{shown}</span></div>
{/if}

<style>
  .bar {
    position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 50; max-width: calc(100vw - 32px);
    display: flex; align-items: center; gap: 14px; padding: 12px 16px; border-radius: 14px;
    background: var(--surface); border: 1px solid var(--border); box-shadow: var(--shadow-lg);
  }
  .msg { display: grid; line-height: 1.3; } .msg span { color: var(--text-2); font-size: 13px; }
  .warn { border-color: var(--warn); } .warn > :global(svg) { color: var(--warn); }
  .ok > :global(svg) { color: var(--ok); } .bad { border-color: var(--bad); } .bad > :global(svg) { color: var(--bad); }
  @media (max-width: 760px) { .bar { bottom: 76px; } }
</style>
