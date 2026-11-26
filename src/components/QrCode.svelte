<script lang="ts">
  import { qrMatrix } from '../lib/qr';
  let { text, size = 220, label = 'QR code' }: { text: string; size?: number; label?: string } = $props();
  const m = $derived(qrMatrix(text));
  const N = $derived(m.length + 8);                                 // 4 modules of quiet zone on each side
  const path = $derived(m.flatMap((row, y) => row.map((d, x) => (d ? `M${x + 4} ${y + 4}h1v1h-1z` : ''))).join(''));
</script>

<!-- Always dark on white, whatever the theme: scanners need the contrast. -->
<svg width={size} height={size} viewBox="0 0 {N} {N}" role="img" aria-label={label} shape-rendering="crispEdges">
  <rect width={N} height={N} fill="#fff" />
  <path d={path} fill="#000" />
</svg>
