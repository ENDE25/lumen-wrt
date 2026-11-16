<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '../../components/Icon.svelte';
  import { call } from '../../lib/ubus';
  import { readFile, writeFile, cronProblem } from '../../lib/admin';

  const PATH = '/etc/crontabs/root';
  let text = $state(''), orig = $state(''), loaded = $state(false), err = $state(''), msg = $state('');
  onMount(async () => { orig = text = await readFile(PATH); loaded = true; });

  const problem = $derived(cronProblem(text));
  async function save() {
    if (problem) return;
    err = msg = '';
    try {
      const body = text.replace(/\s+$/, '') + (text.trim() ? '\n' : '');
      await writeFile(PATH, body, 0o600);
      await call('file', 'exec', { command: '/etc/init.d/cron', params: ['reload'] });
      orig = text = body; msg = 'Saved. The schedule is active.';
    } catch (e) { err = e instanceof Error ? e.message : String(e); }
  }
</script>

<div class="card form">
  <div class="card-title"><h2>Scheduled tasks</h2></div>
  <p class="muted small">Commands the router runs on a schedule (cron). One per line: <span class="mono">minute hour day month weekday command</span>. Times use the router's time zone. Lines starting with <span class="mono">#</span> are notes.</p>
  <textarea class="input" rows="10" spellcheck="false" bind:value={text} placeholder={'# Reboot every Sunday at 04:30\n30 4 * * 0 /sbin/reboot'} disabled={!loaded}></textarea>
  {#if problem}<small class="bad">{problem}</small>{/if}
  {#if err}<p class="alert"><Icon name="alert" size={16} />{err}</p>{/if}
  {#if msg}<p class="ok"><Icon name="check" size={16} />{msg}</p>{/if}
  <div><button class="btn primary" disabled={text === orig || !!problem} onclick={save}>Save</button></div>
  <details class="muted small"><summary>Examples</summary>
    <pre class="mono">0 3 * * *    /sbin/reboot          # every day at 03:00
*/10 * * * * /usr/bin/my-script    # every 10 minutes
@reboot      /usr/bin/on-boot      # at every start</pre></details>
</div>

<style>
  .form { display: grid; gap: 14px; max-width: 960px; }
  textarea.input { font-family: var(--mono, monospace); font-size: 13px; resize: vertical; height: auto; min-height: 240px; padding: 10px 12px; line-height: 1.6; }
  .bad { color: var(--bad, #dc2626); }
  .ok { display: flex; gap: 8px; align-items: center; color: var(--ok, #16a34a); }
  .form :global(.alert) { display: flex; gap: 8px; align-items: center; }
  pre { margin: 8px 0 0; white-space: pre-wrap; }
</style>
