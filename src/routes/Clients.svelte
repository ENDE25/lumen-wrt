<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import Drawer from '../components/Drawer.svelte';
  import { getClients } from '../lib/api';
  import { duration } from '../lib/format';
  import type { Client } from '../lib/types';

  let clients = $state<Client[]>([]);
  let q = $state('');
  let loaded = $state(false);
  let sel = $state<Client | null>(null);
  let sort = $state<{ k: 'name' | 'ip' | 'kind'; dir: 1 | -1 } | null>(null);

  onMount(() => {
    const go = () => getClients().then((c) => { clients = c; loaded = true; }).catch(() => (loaded = true));
    go(); const t = setInterval(go, 10000);
    return () => clearInterval(t);
  });

  const KIND: Record<string, string> = {
    phone: 'Móvil', laptop: 'Portátil', desktop: 'Sobremesa', tv: 'TV', printer: 'Impresora',
    iot: 'IoT', server: 'Servidor', router: 'Red', unknown: 'Desconocido',
  };
  const rows = $derived.by(() => {
    const s = q.trim().toLowerCase();
    let r = s ? clients.filter((c) => [c.name, c.ip, c.mac, KIND[c.kind]].some((v) => v.toLowerCase().includes(s))) : clients;
    if (sort) {
      const { k, dir } = sort;
      r = [...r].sort((a, b) => dir * String(a[k]).localeCompare(String(b[k]), undefined, { numeric: true }));
    }
    return r;
  });
  const toggle = (k: 'name' | 'ip' | 'kind') =>
    (sort = sort?.k === k ? (sort.dir === 1 ? { k, dir: -1 } : null) : { k, dir: 1 });
  const arrow = (k: string) => (sort?.k === k ? (sort.dir === 1 ? ' ↑' : ' ↓') : '');
  const lease = (c: Client) => c.leaseExpires === undefined ? 'Estática / sin DHCP' : duration(c.leaseExpires);
</script>

<div class="page">
  <div class="page-head">
    <h1>Clientes <span class="faint">{loaded ? clients.length : ''}</span></h1>
    <div class="search">
      <Icon name="search" size={16} />
      <input class="input" placeholder="Buscar por nombre, IP o MAC" bind:value={q} aria-label="Buscar clientes" />
    </div>
  </div>

  <div class="card tablewrap">
    <table class="tbl">
      <thead><tr>
        <th><button onclick={() => toggle('name')}>Nombre{arrow('name')}</button></th>
        <th><button onclick={() => toggle('ip')}>IP{arrow('ip')}</button></th>
        <th>MAC</th>
        <th><button onclick={() => toggle('kind')}>Tipo{arrow('kind')}</button></th>
        <th>Concesión DHCP</th>
      </tr></thead>
      <tbody>
        {#each rows as c (c.mac)}
          <tr class="click" class:sel={sel?.mac === c.mac} onclick={() => (sel = c)} tabindex="0"
            onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (sel = c)}>
            <td><span class="who"><span class="ico"><Icon name={c.kind} size={18} /></span>{c.name || 'Sin nombre'}</span></td>
            <td class="num">{c.ip || '—'}</td>
            <td class="mono muted">{c.mac}</td>
            <td>{KIND[c.kind]}</td>
            <td class="muted">{lease(c)}</td>
          </tr>
        {:else}
          <tr><td colspan="5" class="empty muted">{loaded ? 'No hay clientes que coincidan.' : 'Cargando…'}</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<Drawer open={!!sel} title={sel?.name || 'Cliente'} onclose={() => (sel = null)}>
  {#if sel}
    <div class="det-hero"><span class="ico big"><Icon name={sel.kind} size={30} /></span><div><b>{sel.name || 'Sin nombre'}</b><p class="muted">{KIND[sel.kind]}</p></div></div>
    <div class="stat-row"><span>Dirección IP</span><b class="num">{sel.ip || '—'}</b></div>
    <div class="stat-row"><span>MAC</span><b class="mono">{sel.mac}</b></div>
    <div class="stat-row"><span>Concesión DHCP</span><b>{lease(sel)}</b></div>
    {#each sel.ip6 as a}<div class="stat-row"><span>IPv6</span><b class="mono">{a}</b></div>{/each}
  {/if}
</Drawer>

<style>
  .search { position: relative; width: min(340px, 100%); }
  .search :global(svg) { position: absolute; left: 11px; top: 10px; color: var(--text-3); }
  .search .input { padding-left: 34px; }
  .tablewrap { padding: 0; overflow-x: auto; }
  th button { background: none; border: 0; font: inherit; color: inherit; text-transform: inherit; letter-spacing: inherit; padding: 0; }
  .who { display: inline-flex; align-items: center; gap: 12px; font-weight: 500; }
  .ico { width: 32px; height: 32px; border-radius: 9px; background: var(--surface-2); color: var(--text-2); display: grid; place-items: center; }
  .ico.big { width: 56px; height: 56px; border-radius: 14px; background: var(--accent-soft); color: var(--accent); }
  .det-hero { display: flex; gap: 14px; align-items: center; margin-bottom: 14px; }
  .empty { text-align: center; padding: 40px; }
</style>
