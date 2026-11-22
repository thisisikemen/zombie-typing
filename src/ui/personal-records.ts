import { personalBest, personalRecords } from '../core/personal-records';
import type { CorrectionSnapshot, CorrectableDifficulty } from '../core/record-correction';
import { mountRecordCorrection } from './record-correction';

export function initPersonalRecords() {
  const storage = personalRecords();
  const host = document.createElement('section');
  host.id = 'personal-best-result';
  host.className = 'personal-best-result';
  host.setAttribute('aria-label','このブラウザの自己ベスト');
  host.hidden = true;
  const status = document.createElement('strong');
  status.setAttribute('role','status');
  host.append(status);
  document.getElementById('result-register')?.after(host);
  let current: CorrectableDifficulty | null = null;
  let request = 0;
  let channel: BroadcastChannel | undefined;
  try {
    channel = new BroadcastChannel('zombie-typing:personal-records-v1');
    channel.onmessage = event => { if (event.data === 'changed') void refresh(); };
  } catch { /* A single tab still works; other tabs reload on focus. */ }

  function signal() {
    void refresh();
    try { channel?.postMessage('changed'); } catch { /* Not required for storage. */ }
  }
  async function refresh(pending?: Promise<unknown>): Promise<void> {
    const difficulty = current;
    if (!difficulty || document.getElementById('screen-result')?.classList.contains('hidden')) return;
    const token = ++request;
    try {
      await pending;
      const best = personalBest(await storage.load(),difficulty);
      if (token !== request) return;
      status.textContent = 'このブラウザの自己ベスト：'+ (best === undefined ? 'まだ記録なし'
        : difficulty === 'endless' ? `${Math.floor(best/60)}分${String(best%60).padStart(2,'0')}秒`
        : `${best.toLocaleString('ja-JP')}点`);
    } catch {
      if (token === request) status.textContent = 'このブラウザの自己ベスト：保存・読み込みを確認できませんでした';
    }
  }
  window.addEventListener('focus', () => { void refresh(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
  mountRecordCorrection({
    load: storage.load,
    apply: async (revision,changes) => {
      const next = await storage.apply(revision,changes);
      signal();
      return next;
    },
  }, 'このブラウザだけに保存します。ログインしても同期されません。ここで修正しても、公開ランキングや従来の自己ベストは変わりません。追加前のプレイは含まれません。');
  return {
    save(difficulty:CorrectableDifficulty,value:number):Promise<CorrectionSnapshot> {
      const stored = Promise.resolve().then(()=>storage.append({
        id:crypto.randomUUID(),difficulty,value,playedAt:Date.now(),
      }));
      // Do not let optional browser storage change the game's flow or global submissions.
      void stored.then(() => {
        try { channel?.postMessage('changed'); } catch { /* best-effort */ }
      }).catch(() => {});
      return stored;
    },
    show(difficulty:CorrectableDifficulty|null,pending?:Promise<unknown>):void {
      request++;
      current = difficulty;
      host.hidden = difficulty === null;
      status.textContent = difficulty === null ? '' : 'このブラウザの自己ベスト：読み込み中…';
      if (difficulty !== null) void refresh(pending);
    },
  };
}
