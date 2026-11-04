// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../src/core/game';
import { getDifficulty, getMode } from '../src/core/modes';
import { WordPool } from '../src/core/words';
import { PlayTimeRun, formatPlayTime, mergePlayCounters, parsePlayTimeEntry, playTimeKey, playTimeTotals, readPlayCounters, syncPlayTime } from '../src/ui/play-time';
import { recordStorage, setRecordOwner } from '../src/ui/record-scope';
import { createBackup, mergeBackup, parseBackup, restoreBackup } from '../src/ui/backup';
const A = '11111111-1111-4111-8111-111111111111';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const D = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
beforeEach(() => { localStorage.clear(); setRecordOwner(null); });
describe('実プレイ時間の積み上げ', () => {
  it('クリア時間は制限時間まで、失敗・途中終了はその回の時間だけを加算する', () => {
    const diff = getDifficulty(getMode('dawn'), 'normal');
    const game = new Game(diff, new WordPool([]));
    const timer = new PlayTimeRun('normal');
    while (game.status === 'running') {
      game.update(.05);
      timer.observe(Math.min(game.time, game.duration));
    }
    timer.flush();
    expect(playTimeTotals().normal).toBe(120000);
    const failed = new PlayTimeRun('normal'); failed.observe(17.625); failed.flush();
    expect(playTimeTotals().normal).toBe(137625);
  });
  it('一時停止・メニュー・再開待ちなど時間を進めない期間は加算せず、再保存もしない', () => {
    const timer = new PlayTimeRun('basic');
    timer.observe(12.5); timer.flush();
    timer.flush(); timer.observe(12.5); timer.flush();
    expect(playTimeTotals().basic).toBe(12500);
    timer.observe(13.25); timer.flush();
    expect(playTimeTotals().basic).toBe(13250);
  });
  it('5秒ごとに途中保存し、同じ回の累積値をもう一度渡しても重複しない', () => {
    const timer = new PlayTimeRun('endless');
    timer.observe(5); expect(playTimeTotals().endless).toBe(5000);
    timer.observe(5); timer.observe(4); timer.observe(8); timer.flush();
    expect(playTimeTotals().endless).toBe(8000);
  });
  it('別端末の時間は合計し、同期・再送した同じ時間は大きい方だけ残す', () => {
    mergePlayCounters(null, [{ counter_id: C, difficulty: 'easy', elapsed_ms: 12000 }]);
    mergePlayCounters(null, [{ counter_id: C, difficulty: 'easy', elapsed_ms: 10000 }, { counter_id: D, difficulty: 'easy', elapsed_ms: 5000 }]);
    mergePlayCounters(null, readPlayCounters());
    expect(playTimeTotals().easy).toBe(17000);
  });
  it('会員とゲストを分離し、登録・ログアウト後の新しい練習も二重加算せず合流できる', () => {
    const guest = new PlayTimeRun('basic'); guest.observe(10); guest.flush();
    mergePlayCounters(A, readPlayCounters(null));
    setRecordOwner(A);
    const member = new PlayTimeRun('basic'); member.observe(20); member.flush();
    expect(playTimeTotals().basic).toBe(30000);
    setRecordOwner(null);
    const again = new PlayTimeRun('basic'); again.observe(5); again.flush();
    expect(playTimeTotals().basic).toBe(15000);
    mergePlayCounters(A, readPlayCounters(null));
    expect(playTimeTotals(A).basic).toBe(35000);
    expect(playTimeTotals('other').basic).toBe(0);
  });
  it('ファイルに含めても、復元・同じファイルの再読込で累計を減らしたり倍にしたりしない', () => {
    const timer = new PlayTimeRun('basic'); timer.observe(13); timer.flush();
    const file = parseBackup(JSON.stringify(createBackup(recordStorage)));
    timer.observe(20); timer.flush();
    restoreBackup(recordStorage, mergeBackup(recordStorage, file));
    expect(playTimeTotals().basic).toBe(20000);
    expect(() => parsePlayTimeEntry(playTimeKey({counter_id:C,difficulty:'basic',elapsed_ms:0}), '-1')).toThrow();
    expect(formatPlayTime(3661250)).toBe('1時間01分01秒');
  });
  it('同期先が変わるまでに返らなかった結果を別会員に取り込まない', async () => {
    let finish!: (value: unknown) => void;
    const rpc = vi.fn(() => ({ abortSignal: () => new Promise(resolve => { finish = resolve; }) }));
    let current = true;
    const pending = syncPlayTime({ rpc } as any, A, () => current);
    current = false;
    finish({ data: { counters: [{ counter_id: C, difficulty: 'basic', elapsed_ms: 99999 }] }, error: null });
    await pending;
    expect(playTimeTotals(A).basic).toBe(0);
  });
});
