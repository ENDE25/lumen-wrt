<script lang="ts">
  // Edit what we know about a device: a custom name and its type. Both are stored on the router, tied to the MAC.
  // Parents wrap this in {#key client.mac} so typing isn't reset when the list refreshes.
  import { untrack } from 'svelte';
  import { saveAlias } from '../lib/api';
  import { KINDS, KIND_LABEL } from '../lib/kinds';
  import type { Client, ClientKind } from '../lib/types';

  let { client, onsaved }: { client: Client; onsaved: () => void } = $props();
  let name = $state(untrack(() => (client.alias ? client.name : '')));
  let kind = $state<ClientKind | ''>(untrack(() => client.kindOverride ?? ''));
  let busy = $state(false);
  let err = $state('');

  const changed = $derived(name.trim() !== (client.alias ? client.name : '') || kind !== (client.kindOverride ?? ''));
  const customised = $derived(client.alias || !!client.kindOverride);

  async function save(n: string, k: ClientKind | '') {
    busy = true; err = '';
    try { await saveAlias(client, { name: n, kind: k }); onsaved(); }
    catch (e) { err = e instanceof Error ? e.message : String(e); }
    busy = false;
  }
</script>

<form class="nf" onsubmit={(e) => { e.preventDefault(); save(name, kind); }}>
  <label class="fld">Name <span class="hint">· saved on the router, linked to this MAC</span>
    <input class="input" bind:value={name} maxlength="40" placeholder={client.hostname ?? 'e.g. Living room TV'} />
  </label>
  <label class="fld">Device type
    <select class="input" bind:value={kind}>
      <option value="">Automatic ({KIND_LABEL[client.detectedKind ?? 'unknown']})</option>
      {#each KINDS as k}<option value={k}>{KIND_LABEL[k]}</option>{/each}
    </select>
  </label>
  <div class="row">
    <button class="btn primary sm" disabled={busy || !changed}>{busy ? 'Saving…' : 'Save'}</button>
    {#if customised}<button type="button" class="btn sm" disabled={busy} onclick={() => { name = ''; kind = ''; save('', ''); }}>Reset to automatic</button>{/if}
  </div>
  {#if err}<small class="err">{err}</small>{/if}
</form>

<style>
  .nf { display: grid; gap: 12px; padding-bottom: 16px; margin-bottom: 6px; border-bottom: 1px solid var(--border); }
  .row { display: flex; gap: 8px; }
  .err { color: var(--bad); font-size: 12px; }
</style>
