<script lang="ts">
  import { onMount, tick } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import Drawer from '../components/Drawer.svelte';
  import { getBoard } from '../lib/api';
  import { bytes, duration } from '../lib/format';
  import { fetchVersions, firmwareStatus, type Versions } from '../lib/firmware';
  import { getInstalled, getJob, getUpgradable, planPackages, runPackages, searchPackages, type PkgAction, type Pkg, type PkgJob, type Upgradable } from '../lib/packages';
  import type { Board } from '../lib/types';

  type Tab = 'updates' | 'installed' | 'install';
  let tab = $state<Tab>('updates');
  let installed = $state<Pkg[]>([]);
  let upgradable = $state<Upgradable[]>([]);
  let loaded = $state(false);
  let err = $state('');
  let notice = $state('');

  // ---- firmware
  let board = $state<Board | null>(null);
  let versions = $state<Versions | null>(null);
  let checked = $state(false);
  const current = $derived(board?.release.version ?? '');
  const fw = $derived(firmwareStatus(current, versions));
  const series = (v: string) => v.split('.').slice(0, 2).join('.');

  // ---- lists
  async function loadLists() {
    try { [installed, upgradable] = await Promise.all([getInstalled(), getUpgradable()]); err = ''; }
    catch (e) { err = e instanceof Error ? e.message : String(e); }
    loaded = true;
  }

  // ---- background job (install / remove / upgrade / update lists), followed by polling
  let job = $state<PkgJob>({ state: 'idle' });
  let showJob = $state(false);
  let following = false;
  async function follow() {
    if (following) return;
    following = true;
    try {
      for (;;) {
        job = await getJob();
        await tick();
        const el = document.getElementById('joblog'); if (el) el.scrollTop = el.scrollHeight;
        if (job.state !== 'running') break;
        await new Promise((r) => setTimeout(r, 1000));
      }
      await loadLists();
      if (job.cmd?.startsWith('apk update')) upgradableChecked = true;
    } catch (e) { notice = e instanceof Error ? e.message : String(e); }
    following = false;
  }
  let upgradableChecked = $state(false);

  async function start(action: PkgAction, pkgs: string[] = []) {
    notice = '';
    try {
      const r = await runPackages(action, pkgs);
      if (r.error) { notice = r.error; return; }
      showJob = true; job = { state: 'running', cmd: `apk ${action} ${pkgs.join(' ')}`.trim(), log: '' };
      follow();
    } catch (e) { notice = e instanceof Error ? e.message : String(e); }
  }

  onMount(() => {
    loadLists();
    getBoard().then((b) => (board = b)).catch(() => {});
    fetchVersions().then((v) => { versions = v; checked = true; });
    getJob().then((j) => { if (j.state === 'running') { showJob = true; job = j; follow(); } else if (j.state === 'done' && j.ended && Date.now() / 1000 - j.ended < 120) { showJob = true; job = j; } }).catch(() => {});
  });

  // ---- confirmation drawer: show what apk would do before doing it
  interface Plan { action: Exclude<PkgAction, 'update'>; pkgs: string[]; title: string; text: string; loading: boolean; error: string }
  let plan = $state<Plan | null>(null);
  async function openPlan(action: Plan['action'], pkgs: string[], title: string) {
    plan = { action, pkgs, title, text: '', loading: true, error: '' };
    try {
      const r = await planPackages(action, pkgs);
      if (plan) { plan.loading = false; if (r.error) plan.error = r.error; else plan.text = r.text || 'Nothing to do.'; }
    } catch (e) { if (plan) { plan.loading = false; plan.error = e instanceof Error ? e.message : String(e); } }
  }
  function confirmPlan() { if (!plan) return; const p = plan; plan = null; start(p.action, p.pkgs); }
  const busy = $derived(job.state === 'running');

  // ---- search the repositories (done on the router: the catalogue has ~11 000 packages)
  let q = $state('');
  let results = $state<Pkg[]>([]);
  let total = $state(0);
  let searchErr = $state('');
  let searching = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const term = q.trim();
    clearTimeout(timer);
    if (term.length < 2) { results = []; total = 0; searchErr = ''; return; }
    timer = setTimeout(async () => {
      searching = true;
      try { const r = await searchPackages(term); if (r.error) { searchErr = r.error; results = []; } else { searchErr = ''; results = r.results ?? []; total = r.total ?? 0; } }
      catch (e) { searchErr = e instanceof Error ? e.message : String(e); }
      searching = false;
    }, 300);
  });
  const have = $derived(new Set(installed.map((p) => p.name)));

  // ---- installed filter
  let filter = $state('');
  const shown = $derived(filter.trim() ? installed.filter((p) => (p.name + ' ' + (p.description ?? '')).toLowerCase().includes(filter.trim().toLowerCase())) : installed);
  const took = $derived(job.started && job.ended ? duration(job.ended - job.started) : '');
