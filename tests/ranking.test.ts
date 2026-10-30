import { afterEach, describe, expect, it, vi } from 'vitest';
import { OnlineBackend, sanitizeName } from '../src/ui/ranking';

afterEach(() => vi.unstubAllGlobals());
const backend = new OnlineBackend('https://example.supabase.co', 'public-test-key');
describe('ランキングの送信', () => {
  it('保存禁止でも同じセッションは同じランダムキーを使い、共通キーにしない', async () => {
    vi.stubGlobal('localStorage', { getItem() { throw Error(); } });
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetch);
    await backend.rename('一人目');
    await backend.rename('変更後');
    const first = JSON.parse(fetch.mock.calls[0][1].body);
    const second = JSON.parse(fetch.mock.calls[1][1].body);
    expect(first.p_device_key).toBe(second.p_device_key);
    expect(first.p_device_key).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.p_device_key).not.toBe('00000000-0000-4000-8000-000000000000');
  });
  it('名前変更のサーバー拒否を成功扱いしない', async () => {
    vi.stubGlobal('localStorage', { getItem: () => '12345678-1234-1234-1234-123456789abc' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    await expect(backend.rename('名前')).rejects.toThrow('403');
  });
  it('表示不要な端末キーは取得せず、クエリに難易度を埋め込めない', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal('fetch', fetch);
    await backend.load('easy&select=device_key', 'score');
    expect(fetch.mock.calls[0][0]).toContain('difficulty=eq.easy%26select%3Ddevice_key');
    expect(fetch.mock.calls[0][0]).toContain('&select=name,score,kills,wpm,accuracy,updated_at,survival_seconds');
  });
  it('名前は制御文字を除去し、Unicodeの10文字に収める', () => {
    expect(sanitizeName(' \n\t ')).toBe('名無しの生存者');
    expect(sanitizeName('😀'.repeat(11))).toBe('😀'.repeat(10));
  });
});
