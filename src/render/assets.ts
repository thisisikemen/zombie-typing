/**
 * 画像素材のローダー。
 * public/assets/ に PNG があればそれを使い、無ければコード生成の
 * ピクセルアート風スプライトにフォールバックする(仕様 §8:
 * 開発順序を素材に依存させない)。
 *
 * 期待する素材(すべて任意・左向き・透過・足元揃え):
 *   assets/bg_night.png                  背景 1920x1080
 *   assets/soldier_body.png              兵士の胴体(腕なし)
 *   assets/soldier_arms_gun.png          銃 + 両腕(肩ピボット左端)
 *   assets/zombie1_walk_1..4.png         Tier1 歩行 4 フレーム
 *   assets/zombie2_walk_1..4.png         Tier2(無ければ Tier1 の色変え)
 *   assets/zombie3_walk_1..4.png         Tier3(同上)
 */

import type { Tier } from '../config';

export interface Assets {
  bg: HTMLImageElement | null;
  bgFallback: HTMLCanvasElement;
  soldierBody: CanvasImageSource;
  soldierArms: CanvasImageSource;
  zombies: Record<Tier, CanvasImageSource[]>;
  /** HUD 左上のタイトルロゴ(無ければテキスト描画) */
  logo: HTMLImageElement | null;
}

function tryLoadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

/** 決定的な擬似乱数(背景の窓・汚しの配置を毎回同じにする) */
function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

// ---------------------------------------------------------------
// フォールバック: ゾンビ(パラメトリックなドット絵・歩行4フレーム)
// ---------------------------------------------------------------

interface ZombiePalette {
  skin: string;
  skinShade: string;
  cloth: string;
  clothShade: string;
  pants: string;
  eye: string;
}

const ZOMBIE_PALETTES: Record<Tier, ZombiePalette> = {
  1: { skin: '#8fb968', skinShade: '#6e9350', cloth: '#4a5a66', clothShade: '#39464f', pants: '#3a3a46', eye: '#ff5040' },
  2: { skin: '#9f8fbf', skinShade: '#7c6f96', cloth: '#6b5340', clothShade: '#524030', pants: '#2e2e3a', eye: '#ffd24a' },
  3: { skin: '#c06a5a', skinShade: '#94513f', cloth: '#2a2a34', clothShade: '#1d1d24', pants: '#241f28', eye: '#ff2818' },
};

/** 左向きゾンビの歩行フレームを生成する(足元 = キャンバス下端中央) */
function makeZombieFrames(tier: Tier): HTMLCanvasElement[] {
  const p = ZOMBIE_PALETTES[tier];
  const wide = tier === 3; // Tier3 はがっしり体型
  const W = wide ? 40 : 34;
  const H = 46;
  const frames: HTMLCanvasElement[] = [];

  for (let f = 0; f < 4; f++) {
    const [c, g] = makeCanvas(W, H);
    const bob = f % 2 === 0 ? 0 : 1; // 歩行の上下
    const cx = Math.floor(W / 2);
    const torsoW = wide ? 16 : 12;

    // 脚(フレームごとに前後): 0=左前 1=揃い 2=右前 3=揃い
    const stride = [3, 0, -3, 0][f];
    g.fillStyle = p.pants;
    g.fillRect(cx - 5 - stride, 32 + bob, 5, 14 - bob); // 奥脚
    g.fillStyle = p.clothShade;
    g.fillRect(cx + 0 + stride, 32 + bob, 5, 14 - bob); // 手前脚
    // 靴
    g.fillStyle = '#15151c';
    g.fillRect(cx - 7 - stride, 44, 7, 2);
    g.fillRect(cx - 1 + stride, 44, 7, 2);

    // 胴体(破れた服)
    g.fillStyle = p.cloth;
    g.fillRect(cx - torsoW / 2, 16 + bob, torsoW, 17);
    g.fillStyle = p.clothShade;
    g.fillRect(cx - torsoW / 2, 16 + bob, 3, 17);
    g.fillRect(cx - 1, 22 + bob, 4, 3); // 破れ
    g.fillStyle = p.skin;
    g.fillRect(cx + torsoW / 2 - 3, 27 + bob, 2, 2); // 破れから覗く肌

    // 両腕(前方=左へ突き出す。フレームで揺れる)
    const armY = 18 + bob + (f === 1 ? 1 : f === 3 ? -1 : 0);
    g.fillStyle = p.skinShade;
    g.fillRect(cx - torsoW / 2 - 9, armY + 3, 10, 3); // 奥腕
    g.fillStyle = p.skin;
    g.fillRect(cx - torsoW / 2 - 11, armY, 12, 3); // 手前腕
    g.fillRect(cx - torsoW / 2 - 13, armY, 3, 4); // 手

    // 頭(少し左へ傾く)
    const headSize = wide ? 12 : 11;
    const headX = cx - headSize / 2 - 2;
    const headY = 5 + bob + (f === 2 ? 1 : 0);
    g.fillStyle = p.skin;
    g.fillRect(headX, headY, headSize, headSize);
    g.fillStyle = p.skinShade;
    g.fillRect(headX, headY + headSize - 3, headSize, 3); // 顎の影
    g.fillRect(headX + headSize - 2, headY, 2, headSize); // 後頭部の影
    // 目(左向きなので左側)
    g.fillStyle = p.eye;
    g.fillRect(headX + 1, headY + 4, 2, 2);
    // 傷・汚れ
    g.fillStyle = p.skinShade;
    g.fillRect(headX + 5, headY + 2, 1, 3);

    frames.push(c);
  }
  return frames;
}

