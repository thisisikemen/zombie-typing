/**
 * 空の色の時間変化(日没 → 深夜 → 夜明け)。仕様 §11
 * 進行度 0〜1 を SKY_KEYFRAMES で補間する。
 */

import { SKY_KEYFRAMES } from '../config';

export interface SkyColors {
  top: string;
  bottom: string;
  starAlpha: number;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mixHex(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const r = Math.round(lerp(ca[0], cb[0], t));
  const g = Math.round(lerp(ca[1], cb[1], t));
  const bl = Math.round(lerp(ca[2], cb[2], t));
  return `rgb(${r},${g},${bl})`;
}

/** 進行度 t (0〜1) の空の色を返す */
export function skyAt(t: number): SkyColors {
  const frames = SKY_KEYFRAMES;
  const clamped = Math.max(0, Math.min(1, t));
  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i];
    const b = frames[i + 1];
    if (clamped <= b.t) {
      const local = (clamped - a.t) / (b.t - a.t);
      return {
        top: mixHex(a.top, b.top, local),
        bottom: mixHex(a.bottom, b.bottom, local),
        starAlpha: lerp(a.starAlpha, b.starAlpha, local),
      };
    }
  }
  const last = frames[frames.length - 1];
  return { top: last.top, bottom: last.bottom, starAlpha: last.starAlpha };
}
