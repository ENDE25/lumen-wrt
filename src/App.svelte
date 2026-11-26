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
  import Services from './routes/Services.svelte';
  import Logs from './routes/Logs.svelte';
  import Backup from './routes/Backup.svelte';
  import Updates from './routes/Updates.svelte';
  import Settings from './routes/Settings.svelte';
  import Apps from './routes/Apps.svelte';
  import Terminal from './routes/Terminal.svelte';
  import Vpn from './routes/Vpn.svelte';
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
      if (pending?.action === 'update' && pending.to) changes.note = updates.current === pending.to ? `Lumen updated to v${pending.to}` : 'The update did not complete. See Updates.';
    });
  });

  const pages = { dashboard: Dashboard, clients: Clients, network: Network, map: NetworkMap, dhcp: Dhcp, firewall: Firewall, wifi: Wifi, traffic: Traffic, updates: Updates, services: Services, logs: Logs, backup: Backup, settings: Settings, apps: Apps, terminal: Terminal, vpn: Vpn } as const;
  // A short reveal after signing in: the panel comes into focus, the rail slides in, cards rise one after another.
  function welcome() {
    authed = true;
    document.body.classList.add('reveal');
    setTimeout(() => document.body.classList.remove('reveal'), 1800);
  }
  const Page = $derived(pages[router.path as keyof typeof pages] ?? Dashboard);
</script>

{#if !authed}
  <Login onok={welcome} />
{:else}
  <Sidebar />
  <div class="shell">
    <Topbar hostname={host} />
    <main><Page /></main>
  </div>
  <ApplyBar />
{/if}

<style>
  @keyframes unblur { from { opacity: 0; filter: blur(14px); transform: scale(.985) translateY(10px); } to { opacity: 1; filter: blur(0); transform: none; } }
  @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes slide { from { opacity: 0; transform: translateX(-14px); } to { opacity: 1; transform: none; } }
  @keyframes rise { from { opacity: 0; transform: translateY(14px); filter: blur(5px); } to { opacity: 1; transform: none; filter: blur(0); } }
  :global(body.reveal main) { animation: unblur .75s cubic-bezier(.2, .7, .2, 1) both; }
  :global(body.reveal header) { animation: fade .5s ease-out both; }
  :global(body.reveal .rail) { animation: slide .6s cubic-bezier(.2, .7, .2, 1) .1s both; }
  :global(body.reveal main .card) { animation: rise .65s cubic-bezier(.2, .7, .2, 1) both; }
  :global(body.reveal main .card:nth-child(2)) { animation-delay: .06s; }
  :global(body.reveal main .card:nth-child(3)) { animation-delay: .12s; }
  :global(body.reveal main .card:nth-child(4)) { animation-delay: .18s; }
  :global(body.reveal main .card:nth-child(n+5)) { animation-delay: .24s; }
  @media (prefers-reduced-motion: reduce) {
    :global(body.reveal main), :global(body.reveal header), :global(body.reveal .rail), :global(body.reveal main .card) { animation: none; }
  }
  .shell { margin-left: var(--rail); min-height: 100vh; }
  @media (max-width: 760px) { .shell { margin-left: 0; } }
</style>
