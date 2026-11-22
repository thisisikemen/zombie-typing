import {
  CORRECTABLE_DIFFICULTIES, type BestAnchor, type CorrectableDifficulty, type CorrectionBackend,
  type CorrectionChange, type CorrectionSnapshot, type RecentRankedRun,
} from './record-correction';

const WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_RECENT_RUNS = 10_000;
export const PERSONAL_RECORDS_DB = 'zombie-typing:personal-records-v1';
const STORE = 'personal';
const KEY = 'ranked-history';
const opaqueId = () => crypto.randomUUID();
const isEpoch = (n: unknown): n is number => Number.isSafeInteger(n) && Number(n) >= 0 && Number(n) <= 8_640_000_000_000_000;
const isValue = (n: unknown): n is number => isEpoch(n) && n > 0;
export function isPersonalDifficulty(s: unknown): s is CorrectableDifficulty {
  return CORRECTABLE_DIFFICULTIES.some(difficulty => difficulty === s);
}
type Entry = Omit<RecentRankedRun,'excluded'>;
export type PersonalState = {
  token: string;
  revision: number;
  clock: number;
  runs: RecentRankedRun[];
  anchors: BestAnchor[];
};
type Mutator<T> = (stored: unknown) => { state: PersonalState; value: T };
interface PersonalTransactions {
  update<T>(mutate: Mutator<T>): Promise<T>;
}
const object = (o: unknown): o is Record<string, unknown> => Boolean(o && typeof o === 'object' && !Array.isArray(o));
function entry(o: unknown): o is Entry {
  return object(o) && typeof o.id === 'string' && o.id.length > 0 && isPersonalDifficulty(o.difficulty) &&
    isEpoch(o.playedAt) && isValue(o.value);
}
function anchor(o: unknown): o is BestAnchor {
  return object(o) && isPersonalDifficulty(o.difficulty) && isEpoch(o.playedAt) && isValue(o.value);
}

function decoded(raw: unknown, now: number): PersonalState {
  if (raw === undefined) return { token: opaqueId(), revision: 0, clock: now, runs: [], anchors: [] };
  if (!object(raw) || typeof raw.token !== 'string' || !raw.token ||
    !isEpoch(raw.revision) || !isEpoch(raw.clock) || !Array.isArray(raw.runs) || !Array.isArray(raw.anchors) ||
    raw.runs.length > MAX_RECENT_RUNS || raw.anchors.length > CORRECTABLE_DIFFICULTIES.length) {
    throw Error('Personal records unavailable');
  }
  const runIds = new Set<string>();
  const stages = new Set<CorrectableDifficulty>();
  const runs = raw.runs.map(r => {
    if (!entry(r) || !('excluded' in r) || typeof r.excluded !== 'boolean' || runIds.has(r.id)) throw Error('Invalid personal run');
    runIds.add(r.id);
    return { id:r.id, difficulty:r.difficulty, playedAt:r.playedAt, value:r.value, excluded:r.excluded };
  });
  const anchors = raw.anchors.map(a => {
    if (!anchor(a) || stages.has(a.difficulty)) throw Error('Invalid personal best reference');
    stages.add(a.difficulty);
    return { difficulty:a.difficulty, playedAt:a.playedAt, value:a.value };
  });
  return { token:raw.token, revision:raw.revision, clock:raw.clock, runs, anchors };
}

function prune(state: PersonalState, now: number): boolean {
  let pruned = false;
  state.runs = state.runs.filter(run => {
    if (run.playedAt > now-WINDOW_MS) return true;
    pruned = true;
    if (!run.excluded) {
      const anchorIndex = state.anchors.findIndex(item => item.difficulty === run.difficulty);
      const best = state.anchors[anchorIndex];
      if (!best || run.value > best.value || (run.value === best.value && run.playedAt < best.playedAt)) {
        const best = { difficulty:run.difficulty, value:run.value, playedAt:run.playedAt };
        if (anchorIndex < 0) state.anchors.push(best); else state.anchors[anchorIndex] = best;
      }
    }
    return false;
  });
  return pruned;
}
const revisionOf = (state: PersonalState) => state.token + ':' + state.revision;

export function personalBest(snapshot: CorrectionSnapshot, difficulty: CorrectableDifficulty): number | undefined {
  let best = snapshot.anchors.find(item => item.difficulty === difficulty)?.value;
  for (const run of snapshot.runs) {
    if (run.difficulty === difficulty && !run.excluded && (best === undefined || run.value > best)) best = run.value;
  }
  return best;
}

