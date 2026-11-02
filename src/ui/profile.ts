import { MODES } from '../core/modes';
import { loadBest } from './store';

export interface PersonalRank { difficulty: string; rank: number; score: number; survival: number }
export function survivalLabel(seconds: number): string {
  const sec = Math.max(0, Math.floor(seconds));
  return `${Math.floor(sec / 60)}分${String(sec % 60).padStart(2, '0')}秒`;
}
/** 旧記録の0秒は不明。丸めた秒数だけで朝を迎えたと断定しない。 */
export function rankingOutcome(seconds: number, duration: number, cleared?: boolean): { label: string; cleared: boolean } {
  if (cleared === true) return { label: '朝を迎えた', cleared: true };
  if (!Number.isFinite(seconds) || seconds <= 0) return { label: '生存時間の記録なし', cleared: false };
  return cleared === undefined && seconds >= duration
    ? { label: '朝を迎えた', cleared: true }
    : { label: `生存 ${survivalLabel(seconds)}`, cleared: false };
}
export function renderProfile(ranks: PersonalRank[] | null, rankError = false): void {
  const root = document.getElementById('account-records');
  if (!root) return;
  root.replaceChildren();
  for (const mode of MODES.filter(m => m.id !== 'vs')) {
    for (const diff of mode.difficulties.filter(d => d.ranked !== false)) {
      const best = loadBest(mode.id, diff.id);
      const rank = ranks?.find(r => r.difficulty === diff.id);
      const row = document.createElement('article'); row.className = 'profile-record';
      row.style.setProperty('--stage-color', diff.color);
      const title = document.createElement('div'); title.className = 'profile-stage';
      const name = document.createElement('strong'); name.textContent = diff.label;
      const position = document.createElement('span'); position.className = 'profile-rank';
      position.textContent = ranks === null ? rankError ? '順位を取得できません' : '順位を確認中…' : rank ? `世界 ${rank.rank.toLocaleString()}位` : 'ランキング未登録';
      title.append(name, position); row.append(title);
      const values = document.createElement('div'); values.className = 'profile-values';
      if (best) {
        const score = document.createElement('strong');
        score.textContent = diff.endless ? survivalLabel(best.survival ?? 0) : `${best.score.toLocaleString()} pt`;
        const metrics = document.createElement('span');
        metrics.textContent = `WPM ${best.wpm ?? '—'}　正確率 ${(best.accuracy * 100).toFixed(1)}%`;
        values.append(score, metrics);
        if (!diff.endless) {
          const badge = document.createElement('span'); badge.className = `outcome-pill ${best.cleared ? 'dawn' : 'night'}`;
          badge.textContent = best.cleared ? '朝を迎えた' : best.survival ? `生存 ${survivalLabel(best.survival)}` : '夜明けに挑戦中';
          values.append(badge);
        }
        if (rank && (diff.endless ? rank.survival > (best.survival ?? 0) : rank.score > best.score)) {
          const note = document.createElement('small'); note.textContent = '順位は公開ランキングの自己ベスト'; values.append(note);
        }
      } else { values.textContent = 'まだ記録がありません'; }
      row.append(values); root.append(row);
    }
  }
}
