import { describe, expect, it, vi } from 'vitest';
import { Analytics } from '../src/analytics';

function setup(saved: string | null = null) {
  const send = vi.fn();
  const storage = { getItem: () => saved, setItem: vi.fn() };
  return { send, storage, analytics: new Analytics(storage, send) };
}

describe('アクセス解析の許可と送信範囲', () => {
  it('未選択・拒否では送信せず、許可後のイベントだけを送る', () => {
    const { analytics, send } = setup();
    const data = { mode: 'dawn', difficulty: 'normal' };
    analytics.track('game_start', data);
    analytics.choose('denied');
    analytics.track('game_end', data);
    expect(send).not.toHaveBeenCalled();
    analytics.choose('granted');
    analytics.track('game_retry', data);
    expect(send).toHaveBeenCalledTimes(1);
    analytics.choose('denied');
    analytics.track('share', data);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('名前・識別キー・入力内容・不正な数値を送らない', () => {
    const { analytics, send } = setup('granted');
    analytics.track('game_end', {
      ...{ name: '秘密', device_key: 'secret', input: 'typing' },
      mode: 'endless', difficulty: 'endless', score: 3000, wpm: NaN,
    });
    expect(send).toHaveBeenCalledWith('game_end', { mode: 'endless', difficulty: 'endless', score: 3000 });
  });
  it('保存領域が禁止されても、初期状態は不許可でゲームを止めない', () => {
    const send = vi.fn();
    const analytics = new Analytics({ getItem() { throw Error(); }, setItem() { throw Error(); } }, send);
    expect(analytics.choice).toBeNull();
    expect(() => analytics.choose('denied')).not.toThrow();
    analytics.track('game_start', { mode: 'dawn', difficulty: 'easy' });
    expect(send).not.toHaveBeenCalled();
  });
});
