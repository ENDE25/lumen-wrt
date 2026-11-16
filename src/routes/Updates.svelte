<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import { updates } from '../lib/updates.svelte';
  import type { FirmwareStatus } from '../lib/firmware';
  import Firmware from './updates/Firmware.svelte';
  import Packages from './updates/Packages.svelte';
  import LumenCard from './updates/LumenCard.svelte';

  let status = $state<FirmwareStatus | null>(null), pkgCount = $state<number | null>(null), flashing = $state(false);
  const fwNew = $derived(status?.kind === 'patch' || status?.kind === 'series');
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
</script>

<div class="page">
  <div class="page-head"><h1>Updates</h1></div>

  {#if !flashing}
    <div class="tiles">
      <button class="card tile" onclick={() => go('firmware')}>
        <span class="k">OpenWrt</span>
        <b>{#if !status}Checking…{:else if fwNew}{status.kind === 'patch' || status.kind === 'series' ? status.latest : ''} available{:else if status.kind === 'current'}Up to date{:else}—{/if}</b>
        <i class="dot" class:ok={status?.kind === 'current'} class:warn={fwNew}></i>
      </button>
      <button class="card tile" onclick={() => go('packages')}>
        <span class="k">Packages</span>
        <b>{pkgCount === null ? 'Checking…' : pkgCount ? `${pkgCount} update${pkgCount === 1 ? '' : 's'}` : 'Up to date'}</b>
        <i class="dot" class:ok={pkgCount === 0} class:warn={!!pkgCount}></i>
      </button>
      <button class="card tile" onclick={() => go('lumen')}>
        <span class="k">Lumen</span>
        <b>{updates.checking ? 'Checking…' : updates.available ? `v${updates.latest?.version} available` : updates.checked && updates.latest ? 'Up to date' : `v${updates.current}`}</b>
        <i class="dot" class:ok={updates.checked && !!updates.latest && !updates.available} class:warn={updates.available}></i>
      </button>
    </div>
  {/if}

  <section><Firmware bind:waiting={flashing} bind:status /></section>
  {#if !flashing}
    <section><LumenCard /></section>
    <section><Packages bind:count={pkgCount} /></section>
  {/if}
</div>

<style>
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 16px; }
  .tile { position: relative; text-align: left; cursor: pointer; display: grid; gap: 4px; font: inherit; color: inherit; padding: 16px 18px; }
  .tile:hover { border-color: var(--accent); }
  .tile .k { color: var(--text-2); font-size: 12.5px; } .tile b { font-size: 17px; font-weight: 600; }
  .tile .dot { position: absolute; top: 18px; right: 18px; }
  .dot.warn { background: var(--warn); }
  section { margin-bottom: 16px; }
</style>
