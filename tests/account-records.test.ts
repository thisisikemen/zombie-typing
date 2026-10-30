import { beforeEach, describe, expect, it } from 'vitest';
import { accountUpdates, cacheAccountRecords, NAME_KEY, pendingNameKey, readAccountRecords } from '../src/ui/account-records';
import { recordStorage, scopedKey, setRecordOwner } from '../src/ui/record-scope';
import { loadBest, saveBest } from '../src/ui/store';
class MemoryStorage implements Storage {
  data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  key(i: number) { return [...this.data.keys()][i] ?? null; }
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string,v: string) { this.data.set(k,v); }
  removeItem(k: string) { this.data.delete(k); }
}
const storage = new MemoryStorage();
Object.defineProperty(globalThis,'localStorage',{ value:storage, configurable:true });
const key = 'zombie-typing:best:dawn:normal';
const rec = (score: number) => ({ score,kills:1,maxCombo:1,accuracy:1,cleared:true });
beforeEach(() => { storage.clear(); setRecordOwner(null); });
describe('会員・ゲストの記録分離', () => {
  it('登録端末のスナップショットは本人名と記録だけで、識別キー・設定・認証情報を含まない', () => {
    storage.setItem(NAME_KEY,'生存者'); saveBest('dawn','normal',rec(100));
    storage.setItem('zombie-typing:device-key','legacy-id');
    storage.setItem('sb-auth-token','secret');
    storage.setItem('zombie-typing:settings','{}');
    expect(Object.keys(readAccountRecords(storage,null)).sort()).toEqual([key,NAME_KEY].sort());
  });
  it('アカウントA/B/ゲストのベストを混ぜず、ログアウトで元のゲスト記録へ戻る', () => {
    saveBest('dawn','normal',rec(100));
    cacheAccountRecords(storage,'A',{ [key]:JSON.stringify(rec(100)) });
    setRecordOwner('A'); saveBest('dawn','normal',rec(200));
    setRecordOwner('B'); expect(loadBest('dawn','normal')).toBeNull();
    saveBest('dawn','normal',rec(50));
    setRecordOwner('A'); expect(loadBest('dawn','normal')?.score).toBe(200);
    setRecordOwner(null); expect(loadBest('dawn','normal')?.score).toBe(100);
  });
  it('既存ランキングの端末キーもアカウント間で共有しない', () => {
    const device = 'zombie-typing:device-key';
    recordStorage.setItem(device,'guest-key');
    setRecordOwner('A'); expect(recordStorage.getItem(device)).toBeNull();
    recordStorage.setItem(device,'account-a-key');
    setRecordOwner('B'); expect(recordStorage.getItem(device)).toBeNull();
    setRecordOwner(null); expect(recordStorage.getItem(device)).toBe('guest-key');
  });
  it('別端末でのログインはゲスト記録を送信しない', () => {
    storage.setItem(key,JSON.stringify(rec(999)));
    cacheAccountRecords(storage,'A',{ [key]:JSON.stringify(rec(100)) });
    expect(JSON.parse(accountUpdates(storage,'A')[key]).score).toBe(100);
  });
  it('再接続時に未送信の高い会員ベストを古いサーバー応答で失わない', () => {
    storage.setItem(scopedKey(key,'A'),JSON.stringify(rec(200)));
    cacheAccountRecords(storage,'A',{ [key]:JSON.stringify(rec(100)) });
    expect(JSON.parse(readAccountRecords(storage,'A')[key]).score).toBe(200);
  });
  it('名前の未送信変更を保持し、変更していない名前を同期で上書き送信しない', () => {
    setRecordOwner('A'); recordStorage.setItem(NAME_KEY,'新しい名前');
    storage.setItem(pendingNameKey('A'),'新しい名前');
    cacheAccountRecords(storage,'A',{ [NAME_KEY]:'古い名前' });
    expect(accountUpdates(storage,'A')[NAME_KEY]).toBe('新しい名前');
    storage.removeItem(pendingNameKey('A'));
    expect(accountUpdates(storage,'A')[NAME_KEY]).toBeUndefined();
  });
  it('クラウド応答に認証や購入権限などの別キーがあれば拒否する', () => {
    expect(() => cacheAccountRecords(storage,'A',{ paidSkin:'true' })).toThrow();
  });
});
