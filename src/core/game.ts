/**
 * ゲーム状態の更新ロジック(純粋ロジック層)。
 * DOM / Canvas / WebAudio に依存しない。描画・音声へは events キューで通知する。
 * 将来のオンライン化ではこのモジュールをサーバーへ移植する想定(仕様 §1)。
 */

import { BASIC, BONUS, COMBO, ENDLESS, FIELD, PLAYER, SPAWN, TIERS, type BonusEffectId, type Tier } from '../config';
import type { DifficultyDef, TierSpawnRule } from './modes';
import { TypingSession } from './typing/engine';
import type { WordEntry, WordPool } from './words';

export interface Zombie {
  id: number;
  tier: Tier;
  word: WordEntry;
  session: TypingSession;
  /** 足元中心のワールド座標 */
  x: number;
  y: number;
  speed: number;
  speedMultiplier: number;
  walkTime: number;
  /** スポーン時に初手キー排他が効いていたか(デバッグ・演出用) */
  exclusive: boolean;
}

export type GameEvent =
  | { type: 'shot'; zombieId: number }
  | { type: 'miss' }
  | { type: 'kill'; zombieId: number; x: number; y: number; tier: Tier; gained: number; kana: string }
  | { type: 'autokill'; zombieId: number; x: number; y: number; tier: Tier }
  | { type: 'crossed'; zombieId: number; damage: number; tier: Tier; y: number }
  | { type: 'lock'; zombieId: number }
  | { type: 'multiLock'; zombieIds: number[] }
  | { type: 'release' }
  | { type: 'spawn'; zombieId: number }
  | { type: 'bonus'; effect: BonusEffectId; text: string }
  | { type: 'clear' }
  | { type: 'gameover' };

export type GameStatus = 'running' | 'clear' | 'gameover';

/** ボーナス効果は差し替え可能なインターフェース(仕様 §10) */
export interface BonusEffect {
  id: BonusEffectId;
  apply(game: Game): string; // 発動時のバナー文言を返す
}

/** セッションにキー列を入力してみる(全部受理されればそのセッションを返す) */
function replayInto(s: TypingSession, keys: string[]): TypingSession | null {
  for (const k of keys) {
    if (s.isComplete()) return null; // 打ち切った後に余分なキーがある
    if (s.input(k) === 'miss') return null;
  }
  return s;
}

const BONUS_EFFECTS: Record<BonusEffectId, BonusEffect> = {
  heal: {
    id: 'heal',
    apply(game) {
      game.hp = Math.min(PLAYER.maxHp, game.hp + BONUS.healAmount);
      return `HP回復 +${BONUS.healAmount}`;
    },
  },
  shield: {
    id: 'shield',
    apply(game) {
      game.shieldTime = BONUS.shieldDuration;
      return `シールド展開 ${BONUS.shieldDuration}秒`;
    },
  },
  overcharge: {
    id: 'overcharge',
    apply(game) {
      const targets = [...game.zombies]
        .sort((a, b) => a.tier - b.tier || a.x - b.x)
        .slice(0, BONUS.overchargeKills);
      for (const z of targets) {
        game.score += Math.round(TIERS[z.tier].score * BONUS.overchargeScoreRatio);
        game.removeZombie(z.id);
        game.events.push({ type: 'autokill', zombieId: z.id, x: z.x, y: z.y, tier: z.tier });
      }
      return 'オーバーチャージ!';
    },
  },
};

export class Game {
  readonly difficulty: DifficultyDef;
  readonly duration: number;

  time = 0;
  hp: number = PLAYER.maxHp;
  score = 0;
  combo = 0;
  maxCombo = 0;
  kills = 0;
  correctKeys = 0;
  missKeys = 0;
  shieldTime = 0;
  status: GameStatus = 'running';

  zombies: Zombie[] = [];
  /** 通常ロックオン中のゾンビ id */
  targetId: number | null = null;
  /** 重複候補モード中のゾンビ id 群(初手が被った場合のみ) */
  candidateIds: number[] = [];

  /** 1フレーム分のイベント。描画・音声側が読み取って consume する */
  events: GameEvent[] = [];

  private budget = SPAWN.initialBudget;
  private spawnTimer = 0;
  private nextId = 1;
  private recentKana: string[] = [];
  /** ベーシック: 次に出す文字の通し番号(五十音順・ループ) */
  private practiceIndex = 0;
  /** ロック(または重複候補)開始以降の全打鍵列(正打・ミス問わず時系列。自動切替の判定用) */
  private recentKeys: string[] = [];
  private static readonly RECENT_KEYS_MAX = 32;