/** 既存フレームの色相を変えて別 Tier を作る(zombie1 だけ素材がある場合) */
function tintFrames(frames: CanvasImageSource[], tier: Tier): HTMLCanvasElement[] {
  const filters: Record<Tier, string> = {
    1: 'none',
    2: 'hue-rotate(90deg) saturate(0.9) brightness(0.95)',
    3: 'hue-rotate(-80deg) saturate(1.3) brightness(0.85)',
  };
  return frames.map((src) => {
    const w = (src as HTMLImageElement).naturalWidth || (src as HTMLCanvasElement).width;
    const h = (src as HTMLImageElement).naturalHeight || (src as HTMLCanvasElement).height;
    const [c, g] = makeCanvas(w, h);
    g.filter = filters[tier];
    g.drawImage(src, 0, 0);
    return c;
  });
}

// ---------------------------------------------------------------
// フォールバック: 兵士(胴体 / 腕+銃 の2レイヤー)
// ---------------------------------------------------------------

function makeSoldierBody(): HTMLCanvasElement {
  const [c, g] = makeCanvas(30, 46);
  // 脚
  g.fillStyle = '#2e3428';
  g.fillRect(9, 30, 6, 14);
  g.fillRect(16, 30, 6, 14);
  g.fillStyle = '#191c15';
  g.fillRect(8, 44, 8, 2); // ブーツ
  g.fillRect(16, 44, 8, 2);
  // 胴体(ベスト)
  g.fillStyle = '#4a5438';
  g.fillRect(8, 14, 15, 17);
  g.fillStyle = '#39422b';
  g.fillRect(8, 14, 15, 4); // 肩まわりの影
  g.fillRect(13, 19, 5, 7); // ポーチ
  g.fillStyle = '#5c6847';
  g.fillRect(9, 24, 4, 5);
  // 頭(右向き)
  g.fillStyle = '#d9a066';
  g.fillRect(11, 6, 10, 9);
  g.fillStyle = '#b9885a';
  g.fillRect(11, 6, 2, 9);
  // ヘルメット
  g.fillStyle = '#39422b';
  g.fillRect(9, 2, 14, 6);
  g.fillRect(9, 7, 3, 3);
  // 目(右向き)
  g.fillStyle = '#1a1a20';
  g.fillRect(18, 9, 2, 2);
  return c;
}

function makeSoldierArms(): HTMLCanvasElement {
  const [c, g] = makeCanvas(46, 14);
  // 奥腕
  g.fillStyle = '#39422b';
  g.fillRect(2, 7, 16, 4);
  // 銃身
  g.fillStyle = '#23252c';
  g.fillRect(12, 3, 32, 4); // バレル(銃口は右端 x≈44, y≈4-5 → ratio 0.97/0.32)
  g.fillRect(10, 6, 14, 4); // 機関部
  g.fillStyle = '#15161b';
  g.fillRect(20, 9, 3, 5); // グリップ
  g.fillRect(30, 7, 2, 3); // フォアグリップ
  // 手前腕 + 手
  g.fillStyle = '#4a5438';
  g.fillRect(2, 5, 14, 4);
  g.fillStyle = '#d9a066';
  g.fillRect(16, 5, 4, 4);
  g.fillRect(29, 5, 4, 4);
  return c;
}

// ---------------------------------------------------------------
// フォールバック: 夜の廃墟背景(空は透過。空は renderer がグラデ描画)
// ---------------------------------------------------------------

