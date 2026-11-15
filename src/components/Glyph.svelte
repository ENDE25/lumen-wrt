<script lang="ts">
  // A brand logo when we know the maker, otherwise the device-category icon.
  import Icon from './Icon.svelte';
  import { LOGOS } from '../lib/logos';
  let { brand, icon, size = 18 }: { brand?: string; icon: string; size?: number } = $props();
  const path = $derived(brand ? LOGOS[brand] : undefined);
</script>
{#if path}
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={path} /></svg>
{:else}
  <Icon name={icon} {size} />
{/if}
