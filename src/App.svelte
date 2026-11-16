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
  import Traffic from './routes/Traffic.svelte';
  import Software from './routes/Software.svelte';
  import Services from './routes/Services.svelte';
  import Logs from './routes/Logs.svelte';
  import System from './routes/System.svelte';
  import Backup from './routes/Backup.svelte';
  import Admin from './routes/Admin.svelte';
  import { router } from './lib/router.svelte';
  import { hasSession, onAuthLost } from './lib/ubus';
  import { getBoard } from './lib/api';
  import { updates } from './lib/updates.svelte';
  import { changes } from './lib/changes.svelte';

  let authed = $state(hasSession());
  let host = $state('');

  onMount(() => onAuthLost(() => (authed = false)));
  $effect(() => { if (authed) getBoard().then((b) => (host = b.hostname)).catch(() => {}); });

  // Arriving from the old address after an IP change: ask to confirm the new one before the rollback timer ends.
  $effect(() => {
    if (!authed) return;
    const m = /[?&]confirm=(\d+)/.exec(location.hash);
    if (!m) return;
    history.replaceState(null, '', location.pathname + location.hash.replace(/[?&]confirm=\d+/, ''));
    changes.resume(Number(m[1]), 'Network address changed');
  });

  // After an update rpcd restarts and the session ends; on the next sign-in say how it went.
  $effect(() => {
    if (!authed) return;
    const pending = (() => { try { return JSON.parse(sessionStorage.getItem('lumen.pending') ?? 'null'); } catch { return null; } })();
    try { sessionStorage.removeItem('lumen.pending'); } catch { /* ignore */ }
    updates.refresh().then(() => {
      if (pending?.action === 'update' && pending.to) changes.note = updates.current === pending.to ? `Lumen updated to v${pending.to}` : 'The update did not complete. See System → Lumen.';
    });
  });

  const pages = { dashboard: Dashboard, clients: Clients, network: Network, map: NetworkMap, dhcp: Dhcp, firewall: Firewall, wifi: Wifi, traffic: Traffic, software: Software, services: Services, logs: Logs, backup: Backup, admin: Admin, system: System } as const;
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
