/**
 * かな → 許容ローマ字つづりテーブル。
 * 各配列の先頭が「代表つづり」(残り表示のヒントに使う)。
 * 「ん」「っ」は文脈依存のため engine 側で特別扱いする(ここには
 * 単独入力できるつづりのみ載せる)。
 */

/** 1かな・2かな(拗音等)のチャンク → 許容つづり */
export const KANA_CHUNKS: Record<string, string[]> = {
  // --- 基本 ---
  あ: ['a'], い: ['i', 'yi'], う: ['u', 'wu', 'whu'], え: ['e'], お: ['o'],
  か: ['ka', 'ca'], き: ['ki'], く: ['ku', 'cu', 'qu'], け: ['ke'], こ: ['ko', 'co'],
  さ: ['sa'], し: ['si', 'shi', 'ci'], す: ['su'], せ: ['se', 'ce'], そ: ['so'],
  た: ['ta'], ち: ['ti', 'chi'], つ: ['tu', 'tsu'], て: ['te'], と: ['to'],
  な: ['na'], に: ['ni'], ぬ: ['nu'], ね: ['ne'], の: ['no'],
  は: ['ha'], ひ: ['hi'], ふ: ['fu', 'hu'], へ: ['he'], ほ: ['ho'],
  ま: ['ma'], み: ['mi'], む: ['mu'], め: ['me'], も: ['mo'],
  や: ['ya'], ゆ: ['yu'], よ: ['yo'],
  ら: ['ra'], り: ['ri'], る: ['ru'], れ: ['re'], ろ: ['ro'],
  わ: ['wa'], を: ['wo'],
  // --- 濁音・半濁音 ---
  が: ['ga'], ぎ: ['gi'], ぐ: ['gu'], げ: ['ge'], ご: ['go'],
  ざ: ['za'], じ: ['zi', 'ji'], ず: ['zu'], ぜ: ['ze'], ぞ: ['zo'],
  だ: ['da'], ぢ: ['di'], づ: ['du'], で: ['de'], ど: ['do'],
  ば: ['ba'], び: ['bi'], ぶ: ['bu'], べ: ['be'], ぼ: ['bo'],
  ぱ: ['pa'], ぴ: ['pi'], ぷ: ['pu'], ぺ: ['pe'], ぽ: ['po'],
  ゔ: ['vu'],
  // --- 小書き(単独入力) ---
  ぁ: ['la', 'xa'], ぃ: ['li', 'xi', 'lyi', 'xyi'], ぅ: ['lu', 'xu'],
  ぇ: ['le', 'xe', 'lye', 'xye'], ぉ: ['lo', 'xo'],
  ゃ: ['lya', 'xya'], ゅ: ['lyu', 'xyu'], ょ: ['lyo', 'xyo'],
  ゎ: ['lwa', 'xwa'],
  // --- 記号 ---
  ー: ['-'],
  // --- 拗音(2かなチャンク) ---
  きゃ: ['kya'], きゅ: ['kyu'], きょ: ['kyo'], きぇ: ['kye'],
  ぎゃ: ['gya'], ぎゅ: ['gyu'], ぎょ: ['gyo'],
  しゃ: ['sha', 'sya'], しゅ: ['shu', 'syu'], しょ: ['sho', 'syo'], しぇ: ['she', 'sye'],
  じゃ: ['ja', 'zya', 'jya'], じゅ: ['ju', 'zyu', 'jyu'], じょ: ['jo', 'zyo', 'jyo'], じぇ: ['je', 'zye', 'jye'],
  ちゃ: ['cha', 'tya', 'cya'], ちゅ: ['chu', 'tyu', 'cyu'], ちょ: ['cho', 'tyo', 'cyo'], ちぇ: ['che', 'tye', 'cye'],
  ぢゃ: ['dya'], ぢゅ: ['dyu'], ぢょ: ['dyo'],
  にゃ: ['nya'], にゅ: ['nyu'], にょ: ['nyo'],
  ひゃ: ['hya'], ひゅ: ['hyu'], ひょ: ['hyo'],
  びゃ: ['bya'], びゅ: ['byu'], びょ: ['byo'],
  ぴゃ: ['pya'], ぴゅ: ['pyu'], ぴょ: ['pyo'],
  みゃ: ['mya'], みゅ: ['myu'], みょ: ['myo'],
  りゃ: ['rya'], りゅ: ['ryu'], りょ: ['ryo'],
  // --- 外来音 ---
  ふぁ: ['fa'], ふぃ: ['fi'], ふぇ: ['fe'], ふぉ: ['fo'], ふゅ: ['fyu'],
  うぃ: ['wi', 'whi'], うぇ: ['we', 'whe'], うぉ: ['who'],
  てぃ: ['thi'], てゅ: ['thu'], でぃ: ['dhi'], でゅ: ['dhu'],
  とぅ: ['twu'], どぅ: ['dwu'],
  ヴ: ['vu'],
};

/** 「っ」を単独で入力するつづり */
export const SOKUON_STANDALONE = ['ltu', 'xtu', 'ltsu', 'xtsu'];

/** 「ん」を必ず確定させるつづり */
export const N_EXPLICIT = ['nn', 'xn'];

const VOWELS = new Set(['a', 'i', 'u', 'e', 'o']);

/** 「っ」の後で子音重ねが許されるつづりか(先頭が母音・n以外の子音) */
export function canDoubleConsonant(spelling: string): boolean {
  const c = spelling[0];
  return !VOWELS.has(c) && c !== 'n';
}

/** 「ん」を単独 n 1打で済ませられる後続つづりか(母音・な行・や行・n 以外) */
export function allowsSingleN(nextSpelling: string): boolean {
  const c = nextSpelling[0];
  return !VOWELS.has(c) && c !== 'n' && c !== 'y';
}

/** カタカナ→ひらがな正規化(単語データはひらがな想定だが保険) */
export function normalizeKana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60),
  );
}
