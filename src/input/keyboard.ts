/**
 * キーボード入力の取り込み。
 * 入力欄を使わず keydown を直接処理する(IME を起動させない・仕様 §14)。
 */

export type KeyAction =
  | { kind: 'typing'; key: string }
  | { kind: 'enter' }
  | { kind: 'escape' };

/** タイピングキーとして扱う文字(それ以外の文字キーは無視) */
const TYPING_KEY = /^[a-z0-9\-.,;:@!?'^[\]]$/i;

export function initKeyboard(onAction: (a: KeyAction) => void): void {
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.repeat) return; // 長押しリピートは無視

    if (e.key === 'Enter') {
      e.preventDefault();
      onAction({ kind: 'enter' });
      return;
    }
    if (e.key === 'Escape') {
      onAction({ kind: 'escape' });
      return;
    }
    if (e.key.length === 1) {
      if (e.key === ' ') {
        e.preventDefault(); // スクロール防止
        onAction({ kind: 'enter' }); // Space も Enter と同じくターゲット解除
        return;
      }
      if (TYPING_KEY.test(e.key)) {
        // Firefox のクイック検索等を防ぐ
        if (e.key === '/' || e.key === "'") e.preventDefault();
        onAction({ kind: 'typing', key: e.key.toLowerCase() });
      }
    }
  });
}
