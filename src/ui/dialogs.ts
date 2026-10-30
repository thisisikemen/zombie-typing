/** 共通のゲーム用パネル。native dialogのフォーカス管理はそのまま使う。 */
export function initGameDialogs(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-dialog-close]').forEach(button => {
    button.onclick = () => button.closest('dialog')?.close();
  });
}
