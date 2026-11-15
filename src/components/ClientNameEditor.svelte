<script lang="ts">
  // Edit the custom name of a device. The name is stored on the router, tied to the MAC address.
  // Parents wrap this in {#key client.mac} so typing isn't reset when the list refreshes.
  import { untrack } from 'svelte';
  import { saveAlias } from '../lib/api';
  import type { Client } from '../lib/types';

  let { client, onsaved }: { client: Client; onsaved: () => void } = $props();
  let value = $state(untrack(() => (client.alias ? client.name : '')));
  let busy = $state(false);
  let err = $state('');

  const changed = $derived(value.trim() !== (client.alias ? client.name : ''));

  async function save(v: string) {
    busy = true; err = '';
    try { await saveAlias(client.mac, v, client.aliasSection); onsaved(); }
    catch (e) { err = e instanceof Error ? e.message : String(e); }
    busy = false;
  }
</script>

<form class="nf" onsubmit={(e) => { e.preventDefault(); save(value); }}>
  <label class="fld">Name <span class="hint">· saved on the router, linked to this MAC</span>
    <input class="input" bind:value maxlength="40" placeholder={client.hostname ?? 'e.g. Living room TV'} />
  </label>
  <div class="row">
    <button class="btn primary sm" disabled={busy || !changed}>{busy ? 'Saving…' : 'Save name'}</button>
    {#if client.alias}<button type="button" class="btn sm" disabled={busy} onclick={() => { value = ''; save(''); }}>Remove name</button>{/if}
  </div>
  {#if err}<small class="err">{err}</small>{/if}
</form>

<style>
  .nf { display: grid; gap: 10px; padding-bottom: 16px; margin-bottom: 6px; border-bottom: 1px solid var(--border); }
  .row { display: flex; gap: 8px; }
  .err { color: var(--bad); font-size: 12px; }
</style>
