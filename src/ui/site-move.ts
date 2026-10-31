import { createBackup, parseBackup, type RecordBackup } from './backup';

export const OLD_ORIGIN = 'https://thisisikemen.github.io';
export const NEW_ORIGIN = 'https://zombietyping.jp';
const OLD_URL = `${OLD_ORIGIN}/zombie-typing/?move=1`;
const NEW_URL = `${NEW_ORIGIN}/?receive=old`;
const READY = 'zombie-records-ready';
const DATA = 'zombie-records-data';
const DONE = 'zombie-records-done';
export const IMPORT_DONE = 'zombie-records-imported';

/** 相手のタブとoriginの両方を照合。URLやサーバーへ記録を渡さない。 */
export function trustedMessage(event: Pick<MessageEvent, 'origin' | 'source'>, peer: Window | null, origin: string): boolean {
  return peer !== null && event.source === peer && event.origin === origin;
}

export function initOldSiteMove(): boolean {
  if (location.origin !== OLD_ORIGIN || !location.pathname.startsWith('/zombie-typing/')) return false;
  document.documentElement.style.setProperty('--ui-btn', `url("${new URL('./assets/ui/btn.png', location.href).href}")`);
  document.documentElement.style.setProperty('--ui-btn-active', `url("${new URL('./assets/ui/btn-active.png', location.href).href}")`);
  document.getElementById('old-site-move')!.hidden = false;
  document.getElementById('stage')?.setAttribute('inert', '');
  const status = document.getElementById('old-move-status')!;
  const summary = document.getElementById('old-move-summary');
  if (summary) {
    try {
      const records = createBackup(localStorage).entries;
      const name = records['zombie-typing:player-name'];
      summary.textContent = name ? `${name}さんの記録が見つかりました。` : 'このブラウザの記録を引き継げます。';
    } catch {
      summary.textContent = 'このブラウザには記録がありません。';
      (document.getElementById('old-move-records') as HTMLButtonElement).disabled = true;
    }
  }
  let peer: Window | null = null;
  let approved = false;
  let backup: RecordBackup | null = null;
  const send = () => { if (approved && peer && backup) peer.postMessage({ type: DATA, backup }, NEW_ORIGIN); };
  window.addEventListener('message', event => {
    if (!trustedMessage(event, peer, NEW_ORIGIN)) return;
    if (event.data?.type === READY) send();
    if (event.data?.type === DONE) status.textContent = '引き継ぎできました！ 新サイトのタブに戻ってください。';
  });
  document.getElementById('old-move-records')!.onclick = () => {
    try {
      backup = createBackup(localStorage);
      approved = true;
      if (new URL(location.href).searchParams.get('move') === '1' && window.opener) {
        peer = window.opener;
        send();
      } else peer = window.open(NEW_URL, '_blank');
      status.textContent = peer ? '新サイトに記録を渡します。元の記録も残ります。' : '新しいタブを開けませんでした。ポップアップを許可してください。';
    } catch { status.textContent = 'このブラウザに記録がありません。下のボタンで新サイトへ進めます。'; }
  };
  return true;
}

export function initSiteMove(importRecords: (backup: RecordBackup) => Promise<void>): void {
  let peer: Window | null = null;
  let busy = false;
  const dialog = document.getElementById('move-dialog') as HTMLDialogElement;
  const status = document.getElementById('move-status')!;
  const receive = new URL(location.href).searchParams.get('receive') === 'old';
  if (receive) {
    const url = new URL(location.href); url.searchParams.delete('receive'); history.replaceState(null, '', url);
    peer = window.opener;
    if (peer) { dialog.showModal(); status.textContent = '旧サイトの記録を待っています…'; peer.postMessage({type: READY}, OLD_ORIGIN); }
  }
  document.querySelectorAll<HTMLButtonElement>('[data-old-records]').forEach(button => {
    button.onclick = () => {
      dialog.showModal();
      status.textContent = '旧サイトで「記録を引き継ぐ」を押してください。';
      peer = window.open(OLD_URL, '_blank');
      if (!peer) status.textContent = 'タブを開けませんでした。ポップアップを許可して、もう一度押してください。';
    };
  });
  window.addEventListener('message', async event => {
    if (!trustedMessage(event, peer, OLD_ORIGIN) || event.data?.type !== DATA || busy) return;
    busy = true;
    try {
      const backup = parseBackup(JSON.stringify(event.data.backup));
      status.textContent = '記録を引き継いでいます…';
      await importRecords(backup);
      status.textContent = '引き継ぎできました！ このまま遊べます。';
      localStorage.setItem('zombie-typing:old-site-moved', 'true');
      window.dispatchEvent(new Event(IMPORT_DONE));
      peer!.postMessage({type: DONE}, OLD_ORIGIN);
      peer = null;
    } catch (error) { status.textContent = error instanceof Error ? error.message : '引き継げませんでした。もう一度お試しください。'; }
    finally { busy = false; }
  });
}
