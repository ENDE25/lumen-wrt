<script lang="ts">
  let { value, label = '', detail = '' }: { value: number; label?: string; detail?: string } = $props();
  const tone = $derived(value > 90 ? 'bad' : value > 75 ? 'warn' : 'ok');
</script>
<div class="meter">
  <div class="row"><span>{label}</span><span class="num muted">{detail}</span></div>
  <div class="bar" role="meter" aria-valuenow={value} aria-valuemin="0" aria-valuemax="100" aria-label={label}>
    <i class={tone} style:width="{Math.min(100, value)}%"></i>
  </div>
</div>
<style>
  .meter { padding: 7px 0; }
  .row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px; }
  .bar { height: 6px; background: var(--surface-2); border-radius: 99px; overflow: hidden; }
  i { display: block; height: 100%; border-radius: 99px; transition: width .4s; }
  .ok { background: var(--accent); } .warn { background: var(--warn); } .bad { background: var(--bad); }
</style>
