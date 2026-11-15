// Is there a newer OpenWrt release? The official release index is public and CORS-enabled, so the browser
// asks it directly: the router isn't involved (and may not even resolve DNS).
export interface Versions { stable: string; oldstable: string; upcoming: string; list: string[] }

export async function fetchVersions(): Promise<Versions | null> {
  try {
    const r = await fetch('https://downloads.openwrt.org/.versions.json', { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    return { stable: j.stable_version ?? '', oldstable: j.oldstable_version ?? '', upcoming: j.upcoming_version ?? '', list: j.versions_list ?? [] };
  } catch { return null; }
}

/** "25.12.6" / "25.12.0-rc2" -> comparable tuple; releases sort above their own release candidates. */
function parts(v: string): number[] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-rc(\d+))?$/.exec(v);
  return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 999 : +m[4]] : null;
}
export function cmpRelease(a: string, b: string): number {
  const x = parts(a), y = parts(b);
  if (!x || !y) return 0;
  for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

export type FirmwareStatus =
  | { kind: 'current'; latest: string }
  | { kind: 'patch'; latest: string }            // newer release in the same series (e.g. 25.12.5 -> 25.12.6)
  | { kind: 'series'; latest: string }           // a newer series exists (e.g. 24.10 -> 25.12)
  | { kind: 'ahead' }                            // snapshot / release candidate / newer than stable
  | { kind: 'unknown' };

export function firmwareStatus(current: string, v: Versions | null): FirmwareStatus {
  if (!v || !v.stable) return { kind: 'unknown' };
  if (!parts(current)) return { kind: 'ahead' };                     // SNAPSHOT or custom build
  const c = cmpRelease(current, v.stable);
  if (c === 0) return { kind: 'current', latest: v.stable };
  if (c > 0) return { kind: 'ahead' };
  const [cm, cn] = current.split('.'), [sm, sn] = v.stable.split('.');
  return cm === sm && cn === sn ? { kind: 'patch', latest: v.stable } : { kind: 'series', latest: v.stable };
}
