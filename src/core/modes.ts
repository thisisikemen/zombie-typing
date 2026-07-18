/**
 * ゲームモードと難易度の定義(仕様 §11)。
 * モード追加 = MODES 配列に定義を1つ足すだけで、モード選択画面には
 * タブが1個増える構造(UI 側は MODES を列挙して描く)。
 */

import type { Tier } from '../config';

export type DifficultyId = 'basic' | 'easy' | 'normal' | 'hard' | 'hardcore' | 'endless';
export type ModeId = 'dawn' | 'endless';
export type RankMetric = 'score' | 'survival';
export type BackgroundId = 'night' | 'endless';

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
  /** true の場合、制限時間クリアはなく HP 0 のみで終了する */
  endless?: boolean;
  /** true の場合、五十音を順番に練習するモード(一列歩行+キーボードガイド) */
  practice?: boolean;
  /** false の場合、ランキング登録の対象外(既定 true) */
  ranked?: boolean;
  /** カードに出す時間/条件表示 */
  durationHint?: string;
  /** ベスト記録・ランキングで重視する指標 */
  rankBy?: RankMetric;
  /** プレイ中背景 */
  backgroundId?: BackgroundId;
  /** リザルト画面専用背景 */
  resultBackgroundId?: BackgroundId;
  tiers: Record<Tier, TierSpawnRule>;
  /** ラスボスの単語かな長レンジ(未指定ならボスは出ない) */
  bossKana?: readonly [number, number];
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
        id: 'basic',
        label: 'ベーシック',
        wordHint: '五十音 → 短い単語へ',
        zombieHint: '超入門・キーボードガイド付き',
        duration: 90,
        durationHint: '無制限',
        practice: true,
        ranked: false,
        color: '#6ec8e8',
        regenScale: 1.0,
        speedScale: 1.0,
        maxZombies: 2,
        concurrentRampSec: 1,
        tiers: {
          1: { weight: 1, kanaRange: [1, 1] },
          2: { weight: 0, kanaRange: [4, 5] },
          3: { weight: 0, kanaRange: [8, 10] },
        },
      },
      {
        id: 'easy',
        label: 'イージー',
        wordHint: 'かな 2〜5 文字',
        zombieHint: '弱ゾンビ中心・初心者向け',
        duration: 90,
        bossKana: [8, 10],
        color: '#5ad45a',
        regenScale: 1.0,
        speedScale: 1.0,
        maxZombies: 7,
        concurrentRampSec: 11,
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
        zombieHint: 'バランス型・中級者向け',
        duration: 120,
        bossKana: [10, 13],
        color: '#ffd24a',
        regenScale: 1.3,
        speedScale: 1.1,
        maxZombies: 8,
        concurrentRampSec: 9,
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
        zombieHint: '強ゾンビの大群・上級者向け',
        duration: 180,
        bossKana: [12, 15],
        color: '#ff4444',
        regenScale: 1.55,
        speedScale: 1.18,
        maxZombies: 10,
        concurrentRampSec: 8,
        tiers: {
          1: { weight: 0.2, kanaRange: [5, 7] },
          2: { weight: 0.42, kanaRange: [7, 10] },
          3: { weight: 0.38, kanaRange: [8, 13] },
        },
      },
      {
        id: 'hardcore',
        label: 'ハードコア',
        wordHint: 'かな 8 文字以上中心',
        zombieHint: '生還率最低・最凶の夜',
        duration: 180,
        bossKana: [13, 16],
        color: '#a45ae0',
        regenScale: 1.85,
        speedScale: 1.28,
        maxZombies: 12,
        concurrentRampSec: 7,
        tiers: {
          1: { weight: 0.12, kanaRange: [6, 8] },
          2: { weight: 0.4, kanaRange: [8, 11] },
          3: { weight: 0.48, kanaRange: [9, 13] },
        },
      },
    ],
  },
  {
    id: 'endless',
    label: '夜は明けない',
    desc: 'クリアは無い。HP が尽きるまで、少しずつ苛烈になる夜を生き延びる。',
    difficulties: [
      {
        id: 'endless',
        label: 'エンドレス',
        wordHint: 'かな 3〜13+文字',
        zombieHint: '時間とともに無制限に苛烈化',
        duration: 0,
        durationHint: '制限時間なし',
        endless: true,
        rankBy: 'survival',
        backgroundId: 'endless',
        resultBackgroundId: 'endless',
        bossKana: [12, 15],
        color: '#d7d1c4',
        regenScale: 1.22,
        speedScale: 1.08,
        maxZombies: 8,
        concurrentRampSec: 10,
        tiers: {
          1: { weight: 0.65, kanaRange: [3, 5] },
          2: { weight: 0.3, kanaRange: [5, 8] },
          3: { weight: 0.05, kanaRange: [8, 11] },
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
