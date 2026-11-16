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

/** Upload a file to a fixed path in /tmp (via cgi-io). Returns the sha256 the router computed, if it reports one. */
function upload(path: string, file: Blob, onProgress?: (frac: number) => void): Promise<string> {
  if (MOCK) return Promise.resolve('mock-sha256');
  return new Promise((resolve, reject) => {
    const body = new FormData();
    body.append('sessionid', sessionId());
    body.append('filename', path);
    body.append('filedata', file);
    const x = new XMLHttpRequest();
    x.open('POST', '/cgi-bin/cgi-upload');
    x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    x.onerror = () => reject(new Error('Upload failed (network error).'));
    x.onload = () => {
      if (x.status !== 200) return reject(new Error(`Upload failed (HTTP ${x.status}).`));
      try { const r = JSON.parse(x.responseText); resolve(String(r.sha256sum ?? '')); } catch { resolve(''); }
    };
    x.send(body);
  });
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
export async function stageFirmware(file: Blob, expectedSha256?: string, onProgress?: (frac: number) => void): Promise<FirmwareCheck> {
  const sha256 = await upload(FIRMWARE_PATH, file, onProgress);
  if (expectedSha256 && !MOCK && sha256 && sha256 !== expectedSha256) throw new Error('The image arrived damaged (checksum mismatch). Nothing was flashed. Try again.');
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

/** Download a file in the browser with progress (the router needs no internet access of its own). */
export async function downloadBlob(url: string, onProgress: (frac: number) => void): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Download failed (HTTP ${res.status}).`);
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body.getReader(), parts: BlobPart[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value); got += value.length;
    if (total) onProgress(got / total);
  }
  return new Blob(parts);
}
