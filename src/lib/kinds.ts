import type { ClientKind } from './types';

/** Device types a user can pick by hand. */
export const KINDS: ClientKind[] = ['phone', 'laptop', 'desktop', 'tv', 'printer', 'iot', 'server', 'router', 'console', 'camera', 'speaker'];

export const KIND_LABEL: Record<ClientKind, string> = {
  phone: 'Phone', laptop: 'Laptop', desktop: 'Desktop', tv: 'TV', printer: 'Printer', iot: 'IoT device', server: 'Server',
  router: 'Network device', console: 'Game console', camera: 'Camera', speaker: 'Speaker', unknown: 'Unknown',
};

export const isKind = (v: unknown): v is ClientKind => typeof v === 'string' && (KINDS as string[]).includes(v);
