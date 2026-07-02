/**
 * 設定・ベストスコアの localStorage 永続化。
 */

export interface Settings {
  volume: number; // 0〜1
  sfx: boolean;
  bgm: boolean;
  romaji: boolean; // 頭上のローマ字表示
}

export interface BestRecord {
  score: number;
  kills: number;
  maxCombo: number;
  accuracy: number;
  cleared: boolean;
}

const SETTINGS_KEY = 'zombie-typing:settings';
const BEST_PREFIX = 'zombie-typing:best:';

const DEFAULT_SETTINGS: Settings = { volume: 0.7, sfx: true, bgm: true, romaji: true };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* private mode 等では保存しない */
  }
}

export function loadBest(modeId: string, diffId: string): BestRecord | null {
  try {
    const raw = localStorage.getItem(`${BEST_PREFIX}${modeId}:${diffId}`);
    return raw ? (JSON.parse(raw) as BestRecord) : null;
  } catch {
    return null;
  }
}

/** スコアがベスト更新なら保存して true を返す */
export function saveBest(modeId: string, diffId: string, rec: BestRecord): boolean {
  const prev = loadBest(modeId, diffId);
  if (prev && prev.score >= rec.score) return false;
  try {
    localStorage.setItem(`${BEST_PREFIX}${modeId}:${diffId}`, JSON.stringify(rec));
  } catch {
    /* ignore */
  }
  return true;
}