  constructor(
    difficulty: DifficultyDef,
    private readonly pool: WordPool,
    private readonly rng: () => number = Math.random,
  ) {
    this.difficulty = difficulty;
    this.duration = difficulty.duration;
  }

  isEndless(): boolean {
    return this.difficulty.endless === true;
  }

  /** 難易度上昇に使う経過率 0〜1 */
  progressRatio(): number {
    const duration = this.isEndless() ? ENDLESS.openingRampSec : this.duration;
    return duration > 0 ? Math.min(1, this.time / duration) : 0;
  }

  /** 空の色・背景演出に使う経過率。エンドレスは深夜で固定する */
  skyProgressRatio(): number {
    return this.isEndless() ? ENDLESS.skyProgress : this.progressRatio();
  }

  accuracy(): number {
    const total = this.correctKeys + this.missKeys;
    return total === 0 ? 1 : this.correctKeys / total;
  }

  survivalTime(): number {
    return this.isEndless() ? this.time : Math.min(this.time, this.duration);
  }

  update(dt: number): void {
    if (this.status !== 'running') return;

    this.time += dt;
    if (this.shieldTime > 0) this.shieldTime = Math.max(0, this.shieldTime - dt);

    // --- ゾンビ移動・ライン超え判定 ---
    for (const z of [...this.zombies]) {
      z.x -= z.speed * z.speedMultiplier * dt;
      z.walkTime += dt;
      if (z.x < FIELD.lineX) {
        this.onZombieCrossed(z);
      }
    }

    // --- スポーン制御(難易度予算方式・仕様 §7) ---
    this.budget += this.budgetRegenRate() * dt;
    this.spawnTimer += dt;
    if (this.spawnTimer >= SPAWN.interval) {
      this.spawnTimer -= SPAWN.interval;
      this.trySpawn();
    }

    // --- 終了判定 ---
    if (this.hp <= 0) {
      this.hp = 0;
      this.status = 'gameover';
      this.events.push({ type: 'gameover' });
    } else if (!this.isEndless() && this.time >= this.duration) {
      this.status = 'clear';
      this.events.push({ type: 'clear' });
    }
  }

  /** タイピングキー(a-z, 0-9, ハイフン等)の処理 */
  handleKey(rawKey: string): void {
    if (this.status !== 'running') return;
    const key = rawKey.toLowerCase();

    // 通常ロックオン中
    if (this.targetId !== null) {
      const z = this.getZombie(this.targetId);
      if (!z) {
        this.targetId = null;
      } else {
        const res = z.session.input(key);
        if (res === 'miss') {
          // 打鍵列が他のゾンビの単語として正しければ自動で狙いを切り替える
          if (!this.tryAutoSwitch(key)) this.registerMiss();
        } else {
          this.pushRecentKey(key);
          this.correctKeys++;
          this.events.push({ type: 'shot', zombieId: z.id });
          if (res === 'complete') this.onZombieKilled(z);
        }
        return;
      }
    }

    // 重複候補モード中(初手が被ったゾンビたちを並行に進める)
    if (this.candidateIds.length > 0) {
      const alive = this.candidateIds
        .map((id) => this.getZombie(id))
        .filter((z): z is Zombie => !!z);
      const accepting = alive.filter((z) => z.session.currentKeys().has(key));
      if (accepting.length === 0) {
        // ミスでは候補を消さない(仕様 §5: 打ち切るまで断定しない)
        if (!this.tryAutoSwitch(key)) this.registerMiss();
        return;
      }
      this.pushRecentKey(key);
      this.correctKeys++;
      this.events.push({ type: 'shot', zombieId: accepting[0].id });
      let killed: Zombie | null = null;
      for (const z of accepting) {
        if (z.session.input(key) === 'complete') killed = z;
      }
      if (killed) {
        this.onZombieKilled(killed);
        return;
      }
      this.candidateIds = accepting.map((z) => z.id);
      if (this.candidateIds.length === 1) {
        // 一意に確定 → 通常ロックオンへ移行
        this.targetId = this.candidateIds[0];
        this.candidateIds = [];
        this.events.push({ type: 'lock', zombieId: this.targetId });
      } else {
        this.events.push({ type: 'multiLock', zombieIds: this.candidateIds });
      }
      return;
    }

    // ターゲット未確定 → このキーを受け付けるゾンビを探してロックオン
    if (this.zombies.length === 0) return; // 対象がいなければノーカウント
    const matches = this.zombies.filter((z) => z.session.currentKeys().has(key));
    if (matches.length === 0) {
      // 進捗のあるゾンビを最初から打ち直しているケース等を拾う
      if (!this.tryAutoSwitch(key)) this.registerMiss();
      return;
    }
    this.recentKeys = [key];
    if (matches.length === 1) {
      const z = matches[0];
      this.targetId = z.id;
      this.events.push({ type: 'lock', zombieId: z.id });
      const res = z.session.input(key);
      this.correctKeys++;
      this.events.push({ type: 'shot', zombieId: z.id });
      if (res === 'complete') this.onZombieKilled(z);
      return;
    }
    // 初手が重複 → 全員を「重複候補」状態にして並行入力
    this.correctKeys++;
    this.events.push({ type: 'shot', zombieId: matches[0].id });
    for (const z of matches) z.session.input(key);
    this.candidateIds = matches.map((z) => z.id);
    this.events.push({ type: 'multiLock', zombieIds: this.candidateIds });
  }

