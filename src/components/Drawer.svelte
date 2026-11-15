<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  let { open, title, onclose, children }: { open: boolean; title: string; onclose: () => void; children: Snippet } = $props();

  function key(e: KeyboardEvent) { if (e.key === 'Escape' && open) onclose(); }
</script>

<svelte:window onkeydown={key} />

{#if open}
  <button class="scrim" aria-label="Cerrar panel" onclick={onclose}></button>
{/if}
<aside class:open aria-hidden={!open} inert={!open}>
  <header>
    <h2>{title}</h2>
    <button class="x" onclick={onclose} aria-label="Cerrar"><Icon name="x" size={18} /></button>
  </header>
  <div class="body">{@render children()}</div>
</aside>

<style>
  .scrim { position: fixed; inset: 0; background: rgba(10, 14, 20, 0.25); border: 0; z-index: 30; animation: fade .15s; }
  aside {
    position: fixed; top: 0; right: 0; bottom: 0; width: min(400px, 100vw); background: var(--surface);
    border-left: 1px solid var(--border); box-shadow: var(--shadow-lg); z-index: 31;
    transform: translateX(102%); transition: transform .22s cubic-bezier(.2, .8, .2, 1);
    display: flex; flex-direction: column;
  }
  aside.open { transform: none; }
  header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border); }
  h2 { font-size: 16px; font-weight: 600; }
  .x { background: none; border: 0; width: 32px; height: 32px; border-radius: 8px; display: grid; place-items: center; color: var(--text-2); }
  .x:hover { background: var(--surface-2); }
  .body { padding: 20px; overflow: auto; flex: 1; }
  @keyframes fade { from { opacity: 0; } }
</style>
