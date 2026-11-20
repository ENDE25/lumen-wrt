<script lang="ts">
  // Add-on apps (#/apps): every LuCI app installed on the router, found through LuCI's own menu files.
  // #/apps/<id> opens one: Lumen's own panel when it has one (src/apps), otherwise its LuCI pages.
  import { onMount } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import LuciFrame from '../components/LuciFrame.svelte';
  import { router } from '../lib/router.svelte';
  import { getApps, appIcon, appBlurb, type App } from '../lib/apps';
  import { getInitScripts, initAction, type InitScript, type InitAction } from '../lib/admin';
  import { PANELS } from '../apps';
  import { MOCK } from '../lib/ubus';

  let apps = $state<App[]>([]), luci = $state(true), scripts = $state<InitScript[]>([]);
  let loaded = $state(false), err = $state(''), busy = $state(false);

  async function load() {
    try {
      const [r, s] = await Promise.all([getApps(), getInitScripts().catch(() => [] as InitScript[])]);
      apps = r.apps; luci = r.luci; scripts = s; err = '';
    } catch (e) { err = e instanceof Error ? e.message : String(e); }
    loaded = true;
  }
  onMount(load);

  const svc = (a: App) => (a.service ? scripts.find((s) => s.name === a.service) : undefined);
  const app = $derived(router.sub ? apps.find((a) => a.id === router.sub.split('/')[0]) : undefined);
  const Panel = $derived(app ? PANELS[app.id] : undefined);

  // The tabs of the open app: Lumen's panel first when there is one, then the app's LuCI pages.
  interface Tab { key: string; title: string; luci?: string }
  const tabs = $derived.by<Tab[]>(() => {
    if (!app) return [];
    const out: Tab[] = Panel ? [{ key: 'panel', title: 'Overview' }] : [];
    if (luci) {
      if (app.tabs.length) for (const t of app.tabs) out.push({ key: t.path, title: t.title, luci: t.path });
      else out.push({ key: app.path, title: Panel ? 'All settings' : 'Settings', luci: app.path });
    }
    return out;
  });
  let tabKey = $state('');
  $effect(() => { void app?.id; tabKey = ''; });
  const tab = $derived(tabs.find((t) => t.key === tabKey) ?? tabs[0]);

  async function service(a: App, action: InitAction) {
    busy = true; err = '';
    try { await initAction(a.service, action); } catch (e) { err = e instanceof Error ? e.message : String(e); }
    await new Promise((r) => setTimeout(r, 900));
    scripts = await getInitScripts().catch(() => scripts);
    busy = false;
  }
</script>