  private pushRecentKey(key: string): void {
    this.recentKeys.push(key);
    if (this.recentKeys.length > Game.RECENT_KEYS_MAX) this.recentKeys.shift();
  }

  /**
   * 自動ターゲット切替(ミス時)。
   * 直近の打鍵列(正打・ミス問わず時系列)の「末尾の並び」が別のゾンビの
   * 入力として正しい場合、そのゾンビへ乗り移る。照合は 2 通り:
   * - 続きから: 途中まで入力済みのゾンビの「残り」を打っている
   * - 最初から: そのゾンビの単語を頭から打ち直している(進捗は上書き)
   * 例:
   * - 「おつかれ…」のつもりが実は「おつとめ…」→ 全打鍵一致で即切替
   * - 途中で諦めて別の単語を打ち始めた → 打ち直した末尾だけで切替。
   *   最初の数打が現在のターゲットに食われていても拾える
   * - 誤爆防止: 一致は 2 打以上必要。そもそもミスにならない限り発動しない
   *   (狙ったターゲットに正しく打てている間は絶対に横取りされない)
   */
  private tryAutoSwitch(key: string): boolean {
    this.pushRecentKey(key);
    const excluded = new Set<number>(this.candidateIds);
    if (this.targetId !== null) excluded.add(this.targetId);

    let best: { z: Zombie; s: TypingSession; len: number; cont: boolean } | null = null;
    const better = (len: number, cont: boolean, z: Zombie) =>
      !best ||
      len > best.len ||
      (len === best.len && cont && !best.cont) ||
      (len === best.len && cont === best.cont && z.x < best.z.x);

    for (const z of this.zombies) {
      if (excluded.has(z.id)) continue;
      const hasProgress = !z.session.isComplete() && z.session.typedRomaji().length > 0;
      // このゾンビに一致する最長のサフィックスを探す
      for (let len = this.recentKeys.length; len >= 2; len--) {
        if (best && best.len > len) break; // これより短い一致では勝てない
        const suffix = this.recentKeys.slice(-len);
        // 続きから(入力進捗のあるゾンビの残りを打っているケース)
        if (hasProgress) {
          const cont = replayInto(z.session.clone(), suffix);
          if (cont) {
            if (better(len, true, z)) best = { z, s: cont, len, cont: true };
            break;
          }
        }
        // 最初から(頭から打ち直しているケース。進捗は上書きされる)
        const fresh = replayInto(new TypingSession(z.word.kana), suffix);
        if (fresh) {
          if (better(len, false, z)) best = { z, s: fresh, len, cont: false };
          break;
        }
      }
    }
    if (!best) return false;

    best.z.session = best.s;
    this.targetId = best.z.id;
    this.candidateIds = [];
    this.recentKeys = [...best.s.typedRomaji()];
    this.correctKeys++;
    this.events.push({ type: 'lock', zombieId: best.z.id });
    this.events.push({ type: 'shot', zombieId: best.z.id });
    if (best.s.isComplete()) this.onZombieKilled(best.z);
    return true;
  }

