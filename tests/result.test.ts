// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const backend = vi.hoisted(() => ({ online: true, submit: vi.fn(), load: vi.fn(), rename: vi.fn() }));
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
  localStorage.clear();
  document.body.innerHTML = readFileSync('index.html', 'utf8').split('<body>')[1].split('</body>')[0].replace(/<script[\s\S]*?<\/script>/g, '');
  backend.online = true;
  backend.submit.mockReset().mockResolvedValue(1);
  backend.load.mockReset().mockResolvedValue([{ survival: 300, score: 100 }]);
  const noop = () => {};
  ui = new UI({ volume: .5, sfx: false, bgm: false, romaji: true }, {
    onStart: noop, onSelectDifficulty: noop, onBackToTitle: noop, onRetry: noop,
    onGotoModeSelect: noop, onResume: noop, onGiveUp: noop, onSettingsChanged: noop,
    onUserGesture: noop, onUiSound: noop,
  });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
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
    backend.load.mockResolvedValue([{ survival: 600, score: 200 }]);
    ui.showResult(result({ newRecord: false }));
    await flush();
    expect(document.getElementById('result-heading')!.textContent).toBe('GAME OVER');
  });
  it('順位を確認できない回やオフラインの1位は特別表示しない', async () => {
    backend.load.mockRejectedValue(new Error('offline'));
    ui.showResult(result());
    await flush();
    expect(document.getElementById('result-heading')!.textContent).toBe('GAME OVER');
    backend.load.mockResolvedValue([{ survival: 300 }]);
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
