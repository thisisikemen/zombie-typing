import { describe, expect, it } from 'vitest';
import { createBackup, parseBackup, restoreBackup, BACKUP_MAX_BYTES, type RecordBackup } from '../src/ui/backup';

class MemoryStorage {
  data = new Map<string, string>();
  failOn: string | null = null;
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void {
    if (key === this.failOn) throw new Error('quota');
    this.data.set(key, value);
  }
  removeItem(key: string): void { this.data.delete(key); }
}
const best = JSON.stringify({ score: 6000, kills: 25, maxCombo: 15, accuracy: .96, cleared: true, survival: 90, wpm: 220 });
const key = 'zombie-typing:best:dawn:easy';
const makeFile = (entries: Record<string, string>, version = 1) => JSON.stringify({ format: 'zombie-typing-records', version, entries });

describe('独自ドメインへの記録引き継ぎ', () => {
  it('自己ベスト・名前・設定・識別情報を別ブラウザへ復元し、解析許可と無関係なデータは移さない', () => {
    const from = new MemoryStorage();
    from.setItem(key, best);
    from.setItem('zombie-typing:player-name', '生存者');
    from.setItem('zombie-typing:device-key', '12345678-1234-4234-8234-123456789abc');
    from.setItem('zombie-typing:settings', JSON.stringify({ volume: .5, sfx: true, bgm: false, romaji: true }));
    from.setItem('zombie-typing:analytics-consent:v1', 'granted');
    from.setItem('another-app:token', 'do-not-export');
    const file = JSON.stringify(createBackup(from));
    expect(file).not.toContain('do-not-export');
    expect(file).not.toContain('analytics-consent');
    const to = new MemoryStorage();
    to.setItem('another-app:setting', 'preserve');
    restoreBackup(to, parseBackup(file));
    expect(to.getItem(key)).toBe(best);
    expect(to.getItem('zombie-typing:player-name')).toBe('生存者');
    expect(to.getItem('zombie-typing:device-key')).toBe(from.getItem('zombie-typing:device-key'));
    expect(to.getItem('another-app:setting')).toBe('preserve');
    expect(to.getItem('zombie-typing:analytics-consent:v1')).toBeNull();
  });
  it('自己ベスト対戦の打鍵・撃破記録も保持する', () => {
    const vs = JSON.stringify({ version: 1, kills: 1, wpm: 120, accuracy: 1, keysPerKill: 3,
      shotTimesMs: [1000, 1100, 1300], killTimesMs: [1300] });
    const file = parseBackup(makeFile({ 'zombie-typing:vs-best:easy': vs }));
    expect(JSON.parse(file.entries['zombie-typing:vs-best:easy'])).toEqual(JSON.parse(vs));
  });
  it('形式違い・別アプリのキー・同意設定の挿入を拒否する', () => {
    for (const text of ['bad json', '{}', makeFile({ [key]: best }, 2), makeFile({}),
      makeFile({ 'another-app:token': 'x' }), makeFile({ 'zombie-typing:analytics-consent:v1': 'granted' }),
      makeFile(JSON.parse('{"__proto__":"x"}')), makeFile({ 'zombie-typing:device-key': 'not-uuid' })]) {
      expect(() => parseBackup(text)).toThrow();
    }
  });
  it('不正な成績や大きすぎるファイルは保存前に拒否する', () => {
    expect(() => parseBackup(makeFile({ [key]: best.replace('0.96', '2') }))).toThrow();
    expect(() => parseBackup(makeFile({ [key]: best.replace('6000', '-1') }))).toThrow();
    expect(() => parseBackup(' '.repeat(BACKUP_MAX_BYTES + 1))).toThrow();
    expect(() => parseBackup(makeFile({ 'zombie-typing:settings': '{"volume":1,"sfx":"yes","bgm":true,"romaji":true}' }))).toThrow();
  });
  it('容量不足で途中失敗した場合は元の記録へ戻す', () => {
    const storage = new MemoryStorage();
    storage.setItem(key, best);
    storage.failOn = 'zombie-typing:player-name';
    const backup = parseBackup(makeFile({ [key]: best.replace('6000', '7000'), 'zombie-typing:player-name': '名前' }));
    expect(() => restoreBackup(storage, backup)).toThrow('保存できません');
    expect(storage.getItem(key)).toBe(best);
    expect(storage.getItem('zombie-typing:player-name')).toBeNull();
  });
  it('復元時にも形式を確認し、書き込み前にファイル全体を検証する', () => {
    const storage = new MemoryStorage();
    const file = { format: 'zombie-typing-records', version: 1, entries: { [key]: best, forbidden: 'x' } } as RecordBackup;
    expect(() => restoreBackup(storage, file)).toThrow();
    expect(storage.data.size).toBe(0);
  });
});
