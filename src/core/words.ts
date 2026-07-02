/**
 * 単語プール。起動時に全単語の「初手キー集合」を事前計算し、
 * スポーン時の初手キー排他フィルタ(仕様 §5)に使う。
 */

import rawWords from '../data/words.json';
import { firstKeys } from './typing/engine';

export interface WordEntry {
  display: string;
  kana: string;
}

interface IndexedWord extends WordEntry {
  len: number;
  first: Set<string>;
}

export interface PickResult {
  word: WordEntry;
  /** 初手キーが画面上のゾンビと被らない形で選べたか(false = 重複許可フォールバック) */
  exclusive: boolean;
}

export class WordPool {
  private readonly words: IndexedWord[];

  constructor(entries: WordEntry[] = rawWords) {
    this.words = entries.map((w) => ({
      ...w,
      len: [...w.kana].length,
      first: firstKeys(w.kana),
    }));
  }

  /**
   * 指定のかな長レンジから単語を1つ選ぶ。
   * - blockedKeys: 画面上の全ゾンビが現在受け付けるキーの和集合(排他対象)
   * - onScreenKana: 画面上に出ている単語(かな)— 常に除外
   * - recentKana: 最近使った単語 — 在庫があれば除外
   */
  pick(
    rng: () => number,
    range: readonly [number, number],
    blockedKeys: ReadonlySet<string>,
    onScreenKana: ReadonlySet<string>,
    recentKana: ReadonlySet<string>,
  ): PickResult | null {
    const inRange = this.words.filter(
      (w) => w.len >= range[0] && w.len <= range[1] && !onScreenKana.has(w.kana),
    );
    if (inRange.length === 0) return null;

    let cands = inRange.filter((w) => !recentKana.has(w.kana));
    if (cands.length === 0) cands = inRange; // 在庫が尽きたら最近使った語も許可

    const exclusive = cands.filter((w) => !intersects(w.first, blockedKeys));
    if (exclusive.length > 0) {
      return { word: strip(sample(exclusive, rng)), exclusive: true };
    }
    // フォールバック: 初手重複を許可してスポーン(仕様 §5)
    return { word: strip(sample(cands, rng)), exclusive: false };
  }
}

function intersects(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  for (const k of a) if (b.has(k)) return true;
  return false;
}

function sample<T>(arr: T[], rng: () => number): T {
  return arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];
}

function strip(w: IndexedWord): WordEntry {
  return { display: w.display, kana: w.kana };
}