/** No account dependency, imports, sync, telemetry or requests. */
export function personalRecords(
  storage: PersonalTransactions = indexedPersonalTransactions(),
  clock: () => number = Date.now,
): CorrectionBackend & { append(run: Entry): Promise<CorrectionSnapshot> } {
  function update(edit: (state:PersonalState, now:number) => boolean = () => false) {
    return storage.update(raw => {
      const sampled = clock();
      if (!isEpoch(sampled)) throw Error('Invalid local time');
      const state = decoded(raw,sampled);
      const now = Math.max(state.clock,sampled);
      const expired = prune(state,now);
      if (expired) state.revision++;
      if (edit(state,now)) state.revision++;
      state.clock = now;
      if (!isEpoch(state.revision)) throw Error('Invalid personal revision');
      return {state, value:{revision:revisionOf(state),serverNow:now,anchors:state.anchors,runs:state.runs}};
    });
  }
  return {
    load: () => update(),
    append: run => update((state,now) => {
      if (!entry(run) || run.playedAt <= now-WINDOW_MS || run.playedAt > now) throw Error('Invalid or expired personal run');
      const existing = state.runs.find(previous=>previous.id===run.id);
      if (existing) {
        if (existing.difficulty!==run.difficulty || existing.value!==run.value || existing.playedAt!==run.playedAt) {
          throw Error('Personal run identifier reused');
        }
        return false;
      }
      if (state.runs.length >= MAX_RECENT_RUNS) throw Error('Personal record window full');
      const {id,difficulty,value,playedAt} = run;
      state.runs.push({id,difficulty,value,playedAt,excluded:false});
      return true;
    }),
    apply: (revision:string, changes: readonly CorrectionChange[]) => update(state => {
      if (revision!==revisionOf(state) || changes.length===0 || changes.length>MAX_RECENT_RUNS) {
        throw Error('Personal records changed');
      }
      const chosen = new Map<string,boolean>();
      const existing = new Map(state.runs.map(run=>[run.id,run]));
      for (const change of changes) {
        const run = existing.get(change.runId);
        if (!run || chosen.has(change.runId) || typeof change.excluded!=='boolean' || run.excluded===change.excluded) {
          throw Error('Personal record unavailable');
        }
        chosen.set(change.runId,change.excluded);
      }
      for (const [id,excluded] of chosen) existing.get(id)!.excluded = excluded;
      return true;
    }),
  };
}

/** One IndexedDB readwrite transaction serializes reads, expiry, appends and edits across tabs. */
function indexedPersonalTransactions(): PersonalTransactions {
  let cached: Promise<IDBDatabase> | undefined;
  function open(): Promise<IDBDatabase> {
    if (cached) return cached;
    const opening = new Promise<IDBDatabase>((resolve,reject) => {
      const request = globalThis.indexedDB.open(PERSONAL_RECORDS_DB,1);
      let cancelled = false;
      const cancel = () => { cancelled = true; reject(Error('Personal storage unavailable')); };
      const timer = setTimeout(cancel, 2500);
      request.onupgradeneeded = () => {
        if (cancelled) { request.transaction?.abort(); return; }
        request.result.createObjectStore(STORE);
      };
      request.onblocked = () => { clearTimeout(timer); cancel(); };
      request.onerror = () => { clearTimeout(timer); cancel(); };
      request.onsuccess = () => {
        clearTimeout(timer);
        const db = request.result;
        if (cancelled) { db.close(); return; }
        db.onversionchange = () => { db.close(); if(cached===opening) cached=undefined; };
        db.onclose = () => { if(cached===opening) cached=undefined; };
        resolve(db);
      };
    });
    cached = opening;
    void opening.catch(() => { if(cached===opening) cached=undefined; });
    return opening;
  }
  return {
    async update<T>(mutate:Mutator<T>): Promise<T> {
      const db = await open();
      return new Promise<T>((resolve,reject) => {
        const tx = db.transaction(STORE,'readwrite');
        const records = tx.objectStore(STORE);
        let output: T;
        let error: unknown;
        const fail = (cause:unknown) => {
          error = cause;
          try { tx.abort(); } catch { reject(cause); }
        };
        const timer = setTimeout(()=>fail(Error('Personal storage timed out')),3500);
        tx.onabort = () => { clearTimeout(timer); reject(error ?? tx.error ?? Error('Personal storage interrupted')); };
        tx.oncomplete = () => { clearTimeout(timer); resolve(output); };
        const request = records.get(KEY);
        request.onsuccess = () => {
          try {
            const next = mutate(request.result);
            output = next.value;
            records.put(next.state,KEY);
          } catch (cause) { fail(cause); }
        };
      });
    },
  };
}
