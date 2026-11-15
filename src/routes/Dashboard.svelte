<script lang="ts">
  import { onMount } from 'svelte';
  import AreaChart from '../components/AreaChart.svelte';
  import Donut from '../components/Donut.svelte';
  import Meter from '../components/Meter.svelte';
  import Icon from '../components/Icon.svelte';
  import LineChart from '../components/LineChart.svelte';
  import { live } from '../lib/live.svelte';
  import { getBoard, getClients, getServices, isFailed } from '../lib/api';
  import { memory, maxTemp, tempTone } from '../lib/derive';
  import { bps, bytes, duration, load, pct, cidr } from '../lib/format';
  import type { Board, Client, Service } from '../lib/types';

  let board = $state<Board | null>(null);
  let clients = $state<Client[]>([]);
  let picked = $state<string>('');
  let services = $state<Service[]>([]);

  onMount(() => {
    const stop = live.start();
    getBoard().then((b) => (board = b)).catch(() => {});
    const refresh = () => getClients().then((c) => (clients = c)).catch(() => {});
    refresh();
    const svc = () => getServices().then((x) => (services = x)).catch(() => {});
    svc();
    const t = setInterval(() => { refresh(); svc(); }, 10000);
    return () => { stop(); clearInterval(t); };
  });

  const wan = $derived(live.wan);
  const dev = $derived(picked || wan?.l3_device || Object.keys(live.devices)[0] || '');
  const now = $derived(live.rate(dev));
  const series = $derived(live.history[dev] ?? []);
  const sys = $derived(live.system);
  const mem = $derived(memory(live.stats, sys));
  const cpuNow = $derived(live.cpuHist[live.cpuHist.length - 1] ?? 0);
  const temp = $derived(maxTemp(live.stats));
  const down = $derived(services.filter(isFailed));
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
      {#if live.stats?.cpu.model}<div class="stat-row"><span>Procesador</span><b>{live.stats.cpu.model}</b></div>{/if}
      {#if temp !== null}<div class="stat-row"><span>Temperatura</span><b class="num t-{tempTone(temp)}">{Math.round(temp)} °C</b></div>{/if}
      <div class="meters">
        <Meter label="CPU" value={cpuNow} detail="{cpuNow}%" />
        {#if mem}<Meter label="Memoria" value={mem.pct} detail="{bytes(mem.used)} / {bytes(mem.total)}" />{/if}
        {#if sys}<Meter label="Almacenamiento" value={rootUsed} detail="{bytes(sys.root.used * 1024)} / {bytes(sys.root.total * 1024)}" />{/if}
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

      <div class="row2">
        <div class="card">
          <div class="card-title"><h2>CPU</h2><span class="big num">{cpuNow}%</span></div>
          <LineChart data={live.cpuHist} height={110} />
          {#if live.coreUse.length > 1}
            <div class="cores">{#each live.coreUse as c, i}<div title="Núcleo {i}: {c}%"><i style:height="{Math.max(3, c)}%"></i></div>{/each}</div>
          {/if}
          <p class="faint foot">{live.stats?.cpu.count ?? '—'} {live.stats?.cpu.count === 1 ? 'núcleo' : 'núcleos'} · carga {live.stats ? live.stats.load.map((v) => v.toFixed(2)).join(' · ') : '—'}</p>
        </div>

        <div class="card">
          <div class="card-title"><h2>Memoria</h2><span class="big num">{mem?.pct ?? 0}%</span></div>
          <LineChart data={live.memHist} height={110} color="var(--tx)" />
          {#if mem}
            <div class="stack" role="img" aria-label="Uso de memoria">
              <i class="u" style:width="{(mem.used / mem.total) * 100}%"></i><i class="c" style:width="{(mem.cache / mem.total) * 100}%"></i>
            </div>
            <div class="mleg"><span><i class="u"></i>En uso {bytes(mem.used)}</span><span><i class="c"></i>Caché {bytes(mem.cache)}</span><span><i class="f"></i>Libre {bytes(mem.free)}</span>{#if mem.swapTotal}<span class="muted">Swap {bytes(mem.swapUsed)} / {bytes(mem.swapTotal)}</span>{/if}</div>
          {/if}
        </div>
      </div>

      <div class="row2">
        <div class="card">
          <div class="card-title">
            <h2>Servicios</h2>
            <span class="pill"><i class="dot" class:ok={!down.length} class:bad={down.length > 0}></i>{down.length ? `${down.length} con fallos` : 'Todo en marcha'}</span>
          </div>
          <ul class="svc">
            {#each services.slice(0, 8) as sv}
              <li><i class="dot" class:ok={sv.running} class:bad={isFailed(sv)}></i><span>{sv.name}</span>
                <small class="faint">{sv.running ? 'en marcha' : sv.instances ? `fallo (código ${sv.exitCode ?? '?'})` : 'sin demonio'}</small></li>
            {/each}
          </ul>
          {#if services.length > 8}<a href="#/system" class="more">Ver los {services.length} servicios</a>{/if}
        </div>

        <div class="card">
          <div class="card-title"><h2>Actividad del sistema</h2></div>
          <div class="stat-row"><span>Conexiones activas</span><b class="num">{live.stats?.conntrack.count ?? '—'}{live.stats?.conntrack.max ? ` / ${live.stats.conntrack.max.toLocaleString()}` : ''}</b></div>
          <div class="stat-row"><span>Procesos</span><b class="num">{live.stats?.procs ?? '—'}</b></div>
          <div class="stat-row"><span>Clientes conectados</span><b class="num">{clients.length}</b></div>
          <div class="stat-row"><span>Hora del router</span><b class="num">{sys ? new Date(sys.localtime * 1000).toLocaleTimeString() : '—'}</b></div>
          {#if live.stats?.temps.length}
            <div class="temps">{#each live.stats.temps.slice(0, 6) as t}<span class="pill t-{tempTone(t.c)}">{t.label.replace('coretemp ', '')} {Math.round(t.c)}°</span>{/each}</div>
          {/if}
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
  .row2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
  .big { font-size: 22px; font-weight: 650; }
  .foot { margin-top: 10px; font-size: 12.5px; }
  .cores { display: flex; gap: 4px; align-items: flex-end; height: 34px; margin-top: 12px; }
  .cores div { flex: 1; height: 100%; background: var(--surface-2); border-radius: 4px; display: flex; align-items: flex-end; overflow: hidden; }
  .cores i { display: block; width: 100%; background: var(--accent); }
  .stack { display: flex; height: 8px; border-radius: 99px; background: var(--surface-2); overflow: hidden; margin-top: 14px; }
  .stack i.u { background: var(--tx); } .stack i.c { background: var(--rx); opacity: .6; }
  .mleg { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 10px; font-size: 12.5px; color: var(--text-2); }
  .mleg i { display: inline-block; width: 9px; height: 9px; border-radius: 3px; margin-right: 6px; background: var(--surface-2); border: 1px solid var(--border); }
  .mleg i.u { background: var(--tx); border: 0; } .mleg i.c { background: var(--rx); opacity: .6; border: 0; }
  .svc { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  .svc li { display: flex; align-items: center; gap: 10px; padding: 7px 0; border-bottom: 1px solid var(--border); font-size: 13.5px; }
  .svc li:last-child { border-bottom: 0; } .svc small { margin-left: auto; }
  .more { display: inline-block; margin-top: 10px; font-size: 13px; }
  .temps { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
  .t-ok { color: var(--ok); } .t-warn { color: var(--warn); } .t-bad { color: var(--bad); }
  @media (max-width: 760px) { .row2 { grid-template-columns: 1fr; } }
  @media (max-width: 1180px) { .row3 { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 960px) { .layout { grid-template-columns: 1fr; } }
  @media (max-width: 640px) { .row3 { grid-template-columns: 1fr; } }
</style>
