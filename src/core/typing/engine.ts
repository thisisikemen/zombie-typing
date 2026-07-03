/**
 * ローマ字入力判定エンジン。
 *
 * かな文字列に対する「許容されるキー列」の全解釈を候補集合として持ち、
 * 1キー入力ごとに候補を絞り込む。かなの区切り方の揺れ
 * (しんや = shinya / sinnya、しゃ = sha / shixya 等)も候補として共存する。
 *
 * DOM / Canvas に依存しない純粋モジュール。ユニットテスト対象。
 */

import {
  KANA_CHUNKS,
  N_EXPLICIT,
  SOKUON_STANDALONE,
  allowsSingleN,
  canDoubleConsonant,
  normalizeKana,
} from './table';

export type InputResult = 'advance' | 'miss' | 'complete';

/** かな位置 i から始まるチャンクの選択肢(かな消費数と、そのつづり) */
interface ChunkOption {
  kanaLen: number;
  spell: string;
}

/**
 * 入力候補。「kanaIdx までのかなを確定済みで、いま spell というつづりの
 * pos 文字目まで打っている」状態を表す。
 */
interface Candidate {
  kanaIdx: number;
  kanaLen: number; // 現在のチャンクが消費するかな数
  spell: string;
  pos: number;
}

/** かな位置 i から取り得るチャンク選択肢を列挙する(配列先頭が代表つづり) */
function chunkOptionsAt(kana: string, i: number): ChunkOption[] {
  const ch = kana[i];
  const opts: ChunkOption[] = [];

  if (ch === 'っ') {
    // 子音重ね(次チャンクのつづりの先頭子音を二重にする)を優先候補に
    if (i + 1 < kana.length) {
      for (const next of chunkOptionsAt(kana, i + 1)) {
        if (canDoubleConsonant(next.spell)) {
          opts.push({ kanaLen: 1 + next.kanaLen, spell: next.spell[0] + next.spell });
        }
      }
    }
    for (const s of SOKUON_STANDALONE) opts.push({ kanaLen: 1, spell: s });
    return opts;
  }

  if (ch === 'ん') {
    // 単独 n(後続が母音・な行・や行以外のとき)を優先候補に
    if (i + 1 < kana.length) {
      for (const next of chunkOptionsAt(kana, i + 1)) {
        if (allowsSingleN(next.spell)) {
          opts.push({ kanaLen: 1 + next.kanaLen, spell: 'n' + next.spell });
        }
      }
    }
    for (const s of N_EXPLICIT) opts.push({ kanaLen: 1, spell: s });
    return opts;
  }

  // 拗音などの 2 かなチャンクを優先し、1 かな + 小書き単独入力も許容する
  const two = i + 1 < kana.length ? KANA_CHUNKS[kana.slice(i, i + 2)] : undefined;
  if (two) for (const s of two) opts.push({ kanaLen: 2, spell: s });
  const one = KANA_CHUNKS[ch];
  if (one) for (const s of one) opts.push({ kanaLen: 1, spell: s });

  if (opts.length === 0) {
    throw new Error(`変換できないかな文字です: "${ch}" (in "${kana}")`);
  }
  return opts;
}

/** かな位置 i から候補を展開する */
function expandAt(kana: string, i: number): Candidate[] {
  return chunkOptionsAt(kana, i).map((o) => ({
    kanaIdx: i,
    kanaLen: o.kanaLen,
    spell: o.spell,
    pos: 0,
  }));
}

/** 代表つづりでかな全体をローマ字化する(表示ヒント用) */
export function canonicalRomaji(kana: string, from = 0): string {
  let out = '';
  let i = from;
  while (i < kana.length) {
    const opt = chunkOptionsAt(kana, i)[0];
    out += opt.spell;
    i += opt.kanaLen;
  }
  return out;
}

export class TypingSession {
  readonly kana: string;
  private candidates: Candidate[];
  private typed = '';
  private completed = false;
  /** このセッションで打った正打/ミスの数(統計用) */
  correctCount = 0;
  missCount = 0;

