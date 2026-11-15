<script lang="ts">
  import { onMount } from 'svelte';
  import AreaChart from '../components/AreaChart.svelte';
  import Donut from '../components/Donut.svelte';
  import Meter from '../components/Meter.svelte';
  import Icon from '../components/Icon.svelte';
  import { live } from '../lib/live.svelte';
  import { getBoard, getClients } from '../lib/api';
  import { bps, bytes, duration, load, pct, cidr } from '../lib/format';
  import type { Board, Client } from '../lib/types';

  let board = $state<Board | null>(null);
  let clients = $state<Client[]>([]);
  let picked = $state<string>('');

  onMount(() => {
    const stop = live.start();
    getBoard().then((b) => (board = b)).catch(() => {});
    const refresh = () => getClients().then((c) => (clients = c)).catch(() => {});
    refresh();
    const t = setInterval(refresh, 15000);
    return () => { stop(); clearInterval(t); };
  });

  const wan = $derived(live.wan);
  const dev = $derived(picked || wan?.l3_device || Object.keys(live.devices)[0] || '');
  const now = $derived(live.rate(dev));
  const series = $derived(live.history[dev] ?? []);
  const sys = $derived(live.system);
  const memUsed = $derived(sys ? pct(sys.memory.total - sys.memory.available, sys.memory.total) : 0);
  const rootUsed = $derived(sys ? pct(sys.root.used, sys.root.total) : 0);
  const gw = $derived(wan?.route?.find((r) => r.target === '0.0.0.0')?.nexthop);

  const KIND: Record<string, [string, string]> = {
    phone: ['Móviles', '#28a5ee'], laptop: ['Portátiles', '#006fff'], desktop: ['Sobremesa', '#0a3fa8'],
    tv: ['TV', '#f09a14'], printer: ['Impresoras', '#17a860'], iot: ['IoT', '#a24fd8'],
    server: ['Servidores', '#e5484d'], router: ['Red', '#5d6675'], unknown: ['Otros', '#9aa3b2'],
  };
  const segs = $derived.by(() => {
    const m = new Map<string, number>();
    clients.forEach((c) => m.set(c.kind, (m.get(c.kind) ?? 0) + 1));
    return [...m].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: KIND[k][0], value: v, color: KIND[k][1] }));
  });

  // Physical-looking ports: skip bridges, wifi (phy*), loopback & virtual devices.
  const ports = $derived(Object.values(live.devices)
    .filter((d) => d.type === 'Network device' && !/^(phy|wlan|lo$|ifb|veth|tap|tun|wg)/.test(d.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })));
  const speedLabel = (s?: string) => { const n = parseInt(s ?? '0'); return n >= 1000 ? `${n / 1000}G`.replace('.0', '') : n ? String(n) : '✓'; };
  const speedTone = (s?: string) => { const n = parseInt(s ?? '0'); return n >= 2500 ? 'g25' : n >= 1000 ? 'g1' : n > 0 ? 'g0' : 'off'; };
</script>

