// Panels Lumen draws itself for some add-on apps, keyed by the app id from lumen.apps
// (the last part of its LuCI menu path). Apps not listed here show their LuCI pages instead.
// To add one: write src/apps/<Name>.svelte (no props) and register it below.
import type { Component } from 'svelte';
import Wol from './Wol.svelte';

export const PANELS: Record<string, Component> = {
  wol: Wol,
};
