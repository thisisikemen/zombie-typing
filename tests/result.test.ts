// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const backend = vi.hoisted(() => ({ online: true, submit: vi.fn(), rankRun: vi.fn(), load: vi.fn(), rename: vi.fn() }));
vi.mock('../src/ui/ranking', async importOriginal => ({
  ...await importOriginal<typeof import('../src/ui/ranking')>(), rankingBackend: backend,
}));
import { UI, type ResultData } from '../src/ui/screens';
const result = (overrides: Partial<ResultData> = {}): ResultData => ({
  cleared: false, score: 100, kills: 1, accuracy: 1, misses: 0, maxCombo: 1, wpm: 100,
  survival: 300, modeLabel: '夜は明けない', diffId: 'endless', diffLabel: 'エンドレス',
  rankBy: 'survival', ranked: true, endless: true, practice: false, vs: null, newRecord: true,
  ...overrides,
});
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
let ui: UI;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv('VITE_ENABLE_RANKING_CONTEXT','false');
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('unexpected real network')));
  localStorage.clear();
  document.body.innerHTML = readFileSync('index.html', 'utf8').split('<body>')[1].split('</body>')[0].replace(/<script[\s\S]*?<\/script>/g, '');
  backend.online = true;
  backend.submit.mockReset().mockResolvedValue(1);
  backend.rankRun.mockReset().mockResolvedValue(1);
  backend.load.mockReset();
  const noop = () => {};
  ui = new UI({ volume: .5, sfx: false, bgm: false, romaji: true }, {
    onStart: noop, onSelectDifficulty: noop, onBackToTitle: noop, onRetry: noop,
    onGotoModeSelect: noop, onResume: noop, onGiveUp: noop, onSettingsChanged: noop,
    onUserGesture: noop, onUiSound: noop,
  });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('エンドレス世界1位の特別な見出し', () => {
  it('今回の生存時間も世界1位と確認できたときだけ特別表示する', async () => {
    ui.showResult(result());
    await flush();
    expect(document.getElementById('result-heading')!.textContent).toBe('世界で一番長く生き延びた');
  });
  it('世界2位・3位は通常のGAME OVERにする', async () => {
    for (const rank of [2, 3]) {
      backend.submit.mockResolvedValue(rank);
      ui.showResult(result());
      await flush();
      expect(document.getElementById('result-heading')!.textContent).toBe('GAME OVER');
    }
  });
  it('保存済み自己ベストが1位でも、今回の時間が短い場合は特別表示しない', async () => {
    backend.rankRun.mockResolvedValue(2);
    ui.showResult(result({ newRecord: false }));
    await flush();
    expect(document.getElementById('result-heading')!.textContent).toBe('GAME OVER');
  });
  it('順位を確認できない回やオフラインの1位は特別表示しない', async () => {
    backend.rankRun.mockRejectedValue(new Error('offline'));
    ui.showResult(result());
    await flush();
    expect(document.getElementById('result-heading')!.textContent).toBe('GAME OVER');
    backend.rankRun.mockResolvedValue(1);
    backend.online = false;
    ui.showResult(result());
    await flush();
    expect(document.getElementById('result-heading')!.textContent).toBe('GAME OVER');
  });
  it('通常モードの1位にはエンドレス用の文言を表示しない', async () => {
    ui.showResult(result({ endless: false, diffId: 'normal', rankBy: 'score' }));
    await flush();
    expect(document.getElementById('result-heading')!.textContent).toBe('GAME OVER');
  });
  it('前の結果の応答が遅れて届いても、新しい結果の見出しを変えない', async () => {
    let resolve!: (value: number) => void;
    backend.submit.mockReturnValueOnce(new Promise<number>(r => { resolve = r; })).mockResolvedValueOnce(2);
    ui.showResult(result());
    ui.showResult(result({ survival: 200, newRecord: false }));
    await flush();
    resolve(1);
    await flush();
    expect(document.getElementById('result-heading')!.textContent).toBe('GAME OVER');
  });
});

describe('リザルトの今回の順位', () => {
  it('公開一覧の外でも110位まで表示し、今回と自己ベストを区別する', async () => {
    backend.submit.mockResolvedValue(78);
    backend.rankRun.mockResolvedValue(110);
    ui.showResult(result());
    await flush();
    expect(document.getElementById('register-status')!.textContent).toBe('世界 110位（自己ベスト 78位）（名無しの生存者）');
    expect(backend.load).not.toHaveBeenCalled();
  });

  it('自己ベストが上位でも、今回が111位以下なら指定された圏外表示にする', async () => {
    backend.submit.mockResolvedValue(78);
    backend.rankRun.mockResolvedValue('outside');
    ui.showResult(result());
    await flush();
    expect(document.getElementById('register-status')!.textContent).toBe('ランキング圏外（110位まで表示）');
  });

  it('照会に失敗した場合は自己ベストを今回の順位として表示しない', async () => {
    backend.submit.mockResolvedValue(78);
    backend.rankRun.mockRejectedValue(new Error('offline'));
    ui.showResult(result());
    await flush();
    expect(document.getElementById('register-status')!.textContent).toContain('今回の順位を確認できません（自己ベスト：世界 78位）');
  });
});


describe('自動の今回順位（新経路）',()=>{
 it('操作せず元の欄へ今回順位と人数を表示し、自己ベスト詳細は出さない',async()=>{
  vi.stubEnv('VITE_ENABLE_RANKING_CONTEXT','true');
  const f=vi.fn().mockResolvedValue({ok:true,json:async()=>({rank:701,total:802})});vi.stubGlobal('fetch',f);
  backend.submit.mockResolvedValue(5);ui.showResult(result());await flush();
  expect(document.getElementById('register-status')!.textContent).toBe('今回の順位：802人中 701位');
  expect(document.getElementById('ranking-context')).toBeNull();
  expect(backend.rankRun).not.toHaveBeenCalled();expect(f).toHaveBeenCalledTimes(1);
 });
 it('新集計失敗時も保存済みと伝え、自己ベストや圏外で代用しない',async()=>{
  vi.stubEnv('VITE_ENABLE_RANKING_CONTEXT','true');ui.showResult(result());await flush();
  expect(backend.submit).toHaveBeenCalledTimes(1);
  expect(document.getElementById('register-status')!.textContent).toBe('記録を保存しました。今回の順位は確認できませんでした');
  expect(backend.rankRun).not.toHaveBeenCalled();
 });
});
