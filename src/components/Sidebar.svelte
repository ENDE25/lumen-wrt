<script lang="ts">
  import Icon from './Icon.svelte';
  import { router } from '../lib/router.svelte';
  import { theme } from '../lib/theme.svelte';
  import { logout, MOCK } from '../lib/ubus';

  const items = [
    { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
    { id: 'map', icon: 'network', label: 'Network Map' },
    { id: 'traffic', icon: 'stats', label: 'Traffic' },
    { id: 'network', icon: 'devices', label: 'Network' },
    { id: 'clients', icon: 'clients', label: 'Clients' },
    { id: 'wifi', icon: 'wifi', label: 'Wi-Fi' },
    { id: 'firewall', icon: 'shield', label: 'Firewall' },
    { id: 'dhcp', icon: 'dns', label: 'DHCP & DNS' },
    { id: 'logs', icon: 'logs', label: 'Logs' },
    { id: 'system', icon: 'settings', label: 'System' },
  ];
</script>

<nav class="rail" aria-label="Main">
  <a class="logo" href="#/dashboard" aria-label="Lumen">
    <svg width="34" height="34" viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="var(--accent)"/><circle cx="16" cy="16" r="6" fill="none" stroke="#fff" stroke-width="2.4"/><circle cx="16" cy="16" r="1.8" fill="#fff"/></svg>
  </a>
  <div class="items">
    {#each items as it}
      <a href={`#/${it.id}`} class:active={router.path === it.id} aria-label={it.label} aria-current={router.path === it.id ? 'page' : undefined}>
        <Icon name={it.icon} size={22} />
        <span class="tip">{it.label}</span>
      </a>
    {/each}
  </div>
  <div class="foot">
    <button onclick={() => theme.toggle()} aria-label="Toggle theme"><Icon name="moon" /><span class="tip">Theme</span></button>
    {#if !MOCK}<button onclick={logout} aria-label="Sign out"><Icon name="logout" /><span class="tip">Sign out</span></button>{/if}
  </div>
</nav>

<style>
  .rail {
    position: fixed; inset: 0 auto 0 0; width: var(--rail); background: var(--surface);
    border-right: 1px solid var(--border); display: flex; flex-direction: column;
    align-items: center; padding: 14px 0; gap: 18px; z-index: 20;
  }
  .items, .foot { display: flex; flex-direction: column; gap: 6px; align-items: center; }
  .items { flex: 1; margin-top: 6px; }
  a, button {
    position: relative; width: 44px; height: 44px; border-radius: 12px; display: grid; place-items: center;
    color: var(--text-2); background: none; border: 0; transition: background .12s, color .12s;
  }
  a:hover, button:hover { background: var(--surface-2); color: var(--text); text-decoration: none; }
  a.active { background: var(--accent-soft); color: var(--accent); }
  .logo { width: auto; height: auto; border-radius: 10px; }
  .logo:hover { background: none; }
  .tip {
    position: absolute; left: 54px; padding: 4px 9px; border-radius: 6px; background: var(--text);
    color: var(--bg); font-size: 12px; white-space: nowrap; opacity: 0; pointer-events: none;
    transform: translateX(-4px); transition: opacity .12s, transform .12s;
  }
  a:hover .tip, button:hover .tip { opacity: 1; transform: none; }
  @media (max-width: 760px) {
    .rail { inset: auto 0 0 0; width: auto; height: 62px; flex-direction: row; border-right: 0; border-top: 1px solid var(--border); padding: 0 8px; justify-content: space-around; gap: 0; }
    .logo, .foot, .tip { display: none; }
    .items { flex-direction: row; margin: 0; flex: 1; justify-content: space-around; }
  }
</style>
