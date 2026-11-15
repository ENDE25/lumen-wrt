<script lang="ts">
  let { dbm }: { dbm?: number } = $props();
  const lvl = $derived(dbm === undefined ? 0 : dbm >= -55 ? 4 : dbm >= -65 ? 3 : dbm >= -75 ? 2 : 1);
  const tone = $derived(lvl >= 3 ? 'var(--ok)' : lvl === 2 ? 'var(--warn)' : 'var(--bad)');
</script>
<svg width="16" height="14" viewBox="0 0 16 14" role="img" aria-label={dbm === undefined ? 'unknown signal' : `${dbm} dBm`}>
  {#each [0, 1, 2, 3] as i}
    <rect x={i * 4} y={11 - i * 3.4} width="3" height={3 + i * 3.4} rx="1" fill={i < lvl ? tone : 'var(--border)'} />
  {/each}
</svg>
