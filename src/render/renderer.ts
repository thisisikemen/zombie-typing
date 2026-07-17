/**
 * Canvas 描画のメイン。ゲーム状態(core)を読み取って描くだけで、
 * 状態は一切変更しない。
 */

import {
  FIELD,
  HUD_COLORS,
  KEYGUIDE,
  LABEL_COLORS,
  LASER,
  PLAYER,
  SOLDIER,
  TIERS,
  ZOMBIE_ANIM,
} from '../config';
import type { Game, GameEvent, Zombie } from '../core/game';
import type { Assets } from './assets';
import { Effects } from './effects';
import { skyAt } from './sky';

export interface Scene {
  game: Game | null;
  /** カウントダウン表示(main が文言と進行度を渡す) */
  countdown: { text: string; t: number } | null;
  showRomaji: boolean;
  /** タイトル裏のデモ中は HUD を消す */
  demo: boolean;
  /** 終了演出(リザルトへ移る前のフェード) */
  endFade: { kind: 'clear' | 'gameover'; t: number } | null;
}

interface Star {
  x: number;
  y: number;
  size: number;
  phase: number;
}

const W = FIELD.width;
const H = FIELD.height;
const HORIZON = FIELD.horizonY;

/** 撃破時の血飛沫・肉片パレット */
const GORE_PALETTE = ['#8a1414', '#b32020', '#5a0d0d', '#6b1a1a', '#9a9a8a'];

export class Renderer {
  readonly effects = new Effects();

