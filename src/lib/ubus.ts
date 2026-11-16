// Minimal ubus JSON-RPC client for OpenWrt's uhttpd-mod-ubus (/ubus).
import { mockCall } from './mock';

const NULL_SESSION = '0'.repeat(32);
const KEY = 'lumen.sid';
export const MOCK = import.meta.env.VITE_MOCK === '1';

export class UbusError extends Error {
  constructor(public code: number, message: string) { super(message); }
  /** rpcd -32002: session expired or ACL denies this object */
  get denied() { return this.code === -32002; }
}

let sid: string | null = null;
try { sid = sessionStorage.getItem(KEY); } catch { /* storage unavailable */ }

type Listener = () => void;
const authLost = new Set<Listener>();
export const onAuthLost = (fn: Listener) => { authLost.add(fn); return () => authLost.delete(fn); };

export const sessionId = () => sid ?? NULL_SESSION;
export const hasSession = () => MOCK || sid !== null;

function store(v: string | null) {
  sid = v;
  try { v ? sessionStorage.setItem(KEY, v) : sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}

async function rpc(body: unknown): Promise<any> {
  const res = await fetch('/ubus', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new UbusError(-1, `HTTP ${res.status}`);
  return res.json();
}

const req = (id: number, session: string, obj: string, method: string, args: object) =>
  ({ jsonrpc: '2.0', id, method: 'call', params: [session, obj, method, args] });

function unwrap<T>(r: any): T {
  if (r.error) throw new UbusError(r.error.code, r.error.message);
  const [status, data] = r.result as [number, T];
  if (status !== 0) throw new UbusError(status, `ubus status ${status}`);
  return data;
}

export async function login(username: string, password: string): Promise<void> {
  if (MOCK) return;
  const r = await rpc(req(1, NULL_SESSION, 'session', 'login', { username, password }));
  if (r.error || r.result?.[0] !== 0) throw new UbusError(r.error?.code ?? r.result?.[0] ?? -1, 'Wrong username or password');
  store(r.result[1].ubus_rpc_session);
}

export function logout() {
  store(null);
  authLost.forEach((f) => f());
}

async function handleDenied(e: unknown) {
  if (e instanceof UbusError && e.denied && !MOCK) {
    // Distinguish "session died" from "ACL forbids this call" by probing a call every user may do.
    try { unwrap(await rpc(req(0, sid ?? NULL_SESSION, 'system', 'board', {}))); }
    catch { logout(); }
  }
}

export async function call<T = any>(obj: string, method: string, args: object = {}): Promise<T> {
  if (MOCK) return mockCall(obj, method, args) as T;
  try {
    return unwrap<T>(await rpc(req(1, sid ?? NULL_SESSION, obj, method, args)));
  } catch (e) { await handleDenied(e); throw e; }
}

/** One HTTP round trip for several calls. Failed calls yield `null` instead of failing the batch. */
export async function batch(calls: [string, string, object?][]): Promise<any[]> {
  if (MOCK) return Promise.all(calls.map(([o, m, a]) => mockCall(o, m, a ?? {}).catch(() => null)));
  const s = sid ?? NULL_SESSION;
  const rs: any[] = await rpc(calls.map(([o, m, a], i) => req(i, s, o, m, a ?? {})));
  const out = new Array(calls.length).fill(null);
  let denied = false;
  for (const r of rs) {
    try { out[r.id] = unwrap(r); } catch (e) { if (e instanceof UbusError && e.denied) denied = true; }
  }
  if (denied) await handleDenied(new UbusError(-32002, 'denied'));
  return out;
}
