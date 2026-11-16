/** UNWIRED prototype: no production import, storage, endpoint, or credentials. */
const MODES = new Set(['basic', 'easy', 'normal', 'hard', 'hardcore', 'endless']);
const DAY = 86400000;
const OFFSET = 9 * 3600000;
const dayAt = (ms) => new Date(ms + OFFSET).toISOString().slice(0, 10);
const nextDay = (ms) => (Math.floor((ms + OFFSET) / DAY) + 1) * DAY - OFFSET;

export class ActivityCollector {
  #rows = new Map(); #attempt = null; #last = null; #busy = false;
  #generation = 0; #controller = null; #lastFlush = -Infinity;
  #state = 'off'; #epoch = null; #enabled = false;
  #lastAcknowledged = '';
  #minimumFlushMs = 60000;
  #pendingFinal = false;
  constructor({ transport, writerId, now = Date.now, enabled = false, minimumFlushMs = 60000 }) {
    if (typeof writerId !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(writerId)) throw new Error('invalid writer');
    this.transport = transport; this.writerId = writerId; this.now = now; this.#enabled = enabled;
    if(!Number.isSafeInteger(minimumFlushMs)||minimumFlushMs<60000) throw Error('invalid interval');
    this.#minimumFlushMs=minimumFlushMs;
  }
  get state() { return this.#state; }
  snapshot() {
    const allowed = new Set([dayAt(this.now()), dayAt(this.now() - DAY)]);
    for (const [key, row] of this.#rows) if (!allowed.has(row.day)) this.#rows.delete(key);
    return [...this.#rows.values()].map(r => ({ ...r }));
  }
  // Legacy opt-in adapter. A GA grant alone is never authorization for a new purpose.
  acceptConfirmedGrant(epoch) { this.activateEnrollment(epoch); }
  // Called by a separately reviewed policy adapter only after server enrollment.
  activateEnrollment(epoch) {
    if (!this.#enabled || this.#state === 'deletion-pending' || typeof epoch !== 'string' || !epoch) return;
    this.#clear(); this.#epoch = epoch; this.#state = 'granted';
  }
  #clear() {
    this.#generation++; this.#controller?.abort(); this.#rows.clear();
    this.#attempt = null; this.#last = null; this.#epoch = null; this.#lastAcknowledged=''; this.#pendingFinal=false;
  }
  #row(ms, mode) {
    const today = dayAt(this.now());
    const yesterday = dayAt(this.now() - DAY);
    for (const [key, row] of this.#rows) if (row.day !== today && row.day !== yesterday) this.#rows.delete(key);
    const day = dayAt(ms);
    if (day !== today && day !== yesterday) return null;
    const key = `${day}/${mode}`;
    if (!this.#rows.has(key)) this.#rows.set(key, {day, difficulty: mode, writer_id: this.writerId, elapsed_ms: 0, starts: 0, finishes: 0});
    return this.#rows.get(key);
  }
  start(mode) {
    if (this.#state !== 'granted' || !MODES.has(mode)) return;
    if (this.#attempt) return; // duplicate start callback is not another attempt
    const ms = this.now();
    this.#attempt = {mode,elapsed:0}; this.#last = null;
    const row = this.#row(ms, mode); if (row) row.starts=Math.min(1000,row.starts+1);
  }
  // Called at a low-frequency active-game heartbeat, not per keystroke.
  // active=false on pause/countdown/menu/hidden; first active sample establishes baseline.
  sample(active) {
    if (this.#state !== 'granted' || !this.#attempt) return;
    const ms = this.now(); const last = this.#last;
    this.#last = active ? ms : null;
    if (!active || last === null || ms <= last || ms - last > 2000) return;
    for (let from = last; from < ms;) {
      const until = Math.min(ms, nextDay(from));
      const row = this.#row(from, this.#attempt.mode);
      if (row) row.elapsed_ms = Math.min(DAY, row.elapsed_ms + until - from);
      from = until;
    }
  }
  // Reuses the game's existing cumulative active seconds, NOT a countdown or wall-clock session.
  observeElapsed(seconds) {
    if(this.#state!=='granted'||!this.#attempt||!Number.isFinite(seconds)||seconds<0)return;
    const elapsed=Math.round(seconds*1000),delta=elapsed-this.#attempt.elapsed;
    this.#attempt.elapsed=Math.max(this.#attempt.elapsed,elapsed);
    if(delta<=0||delta>2000)return;
    const now=this.now();
    for(let from=now-delta;from<now;){const until=Math.min(now,nextDay(from));const row=this.#row(from,this.#attempt.mode);if(row)row.elapsed_ms=Math.min(DAY,row.elapsed_ms+until-from);from=until;}
  }
  end(outcome) {
    if (this.#state !== 'granted' || !this.#attempt) return;
    const {mode} = this.#attempt;
    if (['clear', 'gameover'].includes(outcome) || (mode === 'basic' && outcome === 'quit')) {
      const row = this.#row(this.now(), mode); if (row) row.finishes=Math.min(1000,row.finishes+1);
    }
    this.#attempt = null; this.#last = null;
  }
  async flush({final=false}={}) {
    if(this.#state !== 'granted')return false;
    if(this.#busy){if(final)this.#pendingFinal=true;return false;}
    if(!final && this.now() - this.#lastFlush < this.#minimumFlushMs)return false;
    const rows = this.snapshot();
    if (!rows.length) return false;
    const fingerprint=JSON.stringify(rows);if(fingerprint===this.#lastAcknowledged)return false;
    this.#busy = true; this.#lastFlush = this.now();
    const generation = this.#generation;
    const controller = new AbortController(); this.#controller = controller;
    let timer;
    try {
      // <= 12 records: 2 JST days x 6 modes
      const timeout = new Promise(resolve => { timer = setTimeout(() => { controller.abort(); resolve(false); }, 3000); });
      const send = Promise.resolve().then(() => this.transport.write({ version: 'activity-v2', epoch: this.#epoch, rows }, controller.signal)).then(() => true, () => false);
      const ok = await Promise.race([send, timeout]);
      const accepted=ok && generation === this.#generation && this.#state === 'granted';
      if(accepted)this.#lastAcknowledged=fingerprint;
      return accepted;
    } catch { return false; }
    finally { clearTimeout(timer); this.#busy = false; if (this.#controller === controller) this.#controller = null; if(this.#pendingFinal){this.#pendingFinal=false;void this.flush({final:true});} }
  }
  async revoke() {
    // Local collection stops synchronously even if the deletion network call fails.
    this.#clear(); this.#state = 'deletion-pending';
    let timer;
    try { await Promise.race([this.transport.revoke(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),3000)})]); this.#state = 'denied'; return true; }
    catch { return false; } finally {clearTimeout(timer);}
  }
}
