<script lang="ts">
  import AdminGeneral from './admin/AdminGeneral.svelte';
  import AdminAccess from './admin/AdminAccess.svelte';
  import AdminStartup from './admin/AdminStartup.svelte';
  import AdminCron from './admin/AdminCron.svelte';

  type Tab = 'general' | 'access' | 'startup' | 'cron';
  let tab = $state<Tab>('general');
  const tabs: [Tab, string][] = [['general', 'General'], ['access', 'Access'], ['startup', 'Startup'], ['cron', 'Scheduled tasks']];
</script>

<div class="page">
  <div class="page-head">
    <h1>Administration</h1>
    <div class="seg" role="tablist">
      {#each tabs as [id, label]}
        <button role="tab" aria-selected={tab === id} class:on={tab === id} onclick={() => (tab = id)}>{label}</button>
      {/each}
    </div>
  </div>
  {#if tab === 'general'}<AdminGeneral />
  {:else if tab === 'access'}<AdminAccess />
  {:else if tab === 'startup'}<AdminStartup />
  {:else}<AdminCron />{/if}
</div>