<div class="page">
  {#if router.sub && loaded && !app}
    <div class="page-head"><h1>App not found</h1></div>
    <div class="card empty"><p class="muted">“{router.sub}” is not installed, or it was removed.</p><a class="btn" href="#/apps">Back to apps</a></div>

  {:else if app}
    {@const s = svc(app)}
    <div class="page-head">
      <div class="title">
        <a class="back" href="#/apps" aria-label="Back to apps"><Icon name="chevron" size={18} /></a>
        <span class="ico"><Icon name={appIcon(app)} size={20} /></span>
        <div>
          <h1>{app.title}</h1>
          <small class="muted">{app.version ? `${app.pkg} · ${app.version}` : app.pkg}</small>
        </div>
      </div>
      {#if s}
        <div class="svc">
          <span class="pill"><i class="dot" class:ok={s.running}></i>{s.running ? 'Running' : 'Stopped'}</span>
          {#if s.running}
            <button class="btn sm" disabled={busy} onclick={() => service(app, 'restart')}><Icon name="refresh" size={14} /> Restart</button>
            <button class="btn sm" disabled={busy} onclick={() => service(app, 'stop')}>Stop</button>
          {:else}
            <button class="btn sm primary" disabled={busy} onclick={() => service(app, 'start')}><Icon name="power" size={14} /> Start</button>
          {/if}
        </div>
      {/if}
    </div>
    {#if err}<p class="alert"><Icon name="alert" size={16} />{err}</p>{/if}

    {#if tabs.length > 1}
      <div class="seg tabs" role="tablist">
        {#each tabs as t (t.key)}
          <button role="tab" aria-selected={tab?.key === t.key} class:on={tab?.key === t.key} onclick={() => (tabKey = t.key)}>{t.title}</button>
        {/each}
      </div>
    {/if}

    {#if !tab}
      <div class="card empty"><Icon name="alert" size={22} /><p class="muted">This app is configured through LuCI, which is not installed on this router.</p></div>
    {:else if tab.key === 'panel' && Panel}
      <Panel />
    {:else if tab.luci}
      {#if MOCK}
        <div class="card empty"><p class="muted">LuCI page <code>{tab.luci}</code> would show here (not available in the mock).</p></div>
      {:else}
        {#key tab.luci}<LuciFrame path={tab.luci} />{/key}
      {/if}
    {/if}

  {:else}
    <div class="page-head">
      <h1>Apps</h1>
      <a class="btn" href="#/updates?find=luci-app-"><Icon name="plus" size={16} /> Get more apps</a>
    </div>
    {#if err}<p class="alert"><Icon name="alert" size={16} />{err}</p>{/if}
    {#if !loaded}
      <p class="muted">Looking for installed apps…</p>
    {:else if !apps.length}
      <div class="card empty">
        <Icon name="apps" size={26} />
        <p><b>No add-on apps installed</b></p>
        <p class="muted">Apps such as Wake on LAN, Dynamic DNS, AdBlock or WireGuard come as <code>luci-app-…</code> packages and appear here once installed.</p>
        <a class="btn primary" href="#/updates?find=luci-app-">Browse apps</a>
      </div>
    {:else}
      <div class="grid apps">
        {#each apps as a (a.id)}
          {@const s = svc(a)}
          <a class="card app" href={`#/apps/${a.id}`}>
            <span class="ico"><Icon name={appIcon(a)} size={22} /></span>
            <span class="txt">
              <b>{a.title}</b>
              <small class="muted">{appBlurb(a) || a.pkg}</small>
            </span>
            <span class="meta">
              {#if s}<span class="pill"><i class="dot" class:ok={s.running}></i>{s.running ? 'Running' : 'Stopped'}</span>{/if}
              {#if PANELS[a.id]}<span class="pill native">Lumen panel</span>{/if}
            </span>
          </a>
        {/each}
      </div>
      <p class="muted small foot">Apps are the LuCI add-ons installed on the router. Those with a Lumen panel open in Lumen's own design; the rest show their LuCI pages here.</p>
    {/if}
  {/if}
</div>

<style>
  .apps { grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
  .app { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; align-items: start; color: inherit; text-decoration: none; transition: border-color .12s, transform .12s; }
  .app:hover { border-color: var(--accent); text-decoration: none; transform: translateY(-1px); }
  .app .txt { display: grid; gap: 3px; min-width: 0; }
  .app .txt b { font-weight: 600; }
  .app .txt small { display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .app .meta { grid-column: 2; display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
  .app .meta:empty { display: none; }
  .ico { width: 40px; height: 40px; border-radius: 11px; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); flex: none; }
  .native { color: var(--accent); }
  .title { display: flex; align-items: center; gap: 12px; }
  .title h1 { line-height: 1.2; }
  .back { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 9px; color: var(--text-2); transform: rotate(180deg); }
  .back:hover { background: var(--surface-2); color: var(--text); }
  .svc { display: flex; align-items: center; gap: 8px; }
  .tabs { margin-bottom: 16px; }
  .empty { display: grid; justify-items: center; gap: 10px; padding: 40px 20px; text-align: center; }
  .empty p { max-width: 520px; }
  .foot { margin-top: 16px; }
</style>
