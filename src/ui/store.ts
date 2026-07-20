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
  survival?: number;
  /** VS 自己ベストのゴースト再現に使う(古い記録には無い) */
  wpm?: number;
}

/** VS専用の「倒すたび強くなる自己ベスト」。通常記録・ランキングとは完全に別保存。 */
export interface VsBestRecord {
  version: 1;
  kills: number;
  wpm: number;
  accuracy: number;
  /** 勝ったプレイで正打した時刻(ゲーム開始からのミリ秒) */
  shotTimesMs: number[];
  /** 勝ったプレイで撃破した時刻。次回も同じ撃破ペースへ合わせる */
  killTimesMs: number[];
  /** 難易度差を吸収するための、1撃破あたりの実測正打数 */
  keysPerKill: number;
}

const SETTINGS_KEY = 'zombie-typing:settings';
const BEST_PREFIX = 'zombie-typing:best:';
const VS_BEST_PREFIX = 'zombie-typing:vs-best:';

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

/** 指定された指標でベスト更新なら保存して true を返す */
export function saveBest(
  modeId: string,
  diffId: string,
  rec: BestRecord,
  metric: 'score' | 'survival' = 'score',
): boolean {
  const prev = loadBest(modeId, diffId);
  if (prev) {
    const prevValue = metric === 'survival' ? prev.survival ?? 0 : prev.score;
    const nextValue = metric === 'survival' ? rec.survival ?? 0 : rec.score;
    if (prevValue >= nextValue) return false;
  }
  try {
    localStorage.setItem(`${BEST_PREFIX}${modeId}:${diffId}`, JSON.stringify(rec));
  } catch {
    /* ignore */
  }
  return true;
}

export function loadVsBest(diffId: string): VsBestRecord | null {
  try {
    const raw = localStorage.getItem(`${VS_BEST_PREFIX}${diffId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<VsBestRecord>;
    if (
      parsed.version !== 1 ||
      !Number.isFinite(parsed.kills) ||
      !Number.isFinite(parsed.wpm) ||
      !Number.isFinite(parsed.accuracy) ||
      !Number.isFinite(parsed.keysPerKill) ||
      !Array.isArray(parsed.shotTimesMs) ||
      !Array.isArray(parsed.killTimesMs)
    ) {
      return null;
    }
    const shotTimesMs = parsed.shotTimesMs
      .filter((v): v is number => Number.isFinite(v) && v >= 0)
      .map((v) => Math.round(v))
      .sort((a, b) => a - b);
    if (shotTimesMs.length === 0) return null;
    const killTimesMs = parsed.killTimesMs
      .filter((v): v is number => Number.isFinite(v) && v >= 0)
      .map((v) => Math.round(v))
      .sort((a, b) => a - b);
    if (killTimesMs.length === 0) return null;
    return {
      version: 1,
      kills: Math.max(0, Math.round(parsed.kills!)),
      wpm: Math.max(1, Math.round(parsed.wpm!)),
      accuracy: Math.max(0, Math.min(1, parsed.accuracy!)),
      shotTimesMs,
      killTimesMs,
      keysPerKill: Math.max(1, parsed.keysPerKill!),
    };
  } catch {
    return null;
  }
}

/** 現在の自己ベストに勝った走りだけを、次回対戦用として置き換える。 */
export function saveVsBest(diffId: string, rec: VsBestRecord): void {
  try {
    localStorage.setItem(`${VS_BEST_PREFIX}${diffId}`, JSON.stringify(rec));
  } catch {
    /* private mode 等では保存しない */
  }
}
