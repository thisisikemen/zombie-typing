import { describe, expect, it } from 'vitest';
import {
  TypingSession,
  canonicalRomaji,
  createTypingSession,
  firstKeys,
} from '../src/core/typing/engine';

/** キー列を順に入力し、結果の配列を返す */
function typeKeys(s: TypingSession, keys: string) {
  return [...keys].map((k) => s.input(k));
}

/** キー列全体で complete に到達するか */
function completes(kana: string, keys: string): boolean {
  const s = createTypingSession(kana);
  const results = typeKeys(s, keys);
  return results[results.length - 1] === 'complete' && !results.slice(0, -1).includes('miss');
}

describe('基本の判定', () => {
  it('単純な単語を打ち切れる', () => {
    expect(completes('とけい', 'tokei')).toBe(true);
    expect(completes('さかな', 'sakana')).toBe(true);
  });

  it('正解キーで advance、不正解キーで miss を返す', () => {
    const s = createTypingSession('ねこ');
    expect(s.input('n')).toBe('advance');
    expect(s.input('x')).toBe('miss');
    expect(s.input('e')).toBe('advance');
    expect(s.input('k')).toBe('advance');
    expect(s.input('o')).toBe('complete');
  });

  it('ミスしても進捗はリセットされない', () => {
    const s = createTypingSession('さくら');
    typeKeys(s, 'saku');
    const before = s.progress();
    s.input('z'); // ミス
    expect(s.progress()).toBe(before);
    expect(s.missCount).toBe(1);
    expect(s.correctCount).toBe(4);
  });

  it('complete 後の progress は 1.0', () => {
    const s = createTypingSession('ちず');
    typeKeys(s, 'tizu');
    expect(s.isComplete()).toBe(true);
    expect(s.progress()).toBe(1);
  });
});

describe('代表的なつづりの揺れ', () => {
  it('し = shi / si / ci', () => {
    expect(completes('すし', 'sushi')).toBe(true);
    expect(completes('すし', 'susi')).toBe(true);
    expect(completes('すし', 'suci')).toBe(true);
  });

  it('ち = chi / ti、つ = tsu / tu', () => {
    expect(completes('ちつ', 'chitsu')).toBe(true);
    expect(completes('ちつ', 'titu')).toBe(true);
  });

  it('ふ = fu / hu、じ = ji / zi', () => {
    expect(completes('ふじ', 'fuji')).toBe(true);
    expect(completes('ふじ', 'huzi')).toBe(true);
  });

  it('か = ka / ca、く = ku / cu / qu、こ = ko / co', () => {
    expect(completes('かくこ', 'kakuko')).toBe(true);
    expect(completes('かくこ', 'cacuco')).toBe(true);
    expect(completes('かくこ', 'kaquko')).toBe(true);
  });

  it('を = wo、ー = -', () => {
    expect(completes('をとこ', 'wotoko')).toBe(true);
    expect(completes('こーひー', 'ko-hi-')).toBe(true);
  });
});

describe('拗音と分解の揺れ', () => {
  it('しゃ = sha / sya、しょ = sho / syo', () => {
    expect(completes('しゃしん', 'shashinn')).toBe(true);
    expect(completes('しゃしん', 'syasinn')).toBe(true);
  });

  it('ちゃ = cha / tya / cya', () => {
    expect(completes('おちゃ', 'ocha')).toBe(true);
    expect(completes('おちゃ', 'otya')).toBe(true);
    expect(completes('おちゃ', 'ocya')).toBe(true);
  });

  it('じゃ = ja / jya / zya', () => {
    expect(completes('じゃま', 'jama')).toBe(true);
    expect(completes('じゃま', 'jyama')).toBe(true);
    expect(completes('じゃま', 'zyama')).toBe(true);
  });

  it('拗音は「基本かな + 小書き」に分解して打てる', () => {
    expect(completes('しゃ', 'shilya')).toBe(true);
    expect(completes('しゃ', 'sixya')).toBe(true);
    expect(completes('ちょきん', 'chixyokinn')).toBe(true);
  });

  it('外来音: ふぁ / てぃ / うぃ', () => {
    expect(completes('ふぁん', 'fann')).toBe(true);
    expect(completes('ふぁん', 'fulann')).toBe(true); // ふ + ぁ に分解
    expect(completes('てぃー', 'thi-')).toBe(true);
    expect(completes('うぃんく', 'winku')).toBe(true);
  });
});

