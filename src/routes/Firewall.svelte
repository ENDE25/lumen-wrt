<script lang="ts">
  import { onMount } from 'svelte';
  import FwForwards from './firewall/FwForwards.svelte';
  import FwRules from './firewall/FwRules.svelte';
  import FwZones from './firewall/FwZones.svelte';
  import FwBlocked from './firewall/FwBlocked.svelte';
  import { changes } from '../lib/changes.svelte';
  import { uciGet, type UciOp } from '../lib/uci';
  import { parseFirewall, type Firewall } from '../lib/firewall';
  import { getClients } from '../lib/api';
  import { live } from '../lib/live.svelte';
  import type { Client } from '../lib/types';

  type Tab = 'forwards' | 'rules' | 'zones' | 'blocked';
  let tab = $state<Tab>('forwards');
  let fw = $state<Firewall | null>(null);
  let err = $state('');
  let clients = $state<Client[]>([]);

  async function load() {
    try { fw = parseFirewall(await uciGet('firewall')); err = ''; }
    catch (e) { err = e instanceof Error ? e.message : String(e); }
  }
  onMount(() => { load(); getClients().then((c) => (clients = c)).catch(() => {}); return live.start(); });

  // Reload whenever an apply finishes or is rolled back, so the screen always shows what is really configured.
  let prev = changes.phase;
  $effect(() => { const p = changes.phase; if (p !== prev) { prev = p; load(); } });

  // Firewall mistakes can lock you out of the panel, so confirmation is always manual.
  async function apply(ops: UciOp[], label: string) {
    if (await changes.apply(ops, 'manual', label)) await load();
  }
</script>

<div class="page">
  <div class="page-head">
    <h1>Firewall</h1>
    <div class="seg" role="tablist">
      <button role="tab" aria-selected={tab === 'forwards'} class:on={tab === 'forwards'} onclick={() => (tab = 'forwards')}>Port forwards</button>
      <button role="tab" aria-selected={tab === 'rules'} class:on={tab === 'rules'} onclick={() => (tab = 'rules')}>Traffic rules</button>
      <button role="tab" aria-selected={tab === 'zones'} class:on={tab === 'zones'} onclick={() => (tab = 'zones')}>Zones</button>
      <button role="tab" aria-selected={tab === 'blocked'} class:on={tab === 'blocked'} onclick={() => (tab = 'blocked')}>Blocked</button>
    </div>
  </div>

  {#if err}<div class="card"><p class="muted">Could not read the firewall configuration: {err}</p></div>
  {:else if !fw}<div class="card"><p class="muted">Loading…</p></div>
  {:else if tab === 'forwards'}<FwForwards {fw} {clients} onapply={apply} />
  {:else if tab === 'rules'}<FwRules {fw} onapply={apply} />
  {:else if tab === 'zones'}<FwZones {fw} onapply={apply} />
  {:else}<FwBlocked {fw} onapply={apply} />{/if}
</div>