<div class="page">
  <div class="page-head"><h1>Panel</h1></div>

  <div class="layout">
    <aside class="card side">
      <div class="hero">
        <div class="ico"><Icon name="router" size={30} /></div>
        <div>
          <h2>{board?.model ?? '—'}</h2>
          <p class="muted">{board?.hostname ?? ''}</p>
        </div>
      </div>
      <div class="stat-row"><span>Tiempo activo</span><b class="num">{sys ? duration(sys.uptime) : '—'}</b></div>
      <div class="stat-row"><span>Carga (1/5/15)</span><b class="num">{sys ? sys.load.map(load).join(' · ') : '—'}</b></div>
      <div class="stat-row"><span>Versión</span><b>{board?.release.version ?? '—'}</b></div>
      <div class="stat-row"><span>Kernel</span><b class="num">{board?.kernel ?? '—'}</b></div>
      <div class="meters">
        {#if sys}
          <Meter label="Memoria" value={memUsed} detail="{bytes(sys.memory.total - sys.memory.available)} / {bytes(sys.memory.total)}" />
          <Meter label="Almacenamiento" value={rootUsed} detail="{bytes(sys.root.used * 1024)} / {bytes(sys.root.total * 1024)}" />
        {/if}
      </div>
    </aside>

    <section class="main">
      <div class="card">
        <div class="card-title">
          <div>
            <h2>Actividad de red</h2>
            <p class="live num">
              <span style="color:var(--rx)"><Icon name="down" size={14} /> {now ? bps(now.rx) : '–'}</span>
              <span style="color:var(--tx)"><Icon name="up" size={14} /> {now ? bps(now.tx) : '–'}</span>
            </p>
          </div>
          <select class="input sel" value={dev} onchange={(e) => (picked = e.currentTarget.value)} aria-label="Interfaz">
            {#each Object.keys(live.devices) as d}<option value={d}>{d}{d === wan?.l3_device ? ' (Internet)' : ''}</option>{/each}
          </select>
        </div>
        <AreaChart data={series} />
      </div>

      <div class="row3">
        <div class="card">
          <div class="card-title"><h2>Internet</h2><span class="pill"><i class="dot" class:ok={!!wan} class:bad={!wan}></i>{wan ? 'Conectado' : 'Sin conexión'}</span></div>
          {#if wan}
            <div class="stat-row"><span>Interfaz</span><b>{wan.interface} · {wan.l3_device}</b></div>
            <div class="stat-row"><span>Protocolo</span><b>{wan.proto.toUpperCase()}</b></div>
            <div class="stat-row"><span>IP</span><b class="num">{wan['ipv4-address']?.[0] ? cidr(wan['ipv4-address'][0]) : '—'}</b></div>
            <div class="stat-row"><span>Puerta de enlace</span><b class="num">{gw ?? '—'}</b></div>
            <div class="stat-row"><span>DNS</span><b class="num">{wan['dns-server']?.join(', ') ?? '—'}</b></div>
            <div class="stat-row"><span>Conectado desde hace</span><b class="num">{wan.uptime ? duration(wan.uptime) : '—'}</b></div>
          {/if}
        </div>

        <div class="card">
          <div class="card-title"><h2>Clientes</h2><a href="#/clients">Ver todos</a></div>
          <div class="cl">
            <Donut {segs} center={String(clients.length)} sub="dispositivos" />
            <ul>
              {#each segs.slice(0, 6) as s}
                <li><i style:background={s.color}></i><span>{s.label}</span><b class="num">{s.value}</b></li>
              {/each}
            </ul>
          </div>
        </div>

        <div class="card">
          <div class="card-title"><h2>Puertos</h2></div>
          <div class="ports">
            {#each ports as p}
              <div class="pw" title="{p.name} · {p.carrier ? (p.speed ?? 'activo') : 'sin enlace'}">
                <div class="port {p.carrier ? speedTone(p.speed) : 'off'}">{p.carrier ? speedLabel(p.speed) : '–'}</div>
                <span>{p.name}</span>
              </div>
            {/each}
          </div>
          <div class="legend">
            <span><i class="g25"></i>2.5G+</span><span><i class="g1"></i>1G</span><span><i class="g0"></i>10/100</span><span><i class="off"></i>Sin enlace</span>
          </div>
        </div>
      </div>
    </section>
  </div>
</div>

<style>
  .layout { display: grid; grid-template-columns: 300px 1fr; gap: 16px; align-items: start; }
  .main { display: grid; gap: 16px; min-width: 0; }
  .row3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
  .hero { display: flex; gap: 14px; align-items: center; padding-bottom: 14px; border-bottom: 1px solid var(--border); }
  .ico { width: 52px; height: 52px; border-radius: 12px; background: var(--accent-soft); color: var(--accent); display: grid; place-items: center; }
  .hero h2 { font-size: 15px; font-weight: 600; }
  .meters { margin-top: 10px; }
  .live { display: flex; gap: 18px; margin-top: 4px; font-size: 20px; font-weight: 600; }
  .live span { display: inline-flex; align-items: center; gap: 4px; }
  .sel { width: auto; min-width: 160px; }
  .cl { display: flex; gap: 18px; align-items: center; flex-wrap: wrap; }
  .cl ul { list-style: none; margin: 0; padding: 0; flex: 1; min-width: 120px; display: grid; gap: 7px; }
  .cl li { display: flex; align-items: center; gap: 8px; font-size: 13px; }
  .cl li i { width: 9px; height: 9px; border-radius: 3px; }
  .cl li b { margin-left: auto; }
  .ports { display: flex; flex-wrap: wrap; gap: 8px; }
  .ports { gap: 12px; }
  .pw { display: grid; justify-items: center; gap: 4px; font-size: 11px; color: var(--text-2); }
  .port { width: 40px; height: 34px; border-radius: 7px; display: grid; place-items: center; font-size: 12px; font-weight: 600; color: #fff; }
  .g25 { background: #2f80ed; } .g1 { background: var(--ok); } .g0 { background: var(--warn); } .off { background: var(--surface-2); color: var(--text-3); }
  .port.off { color: var(--text-3); }
  .legend { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 16px; font-size: 12px; color: var(--text-2); }
  .legend i { display: inline-block; width: 9px; height: 9px; border-radius: 3px; margin-right: 5px; }
  @media (max-width: 1180px) { .row3 { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 960px) { .layout { grid-template-columns: 1fr; } }
  @media (max-width: 640px) { .row3 { grid-template-columns: 1fr; } }
</style>
