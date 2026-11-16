// Administration helpers: files, passwords, startup scripts. Same ubus calls (and ACLs) as LuCI's System section.
import { call } from './ubus';

export async function readFile(path: string): Promise<string> {
  try { return (await call<{ data?: string }>('file', 'read', { path })).data ?? ''; } catch { return ''; }   // missing file = empty
}
export const writeFile = (path: string, data: string, mode = 0o600) => call('file', 'write', { path, data, mode });

export const setPassword = (password: string) => call('luci', 'setPassword', { username: 'root', password });

export interface Timezone { name: string; tz: string }
export async function getTimezones(): Promise<Timezone[]> {
  const r = await call<Record<string, { tzstring: string }>>('luci', 'getTimezones');
  return Object.entries(r ?? {}).map(([name, v]) => ({ name, tz: v.tzstring })).sort((a, b) => a.name.localeCompare(b.name));
}

export interface InitScript { name: string; enabled: boolean; running: boolean; order: number }
export async function getInitScripts(): Promise<InitScript[]> {
  const r = await call<Record<string, { start?: number; enabled?: boolean; running?: boolean }>>('rc', 'list');
  return Object.entries(r ?? {}).map(([name, v]) => ({ name, enabled: !!v.enabled, running: !!v.running, order: v.start ?? 0 }))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}
export type InitAction = 'start' | 'stop' | 'restart' | 'enable' | 'disable';
export const initAction = (name: string, action: InitAction) => call('rc', 'init', { name, action });
/** Stopping or disabling these can make the router unreachable. */
export const ESSENTIAL = new Set(['network', 'uhttpd', 'rpcd', 'dropbear', 'firewall', 'boot', 'sysinit', 'done', 'system', 'log']);

export interface SshKey { line: string; type: string; comment: string; fingerprintHint: string }
export function parseKeys(text: string): SshKey[] {
  return text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((line) => {
    const f = line.split(/\s+/);
    const i = f.findIndex((x) => /^(ssh-|ecdsa-|sk-)/.test(x));
    const type = f[i] ?? '?', blob = f[i + 1] ?? '';
    return { line, type, comment: f.slice(i + 2).join(' ') || '(no comment)', fingerprintHint: blob.slice(-12) };
  });
}
export const validKey = (l: string) => /^(?:\S+\s+)?(ssh-(?:rsa|ed25519|dss)|ecdsa-sha2-nistp\d+|sk-\S+)\s+[A-Za-z0-9+/=]{20,}(?:\s+.*)?$/.test(l.trim());

/** First problem in a crontab, or ''. Lines are `m h dom mon dow command`, `@reboot command`, or comments. */
export function cronProblem(text: string): string {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l || l.startsWith('#') || /^[A-Z_]+=/.test(l)) continue;
    const f = l.split(/\s+/);
    if (/^@(reboot|hourly|daily|weekly|monthly|yearly|annually|midnight)$/.test(f[0])) { if (f.length < 2) return `Line ${i + 1}: missing command`; continue; }
    if (f.length < 6) return `Line ${i + 1}: expected 5 time fields and a command`;
    if (!f.slice(0, 5).every((x) => /^[\d*/,\-A-Za-z]+$/.test(x))) return `Line ${i + 1}: the time fields look wrong`;
  }
  return '';
}
