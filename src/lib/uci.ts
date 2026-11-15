// Thin typed wrapper over rpcd's `uci` object. Values are strings, or string[] for UCI lists.
import { call } from './ubus';

export type UciValue = string | string[];
export interface UciSection { '.name': string; '.type': string; '.anonymous'?: boolean; [opt: string]: UciValue | boolean | undefined }
export type UciConfig = Record<string, UciSection>;

export async function uciGet(config: string): Promise<UciConfig> {
  const r = await call<{ values: UciConfig }>('uci', 'get', { config });
  return r.values ?? {};
}

export const uciSet = (config: string, section: string, values: Record<string, UciValue>) =>
  call('uci', 'set', { config, section, values });

export const uciAdd = (config: string, type: string, values: Record<string, UciValue>, name?: string) =>
  call<{ section: string }>('uci', 'add', { config, type, values, ...(name ? { name } : {}) });

export const uciDelete = (config: string, section: string, option?: string) =>
  call('uci', 'delete', { config, section, ...(option ? { option } : {}) });

export const uciOrder = (config: string, sections: string[]) => call('uci', 'order', { config, sections });
export const uciRevert = (config: string) => call('uci', 'revert', { config });
export const uciApply = (timeout: number) => call('uci', 'apply', { rollback: true, timeout });
export const uciConfirm = () => call('uci', 'confirm');
export const uciRollback = () => call('uci', 'rollback');

export type UciOp =
  | { op: 'set'; config: string; section: string; values: Record<string, UciValue> }
  | { op: 'del-option'; config: string; section: string; option: string }
  | { op: 'add'; config: string; type: string; values: Record<string, UciValue> }
  | { op: 'del'; config: string; section: string }
  | { op: 'order'; config: string; sections: string[] };

export const asList = (v: UciValue | boolean | undefined): string[] => (Array.isArray(v) ? v : v ? [String(v)] : []);
export const str = (v: UciValue | boolean | undefined): string => (Array.isArray(v) ? v.join(' ') : v === undefined ? '' : String(v));

/** Build the minimal ops to turn `orig` into `next` for the keys we manage; unknown options are left untouched. */
export function sectionOps(config: string, section: string, orig: UciSection | null, next: Record<string, UciValue | undefined>, type?: string): UciOp[] {
  const empty = (v: UciValue | undefined) => v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
  if (!orig) {
    const values: Record<string, UciValue> = {};
    for (const [k, v] of Object.entries(next)) if (!empty(v)) values[k] = v!;
    return [{ op: 'add', config, type: type!, values }];
  }
  const out: UciOp[] = [], set: Record<string, UciValue> = {};
  for (const [k, v] of Object.entries(next)) {
    const o = orig[k] as UciValue | undefined;
    if (empty(v)) { if (!empty(o)) out.push({ op: 'del-option', config, section, option: k }); }
    else if (JSON.stringify(Array.isArray(v) ? v : String(v)) !== JSON.stringify(Array.isArray(o) ? o : o === undefined ? undefined : String(o))) set[k] = v!;
  }
  if (Object.keys(set).length) out.unshift({ op: 'set', config, section, values: set });
  return out;
}
