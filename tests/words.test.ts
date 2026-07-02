import { describe, expect, it } from 'vitest';
import words from '../src/data/words.json';
import { canonicalRomaji, createTypingSession, firstKeys } from '../src/core/typing/engine';

describe('単語データ', () => {
  it('500語以上ある', () => {
    expect(words.length).toBeGreaterThanOrEqual(500);
  });

  it('全単語がエンジンで変換できる(未対応かなが無い)', () => {
    for (const w of words) {
      expect(() => canonicalRomaji(w.kana), `変換不可: ${w.display} (${w.kana})`).not.toThrow();
    }
  });

  it('全単語が代表つづりで最後まで打ち切れる', () => {
    for (const w of words) {
      const s = createTypingSession(w.kana);
      const keys = canonicalRomaji(w.kana);
      let last = '';
      for (const k of keys) {
        last = s.input(k);
        expect(last, `ミス発生: ${w.display} (${w.kana}) key=${k}`).not.toBe('miss');
      }
      expect(last, `未完: ${w.display} (${w.kana})`).toBe('complete');
    }
  });

  it('全単語に初手キーがあり、かなは2文字以上', () => {
    for (const w of words) {
      expect(firstKeys(w.kana).size, w.kana).toBeGreaterThan(0);
      expect([...w.kana].length, w.kana).toBeGreaterThanOrEqual(2);
    }
  });

  it('Tier別(かな長)の在庫が十分ある', () => {
    const len = (k: string) => [...k].length;
    expect(words.filter((w) => len(w.kana) <= 4).length).toBeGreaterThan(100);
    expect(words.filter((w) => len(w.kana) >= 5 && len(w.kana) <= 7).length).toBeGreaterThan(60);
    expect(words.filter((w) => len(w.kana) >= 8).length).toBeGreaterThan(30);
  });
});
