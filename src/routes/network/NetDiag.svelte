<script lang="ts">
  import Icon from '../../components/Icon.svelte';
  import { call, UbusError } from '../../lib/ubus';

  type Tool = 'ping' | 'traceroute' | 'nslookup';
  const TOOLS: Record<Tool, { label: string; cmds: string[]; args: (h: string) => string[]; hint: string }> = {
    ping: { label: 'Ping', cmds: ['/bin/ping', '/usr/bin/ping'], args: (h) => ['-c', '4', '-W', '2', h], hint: 'Is this address reachable, and how fast?' },
    traceroute: { label: 'Traceroute', cmds: ['/bin/traceroute', '/usr/bin/traceroute'], args: (h) => ['-m', '15', '-w', '2', '-q', '1', h], hint: 'Which hops does traffic take to get there?' },
    nslookup: { label: 'DNS lookup', cmds: ['/usr/bin/nslookup', '/bin/nslookup'], args: (h) => [h], hint: 'What address does this name resolve to?' },
  };
  let tool = $state<Tool>('ping'), host = $state(''), out = $state(''), busy = $state(false), ran = $state<Tool | null>(null);

  // Hostnames and IPs only. A leading "-" would be read as an option by the tool.
  const bad = $derived(host !== '' && !/^[A-Za-z0-9][A-Za-z0-9.:_-]{0,252}$/.test(host));
  async function run() {
    if (!host || bad || busy) return;
    busy = true; out = ''; ran = tool;
    try {
      const t = TOOLS[tool];
      // The binary lives in /bin on some builds and /usr/bin on others: try each, a "not found" just moves on.
      let r: { code?: number; stdout?: string; stderr?: string } | null = null;
      for (const cmd of t.cmds) {
        try { r = await call('file', 'exec', { command: cmd, params: t.args(host) }); break; }
        catch (e) { if (!(e instanceof UbusError && e.code === 4)) throw e; }
      }
      if (!r) { out = `${t.label} is not installed on this router. You can add it from the Software page.`; busy = false; return; }
      out = ((r.stdout ?? '') + (r.stderr ?? '')).trim() || (r.code ? `The command ended with code ${r.code} and no output.` : 'No output.');
    } catch (e) { out = 'Could not run the tool: ' + (e instanceof Error ? e.message : String(e)); }
    busy = false;
  }
</script>

<div class="card form">
  <div class="card-title"><h2>Network diagnostics</h2></div>
  <div class="seg" role="tablist" style="justify-self:start">
    {#each Object.entries(TOOLS) as [id, t]}<button role="tab" aria-selected={tool === id} class:on={tool === id} onclick={() => (tool = id as Tool)}>{t.label}</button>{/each}
  </div>
  <p class="muted small">{TOOLS[tool].hint} It runs on the router itself.</p>
  <form class="row" onsubmit={(e) => { e.preventDefault(); run(); }}>
    <input class="input" placeholder="example.com or 8.8.8.8" bind:value={host} aria-label="Host" aria-invalid={bad} />
    <button class="btn primary" disabled={!host || bad || busy}><Icon name={busy ? 'refresh' : 'check'} size={15} />{busy ? 'Running…' : 'Run'}</button>
  </form>
  {#if bad}<small class="bad">Enter a host name or IP address (letters, digits, dots, colons and hyphens).</small>{/if}
  {#if out || busy}<pre class="out mono">{busy ? `Running ${TOOLS[ran ?? tool].label.toLowerCase()}…` : out}</pre>{/if}
</div>

<style>
  .form { display: grid; gap: 14px; max-width: 820px; }
  .row { display: flex; gap: 10px; } .row .input { flex: 1; max-width: 420px; }
  .bad { color: var(--bad, #dc2626); }
  .out { margin: 0; padding: 14px 16px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px; font-size: 12.5px; line-height: 1.55; white-space: pre-wrap; overflow-x: auto; max-height: 420px; overflow-y: auto; }
</style>
