import type { SupabaseClient } from '@supabase/supabase-js';
import { RECORD_CHANGE, recordOwner, scopedKey } from './record-scope';

export const PLAY_STAGES = ['basic', 'easy', 'normal', 'hard', 'hardcore', 'endless'] as const;
export type PlayStage = typeof PLAY_STAGES[number];
export interface PlayCounter { counter_id: string; difficulty: PlayStage; elapsed_ms: number }
export const PLAY_TIME_PREFIX = 'zombie-typing:play-time:';
export const PLAY_TIME_MAX = 3_155_760_000_000; // 1つの端末セッションにつき100年まで
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const PLAY_TIME_CHANGE = 'zombie-play-time-change';

export function playTimeKey(counter: PlayCounter): string { return `${PLAY_TIME_PREFIX}${counter.counter_id}:${counter.difficulty}`; }
export function parsePlayTimeEntry(key: string, raw: string): PlayCounter {
  const suffix = key.slice(PLAY_TIME_PREFIX.length);
  const split = suffix.lastIndexOf(':');
  const counter_id = suffix.slice(0, split), difficulty = suffix.slice(split + 1) as PlayStage;
  const elapsed_ms = Number(raw);
  if (!key.startsWith(PLAY_TIME_PREFIX) || !UUID.test(counter_id) || !PLAY_STAGES.includes(difficulty)
      || raw.trim() === '' || !Number.isSafeInteger(elapsed_ms) || elapsed_ms < 0 || elapsed_ms > PLAY_TIME_MAX) {
    throw new Error('プレイ時間の形式が違います。');
  }
  return { counter_id: counter_id.toLowerCase(), difficulty, elapsed_ms };
}
export function validatePlayCounters(value: unknown): PlayCounter[] {
  if (!Array.isArray(value) || value.length > 20000) throw new Error('プレイ時間の形式が違います。');
  return value.map(c => {
    if (!c || typeof c !== 'object' || typeof c.counter_id !== 'string' || typeof c.difficulty !== 'string' || typeof c.elapsed_ms !== 'number') throw new Error('プレイ時間の形式が違います。');
    return parsePlayTimeEntry(playTimeKey(c), String(c.elapsed_ms));
  });
}
export function readPlayCounters(owner = recordOwner()): PlayCounter[] {
  const prefix = scopedKey(PLAY_TIME_PREFIX, owner);
  const counters = new Map<string, PlayCounter>();
  let keys: string[];
  try { keys = Object.keys(localStorage); } catch { return []; }
  for (const key of keys) {
    if (!key.startsWith(prefix)) continue;
    try {
      const counter = parsePlayTimeEntry(PLAY_TIME_PREFIX + key.slice(prefix.length), localStorage.getItem(key)!);
      const id = playTimeKey(counter);
      if (!counters.has(id) || counters.get(id)!.elapsed_ms < counter.elapsed_ms) counters.set(id, counter);
    } catch { /* 壊れたキャッシュは計上しない */ }
  }
  return [...counters.values()];
}
export function mergePlayCounters(owner: string | null, counters: PlayCounter[]): void {
  for (const counter of validatePlayCounters(counters)) {
    const key = scopedKey(playTimeKey(counter), owner);
    const old = Number(localStorage.getItem(key) ?? 0);
    const next = Math.max(Number.isSafeInteger(old) && old >= 0 && old <= PLAY_TIME_MAX ? old : 0, counter.elapsed_ms);
    if (next !== old) localStorage.setItem(key, String(next));
  }
  window.dispatchEvent(new Event(PLAY_TIME_CHANGE));
}
export function playTimeTotals(owner = recordOwner()): Record<PlayStage, number> {
  const totals = Object.fromEntries(PLAY_STAGES.map(s => [s, 0])) as Record<PlayStage, number>;
  for (const c of readPlayCounters(owner)) totals[c.difficulty] += c.elapsed_ms;
  return totals;
}
export function formatPlayTime(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds / 60) % 60, s = seconds % 60;
  return h ? `${h}時間${String(m).padStart(2, '0')}分${String(s).padStart(2, '0')}秒` : `${m}分${String(s).padStart(2, '0')}秒`;
}

// ページと保存先ごとに独立した加算カウンター。再送はmax、別端末・別タブは合計する。
let writerOwner: string | null | undefined;
let writerId = '';
export class PlayTimeRun {
  private readonly owner: string | null;
  private readonly counter: PlayCounter;
  private elapsed = 0;
  private saved = 0;
  constructor(difficulty: PlayStage, owner = recordOwner()) {
    this.owner = owner;
    if (!writerId || writerOwner !== owner) { writerId = crypto.randomUUID(); writerOwner = owner; }
    const key = scopedKey(`${PLAY_TIME_PREFIX}${writerId}:${difficulty}`, owner);
    let baseline = 0;
    try { baseline = Number(localStorage.getItem(key) ?? 0); } catch { /* 保存不可でも練習は続けられる */ }
    this.counter = { counter_id: writerId, difficulty, elapsed_ms: Number.isSafeInteger(baseline) && baseline >= 0 && baseline <= PLAY_TIME_MAX ? baseline : 0 };
  }
  /** 実際にゲームが進んだ累積秒数を渡す。一時停止・カウントダウンでは呼ばない。 */
  observe(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds < 0) return;
    const ms = Math.round(seconds * 1000);
    const delta = Math.max(0, ms - this.elapsed);
    this.elapsed = Math.max(this.elapsed, ms);
    this.counter.elapsed_ms = Math.min(PLAY_TIME_MAX, this.counter.elapsed_ms + delta);
    if (this.elapsed - this.saved >= 5000) this.flush();
  }
  flush(): void {
    if (this.elapsed <= this.saved) return;
    try {
      mergePlayCounters(this.owner, [this.counter]);
      this.saved = this.elapsed;
      window.dispatchEvent(new CustomEvent(RECORD_CHANGE, { detail: { owner: this.owner, key: playTimeKey(this.counter), value: String(this.counter.elapsed_ms) } }));
    } catch { /* 容量不足でもプレイを止めず、次の保存で再試行する */ }
  }
}

export async function syncPlayTime(client: SupabaseClient, owner: string, isCurrent: () => boolean): Promise<void> {
  const counters = readPlayCounters(owner);
  // 一度に送る件数を制限。最後の応答で、別端末で追加した時間も取り込む。
  for (let start = 0; start < Math.max(1, counters.length); start += 500) {
    if (!isCurrent()) return;
    const read = start + 500 >= counters.length;
    const { data, error } = await client.rpc('sync_player_play_time', { p_expected_user: owner, p_counters: counters.slice(start, start + 500), p_read: read }).abortSignal(AbortSignal.timeout(12000));
    if (error) throw error;
    if (!isCurrent()) return;
    if (read) mergePlayCounters(owner, validatePlayCounters(data?.counters));
  }
}