  /** Enter / Space によるターゲット解除(進捗はゾンビ側に保持される・仕様 §5) */
  releaseTarget(): void {
    if (this.status !== 'running') return;
    if (this.targetId !== null || this.candidateIds.length > 0) {
      this.targetId = null;
      this.candidateIds = [];
      this.recentKeys = [];
      this.events.push({ type: 'release' });
    }
  }

  getZombie(id: number): Zombie | undefined {
    return this.zombies.find((z) => z.id === id);
  }

  removeZombie(id: number): void {
    this.zombies = this.zombies.filter((z) => z.id !== id);
    if (this.targetId === id) this.targetId = null;
    this.candidateIds = this.candidateIds.filter((c) => c !== id);
    if (this.targetId === null && this.candidateIds.length === 0) {
      this.recentKeys = [];
    }
  }

  /** イベントを取り出してキューを空にする(毎フレーム描画側が呼ぶ) */
  drainEvents(): GameEvent[] {
    const ev = this.events;
    this.events = [];
    return ev;
  }

  // ---------- private ----------

  private registerMiss(): void {
    this.missKeys++;
    this.combo = 0;
    this.events.push({ type: 'miss' });
  }

  private onZombieKilled(z: Zombie): void {
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const comboBonus = Math.min(COMBO.comboScoreCap, this.combo * COMBO.scorePerCombo);
    const gained = TIERS[z.tier].score + comboBonus;
    this.score += gained;
    this.kills++;
    this.removeZombie(z.id);
    this.targetId = null;
    this.candidateIds = [];
    this.events.push({
      type: 'kill',
      zombieId: z.id,
      x: z.x,
      y: z.y,
      tier: z.tier,
      gained,
      kana: z.session.kana,
    });

    // コンボボーナス(閾値の倍数で発動・仕様 §10)
    if (this.combo > 0 && this.combo % COMBO.bonusThreshold === 0) {
      const effect = BONUS_EFFECTS[BONUS.effect];
      const text = effect.apply(this);
      this.events.push({ type: 'bonus', effect: effect.id, text });
    }
  }

  private onZombieCrossed(z: Zombie): void {
    const p = z.session.progress();
    let damage = TIERS[z.tier].damage * (1 - p); // 入力進捗によるダメージ軽減(仕様 §6)
    if (this.shieldTime > 0) damage *= 1 - BONUS.shieldReduction;
    const applied = Math.round(damage);
    this.hp -= applied;
    if (COMBO.resetOnCross) this.combo = 0;
    this.removeZombie(z.id);
    this.events.push({ type: 'crossed', zombieId: z.id, damage: applied, tier: z.tier, y: z.y });
  }

  private allowedConcurrent(): number {
    const maxZombies = this.isEndless()
      ? Math.min(
          ENDLESS.maxZombiesCap,
          this.difficulty.maxZombies + Math.floor(this.time / ENDLESS.extraConcurrentEverySec),
        )
      : this.difficulty.maxZombies;
    return Math.min(
      maxZombies,
      1 + Math.floor(this.time / this.difficulty.concurrentRampSec),
    );
  }

  private trySpawn(): void {
    // ベーシック(五十音練習): 決まった並びの一文字を一列に出す
    if (this.difficulty.practice) {
      this.trySpawnPractice();
      return;
    }

    if (this.zombies.length >= this.allowedConcurrent()) return;

    // 予算内で出せる Tier を重み付き抽選
    const options: { tier: Tier; weight: number }[] = [];
    for (const tier of [1, 2, 3] as Tier[]) {
      const rule = this.tierRule(tier);
      if (rule.weight <= 0) continue;
      if (TIERS[tier].cost > this.budget) continue;
      options.push({ tier, weight: rule.weight });
    }
    if (options.length === 0) return;

    const total = options.reduce((s, o) => s + o.weight, 0);
    let r = this.rng() * total;
    let tier = options[options.length - 1].tier;
    for (const o of options) {
      r -= o.weight;
      if (r <= 0) {
        tier = o.tier;
        break;
      }
    }

    // 初手キー排他フィルタ: 画面上の全ゾンビが「いま受け付けるキー」と
    // 交わらない単語のみを優先して選ぶ(仕様 §5)
    const blockedKeys = new Set<string>();
    for (const z of this.zombies) for (const k of z.session.currentKeys()) blockedKeys.add(k);
    const onScreen = new Set(this.zombies.map((z) => z.word.kana));
    const recent = new Set(this.recentKana);

    const picked = this.pool.pick(
      this.rng,
      this.tierRule(tier).kanaRange,
      blockedKeys,
      onScreen,
      recent,
    );
    if (!picked) return;

    this.budget -= TIERS[tier].cost;
    this.recentKana.push(picked.word.kana);
    if (this.recentKana.length > SPAWN.recentWordMemory) this.recentKana.shift();

    const z: Zombie = {
      id: this.nextId++,
      tier,
      word: picked.word,
      session: new TypingSession(picked.word.kana),
      x: FIELD.spawnX,
      y: this.pickSpawnY(),
      speed: TIERS[tier].speed * this.currentSpeedScale(),
      speedMultiplier: 1.0, // 「速いゾンビ」導入用パラメータ(仕様 §7)
      walkTime: this.rng() * 10,
      exclusive: picked.exclusive,
    };
    this.zombies.push(z);
    this.events.push({ type: 'spawn', zombieId: z.id });
  }

