/**
 * タイトル背景の自動デモプレイ用ボット(仕様 §12)。
 * ゲーム状態を読み、次に押すべきキーを返すだけの純粋ロジック。
 */

import type { Game, Zombie } from './game';

export class DemoBot {
  private cooldown = 0.8;

  constructor(private readonly rng: () => number = Math.random) {}

  /** 押すキーを返す(押さないフレームは null) */
  update(dt: number, game: Game): string | null {
    if (game.status !== 'running') return null;
    this.cooldown -= dt;
    if (this.cooldown > 0) return null;

    const target = this.pickTarget(game);
    if (!target) {
      this.cooldown = 0.25;
      return null;
    }
    const key = target.session.remainingRomaji()[0] ?? null;
    // 人間らしい打鍵間隔(たまに考えて止まる)
    this.cooldown = 0.07 + this.rng() * 0.09 + (this.rng() < 0.04 ? 0.6 : 0);
    return key;
  }

  private pickTarget(game: Game): Zombie | undefined {
    if (game.targetId !== null) return game.getZombie(game.targetId);
    if (game.candidateIds.length > 0) return game.getZombie(game.candidateIds[0]);
    // ラインに最も近いゾンビを狙う
    return [...game.zombies].sort((a, b) => a.x - b.x)[0];
  }
}
