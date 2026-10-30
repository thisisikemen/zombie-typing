import { recordOwner, recordStorage } from './record-scope';
import { BACKUP_MAX_BYTES, createBackup, parseBackup, restoreBackup, type RecordBackup } from './backup';

export function initRecordTransfer(): void {
  const dialog = document.getElementById('records-dialog') as HTMLDialogElement;
  const status = document.getElementById('records-status')!;
  const input = document.getElementById('records-file') as HTMLInputElement;
  const restore = document.getElementById('records-restore') as HTMLButtonElement;
  let pending: RecordBackup | null = null;
  document.getElementById('records-select')!.onclick = () => input.click();
  document.getElementById('records-open')!.onclick = () => dialog.showModal();
  document.getElementById('records-close')!.onclick = () => dialog.close();
  dialog.addEventListener('keydown', (event) => event.stopPropagation());
  document.getElementById('records-export')!.onclick = () => {
    try {
      const backup = createBackup(recordStorage);
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `zombie-typing-records-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent = '記録ファイルを書き出しました。ご自身で保管し、引き継ぎ先で読み込んでください。';
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : '記録を書き出せませんでした。';
    }
  };
  let selection = 0;
  input.onchange = async () => {
    const current = ++selection;
    pending = null;
    restore.disabled = true;
    const file = input.files?.[0];
    document.getElementById('records-filename')!.textContent = file?.name ?? 'ファイル未選択';
    if (!file) return;
    try {
      if (file.size > BACKUP_MAX_BYTES) throw new Error('記録ファイルは2MB以内にしてください。');
      const parsed = parseBackup(await file.text());
      if (current !== selection) return;
      pending = parsed;
      status.textContent = `${Object.keys(parsed.entries).length}件の記録・設定を読み込めます。同じ項目はこのブラウザの内容を上書きします。先に現在の記録を書き出すことをおすすめします。`;
      restore.disabled = false;
    } catch (error) {
      if (current !== selection) return;
      status.textContent = error instanceof Error ? error.message : '記録を読み取れませんでした。';
    }
  };
  restore.onclick = () => {
    if (!pending) return;
    if (recordOwner()) { status.textContent = 'ログイン中はファイルを読み込めません。未登録データへ読み込む場合は先にログアウトしてください。'; return; }
    try {
      restoreBackup(localStorage, pending);
      location.reload();
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : '記録を保存できませんでした。';
    }
  };
}
