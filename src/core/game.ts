/**
 * ゲーム状態の更新ロジック(純粋ロジック層)。
 * DOM / Canvas / WebAudio に依存しない。描画・音声へは events キューで通知する。
 * 将来のオンライン化ではこのモジュールをサーバーへ移植する想定(仕様 §1)。
 */

import { BONUS, COMBO, FIELD, PLAYER, SPAWN, TIERS, type BonusEffectId, type Tier } from '../config';
import type { DifficultyDef } from './modes';
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
  | { type: 'kill'; zombieId: number; x: number; y: number; tier: Tier; gained: number }
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

/** かなに対してキー列を最初から入力してみる(全部受理されればセッションを返す) */
function replayKeys(kana: string, keys: string[]): TypingSession | null {
  const s = new TypingSession(kana);
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
  /** ロック(または重複候補)開始以降に受理されたキー列 */
  private typedSinceLock: string[] = [];
  /** 現在のターゲットに対して連続ミスになっているキー列(自動切替の判定用) */
  private missBuffer: string[] = [];

  constructor(
    difficulty: DifficultyDef,
    private readonly pool: WordPool,
    private readonly rng: () => number = Math.random,
  ) {
    this.difficulty = difficulty;
    this.duration = difficulty.duration;
  }

  /** 経過率 0〜1(空の色・時間バーに使う) */
  progressRatio(): number {
    return Math.min(1, this.time / this.duration);
  }

  accuracy(): number {
    const total = this.correctKeys + this.missKeys;
    return total === 0 ? 1 : this.correctKeys / total;
  }

  survivalTime(): number {
    return Math.min(this.time, this.duration);
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
    const regen =
      (SPAWN.budgetRegenStart +
        (SPAWN.budgetRegenEnd - SPAWN.budgetRegenStart) * this.progressRatio()) *
      this.difficulty.regenScale;
    this.budget += regen * dt;
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
    } else if (this.time >= this.duration) {
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
          this.typedSinceLock.push(key);
          this.missBuffer = [];
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
      this.typedSinceLock.push(key);
      this.missBuffer = [];
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
      this.registerMiss();
      return;
    }
    this.typedSinceLock = [key];
    this.missBuffer = [];
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

  /**
   * 自動ターゲット切替(ミス時)。
   * いま打っているキー列が別のゾンビの単語として正しい場合、そのゾンビへ
   * 入力進捗ごと乗り移る(例: 「おつかれ…」を打っていたつもりが実は
   * 「おつとめ…」だった場合、ミスにせず切り替える)。
   * - 文脈込み(ロック以降の受理キー + ミスキー列)が丸ごと通る → 即切替
   * - ミスキー列の末尾 2 打以上が通る → 切替(先頭に無関係なミスが
   *   混ざっていても、打ち直しの部分だけで判定する。1 打だけの誤爆は防止)
   */
  private tryAutoSwitch(key: string): boolean {
    this.missBuffer.push(key);
    const excluded = new Set<number>(this.candidateIds);
    if (this.targetId !== null) excluded.add(this.targetId);

    const ctxKeys = [...this.typedSinceLock, ...this.missBuffer];
    let best: { z: Zombie; s: TypingSession; weight: number } | null = null;
    for (const z of this.zombies) {
      if (excluded.has(z.id)) continue;
      // このゾンビに対する最良の解釈を求める
      let cand: { s: TypingSession; weight: number } | null = null;
      const full = replayKeys(z.word.kana, ctxKeys);
      if (full) {
        cand = { s: full, weight: 1000 + ctxKeys.length }; // 文脈込みは最優先
      } else {
        // ミス列の末尾一致(長いものを優先。1 打だけの誤爆は防止)
        for (let len = this.missBuffer.length; len >= 2; len--) {
          const s = replayKeys(z.word.kana, this.missBuffer.slice(-len));
          if (s) {
            cand = { s, weight: len };
            break;
          }
        }
      }
      if (!cand) continue;
      if (!best || cand.weight > best.weight || (cand.weight === best.weight && z.x < best.z.x)) {
        best = { z, s: cand.s, weight: cand.weight };
      }
    }
    if (!best) return false;

    best.z.session = best.s;
    this.targetId = best.z.id;
    this.candidateIds = [];
    this.typedSinceLock = [...best.s.typedRomaji()];
    this.missBuffer = [];
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
      this.typedSinceLock = [];
      this.missBuffer = [];
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
      this.typedSinceLock = [];
      this.missBuffer = [];
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
    this.events.push({ type: 'kill', zombieId: z.id, x: z.x, y: z.y, tier: z.tier, gained });

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
    return Math.min(
      this.difficulty.maxZombies,
      1 + Math.floor(this.time / this.difficulty.concurrentRampSec),
    );
  }

  private trySpawn(): void {
    if (this.zombies.length >= this.allowedConcurrent()) return;

    // 予算内で出せる Tier を重み付き抽選
    const options: { tier: Tier; weight: number }[] = [];
    for (const tier of [1, 2, 3] as Tier[]) {
      const rule = this.difficulty.tiers[tier];
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
      this.difficulty.tiers[tier].kanaRange,
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
      speed: TIERS[tier].speed * this.difficulty.speedScale,
      speedMultiplier: 1.0, // 「速いゾンビ」導入用パラメータ(仕様 §7)
      walkTime: this.rng() * 10,
      exclusive: picked.exclusive,
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
}
