/**
 * コード描画のエフェクト群: パーティクル、ヒットスパーク、爆散、
 * 画面フラッシュ、スクリーンシェイク、フロートテキスト、バナー。
 */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
}

interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  size: number;
}

interface Banner {
  text: string;
  life: number;
  maxLife: number;
}

export class Effects {
  private particles: Particle[] = [];
  private texts: FloatText[] = [];
  private banner: Banner | null = null;
  /** 被ダメ時の画面端フラッシュ 0〜1 */
  damageFlash = 0;
  /** 正打時のごく短い白フラッシュ(レーザー用は renderer 側) */
  private shakeTime = 0;
  private shakeAmp = 0;

  spark(x: number, y: number, color: string, count = 6, speed = 220): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: 0.25 + Math.random() * 0.15,
        maxLife: 0.4,
        size: 2 + Math.random() * 2.5,
        color,
        gravity: 200,
      });
    }
  }

  explosion(x: number, y: number, scale = 1, palette = ['#ffd24a', '#ff7a30', '#ff4444', '#b9ff7a']): void {
    for (let i = 0; i < 26 * scale; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (120 + Math.random() * 340) * scale;
      this.particles.push({
        x,
        y: y - 40 * scale,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 60,
        life: 0.4 + Math.random() * 0.45,
        maxLife: 0.85,
        size: 2.5 + Math.random() * 4 * scale,
        color: palette[Math.floor(Math.random() * palette.length)],
        gravity: 500,
      });
    }
  }

  floatText(x: number, y: number, text: string, color: string, size = 26): void {
    this.texts.push({ x, y, text, color, life: 0.9, maxLife: 0.9, size });
  }

  showBanner(text: string): void {
    this.banner = { text, life: 2.2, maxLife: 2.2 };
  }

  flashDamage(): void {
    this.damageFlash = 1;
  }

  shake(amp = 10, time = 0.25): void {
    this.shakeAmp = Math.max(this.shakeAmp, amp);
    this.shakeTime = Math.max(this.shakeTime, time);
  }

  shakeOffset(): [number, number] {
    if (this.shakeTime <= 0) return [0, 0];
    const a = this.shakeAmp * (this.shakeTime / 0.25);
    return [(Math.random() - 0.5) * 2 * a, (Math.random() - 0.5) * 2 * a];
  }

  update(dt: number): void {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    for (const t of this.texts) {
      t.y -= 46 * dt;
      t.life -= dt;
    }
    this.texts = this.texts.filter((t) => t.life > 0);

    if (this.banner) {
      this.banner.life -= dt;
      if (this.banner.life <= 0) this.banner = null;
    }
    this.damageFlash = Math.max(0, this.damageFlash - dt * 2.4);
    this.shakeTime = Math.max(0, this.shakeTime - dt);
  }

  /** ワールド空間(ゾンビと同レイヤー)のエフェクト */
  drawWorld(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    for (const t of this.texts) {
      const a = Math.max(0, t.life / t.maxLife);
      ctx.globalAlpha = a;
      ctx.font = `900 ${t.size}px "Hiragino Kaku Gothic ProN", sans-serif`;
      ctx.fillStyle = t.color;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 4;
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  /** スクリーン空間(HUD より上)のエフェクト */
  drawScreen(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    // 被ダメの赤フラッシュ(画面端ビネット)
    if (this.damageFlash > 0) {
      const g = ctx.createRadialGradient(
        width / 2, height / 2, height * 0.32,
        width / 2, height / 2, height * 0.75,
      );
      g.addColorStop(0, 'rgba(255,30,20,0)');
      g.addColorStop(1, `rgba(255,30,20,${0.5 * this.damageFlash})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
    }

    // ボーナスバナー
    if (this.banner) {
      const t = 1 - this.banner.life / this.banner.maxLife;
      const alpha = t < 0.1 ? t / 0.1 : this.banner.life < 0.4 ? this.banner.life / 0.4 : 1;
      const scale = t < 0.12 ? 0.7 + 0.3 * (t / 0.12) : 1;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(width / 2, height * 0.3);
      ctx.scale(scale, scale);
      ctx.textAlign = 'center';
      ctx.font = '900 44px "Hiragino Kaku Gothic ProN", sans-serif';
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.lineWidth = 8;
      ctx.strokeText(this.banner.text, 0, 0);
      ctx.fillStyle = '#ffd24a';
      ctx.fillText(this.banner.text, 0, 0);
      ctx.restore();
    }
  }
}