  /** ベーシック用スポーン: 五十音順に一文字ずつ、一列に歩かせる */
  private trySpawnPractice(): void {
    if (this.zombies.length >= BASIC.maxOnScreen) return;
    // 直前のゾンビが少し進むまで待つ(重なり防止)
    if (this.zombies.some((z) => z.x > FIELD.spawnX - BASIC.minSpacing)) return;

    const ch = BASIC.sequence[this.practiceIndex % BASIC.sequence.length];
    this.practiceIndex++;
    const z: Zombie = {
      id: this.nextId++,
      tier: 1,
      word: { display: ch, kana: ch },
      session: new TypingSession(ch),
      x: FIELD.spawnX,
      y: BASIC.rowY,
      speed: TIERS[1].speed * BASIC.speedScale * this.difficulty.speedScale,
      speedMultiplier: 1.0,
      walkTime: this.rng() * 10,
      exclusive: true,
    };
    this.zombies.push(z);
    this.events.push({ type: 'spawn', zombieId: z.id });
  }

  /** 直近のゾンビと高さが近すぎないよう数回リトライしつつ Y を選ぶ */
  private pickSpawnY(): number {
    const range = FIELD.zombieMaxY - FIELD.zombieMinY;
    let y = FIELD.zombieMinY + this.rng() * range;
    for (let i = 0; i < 4; i++) {
      const tooClose = this.zombies.some(
        (z) => z.x > FIELD.spawnX - 260 && Math.abs(z.y - y) < 90,
      );
      if (!tooClose) break;
      y = FIELD.zombieMinY + this.rng() * range;
    }
    return y;
  }

  private endlessLevel(): number {
    return Math.max(0, this.time / ENDLESS.rampStepSec);
  }

  private budgetRegenRate(): number {
    const base =
      (SPAWN.budgetRegenStart +
        (SPAWN.budgetRegenEnd - SPAWN.budgetRegenStart) * this.progressRatio()) *
      this.difficulty.regenScale;
    if (!this.isEndless()) return base;

    const growth = Math.min(
      ENDLESS.regenMaxMultiplier,
      1 + this.endlessLevel() * ENDLESS.regenGrowthPerStep,
    );
    return base * growth;
  }

  private currentSpeedScale(): number {
    if (!this.isEndless()) return this.difficulty.speedScale;
    const growth = Math.min(
      ENDLESS.speedMaxMultiplier,
      1 + this.endlessLevel() * ENDLESS.speedGrowthPerStep,
    );
    return this.difficulty.speedScale * growth;
  }

  private tierRule(tier: Tier): TierSpawnRule {
    const base = this.difficulty.tiers[tier];
    if (!this.isEndless()) return base;

    const t = Math.min(1, this.time / ENDLESS.tierWeightRampSec);
    const weight =
      ENDLESS.tierWeightsStart[tier] +
      (ENDLESS.tierWeightsEnd[tier] - ENDLESS.tierWeightsStart[tier]) * t;
    const shift = Math.min(
      ENDLESS.wordShiftMax,
      Math.floor(this.time / ENDLESS.wordShiftEverySec),
    );
    const minShift =
      tier === 1 ? Math.floor(shift * 0.5) : tier === 2 ? Math.floor(shift * 0.75) : shift;
    const maxCap = tier === 1 ? 8 : tier === 2 ? 12 : 15;
    const min = Math.min(maxCap, base.kanaRange[0] + minShift);
    const max = Math.min(maxCap, base.kanaRange[1] + shift);
    return { weight, kanaRange: [min, Math.max(min, max)] };
  }
}
