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

export const ENDLESS = {
  /** 空と背景演出は深夜で固定する(夜明けへ進ませない) */
  skyProgress: 0.5,
  /** 通常モードの終盤相当まで到達する秒数 */
  openingRampSec: 180,
  /** 何秒ごとに一段難しくなるか */
  rampStepSec: 35,
  /** 予算回復の伸び(1段ごとの倍率加算) */
  regenGrowthPerStep: 0.045,
  regenMaxMultiplier: 2.35,
  /** 新しく出るゾンビの速度上昇(1段ごとの倍率加算) */
  speedGrowthPerStep: 0.018,
  speedMaxMultiplier: 1.7,
  /** 同時出現数の上限を伸ばす間隔と天井 */
  extraConcurrentEverySec: 55,
  maxZombiesCap: 18,
  /** 単語の長さをじわじわ伸ばす */
  wordShiftEverySec: 70,
  wordShiftMax: 4,
  /** Tier 構成比。序盤は短い語中心、後半は強いゾンビが増える */
  tierWeightsStart: { 1: 0.65, 2: 0.3, 3: 0.05 } as Record<Tier, number>,
  tierWeightsEnd: { 1: 0.18, 2: 0.42, 3: 0.4 } as Record<Tier, number>,
  tierWeightRampSec: 420,
} as const;

/** ラスボスゾンビ(巨体・鈍足・大ダメージ・長文)。
    夜明けまで各難易度は「残り dawnLeadSec 秒」に1体、
    エンドレスは endlessIntervalSec ごとに出現する。
    単語のかな長は難易度ごとの bossKana(modes.ts)で指定 */
export const BOSS = {
  /** ライン超え時の基礎ダメージ(1文字も削らないとこれを喰らう) */
  damage: 50,
  /** 歩行速度 px/s(どの Tier よりも遅い。難易度の speedScale は掛けない) */
  speed: 26,
  /** 撃破基礎スコア */
  score: 2000,
  /** 見た目の大きさ倍率(Tier3=1.5 より大) */
  scale: 2.1,
  /** 足元 Y(最前列固定。手前レイヤーに描かれ他ゾンビと重なりにくい) */
  y: 848,
  /** 夜明けまでモード: 終了の何秒前に出すか */
  dawnLeadSec: 30,
  /** エンドレス: 出現間隔(秒) */
  endlessIntervalSec: 90,
} as const;

/** ベーシック(五十音練習)の設定 */
export const BASIC = {
  /** ゾンビが歩く一列の足元 Y(キーボードガイドに重ならない高さ) */
  rowY: 596,
  /** 同時に出す最大数 */
  maxOnScreen: 3,
  /** 一定テンポで湧く間隔(秒)。撃破時は待たずに即出現する */
  spawnIntervalSec: 5.0,
  /** 歩行速度の倍率(ゆっくり) */
  speedScale: 0.75,
  /** 2周目以降(ランダム出題)の1周あたりの出題数 */
  randomLapLength: 30,
  /** 練習する文字の並び(五十音 → 濁音・半濁音 → 記号) */
  sequence: [
    'あ', 'い', 'う', 'え', 'お',
    'か', 'き', 'く', 'け', 'こ',
    'さ', 'し', 'す', 'せ', 'そ',
    'た', 'ち', 'つ', 'て', 'と',
    'な', 'に', 'ぬ', 'ね', 'の',
    'は', 'ひ', 'ふ', 'へ', 'ほ',
    'ま', 'み', 'む', 'め', 'も',
    'や', 'ゆ', 'よ',
    'ら', 'り', 'る', 'れ', 'ろ',
    'わ', 'を', 'ん',
    'が', 'ぎ', 'ぐ', 'げ', 'ご',
    'ざ', 'じ', 'ず', 'ぜ', 'ぞ',
    'だ', 'ぢ', 'づ', 'で', 'ど',
    'ば', 'び', 'ぶ', 'べ', 'ぼ',
    'ぱ', 'ぴ', 'ぷ', 'ぺ', 'ぽ',
    'ー', '、', '。', '？', '！', // ー 、 。 ？ !(全角)
  ],
} as const;

/** ベーシック用キーボードガイドの描画設定 */
export const KEYGUIDE = {
  /** パネル上端の Y(ゾンビはこれより上を歩く) */
  top: 618,
  keySize: 40,
  keyGap: 5,
} as const;

/** エナジー = 100% 超のオーバーヒール(水色)。
    ノーミス撃破の報酬はまず緑(HP)の回復に使われ、HP 満タンのときだけ
    100% を超えた分が水色として貯まる。被弾時は水色から先に減る。
    寿司打のボーナス程度の「ちょっとずつ確実に積み上がる」バランス */
export const ENERGY = {
  /** 撃破1体あたりの獲得量 = gainBase × min(コンボ数, comboCap) */
  gainBase: 0.25,
  comboCap: 4,
  /** オーバーヒール(100% 超過分)の上限。ノーミス上級者で最大 130% */
  max: 30,
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
  /** ローマ字はゾンビの HP に見立てる: 残り=緑(HPバーと同系) → 打った分=赤 */
  romajiTyped: '#ff3b30',
  romajiRemaining: '#5ad45a',
} as const;

export const HUD_COLORS = {
  hpHigh: '#5ad45a',
  hpMid: '#ffd24a',
  hpLow: '#ff4444',
  /** エナジー(水色シールド)ゲージ */
  energy: '#54c8ea',
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
