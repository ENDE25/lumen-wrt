// Backup, restore, firmware flashing and factory reset. These use the same router endpoints and exact commands as LuCI
// (cgi-io backup/upload plus whitelisted `sysupgrade` calls), so the standard LuCI ACLs already cover them.
import { call, sessionId, MOCK } from './ubus';

export const BACKUP_PATH = '/tmp/backup.tar.gz';
export const FIRMWARE_PATH = '/tmp/firmware.bin';

interface ExecResult { code?: number; stdout?: string; stderr?: string }
const exec = (command: string, params: string[] = []) => call<ExecResult>('file', 'exec', { command, params });

function save(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

export async function downloadBackup(hostname: string): Promise<void> {
  const stamp = new Date().toISOString().slice(0, 10);
  const name = `backup-${hostname || 'openwrt'}-${stamp}.tar.gz`;
  if (MOCK) return save(new Blob(['mock backup']), name);
  // cgi-backup only accepts a urlencoded form (not multipart)
  const res = await fetch('/cgi-bin/cgi-backup', { method: 'POST', body: new URLSearchParams({ sessionid: sessionId() }) });
  if (!res.ok) throw new Error(`The router refused to create the backup (HTTP ${res.status}).`);
  save(await res.blob(), name);
}

/** Upload a file to a fixed path in /tmp (via cgi-io). Returns the checksum the router reports, if any. */
async function upload(path: string, file: File): Promise<string> {
  if (MOCK) return 'mock-sha256';
  const body = new FormData();
  body.append('sessionid', sessionId());
  body.append('filename', path);
  body.append('filedata', file);
  const res = await fetch('/cgi-bin/cgi-upload', { method: 'POST', body });
  if (!res.ok) throw new Error(`Upload failed (HTTP ${res.status}).`);
  const r = await res.json().catch(() => ({}));
  return String(r.sha256sum ?? r.checksum ?? '');
}

/** Upload a backup and list what it contains; throws if it is not a valid archive. */
export async function stageBackup(file: File): Promise<string[]> {
  await upload(BACKUP_PATH, file);
  const r = await exec('/bin/tar', ['-tzf', BACKUP_PATH]);
  if (r.code !== 0) throw new Error('This file is not a valid OpenWrt backup (.tar.gz).');
  return (r.stdout ?? '').split('\n').filter(Boolean);
}

export async function restoreBackup(): Promise<void> {
  const r = await exec('/sbin/sysupgrade', ['--restore-backup', BACKUP_PATH]);
  if (r.code !== 0) throw new Error(r.stderr || 'The router could not restore this backup.');
  await exec('/sbin/reboot').catch(() => {});
}

export interface FirmwareCheck { valid: boolean; allowBackup: boolean; sha256: string; size: number }
export async function stageFirmware(file: File): Promise<FirmwareCheck> {
  const sha256 = await upload(FIRMWARE_PATH, file);
  const v = await call<{ valid?: boolean; allow_backup?: boolean }>('system', 'validate_firmware_image', { path: FIRMWARE_PATH });
  return { valid: !!v.valid, allowBackup: v.allow_backup !== false, sha256, size: file.size };
}

/** Starts the flash. The router reboots and the connection drops, so a network error here is normal. */
export async function flashFirmware(keepSettings: boolean): Promise<void> {
  try { await exec('/sbin/sysupgrade', keepSettings ? [FIRMWARE_PATH] : ['-n', FIRMWARE_PATH]); } catch { /* connection drops */ }
}

export async function factoryReset(): Promise<void> {
  const r = await exec('/sbin/firstboot', ['-r', '-y']);
  if (r.code !== 0) throw new Error(r.stderr || 'Factory reset failed.');
  await exec('/sbin/reboot').catch(() => {});
}

/** Resolves once the router has gone away and come back (or after `maxMs`). */
export async function waitForReboot(maxMs = 600000): Promise<boolean> {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const up = () => fetch('/', { cache: 'no-store', signal: AbortSignal.timeout(2500) }).then((r) => r.ok, () => false);
  const t0 = Date.now();
  let wentDown = false;
  while (Date.now() - t0 < maxMs) {
    await sleep(2500);
    const ok = await up();
    if (!ok) wentDown = true;
    else if (wentDown || Date.now() - t0 > 90000) return true;
  }
  return false;
}
