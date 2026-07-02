/**
 * ゲームモードと難易度の定義(仕様 §11)。
 * モード追加 = MODES 配列に定義を1つ足すだけで、モード選択画面には
 * タブが1個増える構造(UI 側は MODES を列挙して描く)。
 */

import type { Tier } from '../config';

export type DifficultyId = 'easy' | 'normal' | 'hard';
export type ModeId = 'dawn';

export interface TierSpawnRule {
  /** 出現比率(0 なら出現しない) */
  weight: number;
  /** この Tier に割り当てる単語のかな長レンジ */
  kanaRange: readonly [number, number];
}

export interface DifficultyDef {
  id: DifficultyId;
  label: string;
  /** カードに表示する説明 */
  wordHint: string;
  zombieHint: string;
  /** 制限時間(夜の長さ・秒) */
  duration: number;
  tiers: Record<Tier, TierSpawnRule>;
  color: string;
  /** スポーン強度(予算回復への乗算) */
  regenScale: number;
  /** ゾンビ移動速度への乗算 */
  speedScale: number;
  /** 同時最大数 */
  maxZombies: number;
  /** 同時数上限が 1 体増えるまでの秒数 */
  concurrentRampSec: number;
}

export interface ModeDef {
  id: ModeId;
  label: string;
  desc: string;
  difficulties: DifficultyDef[];
}

export const MODES: ModeDef[] = [
  {
    id: 'dawn',
    label: '夜明けまで',
    desc: '日没から夜明けまで生き延びたらクリア。HP が尽きたらゲームオーバー。',
    difficulties: [
      {
        id: 'easy',
        label: 'イージー',
        wordHint: 'かな 2〜5 文字',
        zombieHint: '弱ゾンビ中心・初心者向け',
        duration: 90,
        color: '#5ad45a',
        regenScale: 0.85,
        speedScale: 0.95,
        maxZombies: 6,
        concurrentRampSec: 13,
        tiers: {
          1: { weight: 0.78, kanaRange: [2, 4] },
          2: { weight: 0.22, kanaRange: [4, 5] },
          3: { weight: 0, kanaRange: [8, 10] },
        },
      },
      {
        id: 'normal',
        label: 'ノーマル',
        wordHint: 'かな 3〜9 文字',
        zombieHint: 'バランス型・120秒',
        duration: 120,
        color: '#ffd24a',
        regenScale: 1.15,
        speedScale: 1.05,
        maxZombies: 8,
        concurrentRampSec: 10,
        tiers: {
          1: { weight: 0.45, kanaRange: [3, 5] },
          2: { weight: 0.38, kanaRange: [5, 7] },
          3: { weight: 0.17, kanaRange: [8, 11] },
        },
      },
      {
        id: 'hard',
        label: 'ハード',
        wordHint: 'かな 7 文字以上中心',
        zombieHint: '強ゾンビ多数・180秒の死闘',
        duration: 180,
        color: '#ff4444',
        regenScale: 1.45,
        speedScale: 1.15,
        maxZombies: 10,
        concurrentRampSec: 8,
        tiers: {
          1: { weight: 0.2, kanaRange: [5, 7] },
          2: { weight: 0.42, kanaRange: [7, 10] },
          3: { weight: 0.38, kanaRange: [9, 13] },
        },
      },
    ],
  },
];

export function getMode(id: ModeId): ModeDef {
  const m = MODES.find((m) => m.id === id);
  if (!m) throw new Error(`unknown mode: ${id}`);
  return m;
}

export function getDifficulty(mode: ModeDef, id: DifficultyId): DifficultyDef {
  const d = mode.difficulties.find((d) => d.id === id);
  if (!d) throw new Error(`unknown difficulty: ${id}`);
  return d;
}
