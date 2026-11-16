<script lang="ts">
  import AdminGeneral from './admin/AdminGeneral.svelte';
  import AdminPassword from './admin/AdminPassword.svelte';
  import AdminSsh from './admin/AdminSsh.svelte';
  import AdminLeds from './admin/AdminLeds.svelte';
  import DeviceInfo from './settings/DeviceInfo.svelte';
</script>

<div class="page">
  <div class="page-head"><h1>Settings</h1></div>

  <!-- Two columns of stacked cards, so heights even out and nothing leaves gaps. -->
  <div class="cols">
    <div class="col"><AdminGeneral /><AdminPassword /></div>
    <div class="col"><AdminSsh /><AdminLeds /></div>
  </div>

  <h2 class="sec">Device</h2>
  <DeviceInfo />
</div>

<style>
  .cols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: start; }
  .col { display: grid; gap: 16px; min-width: 0; align-content: start; }
  .sec { font-size: 15px; font-weight: 600; margin: 26px 0 12px; }
  @media (max-width: 960px) { .cols { grid-template-columns: 1fr; } }
</style>
