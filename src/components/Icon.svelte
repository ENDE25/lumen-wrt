<script lang="ts">
  let { name, size = 20 }: { name: string; size?: number } = $props();
  const P: Record<string, string> = {
    dashboard: 'M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0zM12 12l4-4M12 7v1M7 12h1M17 12h-1',
    network: 'M6 6a2 2 0 1 0 0-.01zM18 6a2 2 0 1 0 0-.01zM12 19a2 2 0 1 0 0-.01zM7.5 7.5l3.5 9M16.5 7.5L13 16.5M8 6h8',
    devices: 'M3 7h18v6H3zM3 17h18v3H3zM7 10h.01M7 18.5h.01',
    clients: 'M3 5h18v11H3zM8 20h8M12 16v4',
    stats: 'M5 20V10M12 20V4M19 20v-7',
    wifi: 'M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01',
    logs: 'M5 4h14v16H5zM9 9h6M9 13h6M9 17h3',
    settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
    sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
    moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
    logout: 'M9 21H5V3h4M16 17l5-5-5-5M21 12H9',
    search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3',
    x: 'M6 6l12 12M18 6L6 18',
    down: 'M12 5v14M6 13l6 6 6-6',
    up: 'M12 19V5M6 11l6-6 6 6',
    phone: 'M8 2h8a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM11 18h2',
    laptop: 'M5 5h14v10H5zM2 19h20',
    desktop: 'M3 4h18v12H3zM9 20h6M12 16v4',
    tv: 'M3 6h18v12H3zM8 3l4 3 4-3',
    printer: 'M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z',
    iot: 'M7 7h10v10H7zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4',
    server: 'M3 4h18v6H3zM3 14h18v6H3zM7 7h.01M7 17h.01',
    router: 'M3 15h18v5H3zM7 17.5h.01M11 17.5h.01M8 15V9M16 15V9M5 6l3 3M19 6l-3 3',
    console: 'M7 8h10a4 4 0 0 1 4 4v2a3 3 0 0 1-5.2 2L14 15h-4l-1.8 1A3 3 0 0 1 3 14v-2a4 4 0 0 1 4-4zM8 10v4M6 12h4M16 11h.01M18 13h.01',
    camera: 'M3 8h4l2-3h6l2 3h4v11H3zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
    speaker: 'M7 3h10v18H7zM12 7h.01M12 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    unknown: 'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01',
    globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18M4.5 7.5h15M4.5 16.5h15',
    dns: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
    plus: 'M12 5v14M5 12h14',
    trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
    shield: 'M12 3l8 3v6c0 5-3.4 8.2-8 9-4.6-.8-8-4-8-9V6zM9 12l2 2 4-4',
    services: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM10 8.5l5 3.5-5 3.5z',
    apps: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
    package: 'M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
    chevron: 'M9 6l6 6-6 6',
    refresh: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5',
    power: 'M12 2v10M18.4 6.6a9 9 0 1 1-12.8 0',
    check: 'M5 13l4 4L19 7',
    alert: 'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  };
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d={P[name] ?? P.unknown} />
</svg>