function makeBgFallback(width: number, height: number): HTMLCanvasElement {
  const [c, g] = makeCanvas(width, height);
  const rng = seededRng(20260702);
  const horizon = 412;

  // 遠景ビル群(シルエット)
  g.fillStyle = '#0b0c16';
  let x = -40;
  while (x < width + 40) {
    const w = 90 + rng() * 160;
    const h = 90 + rng() * 230;
    const top = horizon - h;
    g.fillRect(x, top, w, h + 20);
    // 崩れた屋上(ギザギザの欠け)
    g.clearRect(x + w * (0.2 + rng() * 0.5), top - 1, w * (0.15 + rng() * 0.3), 14 + rng() * 26);
    // 窓
    const cols = Math.floor(w / 26);
    const rows = Math.floor(h / 34);
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        if (rng() < 0.72) continue;
        const lit = rng() < 0.12;
        g.fillStyle = lit ? 'rgba(255, 190, 90, 0.5)' : 'rgba(30, 34, 52, 0.9)';
        g.fillRect(x + 8 + i * 26, top + 12 + j * 34, 10, 14);
      }
    }
    g.fillStyle = '#0b0c16';
    x += w + 14 + rng() * 40;
  }

  // 地面
  const ground = g.createLinearGradient(0, horizon, 0, height);
  ground.addColorStop(0, '#14141e');
  ground.addColorStop(0.25, '#101019');
  ground.addColorStop(1, '#08080e');
  g.fillStyle = ground;
  g.fillRect(0, horizon, width, height - horizon);

  // 地面の亀裂・瓦礫
  g.strokeStyle = 'rgba(0,0,0,0.5)';
  g.lineWidth = 2;
  for (let i = 0; i < 26; i++) {
    const gx = rng() * width;
    const gy = horizon + 30 + rng() * (height - horizon - 60);
    g.beginPath();
    g.moveTo(gx, gy);
    g.lineTo(gx + 20 + rng() * 60, gy + (rng() - 0.5) * 16);
    g.stroke();
  }
  g.fillStyle = 'rgba(22, 22, 32, 0.9)';
  for (let i = 0; i < 14; i++) {
    const gx = rng() * width;
    const gy = horizon + 20 + rng() * (height - horizon - 60);
    g.beginPath();
    g.ellipse(gx, gy, 14 + rng() * 30, 5 + rng() * 8, 0, 0, Math.PI * 2);
    g.fill();
  }

  // 倒れた街灯・電柱のシルエット
  g.strokeStyle = '#0d0e18';
  g.lineWidth = 6;
  for (const px of [420, 980, 1420]) {
    g.beginPath();
    g.moveTo(px, horizon + 10);
    g.lineTo(px + 30, horizon - 110 - rng() * 40);
    g.stroke();
  }

  return c;
}

// ---------------------------------------------------------------
// ローダー本体
// ---------------------------------------------------------------

export async function loadAssets(): Promise<Assets> {
  const base = import.meta.env.BASE_URL;
  const url = (name: string) => `${base}assets/${name}`;

  const [bg, body, arms, logo, ...zombieFlat] = await Promise.all([
    tryLoadImage(url('bg_night.png')),
    tryLoadImage(url('soldier_body.png')),
    tryLoadImage(url('soldier_arms_gun.png')),
    tryLoadImage(url('ui/logo.png')),
    ...([1, 2, 3] as Tier[]).flatMap((t) =>
      [1, 2, 3, 4].map((i) => tryLoadImage(url(`zombie${t}_walk_${i}.png`))),
    ),
  ]);

  const zombieImgs: Record<Tier, (HTMLImageElement | null)[]> = {
    1: zombieFlat.slice(0, 4),
    2: zombieFlat.slice(4, 8),
    3: zombieFlat.slice(8, 12),
  };

  const zombies = {} as Record<Tier, CanvasImageSource[]>;
  const tier1Complete = zombieImgs[1].every((f) => f !== null);
  for (const t of [1, 2, 3] as Tier[]) {
    const own = zombieImgs[t];
    if (own.every((f) => f !== null)) {
      zombies[t] = own as HTMLImageElement[];
    } else if (tier1Complete) {
      // Tier1 素材だけある → 色変えで代用
      zombies[t] = tintFrames(zombieImgs[1] as HTMLImageElement[], t);
    } else {
      zombies[t] = makeZombieFrames(t);
    }
  }

  return {
    bg,
    bgFallback: makeBgFallback(1600, 900),
    soldierBody: body ?? makeSoldierBody(),
    soldierArms: arms ?? makeSoldierArms(),
    zombies,
    logo,
  };
}
