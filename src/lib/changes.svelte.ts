// Safe-apply workflow: stage ops -> `uci apply` with rollback timer -> confirm (auto or by the user).
// If the router becomes unreachable, nobody confirms and rpcd rolls everything back by itself.
import { uciAdd, uciApply, uciConfirm, uciDelete, uciRevert, uciRollback, uciSet, type UciOp } from './uci';
import { call } from './ubus';

const TIMEOUT = 30;

class Changes {
  phase = $state<'idle' | 'applying' | 'pending'>('idle');
  remaining = $state(0);
  error = $state('');
  note = $state('');
  #timer: ReturnType<typeof setInterval> | null = null;

  /**
   * @param mode 'auto' confirms as soon as the router answers again (safe for DHCP/DNS);
   *             'manual' leaves the countdown bar for the user (network / wifi / firewall).
   */
  async apply(ops: UciOp[], mode: 'auto' | 'manual' = 'auto', label = 'Changes applied'): Promise<boolean> {
    if (!ops.length) return true;
    this.error = ''; this.phase = 'applying';
    const touched = new Set(ops.map((o) => o.config));
    try {
      for (const o of ops) {
        if (o.op === 'set') await uciSet(o.config, o.section, o.values);
        else if (o.op === 'add') await uciAdd(o.config, o.type, o.values);
        else if (o.op === 'del') await uciDelete(o.config, o.section);
        else await uciDelete(o.config, o.section, o.option);
      }
      await uciApply(TIMEOUT);
    } catch (e) {
      // Never leave half-staged edits lying around.
      await Promise.all([...touched].map((c) => uciRevert(c).catch(() => {})));
      this.phase = 'idle';
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }

    if (mode === 'auto') {
      // Give services a moment to reload, then prove the router still answers before confirming.
      await new Promise((r) => setTimeout(r, 1500));
      try { await call('system', 'board'); await uciConfirm(); this.phase = 'idle'; this.note = label; return true; }
      catch { /* fall through to manual bar: rollback timer is still running */ }
    }
    this.note = label;
    this.#countdown();
    return true;
  }

  #countdown() {
    this.phase = 'pending'; this.remaining = TIMEOUT;
    this.#timer && clearInterval(this.#timer);
    this.#timer = setInterval(() => {
      if (--this.remaining <= 0) { this.#stop(); this.note = 'Time ran out: the changes were rolled back.'; }
    }, 1000);
  }
  #stop() { this.#timer && clearInterval(this.#timer); this.#timer = null; this.phase = 'idle'; }

  async confirm() {
    try { await uciConfirm(); this.#stop(); } catch (e) { this.error = e instanceof Error ? e.message : String(e); }
  }
  async rollback() {
    try { await uciRollback(); } catch { /* may already be rolled back */ }
    this.#stop(); this.note = 'Changes rolled back.';
  }
}

export const changes = new Changes();
