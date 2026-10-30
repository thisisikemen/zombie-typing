import { MODES } from '../core/modes';
import { parseBackup } from './backup';
import { scopedKey } from './record-scope';

export type AccountRecords = Record<string, string>;
export const NAME_KEY = 'zombie-typing:player-name';
export const ACCOUNT_RECORD_KEYS = [NAME_KEY,
  ...MODES.filter(m => m.id !== 'vs').flatMap(m => m.difficulties.map(d => `zombie-typing:best:${m.id}:${d.id}`)),
  ...MODES.find(m => m.id === 'vs')!.difficulties.map(d => `zombie-typing:vs-best:${d.id}`),
];
export function validateAccountRecords(value: unknown): AccountRecords {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('同期データの形式が違います。');
  const entries = value as AccountRecords;
  if (Object.keys(entries).some(k => !ACCOUNT_RECORD_KEYS.includes(k))) throw new Error('同期対象外のデータです。');
  if (!Object.keys(entries).length) return {};
  return parseBackup(JSON.stringify({ format: 'zombie-typing-records', version: 1, entries })).entries;
}
export function readAccountRecords(storage: Pick<Storage, 'getItem'>, id: string | null): AccountRecords {
  const entries: AccountRecords = {};
  for (const key of ACCOUNT_RECORD_KEYS) {
    const value = storage.getItem(scopedKey(key, id));
    if (value !== null) entries[key] = value;
  }
  return validateAccountRecords(entries);
}
export function pendingNameKey(id: string): string { return `zombie-typing:account:${id}:pending-name`; }
/** 名前だけは未送信の変更時に送る。自己ベストは常にサーバーで大きい方を残す。 */
export function accountUpdates(storage: Pick<Storage, 'getItem'>, id: string): AccountRecords {
  const records = readAccountRecords(storage, id);
  if (storage.getItem(pendingNameKey(id)) === null) delete records[NAME_KEY];
  return records;
}
export function cacheAccountRecords(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, id: string, remote: unknown): void {
  const records = validateAccountRecords(remote);
  const local = readAccountRecords(storage, id);
  for (const key of ACCOUNT_RECORD_KEYS) {
    let value = records[key];
    if (key === NAME_KEY) {
      if (storage.getItem(pendingNameKey(id)) !== null) continue;
    } else if (local[key] !== undefined) {
      const a = JSON.parse(local[key]);
      const b = value === undefined ? null : JSON.parse(value);
      const metric = key.includes(':vs-best:') ? 'kills' : key.endsWith(':endless:endless') ? 'survival' : 'score';
      if (!b || (a[metric] ?? 0) > (b[metric] ?? 0)) value = local[key];
    }
    if (value !== undefined) storage.setItem(scopedKey(key, id), value);
    else storage.removeItem(scopedKey(key, id));
  }
}
