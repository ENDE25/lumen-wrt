<script lang="ts">
  import AdminGeneral from './admin/AdminGeneral.svelte';
  import AdminAccess from './admin/AdminAccess.svelte';
  import AdminLeds from './admin/AdminLeds.svelte';
  import DeviceInfo from './settings/DeviceInfo.svelte';
</script>

<div class="page">
  <div class="page-head"><h1>Settings</h1></div>

  <section><AdminGeneral /></section>
  <section><AdminAccess /></section>
  <section><AdminLeds /></section>
  <h2 class="sec">Device</h2>
  <DeviceInfo />
</div>

<style>
  section { margin-bottom: 16px; }
  .sec { font-size: 15px; font-weight: 600; margin: 26px 0 12px; }
</style>
