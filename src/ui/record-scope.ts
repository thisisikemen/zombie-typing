/** ゲストの既存キーは保ち、会員の記録はユーザーIDごとに分離する。 */
let owner: string | null = null;
export const RECORD_CHANGE = 'zombie-player-record-change';
export function recordOwner(): string | null { return owner; }
export function setRecordOwner(id: string | null): void { owner = id; }
export function scopedKey(key: string, id = owner): string {
  return id && /^(zombie-typing:)(player-name|device-key|best:|vs-best:|ranking:)/.test(key)
    ? `zombie-typing:account:${id}:${key}` : key;
}
export const recordStorage = {
  getItem(key: string): string | null { return localStorage.getItem(scopedKey(key)); },
  setItem(key: string, value: string): void {
    localStorage.setItem(scopedKey(key), value);
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(RECORD_CHANGE, { detail: { owner, key, value } }));
  },
  removeItem(key: string): void { localStorage.removeItem(scopedKey(key)); },
};
