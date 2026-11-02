import { recordOwner } from './record-scope';

export type TransferChoice = 'pending' | 'completed' | 'dismissed';
export const TRANSFER_CHANGE = 'zombie-transfer-choice-change';
const key = (owner: string | null) => `zombie-typing:transfer-choice:${owner ?? 'guest'}`;
export function transferChoice(owner = recordOwner()): TransferChoice {
  try {
    const saved = localStorage.getItem(key(owner));
    if (saved === 'completed' || saved === 'dismissed') return saved;
    if (!owner && localStorage.getItem('zombie-typing:old-site-moved') === 'true') return 'completed';
  } catch { /* Storage is optional. */ }
  return 'pending';
}
export function cacheTransferChoice(choice: TransferChoice, owner = recordOwner()): void {
  try { localStorage.setItem(key(owner), choice); } catch { /* This session can still continue. */ }
  window.dispatchEvent(new Event(TRANSFER_CHANGE));
}
export function refreshTransferPrompts(): void {
  const choice = transferChoice();
  document.querySelectorAll<HTMLElement>('[data-transfer-prompt]').forEach(el => {
    el.hidden = choice !== 'pending' || (el.id === 'account-old-hint' && Boolean(recordOwner()));
  });
  const status = document.getElementById('transfer-help-status');
  if (status) status.textContent = choice === 'completed'
    ? '引き継ぎは完了しています。同じ記録の確認や、途中で失敗した引き継ぎは、下のボタンからやり直せます。'
    : '記録があるブラウザで引き継いでください。登録済みでも引き継げます。自己ベストは高い方を残します。';
}
