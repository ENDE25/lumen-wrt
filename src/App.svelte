<script lang="ts">
  import { onMount } from 'svelte';
  import Sidebar from './components/Sidebar.svelte';
  import ApplyBar from './components/ApplyBar.svelte';
  import Topbar from './components/Topbar.svelte';
  import Login from './routes/Login.svelte';
  import Dashboard from './routes/Dashboard.svelte';
  import Clients from './routes/Clients.svelte';
  import Network from './routes/Network.svelte';
  import NetworkMap from './routes/NetworkMap.svelte';
  import Dhcp from './routes/Dhcp.svelte';
  import Firewall from './routes/Firewall.svelte';
  import Wifi from './routes/Wifi.svelte';
  import Logs from './routes/Logs.svelte';
  import System from './routes/System.svelte';
  import { router } from './lib/router.svelte';
  import { hasSession, onAuthLost } from './lib/ubus';
  import { getBoard } from './lib/api';

  let authed = $state(hasSession());
  let host = $state('');

  onMount(() => onAuthLost(() => (authed = false)));
  $effect(() => { if (authed) getBoard().then((b) => (host = b.hostname)).catch(() => {}); });

  const pages = { dashboard: Dashboard, clients: Clients, network: Network, map: NetworkMap, dhcp: Dhcp, firewall: Firewall, wifi: Wifi, logs: Logs, system: System } as const;
  const Page = $derived(pages[router.path as keyof typeof pages] ?? Dashboard);
</script>

{#if !authed}
  <Login onok={() => (authed = true)} />
{:else}
  <Sidebar />
  <div class="shell">
    <Topbar hostname={host} />
    <main><Page /></main>
  </div>
  <ApplyBar />
{/if}

<style>
  .shell { margin-left: var(--rail); min-height: 100vh; }
  @media (max-width: 760px) { .shell { margin-left: 0; } }
</style>
