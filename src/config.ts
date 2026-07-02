/**
 * ゲームバランス・演出パラメータの集約ファイル。
 * バランス調整はこのファイルの数値を変えるだけで完結する。
 */

export type Tier = 1 | 2 | 3;
export type BonusEffectId = 'heal' | 'shield' | 'overcharge';

export const FIELD = {
  width: 1600,
  height: 900,
  /** ディフェンスライン(縦線)の X 座標 */
  lineX: 300,
  /** 兵士の位置 */
  soldierX: 140,
  soldierY: 640,
  /** ゾンビ出現 X(画面右外) */
  spawnX: 1700,
  /** 地平線(背景画像の街並みの下端に合わせる) */
  horizonY: 412,
  /** ゾンビ足元 Y のランダム範囲(地面領域内) */
  zombieMinY: 450,
  zombieMaxY: 860,
} as const;

export const PLAYER = {
  maxHp: 100,
} as const;

/** Tier ごとの基礎パラメータ */
export const TIERS: Record<Tier, {
  damage: number;      // ライン超え時の基礎ダメージ
  speed: number;       // 歩行速度 px/s
  score: number;       // 撃破基礎スコア
  cost: number;        // スポーン予算コスト
  scale: number;       // 見た目の大きさ倍率
}> = {
  1: { damage: 5, speed: 66, score: 100, cost: 1, scale: 1.0 },
  2: { damage: 10, speed: 52, score: 300, cost: 3, scale: 1.22 },
  3: { damage: 20, speed: 40, score: 700, cost: 6, scale: 1.5 },
};

export const SPAWN = {
  /** スポーン試行の間隔(秒) */
  interval: 0.75,
  /** 予算回復速度(毎秒)。ゲーム進行に応じて start → end へ線形に増える。
      難易度ごとの regenScale が乗算される */
  budgetRegenStart: 0.42,
  budgetRegenEnd: 1.25,
  /** 開始時の初期予算(最初の1体をすぐ出すため) */
  initialBudget: 1.2,
  /** 最近使った単語を避ける数 */
  recentWordMemory: 20,
} as const;

export const COMBO = {
  /** ボーナス発動のコンボ閾値(この倍数ごとに発動) */
  bonusThreshold: 10,
  /** 撃破スコアに加算されるコンボボーナス(コンボ数 × これ) */
  scorePerCombo: 10,
  /** コンボボーナスの上限 */
  comboScoreCap: 500,
  /** ライン超えされたときにコンボをリセットするか */
  resetOnCross: true,
} as const;

/** ボーナス効果(差し替え可能)。実プレイで選定する */
export const BONUS = {
  /** 採用する効果: 'heal' | 'shield' | 'overcharge' */
  effect: 'heal' as BonusEffectId,
  healAmount: 15,
  shieldDuration: 10, // 秒
  shieldReduction: 0.5, // 被ダメ軽減率
  overchargeKills: 2, // 自動撃破する体数(弱い順)
  overchargeScoreRatio: 0.5, // 自動撃破のスコア倍率
} as const;

/** 頭上の文字の状態色(仕様 §5)。枠なし・縁取り文字スタイル */
export const LABEL_COLORS = {
  untyped: '#ffffff',
  typed: '#ff3b30',
  duplicate: '#ffd24a',
  underline: '#d92020',
  outline: 'rgba(0, 0, 0, 0.85)',
  romajiTyped: '#9a9ab0',
  romajiRemaining: '#e8e8f0',
} as const;

export const HUD_COLORS = {
  hpHigh: '#5ad45a',
  hpMid: '#ffd24a',
  hpLow: '#ff4444',
  timeBar: '#9ab8ff',
  text: '#e8e8f0',
} as const;

export const LASER = {
  color: '#ff3b30',
  coreColor: '#ffd0c0',
  idleSweepDeg: 16, // アイドル時のスイープ振幅(度)
  idleSweepSpeed: 0.9, // rad/s
  lockLerp: 14, // ロックオン時の角度補間の速さ(大きいほど速い)
  pulseTime: 0.09, // 正打時に太くなる時間(秒)
} as const;

/** 兵士スプライトの取り付け情報(素材差し替え時はここを調整) */
export const SOLDIER = {
  /** 胴体描画サイズ(高さ基準 px、幅はアスペクト維持) */
  bodyHeight: 170,
  /** 肩ピボットの胴体内相対位置(0〜1)。素材の肩ソケット位置 */
  shoulderRatioX: 0.31,
  shoulderRatioY: 0.26,
  /** 腕+銃 画像の描画高さ(ライフル全長 ≒ 兵士の身長の 0.85 倍になる値) */
  armsHeight: 46,
  /** 腕+銃 画像内のピボット位置(0〜1、左端の肩) */
  armsPivotRatioX: 0.05,
  armsPivotRatioY: 0.4,
  /** 腕+銃 画像内の銃口位置(0〜1、実測値) */
  muzzleRatioX: 0.985,
  muzzleRatioY: 0.347,
} as const;

export const ZOMBIE_ANIM = {
  walkFps: 8,
  bounceAmp: 2.5, // 上下バウンス px
  bounceFreq: 2.0, // Hz
  /** Tier1 スプライトの描画高さ(scale 1.0 のとき) */
  baseHeight: 155,
} as const;

export const AUDIO = {
  masterVolume: 0.7,
  sfxVolume: 1.0,
  /** BGM(mp3)の相対音量 */
  musicVolume: 0.55,
} as const;

export const COUNTDOWN = {
  /** 「日没…」表示時間 */
  introTime: 0.9,
  /** 3,2,1 の各秒数 */
  stepTime: 0.72,
  goText: '生き延びろ',
  goTime: 0.9,
} as const;

/** 空の色変化(進行度 0=日没 → 1=夜明け)のキーフレーム */
export const SKY_KEYFRAMES: { t: number; top: string; bottom: string; starAlpha: number }[] = [
  { t: 0.0, top: '#2b1638', bottom: '#7a3020', starAlpha: 0.15 },
  { t: 0.18, top: '#131228', bottom: '#2c1e3e', starAlpha: 0.7 },
  { t: 0.5, top: '#05060f', bottom: '#101226', starAlpha: 1.0 },
  { t: 0.78, top: '#0a1224', bottom: '#22344e', starAlpha: 0.55 },
  { t: 0.92, top: '#274a72', bottom: '#8a6a56', starAlpha: 0.15 },
  { t: 1.0, top: '#4a76a8', bottom: '#ffb56b', starAlpha: 0.0 },
];
