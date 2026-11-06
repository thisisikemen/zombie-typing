import { MODES } from '../core/modes';
import { loadBest } from './store';
import { formatPlayTime, playTimeTotals } from './play-time';
import { RESULT_RANK_LIMIT, worldRankLabel } from './ranking';

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
  const times = playTimeTotals();
  const total = document.getElementById('account-total-time');
  if (total) total.textContent = formatPlayTime(Object.values(times).reduce((sum, ms) => sum + ms, 0));
  root.replaceChildren();
  for (const mode of MODES.filter(m => m.id !== 'vs')) {
    for (const diff of mode.difficulties) {
      const best = loadBest(mode.id, diff.id);
      const rank = ranks?.find(r => r.difficulty === diff.id);
      const row = document.createElement('article'); row.className = 'profile-record';
      row.style.setProperty('--stage-color', diff.color);
      const title = document.createElement('div'); title.className = 'profile-stage';
      const name = document.createElement('strong'); name.textContent = diff.label;
      const position = document.createElement('span'); position.className = 'profile-rank';
      position.textContent = diff.practice ? '練習モード' : ranks === null ? rankError ? '順位を取得できません' : '順位を確認中…' : rank ? worldRankLabel(rank.rank) : 'ランキング未登録';
      if (rank && rank.rank > RESULT_RANK_LIMIT) position.classList.add('profile-rank-outside');
      title.append(name, position); row.append(title);
      const values = document.createElement('div'); values.className = 'profile-values';
      if (diff.practice) {
        values.classList.add('profile-practice');
        values.textContent = '五十音・単語の練習';
      } else if (best) {
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
      const time = document.createElement('div'); time.className = 'profile-time';
      const label = document.createElement('span'); label.textContent = diff.practice ? '総練習時間' : '総プレイ時間';
      const duration = document.createElement('strong'); duration.textContent = formatPlayTime(times[diff.id]);
      time.append(label, duration);
      row.append(values, time); root.append(row);
    }
  }
}