describe('「ん」の判定', () => {
  it('子音の前は n 1打でよい', () => {
    expect(completes('はんたい', 'hantai')).toBe(true);
    expect(completes('さんぽ', 'sanpo')).toBe(true);
    expect(completes('はんたい', 'hanntai')).toBe(true); // nn も常に可
  });

  it('母音の前は nn が必須(n 1打 + 母音は にぬね… に化けるので不可)', () => {
    const s = createTypingSession('まんいん');
    typeKeys(s, 'man');
    expect(s.input('i')).toBe('miss'); // "mani" は まに になってしまう
    expect(completes('まんいん', 'manninn')).toBe(true);
  });

  it('や行・な行の前は nn が必須', () => {
    expect(completes('しんや', 'shinnya')).toBe(true);
    expect(completes('しんや', 'sinnya')).toBe(true);
    const s = createTypingSession('しんや');
    typeKeys(s, 'shin');
    expect(s.input('y')).toBe('miss'); // "shinya" は しにゃ になるため不可
    expect(completes('かんな', 'kannna')).toBe(true);
  });

  it('語末の ん は nn(または xn)で確定する', () => {
    const s = createTypingSession('ほん');
    typeKeys(s, 'hon');
    expect(s.isComplete()).toBe(false); // n 1打では未確定
    expect(s.input('n')).toBe('complete');
    expect(completes('ほん', 'hoxn')).toBe(true);
  });
});

describe('「っ」の判定', () => {
  it('子音重ねで打てる', () => {
    expect(completes('きって', 'kitte')).toBe(true);
    expect(completes('ざっし', 'zasshi')).toBe(true);
    expect(completes('ざっし', 'zassi')).toBe(true);
  });

  it('ltu / xtu / ltsu / xtsu でも打てる', () => {
    expect(completes('きって', 'kiltute')).toBe(true);
    expect(completes('きって', 'kixtute')).toBe(true);
    expect(completes('きって', 'kiltsute')).toBe(true);
  });

  it('っ + 拗音は両方の揺れが効く', () => {
    expect(completes('まっちゃ', 'maccha')).toBe(true);
    expect(completes('まっちゃ', 'mattya')).toBe(true);
    expect(completes('まっちゃ', 'maxtutya')).toBe(true);
  });

  it('っ の後に母音は重ねられない', () => {
    const s = createTypingSession('あっい'); // 人工的な例
    typeKeys(s, 'a');
    expect(s.currentKeys().has('i')).toBe(false); // "aii" とは打てない
    expect(s.currentKeys().has('l')).toBe(true); // ltu 系のみ
  });
});

describe('初手キー集合と currentKeys', () => {
  it('ちず → {t, c}', () => {
    expect(firstKeys('ちず')).toEqual(new Set(['t', 'c']));
  });

  it('しんぶん → {s, c}', () => {
    expect(firstKeys('しんぶん')).toEqual(new Set(['s', 'c']));
  });

  it('じかん → {z, j}、ふね → {f, h}', () => {
    expect(firstKeys('じかん')).toEqual(new Set(['z', 'j']));
    expect(firstKeys('ふね')).toEqual(new Set(['f', 'h']));
  });

  it('途中まで打った後の currentKeys(再ターゲット判定に使う)', () => {
    const s = createTypingSession('としょかん');
    typeKeys(s, 'to');
    expect(s.currentKeys()).toEqual(new Set(['s', 'c'])); // しょ or し
  });
});

describe('表示用 API', () => {
  it('canonicalRomaji は代表つづりを返す', () => {
    expect(canonicalRomaji('としょかん')).toBe('toshokann');
    expect(canonicalRomaji('きって')).toBe('kitte');
    expect(canonicalRomaji('はんたい')).toBe('hantai');
  });

  it('remainingRomaji は途中から自然につながる', () => {
    const s = createTypingSession('としょかん');
    typeKeys(s, 'tos');
    expect(s.remainingRomaji()).toBe('hokann'); // sho 解釈を優先
    const s2 = createTypingSession('としょかん');
    typeKeys(s2, 'tosy');
    expect(s2.remainingRomaji()).toBe('okann'); // syo 解釈に追従
  });

  it('typedRomaji は受理されたキーのみ蓄積する(ミスは含まない)', () => {
    const s = createTypingSession('ねこ');
    s.input('n');
    s.input('z'); // miss
    s.input('e');
    expect(s.typedRomaji()).toBe('ne');
  });

  it('confirmedKanaCount は確定したかな数を返す', () => {
    const s = createTypingSession('さかな');
    expect(s.confirmedKanaCount()).toBe(0);
    typeKeys(s, 'sa');
    expect(s.confirmedKanaCount()).toBe(1);
    typeKeys(s, 'ka');
    expect(s.confirmedKanaCount()).toBe(2);
  });
});

describe('記号・句読点(ベーシック練習用)', () => {
  it('、 = カンマ、。 = ピリオド', () => {
    expect(completes('、', ',')).toBe(true);
    expect(completes('。', '.')).toBe(true);
  });

  it('? と ! はそのまま打てる', () => {
    expect(completes('?', '?')).toBe(true);
    expect(completes('!', '!')).toBe(true);
  });

  it('ん 一文字の単語は nn で確定する', () => {
    const s = createTypingSession('ん');
    expect(s.input('n')).toBe('advance');
    expect(s.input('n')).toBe('complete');
  });
});

describe('進捗率', () => {
  it('かな単位で単調に進む', () => {
    const s = createTypingSession('としょかん');
    let prev = 0;
    for (const k of 'toshokann') {
      s.input(k);
      const p = s.progress();
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
    expect(prev).toBe(1);
  });

  it('カタカナ・ヴ も打てる(正規化)', () => {
    expect(completes('コーヒー', 'ko-hi-')).toBe(true);
  });
});
