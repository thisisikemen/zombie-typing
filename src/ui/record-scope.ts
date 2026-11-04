/** ゲストの既存キーは保ち、会員の記録はユーザーIDごとに分離する。 */
let owner: string | null = null;
export const RECORD_CHANGE = 'zombie-player-record-change';
export function recordOwner(): string | null { return owner; }
export function setRecordOwner(id: string | null): void { owner = id; }
export function scopedKey(key: string, id = owner): string {
  return id && /^(zombie-typing:)(player-name|device-key|best:|vs-best:|ranking:|play-time:)/.test(key)
    ? `zombie-typing:account:${id}:${key}` : key;
}
export const recordStorage = {
  keys(): string[] {
    const prefix = scopedKey('zombie-typing:play-time:');
    return Object.keys(localStorage).filter(key => key.startsWith(prefix)).map(key => 'zombie-typing:play-time:' + key.slice(prefix.length));
  },
  getItem(key: string): string | null { return localStorage.getItem(scopedKey(key)); },
  setItem(key: string, value: string): void {
    localStorage.setItem(scopedKey(key), value);
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(RECORD_CHANGE, { detail: { owner, key, value } }));
  },
  removeItem(key: string): void { localStorage.removeItem(scopedKey(key)); },
};