</script>

<div class="page">
  <div class="page-head">
    <h1>Software</h1>
    <button class="btn" disabled={busy} onclick={() => start('update')}><Icon name="refresh" size={16} />Update package lists</button>
  </div>

  {#if notice}<p class="notice" role="alert"><Icon name="alert" size={16} />{notice}<button class="x" onclick={() => (notice = '')} aria-label="Dismiss">×</button></p>{/if}

  <!-- ===== Firmware ===== -->
  <div class="card fw">
    <div class="fwhead">
      <span class="fico"><Icon name="router" size={24} /></span>
      <div class="fwt">
        <h2>OpenWrt {current || '…'}</h2>
        <p class="muted">{board?.release.description ?? ''}{board ? ` · ${board.release.target}` : ''}</p>
      </div>
      {#if !checked}<span class="pill">Checking for new releases…</span>
      {:else if fw.kind === 'current'}<span class="pill ok"><i class="dot ok"></i>Up to date</span>
      {:else if fw.kind === 'patch' || fw.kind === 'series'}<span class="pill warn"><i class="dot warn"></i>{fw.latest} is available</span>
      {:else if fw.kind === 'ahead'}<span class="pill">Newer than the latest stable release</span>
      {:else}<span class="pill">Couldn't check for releases</span>{/if}
    </div>
    <div class="fwbody">
      {#if fw.kind === 'current'}
        <p class="muted">You're running the latest stable release ({fw.latest}). Package updates within it are listed below.</p>
      {:else if fw.kind === 'patch'}
        <p class="muted">A newer release of the {series(current)} series is out. It usually carries security and bug fixes.</p>
      {:else if fw.kind === 'series'}
        <p class="muted">A newer release series exists. Upgrading across series is a bigger step: read the release notes first, and keep a backup.</p>
      {:else if fw.kind === 'unknown' && checked}
        <p class="muted">Your browser couldn't reach <code>downloads.openwrt.org</code>. You can still manage packages below.</p>
      {/if}
      {#if versions && (fw.kind === 'patch' || fw.kind === 'series')}
        <div class="links">
          <a href="https://openwrt.org/releases/{series(fw.latest)}/notes-{fw.latest}" target="_blank" rel="noreferrer">Release notes</a>
          <a href="#/backup">Install it</a>
        </div>
        <p class="faint small">Lumen can install it for you: open <a href="#/backup">Backup &amp; Firmware</a>, which downloads the official image for your device and checks it before flashing.</p>
      {/if}
    </div>
  </div>

  <!-- ===== Running / last job ===== -->
  {#if showJob && job.state !== 'idle'}
    <div class="card job">
      <div class="jh">
        {#if job.state === 'running'}<span class="spin"><Icon name="refresh" size={18} /></span><b>Running</b>
        {:else if job.code === 0}<Icon name="check" size={18} /><b class="okc">Finished</b>
        {:else}<Icon name="alert" size={18} /><b class="badc">Failed (exit {job.code})</b>{/if}
        <code>{job.cmd}</code>
        {#if took}<span class="faint small">{took}</span>{/if}
        {#if job.state === 'done'}<button class="btn sm" style="margin-left:auto" onclick={() => (showJob = false)}>Dismiss</button>{/if}
      </div>
      <pre id="joblog">{job.log || 'Waiting for output…'}</pre>
    </div>
  {/if}

  <!-- ===== Packages ===== -->
  <div class="tabs">
    <div class="seg" role="tablist">
      <button role="tab" aria-selected={tab === 'updates'} class:on={tab === 'updates'} onclick={() => (tab = 'updates')}>Updates{#if upgradable.length} <span class="cnt">{upgradable.length}</span>{/if}</button>
      <button role="tab" aria-selected={tab === 'installed'} class:on={tab === 'installed'} onclick={() => (tab = 'installed')}>Installed <span class="cnt">{installed.length}</span></button>
      <button role="tab" aria-selected={tab === 'install'} class:on={tab === 'install'} onclick={() => (tab = 'install')}>Install new</button>
    </div>
  </div>

  {#if err}
    <div class="card"><p class="muted">Could not read the package database: {err}</p></div>
  {:else if !loaded}
    <div class="card"><p class="muted">Loading…</p></div>
  {:else if tab === 'updates'}
    <div class="card">
      <div class="card-title">
        <h2>Available updates <span class="faint">{upgradable.length}</span></h2>
        {#if upgradable.length}<button class="btn primary" disabled={busy} onclick={() => openPlan('upgrade', [], 'Upgrade all packages')}>Upgrade all</button>{/if}
      </div>
      {#if upgradable.length}
        <div class="tw"><table class="tbl">
          <thead><tr><th>Package</th><th>Installed</th><th>Available</th><th></th></tr></thead>
          <tbody>
            {#each upgradable as u (u.name)}
              <tr><td class="mono"><b>{u.name}</b></td><td class="num muted">{u.from ?? '—'}</td><td class="num">{u.to}</td>
                <td><div class="row-actions"><button class="btn sm" disabled={busy} onclick={() => openPlan('upgrade', [u.name], `Upgrade ${u.name}`)}>Upgrade</button></div></td></tr>
            {/each}
          </tbody>
        </table></div>
        <p class="faint small note">These come from the package lists last downloaded. Use “Update package lists” to refresh them. Kernel modules are tied to the running kernel and are not upgraded by apk.</p>
      {:else}
        <p class="muted">Every installed package is up to date{upgradableChecked ? '' : ' (as of the last package-list update)'}.</p>
      {/if}
    </div>
  {:else if tab === 'installed'}
    <div class="card">
      <div class="card-title">
        <h2>Installed packages <span class="faint">{shown.length}{shown.length !== installed.length ? ` of ${installed.length}` : ''}</span></h2>
        <div class="search"><Icon name="search" size={16} /><input class="input" placeholder="Filter" bind:value={filter} aria-label="Filter installed packages" /></div>
      </div>
      <div class="tw"><table class="tbl">
        <thead><tr><th>Package</th><th>Version</th><th>Size</th><th class="desc">Description</th><th></th></tr></thead>
        <tbody>
          {#each shown as p (p.name)}
            <tr>
              <td class="mono"><b>{p.name}</b></td><td class="num muted">{p.version}</td><td class="num">{p.size ? bytes(p.size) : '—'}</td>
              <td class="desc muted">{p.description ?? ''}</td>
              <td><div class="row-actions">
                {#if p.core}<span class="tag" title="Part of the base system">core</span>
                {:else}<button class="btn sm danger" disabled={busy} onclick={() => openPlan('del', [p.name], `Remove ${p.name}`)}>Remove</button>{/if}
              </div></td>
            </tr>
          {/each}
        </tbody>
      </table></div>
    </div>
  {:else}
    <div class="card">
      <div class="card-title"><h2>Install a package</h2></div>
      <div class="search wide"><Icon name="search" size={16} /><input class="input" placeholder="Search the repositories, e.g. htop, wireguard, adblock" bind:value={q} aria-label="Search packages" /></div>
      {#if searchErr}<p class="muted pad">{searchErr}</p>
      {:else if q.trim().length < 2}<p class="muted pad">Type at least two characters. About 11 000 packages are available; the search runs on the router.</p>
      {:else if searching && !results.length}<p class="muted pad">Searching…</p>
      {:else if !results.length}<p class="muted pad">No package matches “{q.trim()}”. If you expected one, try “Update package lists”.</p>
      {:else}
        {#if total > results.length}<p class="faint small pad">Showing the first {results.length} of {total} matches. Refine the search to narrow it down.</p>{/if}
        <div class="tw"><table class="tbl">
          <thead><tr><th>Package</th><th>Version</th><th>Size</th><th class="desc">Description</th><th></th></tr></thead>
          <tbody>
            {#each results as p (p.name)}
              <tr>
                <td class="mono"><b>{p.name}</b></td><td class="num muted">{p.version}</td><td class="num">{p.size ? bytes(p.size) : '—'}</td><td class="desc muted">{p.description ?? ''}</td>
                <td><div class="row-actions">
                  {#if have.has(p.name)}<span class="tag">installed</span>
                  {:else}<button class="btn sm primary" disabled={busy} onclick={() => openPlan('add', [p.name], `Install ${p.name}`)}>Install</button>{/if}
                </div></td>
              </tr>
            {/each}
          </tbody>
        </table></div>
      {/if}
    </div>
  {/if}
</div>

<Drawer open={!!plan} title={plan?.title ?? ''} onclose={() => (plan = null)}>
  {#if plan}
    {#if plan.loading}<p class="muted">Working out what would change…</p>
    {:else if plan.error}<p class="errtxt">{plan.error}</p>
    {:else}
      <p class="muted" style="margin-bottom:10px">This is what apk is going to do:</p>
      <pre class="plan">{plan.text}</pre>
      {#if plan.action === 'del'}<p class="faint small">Packages that were only installed for this one are removed with it. apk refuses if another installed package still needs it.</p>{/if}
      {#if plan.action === 'upgrade' && !plan.pkgs.length}<p class="faint small">Packages that provide running services may restart. Your connection to the router can drop briefly.</p>{/if}
    {/if}
    <div class="form-actions">
      <button class="btn" onclick={() => (plan = null)}>Cancel</button>
      <button class="btn primary" disabled={plan.loading || !!plan.error || busy} onclick={confirmPlan}>Confirm</button>
    </div>
  {/if}
</Drawer>

<style>
  .notice { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 10px; margin-bottom: 14px; background: color-mix(in srgb, var(--bad) 12%, transparent); color: var(--text); }
  .notice :global(svg) { color: var(--bad); flex: none; } .notice .x { margin-left: auto; background: none; border: 0; font-size: 18px; color: var(--text-2); }
  .fw { padding: 0; margin-bottom: 16px; overflow: hidden; }
  .fwhead { display: flex; align-items: center; gap: 14px; padding: 18px 20px; flex-wrap: wrap; }
  .fico { width: 46px; height: 46px; border-radius: 12px; background: var(--accent-soft); color: var(--accent); display: grid; place-items: center; flex: none; }
  .fwt { flex: 1; min-width: 220px; } .fwt h2 { font-size: 17px; font-weight: 650; } .fwt p { font-size: 13px; }
  .pill.ok { color: var(--ok); } .pill.warn { color: var(--warn); }
  .fwbody { padding: 0 20px 18px; display: grid; gap: 10px; } .fwbody p { margin: 0; font-size: 13.5px; }
  .fwbody code, .job code { background: var(--surface-2); padding: 1px 6px; border-radius: 5px; font-size: 12.5px; }
  .links { display: flex; gap: 18px; font-size: 13.5px; font-weight: 500; }
  .small { font-size: 12.5px; }
  .job { margin-bottom: 16px; padding: 0; overflow: hidden; }
  .jh { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
  .okc { color: var(--ok); } .badc { color: var(--bad); }
  .job pre { margin: 0; padding: 14px 16px; max-height: 260px; overflow: auto; font-family: var(--mono); font-size: 12.5px; white-space: pre-wrap; background: var(--surface-2); }
  .spin { display: inline-flex; animation: spin 1s linear infinite; color: var(--accent); }
  @keyframes spin { to { transform: rotate(360deg); } }
  .tabs { margin-bottom: 14px; }
  .cnt { margin-left: 5px; font-size: 12px; background: var(--accent-soft); color: var(--accent); padding: 1px 7px; border-radius: 99px; font-weight: 600; }
  .seg button.on .cnt { background: var(--accent); color: #fff; }
  .search { position: relative; width: min(300px, 100%); } .search.wide { width: 100%; }
  .search :global(svg) { position: absolute; left: 11px; top: 10px; color: var(--text-3); } .search .input { padding-left: 34px; }
  .pad { padding: 14px 2px 0; } .note { margin-top: 14px; }
  th.desc, td.desc { max-width: 420px; } td.desc { font-size: 13px; }
  .tw { margin: 0 -20px -4px; } .tbl th:first-child, .tbl td:first-child { padding-left: 20px; } .tbl th:last-child, .tbl td:last-child { padding-right: 20px; }
  .plan { background: var(--surface-2); border-radius: 8px; padding: 12px 14px; font-family: var(--mono); font-size: 12.5px; white-space: pre-wrap; max-height: 50vh; overflow: auto; margin: 0 0 12px; }
  .errtxt { color: var(--bad); }
</style>