  private ctx: CanvasRenderingContext2D;
  private time = 0;
  private aimAngle = 0;
  private laserPulse = 0;
  private lineFlash = 0;
  private muzzleFlash = 0;
  private zombieFlash = new Map<number, number>();
  private stars: Star[] = [];
  private displayHp = PLAYER.maxHp;
  private displayEnergy = 0;
  private comboPop = 0;
  private lastCombo = 0;
  private sparkTimer = 0;
  /** 撃破直後に一瞬「全部赤」の単語を残す(倒した!の気持ちよさ用) */
  private killLabels: { x: number; y: number; kana: string; t: number }[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly assets: Assets,
  ) {
    this.ctx = canvas.getContext('2d')!;
    let seed = 12345;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let i = 0; i < 150; i++) {
      this.stars.push({
        x: rng() * W,
        y: rng() * (HORIZON - 40),
        size: rng() < 0.85 ? 1.2 : 2.2,
        phase: rng() * Math.PI * 2,
      });
    }
    this.resize();
  }

  /** 新しいゲーム開始時に HUD 内部状態をリセットする */
  resetForNewGame(): void {
    this.displayHp = PLAYER.maxHp;
    this.displayEnergy = 0;
    this.lastCombo = 0;
    this.comboPop = 0;
    this.zombieFlash.clear();
    this.laserPulse = 0;
    this.lineFlash = 0;
    this.muzzleFlash = 0;
  }

  resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
  }

  /** ゲームイベントを演出に反映する(音は main 側で処理) */
  handleEvents(game: Game, events: GameEvent[]): void {
    for (const ev of events) {
      switch (ev.type) {
        case 'shot': {
          this.laserPulse = 1;
          this.muzzleFlash = 1;
          this.zombieFlash.set(ev.zombieId, 0.12);
          const z = game.getZombie(ev.zombieId);
          if (z) this.effects.spark(z.x, this.chestY(z), '#ff8a70', 3, 160);
          break;
        }
        case 'miss':
          this.effects.shake(3, 0.08);
          break;
        case 'kill': {
          this.effects.explosion(ev.x, ev.y, 0.8 + ev.tier * 0.35, GORE_PALETTE);
          this.effects.floatText(ev.x, ev.y - 150, `+${ev.gained}`, '#ffd24a');
          this.effects.shake(3 + ev.tier * 2, 0.18);
          // 最後の一文字まで赤くなった単語を一瞬だけ残す
          const h = ZOMBIE_ANIM.baseHeight * TIERS[ev.tier].scale;
          this.killLabels.push({ x: ev.x, y: Math.max(164, ev.y - h - 22), kana: ev.kana, t: 0 });
          break;
        }
        case 'autokill':
          this.effects.explosion(ev.x, ev.y, 0.7 + ev.tier * 0.3, ['#9ad0ff', '#5a8aff', '#ffffff']);
          break;
        case 'crossed':
          this.effects.flashDamage();
          this.effects.shake(12, 0.3);
          this.lineFlash = 1;
          if (ev.damage > 0) {
            this.effects.floatText(FIELD.lineX + 70, ev.y - 120, `-${ev.damage}`, '#ff4444', 34);
          }
          break;
        case 'bonus':
          this.effects.showBanner(ev.text);
          break;
        default:
          break;
      }
    }
  }

  render(scene: Scene, dt: number): void {
    this.time += dt;
    this.laserPulse = Math.max(0, this.laserPulse - dt / LASER.pulseTime);
    this.muzzleFlash = Math.max(0, this.muzzleFlash - dt * 10);
    this.lineFlash = Math.max(0, this.lineFlash - dt * 2);
    for (const [id, t] of this.zombieFlash) {
      if (t - dt <= 0) this.zombieFlash.delete(id);
      else this.zombieFlash.set(id, t - dt);
    }
    for (const k of this.killLabels) k.t += dt;
    this.killLabels = this.killLabels.filter((k) => k.t < 0.32);
    this.effects.update(dt);

    const ctx = this.ctx;
    const scaleX = this.canvas.width / W;
    const scaleY = this.canvas.height / H;
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);

    const game = scene.game;
    const progress = game ? game.skyProgressRatio() : 0.35;

    const [sx, sy] = this.effects.shakeOffset();
    ctx.save();
    ctx.translate(sx, sy);

    const bg =
      game?.difficulty.backgroundId === 'endless'
        ? this.assets.bgEndless ?? this.assets.bg
        : this.assets.bg;
    if (bg) {
      this.drawImageBackdrop(ctx, progress, bg);
    } else {
      this.drawSky(ctx, progress);
      ctx.drawImage(this.assets.bgFallback, 0, 0, W, H);
    }
    this.drawDefenseLine(ctx);

    if (game) {
      this.updateAim(game, dt);

      // 奥行き順(y 昇順)にゾンビを描画
      const sorted = [...game.zombies].sort((a, b) => a.y - b.y);
      for (const z of sorted) this.drawZombie(ctx, z);

      this.drawSoldier(ctx);
      this.drawLaser(ctx, game);
      this.effects.drawWorld(ctx);

      // ラベルは最前面(ロックオン中のものを最後に)
      for (const z of sorted) {
        if (z.id !== game.targetId) this.drawLabel(ctx, game, z, scene.showRomaji);
      }
      const target = game.targetId !== null ? game.getZombie(game.targetId) : undefined;
      if (target) this.drawLabel(ctx, game, target, scene.showRomaji);
      this.drawKillLabels(ctx);

      if (!scene.demo) {
        this.drawHud(ctx, game);
        if (game.difficulty.practice) {
          // ベーシック: e-typing 風のキーボード+指ガイド
          this.drawKeyboardGuide(ctx, game);
        } else {
          // 下部の操作ヒント(邪魔にならない薄さで)
          ctx.save();
          ctx.textAlign = 'center';
          ctx.font = '600 15px "Hiragino Kaku Gothic ProN", sans-serif';
          ctx.fillStyle = 'rgba(232, 228, 216, 0.48)';
          ctx.fillText('Space / Enter: ターゲット切り替え(解除)　　Esc: 一時停止', W / 2 + 60, H - 14);
          ctx.restore();
        }
      }
    } else {
      this.drawSoldier(ctx);
    }

    ctx.restore();

    if (game && !scene.demo) this.drawLowHpVignette(ctx, game);
    this.effects.drawScreen(ctx, W, H);
    if (scene.countdown) this.drawCountdown(ctx, scene.countdown);
    if (scene.endFade) this.drawEndFade(ctx, scene.endFade);
  }

  // ---------- 空・背景 ----------

  /**
   * 背景画像モード: 画像自体は「深夜」の絵として扱い、
   * 序盤は日没の残光を、終盤は夜明けの白みと朝焼けを重ねて
   * 時間経過を作る(ベイクされた月・星を殺さない)。
   */
  private drawImageBackdrop(
    ctx: CanvasRenderingContext2D,
    progress: number,
    bg: HTMLImageElement,
  ): void {
    ctx.drawImage(bg, 0, 0, W, H);

    // 序盤: 日没の残光が地平線に残る → 消えていく
    const sunset = Math.max(0, 1 - progress / 0.22);
    if (sunset > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const g = ctx.createLinearGradient(0, HORIZON - 220, 0, HORIZON + 40);
      g.addColorStop(0, 'rgba(255,110,40,0)');
      g.addColorStop(1, `rgba(255,110,40,${0.4 * sunset})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, HORIZON + 40);
      ctx.restore();
    }

    // コード側の星も薄く重ねる(明滅のライブ感)
    const dawn = Math.max(0, (progress - 0.78) / 0.22);
    this.drawStars(ctx, 0.4 * (1 - dawn) * (1 - sunset * 0.6));

    // 終盤: 空が白み、朝焼けが昇る
    if (dawn > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const g1 = ctx.createLinearGradient(0, 0, 0, HORIZON + 90);
      g1.addColorStop(0, `rgba(96,126,178,${0.5 * dawn})`);
      g1.addColorStop(1, `rgba(255,170,110,${0.42 * dawn})`);
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, W, HORIZON + 90);
      const sun = ctx.createRadialGradient(W * 0.62, HORIZON + 6, 8, W * 0.62, HORIZON + 6, 90 + 480 * dawn);
      sun.addColorStop(0, `rgba(255,230,180,${0.8 * dawn})`);
      sun.addColorStop(1, 'rgba(255,190,120,0)');
      ctx.fillStyle = sun;
      ctx.fillRect(0, 0, W, H);
      // 地面もわずかに温める
      ctx.fillStyle = `rgba(255,190,130,${0.12 * dawn})`;
      ctx.fillRect(0, HORIZON, W, H - HORIZON);
      ctx.restore();
    }
  }

  /** フォールバック背景モード: コード描画のグラデーション空 */
  private drawSky(ctx: CanvasRenderingContext2D, progress: number): void {
    const sky = skyAt(progress);
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.75);
    g.addColorStop(0, sky.top);
    g.addColorStop(1, sky.bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    this.drawStars(ctx, sky.starAlpha * 0.85);

    // 月(夜間に弧を描いて移動)
    if (sky.starAlpha > 0.05) {
      const mx = W * (0.86 - progress * 0.62);
      const my = 170 - Math.sin(progress * Math.PI) * 60;
      ctx.save();
      ctx.globalAlpha = Math.min(1, sky.starAlpha + 0.15);
      ctx.fillStyle = '#f5f0dc';
      ctx.shadowColor = '#f5f0dc';
      ctx.shadowBlur = 40;
      ctx.beginPath();
      ctx.arc(mx, my, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(20,22,40,0.85)';
      ctx.beginPath();
      ctx.arc(mx + 13, my - 8, 29, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 夜明けの太陽の気配(終盤)
    if (progress > 0.88) {
      const t = (progress - 0.88) / 0.12;
      const g2 = ctx.createRadialGradient(W * 0.62, HORIZON, 10, W * 0.62, HORIZON, 420);
      g2.addColorStop(0, `rgba(255, 200, 120, ${0.75 * t})`);
      g2.addColorStop(1, 'rgba(255, 200, 120, 0)');
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, W, H);
    }
  }

  private drawStars(ctx: CanvasRenderingContext2D, alpha: number): void {
    if (alpha <= 0.01) return;
    ctx.fillStyle = '#ffffff';
    for (const s of this.stars) {
      const tw = 0.55 + 0.45 * Math.sin(this.time * 1.6 + s.phase);
      ctx.globalAlpha = alpha * tw;
      ctx.fillRect(s.x, s.y, s.size, s.size);
    }
    ctx.globalAlpha = 1;
  }

  private drawDefenseLine(ctx: CanvasRenderingContext2D): void {
    const x = FIELD.lineX;
    const pulse = 0.55 + 0.2 * Math.sin(this.time * 2.6);
    // 通常は青白い光、突破された瞬間は赤く明滅する
    const f = Math.min(1, this.lineFlash);
    const r = Math.round(190 + (255 - 190) * f);
    const g = Math.round(225 + (60 - 225) * f);
    const b = Math.round(255 + (48 - 255) * f);
    ctx.save();
    ctx.strokeStyle = `rgba(${r},${g},${b},${Math.min(1, pulse + f * 0.4)})`;
    ctx.shadowColor = `rgba(${r},${g},${b},0.8)`;
    ctx.shadowBlur = 10 + f * 14;
    ctx.lineWidth = 3.2 + f * 4;
    ctx.setLineDash([16, 12]);
    ctx.lineDashOffset = -this.time * 26;
    ctx.beginPath();
    ctx.moveTo(x, 108);
    ctx.lineTo(x, H - 60);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;

    // ラインの札(防衛ライン)
    const pw = 152;
    const ph = 36;
    const py = H - 52;
    ctx.fillStyle = 'rgba(14, 13, 12, 0.88)';
    roundRect(ctx, x - pw / 2, py, pw, ph, 5);
    ctx.fill();
    ctx.strokeStyle = '#6a675f';
    ctx.lineWidth = 2;
    roundRect(ctx, x - pw / 2, py, pw, ph, 5);
    ctx.stroke();
    // 小さな盾アイコン
    const sx = x + 46;
    const sy = py + 9;
    ctx.fillStyle = '#b9b5a9';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + 12, sy);
    ctx.lineTo(sx + 12, sy + 10);
    ctx.lineTo(sx + 6, sy + 18);
    ctx.lineTo(sx, sy + 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#d8d4c8';
    ctx.font = '700 18px "Hiragino Kaku Gothic ProN", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('防衛ライン', x - 10, py + 26);
    ctx.restore();
  }

  // ---------- 兵士・レーザー ----------

  private bodyMetrics() {
    const img = this.assets.soldierBody;
    const iw = (img as HTMLImageElement).naturalWidth || (img as HTMLCanvasElement).width;
    const ih = (img as HTMLImageElement).naturalHeight || (img as HTMLCanvasElement).height;
    const h = SOLDIER.bodyHeight;
    const w = h * (iw / ih);
    return { w, h };
  }

  /** 肩ピボットのワールド座標 */
  private shoulderPos(): [number, number] {
    const { w, h } = this.bodyMetrics();
    return [
      FIELD.soldierX - w / 2 + w * SOLDIER.shoulderRatioX,
      FIELD.soldierY - h + h * SOLDIER.shoulderRatioY,
    ];
  }

  /** 銃口のワールド座標(腕の回転を反映) */
  private muzzlePos(): [number, number] {
    const img = this.assets.soldierArms;
    const iw = (img as HTMLImageElement).naturalWidth || (img as HTMLCanvasElement).width;
    const ih = (img as HTMLImageElement).naturalHeight || (img as HTMLCanvasElement).height;
    const ah = SOLDIER.armsHeight;
    const aw = ah * (iw / ih);
    const px = SOLDIER.armsPivotRatioX * aw;
    const py = SOLDIER.armsPivotRatioY * ah;
    const mx = SOLDIER.muzzleRatioX * aw - px;
    const my = SOLDIER.muzzleRatioY * ah - py;
    const [shx, shy] = this.shoulderPos();
    const cos = Math.cos(this.aimAngle);
    const sin = Math.sin(this.aimAngle);
    return [shx + mx * cos - my * sin, shy + mx * sin + my * cos];
  }

  private chestY(z: Zombie): number {
    return z.y - ZOMBIE_ANIM.baseHeight * TIERS[z.tier].scale * 0.55;
  }

  private updateAim(game: Game, dt: number): void {
    let desired: number;
    const target =
      (game.targetId !== null ? game.getZombie(game.targetId) : undefined) ??
      this.nearestCandidate(game);
    if (target) {
      const [shx, shy] = this.shoulderPos();
      desired = Math.atan2(this.chestY(target) - shy, target.x - shx);
      const k = Math.min(1, LASER.lockLerp * dt);
      this.aimAngle += (desired - this.aimAngle) * k;
    } else {
      // アイドル時: sin 波でゆっくりスイープ
      desired = Math.sin(this.time * LASER.idleSweepSpeed) * (LASER.idleSweepDeg * Math.PI / 180);
      const k = Math.min(1, 3 * dt);
      this.aimAngle += (desired - this.aimAngle) * k;
    }
  }

  private nearestCandidate(game: Game): Zombie | undefined {
    let best: Zombie | undefined;
    for (const id of game.candidateIds) {
      const z = game.getZombie(id);
      if (z && (!best || z.x < best.x)) best = z;
    }
    return best;
  }

  private drawSoldier(ctx: CanvasRenderingContext2D): void {
    const { w, h } = this.bodyMetrics();
    ctx.imageSmoothingEnabled = false;

    // 影
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(FIELD.soldierX, FIELD.soldierY + 4, w * 0.55, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.drawImage(this.assets.soldierBody, FIELD.soldierX - w / 2, FIELD.soldierY - h, w, h);

    // 腕 + 銃(肩ピボットで回転)
    const img = this.assets.soldierArms;
    const iw = (img as HTMLImageElement).naturalWidth || (img as HTMLCanvasElement).width;
    const ih = (img as HTMLImageElement).naturalHeight || (img as HTMLCanvasElement).height;
    const ah = SOLDIER.armsHeight;
    const aw = ah * (iw / ih);
    const [shx, shy] = this.shoulderPos();
    ctx.save();
    ctx.translate(shx, shy);
    ctx.rotate(this.aimAngle);
    ctx.drawImage(img, -SOLDIER.armsPivotRatioX * aw, -SOLDIER.armsPivotRatioY * ah, aw, ah);
    ctx.restore();

    // マズルフラッシュ
    if (this.muzzleFlash > 0) {
      const [mx, my] = this.muzzlePos();
      ctx.save();
      ctx.globalAlpha = this.muzzleFlash;
      ctx.fillStyle = '#ffe9a0';
      ctx.beginPath();
      ctx.arc(mx, my, 6 + this.muzzleFlash * 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.imageSmoothingEnabled = true;
  }

  private drawLaser(ctx: CanvasRenderingContext2D, game: Game): void {
    const [mx, my] = this.muzzlePos();
    const target =
      (game.targetId !== null ? game.getZombie(game.targetId) : undefined) ??
      this.nearestCandidate(game);

    let ex: number;
    let ey: number;
    if (target) {
      const dist = Math.hypot(target.x - mx, this.chestY(target) - my);
      ex = mx + Math.cos(this.aimAngle) * dist;
      ey = my + Math.sin(this.aimAngle) * dist;
    } else {
      ex = mx + Math.cos(this.aimAngle) * 1900;
      ey = my + Math.sin(this.aimAngle) * 1900;
    }

    const flicker = 0.72 + 0.28 * Math.sin(this.time * 47);
    const pulse = this.laserPulse;

    ctx.save();
    ctx.lineCap = 'round';
    // 外側グロー
    ctx.globalAlpha = 0.22 * flicker + pulse * 0.25;
    ctx.strokeStyle = LASER.color;
    ctx.lineWidth = 9 + pulse * 10;
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    // 本体
    ctx.globalAlpha = 0.75 * flicker + pulse * 0.25;
    ctx.lineWidth = 2.6 + pulse * 4;
    ctx.shadowColor = LASER.color;
    ctx.shadowBlur = 12 + pulse * 16;
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    // コア
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = LASER.coreColor;
    ctx.lineWidth = 1 + pulse * 1.6;
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    // ロックオン中はレーザー先端にヒットスパーク
    if (target) {
      ctx.globalAlpha = 0.8 * flicker;
      ctx.fillStyle = '#ffb0a0';
      ctx.beginPath();
      ctx.arc(ex, ey, 4 + pulse * 5, 0, Math.PI * 2);
      ctx.fill();
      this.sparkTimer += 1;
      if (this.sparkTimer % 5 === 0) {
        this.effects.spark(ex, ey, '#ff6a50', 2, 120);
      }
    }
    ctx.restore();
  }

  // ---------- ゾンビ ----------

  private drawZombie(ctx: CanvasRenderingContext2D, z: Zombie): void {
    const frames = this.assets.zombies[z.tier];
    const frame = frames[Math.floor(z.walkTime * ZOMBIE_ANIM.walkFps) % frames.length];
    const iw = (frame as HTMLImageElement).naturalWidth || (frame as HTMLCanvasElement).width;
    const ih = (frame as HTMLImageElement).naturalHeight || (frame as HTMLCanvasElement).height;
    const h = ZOMBIE_ANIM.baseHeight * TIERS[z.tier].scale;
    const w = h * (iw / ih);
    const bounce = Math.sin(z.walkTime * Math.PI * 2 * ZOMBIE_ANIM.bounceFreq) * ZOMBIE_ANIM.bounceAmp;

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // 影
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(z.x, z.y + 4, w * 0.42, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    const flash = this.zombieFlash.get(z.id) ?? 0;
    if (flash > 0) ctx.filter = 'brightness(1.65) saturate(1.2)';
    if (z.tier === 3) {
      // Tier3 は禍々しいオーラ(控えめに)
      ctx.shadowColor = 'rgba(255, 30, 20, 0.35)';
      ctx.shadowBlur = 16;
    }
    ctx.drawImage(frame, z.x - w / 2, z.y - h + bounce, w, h);
    ctx.restore();
  }

  /**
   * 頭上ラベル(枠なしの縁取り文字・3 行構成)。
   *   上段: 漢字などの表示文字列(小・ルビの逆で漢字が上)
   *   中段: ひらがな(メイン。タイプ済み=赤 / 重複候補=黄。ロックオン中は赤下線)
   *   下段: ローマ字ガイド(ロックオン中・設定オン時)
   */
  private drawLabel(ctx: CanvasRenderingContext2D, game: Game, z: Zombie, showRomaji: boolean): void {
    const locked = game.targetId === z.id;
    const duplicate = game.candidateIds.includes(z.id);
    const h = ZOMBIE_ANIM.baseHeight * TIERS[z.tier].scale;

    ctx.save();
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.lineJoin = 'round';

    const kanaSize = locked ? 34 : 27;
    const kanaFont = `900 ${kanaSize}px "Hiragino Kaku Gothic ProN", sans-serif`;
    const hasKanji = z.word.display !== z.session.kana;

    ctx.font = kanaFont;
    const kanaW = ctx.measureText(z.session.kana).width;

    let cx = z.x;
    cx = Math.max(20 + kanaW / 2, Math.min(W - 20 - kanaW / 2, cx));
    let ty = z.y - h - 22; // 中段(かな)のベースライン
    ty = Math.max(hasKanji ? 164 : 140, ty);
    const left = cx - kanaW / 2;

    // --- 上段: 漢字(表示文字列) ---
    if (hasKanji) {
      ctx.font = '800 18px "Hiragino Kaku Gothic ProN", sans-serif';
      const dw = ctx.measureText(z.word.display).width;
      const dx = Math.max(12, Math.min(W - 12 - dw, cx - dw / 2));
      const dy = ty - kanaSize - 8;
      ctx.strokeStyle = LABEL_COLORS.outline;
      ctx.lineWidth = 5;
      ctx.strokeText(z.word.display, dx, dy);
      ctx.fillStyle = 'rgba(232, 228, 216, 0.92)';
      ctx.fillText(z.word.display, dx, dy);
    }

    // --- 中段: ひらがな(タイプ済みを塗り分け) ---
    // 撃たれている間(正打直後)は小さく揺れる
    const flash = this.zombieFlash.get(z.id) ?? 0;
    const shake = locked && flash > 0 ? flash / 0.12 : 0;
    const sx = Math.sin(this.time * 91) * 3.4 * shake;
    const sy = Math.cos(this.time * 73) * 2.4 * shake;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.font = kanaFont;
    ctx.strokeStyle = LABEL_COLORS.outline;
    ctx.lineWidth = 7;
    ctx.strokeText(z.session.kana, left, ty);
    const chars = [...z.session.kana];
    // 打ちかけのかなも赤くする(反応の速さ優先)
    const done = z.session.activeKanaCount();
    let x = left;
    for (let i = 0; i < chars.length; i++) {
      ctx.fillStyle =
        i < done
          ? LABEL_COLORS.typed
          : duplicate
            ? LABEL_COLORS.duplicate
            : LABEL_COLORS.untyped;
      ctx.fillText(chars[i], x, ty);
      x += ctx.measureText(chars[i]).width;
    }

    // ロックオン中: 赤い下線
    if (locked) {
      ctx.fillStyle = LABEL_COLORS.underline;
      ctx.shadowColor = LABEL_COLORS.underline;
      ctx.shadowBlur = 8;
      ctx.fillRect(left - 4, ty + 8, kanaW + 8, 5);
      ctx.shadowBlur = 0;
    }
    ctx.restore();

    // --- 下段: ローマ字ガイド ---
    // ローマ字はゾンビの HP: 残り=緑 → 打った分=赤。
    // ロックオン中に加え、入力進捗のあるゾンビにも常時表示する
    // (どこまで打ったか一目で分かるように)
    const typedR = z.session.typedRomaji();
    if (showRomaji && (locked || typedR.length > 0)) {
      const remainR = z.session.remainingRomaji();
      ctx.font = `800 ${locked ? 24 : 20}px ui-monospace, Menlo, monospace`;
      const rw = ctx.measureText(typedR + remainR).width;
      let rx = cx - rw / 2;
      const ry = ty + (locked ? 42 : 36);
      ctx.strokeStyle = LABEL_COLORS.outline;
      ctx.lineWidth = locked ? 7 : 6;
      ctx.strokeText(typedR + remainR, rx, ry);
      ctx.fillStyle = LABEL_COLORS.romajiTyped;
      ctx.fillText(typedR, rx, ry);
      rx += ctx.measureText(typedR).width;
      ctx.fillStyle = LABEL_COLORS.romajiRemaining;
      ctx.fillText(remainR, rx, ry);
    }

    ctx.restore();
  }

  /** 撃破直後の「全部赤の単語」を一瞬残して消す */
  private drawKillLabels(ctx: CanvasRenderingContext2D): void {
    for (const k of this.killLabels) {
      const p = k.t / 0.32; // 0→1
      const alpha = 1 - p * p;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.lineJoin = 'round';
      ctx.font = '900 34px "Hiragino Kaku Gothic ProN", sans-serif';
      const w = ctx.measureText(k.kana).width;
      const cx = Math.max(20 + w / 2, Math.min(W - 20 - w / 2, k.x));
      const y = k.y - 14 * p; // ふわっと上がりながら消える
      ctx.strokeStyle = LABEL_COLORS.outline;
      ctx.lineWidth = 7;
      ctx.strokeText(k.kana, cx - w / 2, y);
      ctx.fillStyle = LABEL_COLORS.typed;
      ctx.fillText(k.kana, cx - w / 2, y);
      ctx.fillStyle = LABEL_COLORS.underline;
      ctx.fillRect(cx - w / 2 - 4, y + 8, w + 8, 5);
      ctx.restore();
    }
  }

  // ---------- HUD ----------

  /** 上部フルワイドの HUD バー(イメージ集準拠) */
  private drawHud(ctx: CanvasRenderingContext2D, game: Game): void {
    const BAR_H = 96;
    ctx.save();

    // バー背景
    const bg = ctx.createLinearGradient(0, 0, 0, BAR_H);
    bg.addColorStop(0, 'rgba(16, 14, 12, 0.97)');
    bg.addColorStop(1, 'rgba(9, 8, 7, 0.94)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, BAR_H);
    ctx.fillStyle = 'rgba(90, 82, 70, 0.65)';
    ctx.fillRect(0, BAR_H - 2, W, 2);

    // ロゴ + 難易度サブタイトル(一目でどの難易度か分かるように)
    let logoRight = 224;
    if (this.assets.logo) {
      const lh = 54;
      const lw = lh * (this.assets.logo.naturalWidth / this.assets.logo.naturalHeight);
      ctx.drawImage(this.assets.logo, 18, (BAR_H - lh) / 2 - 4, lw, lh);
      logoRight = 18 + lw;
    } else {
      ctx.fillStyle = '#d8d4c8';
      ctx.font = '900 26px "Hiragino Kaku Gothic ProN", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('ゾンビタイピング', 20, 54);
    }
    ctx.save();
    ctx.textAlign = 'right';
    ctx.font = '900 19px "Hiragino Kaku Gothic ProN", sans-serif';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.lineWidth = 5;
    ctx.strokeText(game.difficulty.label, logoRight + 4, BAR_H - 10);
    ctx.fillStyle = game.difficulty.color;
    ctx.shadowColor = `${game.difficulty.color}88`;
    ctx.shadowBlur = 10;
    ctx.fillText(game.difficulty.label, logoRight + 4, BAR_H - 10);
    ctx.restore();

    const boxY = 14;
    const boxH = BAR_H - 28;
    const panel = (x: number, w: number) => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
      roundRect(ctx, x, boxY, w, boxH, 5);
      ctx.fill();
      ctx.strokeStyle = 'rgba(122, 112, 96, 0.55)';
      ctx.lineWidth = 1.5;
      roundRect(ctx, x, boxY, w, boxH, 5);
      ctx.stroke();
    };
    const label = (text: string, x: number) => {
      ctx.fillStyle = 'rgba(216, 212, 200, 0.72)';
      ctx.font = '700 15px "Hiragino Kaku Gothic ProN", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(text, x, boxY + 22);
    };

    // --- HP ---
    panel(268, 420);
    label('HP', 282);
    this.displayHp += (game.hp - this.displayHp) * 0.15;
    this.displayEnergy += (game.energy - this.displayEnergy) * 0.15;
    const hpRatio = Math.max(0, this.displayHp / PLAYER.maxHp);
    const energyRatio = Math.max(0, this.displayEnergy / PLAYER.maxHp);
    const hpColor = hpRatio > 0.5 ? HUD_COLORS.hpHigh : hpRatio > 0.25 ? HUD_COLORS.hpMid : HUD_COLORS.hpLow;
    const barX = 318;
    const barW = 250;
    const barY = boxY + 22;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    roundRect(ctx, barX, barY, barW, 24, 4);
    ctx.fill();
    // エナジー(水色)が左から重なり、被弾時はここから先に減る。緑(HP)はその後ろ
    const innerW = barW - 4;
    const eW = Math.min(innerW, innerW * energyRatio);
    if (eW > 1) {
      const eg = ctx.createLinearGradient(barX, 0, barX + barW, 0);
      eg.addColorStop(0, HUD_COLORS.energy);
      eg.addColorStop(1, '#9ae4f8');
      ctx.fillStyle = eg;
      roundRect(ctx, barX + 2, barY + 2, eW, 20, 3);
      ctx.fill();
    }
    if (hpRatio > 0.01) {
      const gW = Math.min(innerW - eW, innerW * hpRatio);
      if (gW > 1) {
        const hg = ctx.createLinearGradient(barX, 0, barX + barW, 0);
        hg.addColorStop(0, hpColor);
        hg.addColorStop(1, hpRatio > 0.5 ? '#b8e04a' : hpColor);
        ctx.fillStyle = hg;
        roundRect(ctx, barX + 2 + eW, barY + 2, gW, 20, 3);
        ctx.fill();
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    roundRect(ctx, barX, barY, barW, 24, 4);
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.font = '900 30px sans-serif';
    ctx.fillStyle = hpColor;
    ctx.fillText(`${Math.max(0, Math.ceil(game.hp))}`, 648, boxY + 44);
    ctx.font = '700 16px sans-serif';
    ctx.fillStyle = 'rgba(216,212,200,0.6)';
    ctx.fillText('/100', 682, boxY + 44);
    // エナジー残量(水色の数値)
    if (game.energy > 0) {
      ctx.fillStyle = HUD_COLORS.energy;
      ctx.font = '700 13px sans-serif';
      ctx.fillText(`エナジー +${Math.ceil(game.energy)}`, 682, boxY + 60);
    }
    // シールド残り
    if (game.shieldTime > 0) {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#9ad0ff';
      ctx.font = '700 13px sans-serif';
      ctx.fillText(`軽減 ${game.shieldTime.toFixed(0)}s`, 282, boxY + 60);
    }

    // --- スコア ---
    panel(708, 210);
    label('スコア', 722);
    ctx.textAlign = 'right';
    ctx.font = '900 32px sans-serif';
    ctx.fillStyle = HUD_COLORS.text;
    ctx.fillText(game.score.toLocaleString(), 902, boxY + 52);

    // --- コンボ ---
    panel(938, 190);
    label('コンボ', 952);
    if (game.combo !== this.lastCombo) {
      if (game.combo > this.lastCombo) this.comboPop = 1;
      this.lastCombo = game.combo;
    }
    this.comboPop = Math.max(0, this.comboPop - 0.08);
    ctx.save();
    ctx.translate(1074, boxY + 48);
    ctx.scale(1 + this.comboPop * 0.25, 1 + this.comboPop * 0.25);
    ctx.textAlign = 'right';
    ctx.font = '900 34px sans-serif';
    ctx.fillStyle = game.combo > 0 ? '#ffd24a' : 'rgba(216,212,200,0.5)';
    ctx.fillText(`${game.combo}`, 0, 0);
    ctx.restore();
    if (game.combo > 0) {
      ctx.textAlign = 'left';
      ctx.font = '900 12px sans-serif';
      ctx.fillStyle = '#ffd24a';
      ctx.fillText('COMBO!', 1082, boxY + 48);
      ctx.fillRect(1006, boxY + 56, 70, 3);
    }

    // --- 倒した数 ---
    panel(1148, 176);
    label('倒した数', 1162);
    ctx.textAlign = 'right';
    ctx.font = '900 32px sans-serif';
    ctx.fillStyle = HUD_COLORS.text;
    ctx.fillText(`${game.kills}`, 1282, boxY + 52);
    ctx.font = '700 16px sans-serif';
    ctx.fillStyle = 'rgba(216,212,200,0.6)';
    ctx.fillText('体', 1306, boxY + 52);

    // --- 残り時間 ---
    panel(1344, 240);
    ctx.textAlign = 'left';
    ctx.font = '700 15px "Hiragino Kaku Gothic ProN", sans-serif';
    ctx.fillStyle = 'rgba(216,212,200,0.72)';
    ctx.fillText(game.isEndless() ? '生存時間:' : '残り時間:', 1358, boxY + 22);
    ctx.fillStyle = '#ffab4a';
    ctx.fillText(
      game.isPractice() ? '練習し放題' : game.isEndless() ? '夜は明けない' : '夜明けまで',
      1432,
      boxY + 22,
    );
    // 進行バー(青)
    const tbX = 1358;
    const tbW = 118;
    const tbY = boxY + 34;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    roundRect(ctx, tbX, tbY, tbW, 12, 3);
    ctx.fill();
    const p = game.isPractice()
      ? 0
      : game.isEndless()
        ? (game.time % 60) / 60
        : game.progressRatio();
    if (p > 0.01) {
      const tg = ctx.createLinearGradient(tbX, 0, tbX + tbW, 0);
      tg.addColorStop(0, '#2a72c8');
      tg.addColorStop(1, '#9ad0ff');
      ctx.fillStyle = tg;
      roundRect(ctx, tbX + 1, tbY + 1, (tbW - 2) * p, 10, 2);
      ctx.fill();
    }
    const displayTime = game.isEndless() ? game.time : Math.max(0, game.duration - game.time);
    const mm = Math.floor(displayTime / 60);
    const ss = Math.floor(displayTime % 60);
    ctx.textAlign = 'right';
    ctx.font = '900 30px ui-monospace, Menlo, monospace';
    ctx.fillStyle = HUD_COLORS.text;
    // 練習モードは時間無制限なので --:-- 表示
    const timeText = game.isPractice()
      ? '--:--'
      : `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    ctx.fillText(timeText, 1568, boxY + 50);

    // 練習で五十音を一周したら、終了方法をさりげなく案内する
    if (game.isPractice() && game.practiceLooped) {
      ctx.textAlign = 'center';
      ctx.font = '700 18px "Hiragino Kaku Gothic ProN", sans-serif';
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.lineWidth = 4;
      ctx.strokeText('五十音を一周! 終了する場合は ESC', W / 2, 108);
      ctx.fillStyle = 'rgba(232, 228, 216, 0.9)';
      ctx.fillText('五十音を一周! 終了する場合は ESC', W / 2, 108);
    }

    ctx.restore();
  }

  /**
   * 低 HP 時の赤いビネット(FPS の被弾視界風)。
   * HP 50% から徐々に画面端が赤くなり、25% 以下では鼓動のように明滅する。
   */
  private drawLowHpVignette(ctx: CanvasRenderingContext2D, game: Game): void {
    const ratio = Math.max(0, game.hp / PLAYER.maxHp);
    if (ratio >= 0.5) return;
    const t = 1 - ratio / 0.5; // 0(HP50%) → 1(HP0)
    const pulse = ratio < 0.25 ? (0.5 + 0.5 * Math.sin(this.time * 4.6)) * 0.12 : 0;
    const alpha = Math.min(0.55, 0.4 * t + pulse);
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.34, W / 2, H / 2, H * 0.82);
    g.addColorStop(0, 'rgba(140, 8, 8, 0)');
    g.addColorStop(0.7, `rgba(140, 8, 8, ${alpha * 0.45})`);
    g.addColorStop(1, `rgba(120, 4, 4, ${alpha})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  /**
   * ベーシック用のキーボード+指ガイド(e-typing 風)。
   * 次に打つキーと担当の指をオレンジで示す。ゾンビはこのパネルより上を歩く。
   */
  private drawKeyboardGuide(ctx: CanvasRenderingContext2D, game: Game): void {
    const K = KEYGUIDE.keySize;
    const G = KEYGUIDE.keyGap;
    const rows: string[][] = [
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '^'],
      ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '@', '['],
      ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', ':', ']'],
      ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/'],
    ];
    const rowOffsets = [0, 22, 34, 58];

    // 次に打つキー(ロックオン中 or 一番手前のゾンビ)
    const target =
      (game.targetId !== null ? game.getZombie(game.targetId) : undefined) ??
      [...game.zombies].sort((a, b) => a.x - b.x)[0];
    const nextRaw = target?.session.remainingRomaji()[0] ?? null;
    // 記号はシフトが要る: ! = Shift+1(右シフト) / ? = Shift+/(左シフト)
    let nextKey = nextRaw;
    let shiftSide: 'left' | 'right' | null = null;
    if (nextRaw === '!') {
      nextKey = '1';
      shiftSide = 'right';
    } else if (nextRaw === '?') {
      nextKey = '/';
      shiftSide = 'left';
    }

    const rowW = 12 * K + 11 * G;
    const panelW = rowW + 110;
    const panelX = W / 2 - panelW / 2;
    const panelY = KEYGUIDE.top;
    const panelH = H - 10 - panelY;

    ctx.save();
    // パネル
    ctx.fillStyle = 'rgba(8, 8, 10, 0.86)';
    roundRect(ctx, panelX, panelY, panelW, panelH, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(122, 112, 96, 0.55)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, panelX, panelY, panelW, panelH, 10);
    ctx.stroke();

    const keysX = panelX + (panelW - rowW) / 2;
    const keysY = panelY + 12;

    const drawKey = (x: number, y: number, w: number, label: string, hot: boolean) => {
      ctx.fillStyle = hot ? '#ff9a2a' : '#201d1a';
      if (hot) {
        ctx.shadowColor = 'rgba(255, 154, 42, 0.9)';
        ctx.shadowBlur = 12;
      }
      roundRect(ctx, x, y, w, K, 5);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = hot ? '#ffd9a8' : '#4a453c';
      ctx.lineWidth = 1.2;
      roundRect(ctx, x, y, w, K, 5);
      ctx.stroke();
      ctx.fillStyle = hot ? '#241505' : '#c8c2b4';
      ctx.font = `700 ${label.length > 2 ? 12 : 17}px ui-monospace, Menlo, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label.length === 1 ? label.toUpperCase() : label, x + w / 2, y + K / 2 + 1);
    };

    // 4 段のキー
    rows.forEach((row, r) => {
      const y = keysY + r * (K + G);
      let x = keysX + rowOffsets[r];
      if (r === 3) {
        // 左シフト
        drawKey(keysX - 6, y, rowOffsets[3] + K, 'shift', shiftSide === 'left');
        x = keysX + rowOffsets[3] + K + G - 6 + 6;
      }
      for (const key of row) {
        drawKey(x, y, K, key, nextKey === key);
        x += K + G;
      }
      if (r === 3) {
        // 右シフト
        drawKey(x, y, keysX + rowW - x + 6, 'shift', shiftSide === 'right');
      }
    });

    // スペースバー
    const spaceY = keysY + 4 * (K + G);
    drawKey(keysX + rowW / 2 - 120, spaceY, 240, 'space', false);

    // 指ガイド(左右 5 本ずつ・次のキーの担当指を点灯)
    const fingerOfKey: Record<string, number> = {
      '1': 0, q: 0, a: 0, z: 0,
      '2': 1, w: 1, s: 1, x: 1,
      '3': 2, e: 2, d: 2, c: 2,
      '4': 3, '5': 3, r: 3, t: 3, f: 3, g: 3, v: 3, b: 3,
      '6': 6, '7': 6, y: 6, u: 6, h: 6, j: 6, n: 6, m: 6,
      '8': 7, i: 7, k: 7, ',': 7,
      '9': 8, o: 8, l: 8, '.': 8,
      '0': 9, '-': 9, '^': 9, p: 9, '@': 9, '[': 9, ';': 9, ':': 9, ']': 9, '/': 9,
    };
    const hotFingers = new Set<number>();
    if (nextKey && fingerOfKey[nextKey] !== undefined) hotFingers.add(fingerOfKey[nextKey]);
    if (shiftSide === 'left') hotFingers.add(0); // 左小指でシフト
    if (shiftSide === 'right') hotFingers.add(9); // 右小指でシフト

    const heights = [36, 46, 52, 46, 30, 30, 46, 52, 46, 36]; // 小指〜親指〜小指
    const fw = 34;
    const fGap = 10;
    const handGap = 46;
    const totalFW = 10 * fw + 9 * fGap + (handGap - fGap);
    let fx = W / 2 - totalFW / 2;
    const fBottom = panelY + panelH - 8;
    for (let i = 0; i < 10; i++) {
      const h = heights[i];
      const hot = hotFingers.has(i);
      ctx.fillStyle = hot ? '#ff9a2a' : 'rgba(148, 142, 130, 0.5)';
      if (hot) {
        ctx.shadowColor = 'rgba(255, 154, 42, 0.9)';
        ctx.shadowBlur = 10;
      }
      roundRect(ctx, fx, fBottom - h, fw, h, 12);
      ctx.fill();
      ctx.shadowBlur = 0;
      fx += fw + (i === 4 ? handGap : fGap);
    }

    ctx.restore();
    ctx.textBaseline = 'alphabetic';
  }

  // ---------- オーバーレイ ----------

  /** カウントダウン(燃えるようなオレンジの明朝体・イメージ集準拠) */
  private drawCountdown(ctx: CanvasRenderingContext2D, cd: { text: string; t: number }): void {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(0, 0, W, H);
    const appear = Math.min(1, cd.t / 0.18);
    const scale = 1.35 - 0.35 * appear;
    const size = cd.text.length === 1 ? 210 : cd.text.includes('…') ? 84 : 96;
    ctx.translate(W / 2, H / 2 - 20);
    ctx.scale(scale, scale);
    ctx.globalAlpha = appear;
    ctx.textAlign = 'center';
    ctx.font = `900 ${size}px "Hiragino Mincho ProN", "Yu Mincho", serif`;
    // 外側の燃えるグロー
    ctx.shadowColor = 'rgba(255, 110, 20, 0.95)';
    ctx.shadowBlur = 70;
    ctx.fillStyle = '#ff9a30';
    ctx.fillText(cd.text, 0, 0);
    // 内側の明るい芯
    ctx.shadowColor = 'rgba(255, 190, 90, 0.9)';
    ctx.shadowBlur = 22;
    const g = ctx.createLinearGradient(0, -size * 0.7, 0, size * 0.3);
    g.addColorStop(0, '#fff3d8');
    g.addColorStop(1, '#ffb648');
    ctx.fillStyle = g;
    ctx.fillText(cd.text, 0, 0);
    ctx.restore();
  }

  private drawEndFade(ctx: CanvasRenderingContext2D, fade: { kind: 'clear' | 'gameover'; t: number }): void {
    const t = Math.min(1, fade.t);
    ctx.save();
    if (fade.kind === 'clear') {
      // 朝日が昇る
      const g = ctx.createLinearGradient(0, H, 0, 0);
      g.addColorStop(0, `rgba(255, 190, 110, ${0.75 * t})`);
      g.addColorStop(0.6, `rgba(255, 230, 180, ${0.4 * t})`);
      g.addColorStop(1, `rgba(160, 200, 255, ${0.3 * t})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      const sun = ctx.createRadialGradient(W * 0.5, H * 0.9, 20, W * 0.5, H * 0.9, 600 * t);
      sun.addColorStop(0, `rgba(255,255,230,${0.9 * t})`);
      sun.addColorStop(1, 'rgba(255,255,230,0)');
      ctx.fillStyle = sun;
      ctx.fillRect(0, 0, W, H);
    } else {
      ctx.fillStyle = `rgba(30, 0, 0, ${0.72 * t})`;
      ctx.fillRect(0, 0, W, H);
      const g = ctx.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, H * 0.8);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(120, 0, 0, ${0.55 * t})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