  constructor(kana: string) {
    this.kana = normalizeKana(kana);
    if (this.kana.length === 0) throw new Error('空のかな文字列です');
    this.candidates = expandAt(this.kana, 0);
  }

  /** 1キー入力を処理する */
  input(rawKey: string): InputResult {
    if (this.completed) return 'complete';
    const key = rawKey.toLowerCase();

    const advanced: Candidate[] = [];
    const seen = new Set<string>();
    let anyComplete = false;

    for (const c of this.candidates) {
      if (c.spell[c.pos] !== key) continue;
      const pos = c.pos + 1;
      if (pos < c.spell.length) {
        pushUnique(advanced, seen, { ...c, pos });
        continue;
      }
      // チャンク打ち切り → 次のかな位置へ展開
      const nextIdx = c.kanaIdx + c.kanaLen;
      if (nextIdx >= this.kana.length) {
        anyComplete = true;
        continue;
      }
      for (const n of expandAt(this.kana, nextIdx)) pushUnique(advanced, seen, n);
    }

    if (anyComplete) {
      this.typed += key;
      this.correctCount++;
      this.completed = true;
      return 'complete';
    }
    if (advanced.length === 0) {
      this.missCount++;
      return 'miss'; // 進捗はリセットしない
    }
    this.typed += key;
    this.correctCount++;
    this.candidates = advanced;
    return 'advance';
  }

  /** 次に受け付けるキーの集合 */
  currentKeys(): Set<string> {
    const keys = new Set<string>();
    if (this.completed) return keys;
    for (const c of this.candidates) keys.add(c.spell[c.pos]);
    return keys;
  }

  /** かな単位の進捗率 0.0〜1.0(チャンク途中は按分) */
  progress(): number {
    if (this.completed) return 1;
    const best = this.bestCandidate();
    const v = best.kanaIdx + best.kanaLen * (best.pos / best.spell.length);
    return Math.min(1, v / this.kana.length);
  }

  /** 確定済みのかな文字数(頭上表示の塗り分け用) */
  confirmedKanaCount(): number {
    if (this.completed) return this.kana.length;
    return this.bestCandidate().kanaIdx;
  }

  /**
   * 打ちかけのチャンクも含めた進行中のかな文字数。
   * 「か」の k を打った瞬間に「か」を塗れるので、表示の反応が速い。
   */
  activeKanaCount(): number {
    if (this.completed) return this.kana.length;
    const best = this.bestCandidate();
    return best.kanaIdx + (best.pos > 0 ? best.kanaLen : 0);
  }

  /** これまでに受理されたキー列 */
  typedRomaji(): string {
    return this.typed;
  }

  /** 残りの推奨キー列(代表つづり) */
  remainingRomaji(): string {
    if (this.completed) return '';
    const best = this.bestCandidate();
    return best.spell.slice(best.pos) + canonicalRomaji(this.kana, best.kanaIdx + best.kanaLen);
  }

  isComplete(): boolean {
    return this.completed;
  }

  /** 表示・進捗の基準となる代表候補(最も進んでいるもの。同率なら優先順) */
  private bestCandidate(): Candidate {
    let best = this.candidates[0];
    let bestV = progressValue(best);
    for (let i = 1; i < this.candidates.length; i++) {
      const v = progressValue(this.candidates[i]);
      if (v > bestV) {
        best = this.candidates[i];
        bestV = v;
      }
    }
    return best;
  }
}

function progressValue(c: Candidate): number {
  return c.kanaIdx + c.kanaLen * (c.pos / c.spell.length);
}

function pushUnique(arr: Candidate[], seen: Set<string>, c: Candidate): void {
  const k = `${c.kanaIdx}:${c.kanaLen}:${c.spell}:${c.pos}`;
  if (seen.has(k)) return;
  seen.add(k);
  arr.push(c);
}

/** セッション生成(仕様の API 名に合わせたファクトリ) */
export function createTypingSession(kana: string): TypingSession {
  return new TypingSession(kana);
}

/** 単語の「初手キー集合」(スポーンフィルタ用の静的関数) */
export function firstKeys(kana: string): Set<string> {
  return new TypingSession(kana).currentKeys();
}
