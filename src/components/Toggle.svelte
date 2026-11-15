<script lang="ts">
  let { checked = $bindable(false), label = '', disabled = false }: { checked?: boolean; label?: string; disabled?: boolean } = $props();
</script>
<label class="tg" class:disabled>
  <input type="checkbox" role="switch" bind:checked {disabled} />
  <span class="track"><i></i></span>
  {#if label}<span class="lbl">{label}</span>{/if}
</label>
<style>
  .tg { display: inline-flex; align-items: center; gap: 10px; cursor: pointer; user-select: none; }
  .tg.disabled { opacity: .5; cursor: not-allowed; }
  input { position: absolute; opacity: 0; width: 0; height: 0; }
  .track { width: 38px; height: 22px; border-radius: 99px; background: var(--border); position: relative; transition: background .15s; flex: none; }
  .track i { position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.25); transition: transform .15s; }
  input:checked + .track { background: var(--accent); }
  input:checked + .track i { transform: translateX(16px); }
  input:focus-visible + .track { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
