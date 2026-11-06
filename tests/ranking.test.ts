import { afterEach, describe, expect, it, vi } from 'vitest';
import { setRecordOwner } from '../src/ui/record-scope';
import { OnlineBackend, sanitizeName, type RankEntry } from '../src/ui/ranking';

afterEach(() => { vi.unstubAllGlobals(); setRecordOwner(null); });
const backend = new OnlineBackend('https://example.supabase.co', 'public-test-key');
const run: RankEntry = { name: '生存者', score: 1200, kills: 1, wpm: 100, accuracy: 1, survival: 123.6, ts: 1 };

describe('今回の順位の照会', () => {
  it.each([[100, 101], [104, 105], [109, 110], [110, 'outside']] as const)(
    '上回る記録が%d件なら%jを返す', async (count, expected) => {
      const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => Array.from({ length: count }, () => ({ score: 1201 })) });
      vi.stubGlobal('fetch', fetch);
      expect(await backend.rankRun('normal', run, 'score')).toBe(expected);
      const query = new URL(fetch.mock.calls[0][0]).searchParams;
      expect(Object.fromEntries(query)).toEqual({ difficulty: 'eq.normal', select: 'score', score: 'gt.1200', limit: '110' });
    },
  );

  it('エンドレスはスコアではなく、投稿時と同じ丸め方の生存秒数で照会する', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [{ survival_seconds: 125 }] });
    vi.stubGlobal('fetch', fetch);
    expect(await backend.rankRun('endless', run, 'survival')).toBe(2);
    expect(Object.fromEntries(new URL(fetch.mock.calls[0][0]).searchParams)).toEqual({
      difficulty: 'eq.endless', select: 'survival_seconds', survival_seconds: 'gt.124', limit: '110',
    });
  });
});

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

it('新しい投稿にはクリア結果を送り、自己ベストを更新しない回の結果で上書きしない',async()=>{
 vi.stubGlobal('localStorage',{getItem:()=> '12345678-1234-1234-1234-123456789abc'});
 const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>7});vi.stubGlobal('fetch',fetch);
 await backend.submit('normal',{name:'生存者',score:100,kills:1,wpm:200,accuracy:.9,survival:120,cleared:false,ts:1},'score');
 expect(fetch.mock.calls[0][0]).toContain('/rpc/submit_score_with_outcome');
 expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({p_cleared:false,p_survival_seconds:120});
});
it('旧サーバーで新しい投稿RPCが見つからない場合だけ従来の投稿へ戻す',async()=>{
 vi.stubGlobal('localStorage',{getItem:()=> '12345678-1234-1234-1234-123456789abc'});
 const fetch=vi.fn().mockResolvedValueOnce({ok:false,status:404}).mockResolvedValueOnce({ok:true,json:async()=>8});vi.stubGlobal('fetch',fetch);
 expect(await backend.submit('easy',{name:'生存者',score:100,kills:1,wpm:100,accuracy:1,survival:90,cleared:true,ts:1},'score')).toBe(8);
 expect(fetch.mock.calls[1][0]).toContain('/rpc/submit_score');expect(JSON.parse(fetch.mock.calls[1][1].body)).not.toHaveProperty('p_cleared');
});

it('会員キーが消えた後は勝手に別のランキング枠を作って投稿しない',async()=>{
 setRecordOwner('deleted-member');vi.stubGlobal('localStorage',{getItem:()=>null});
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 await expect(backend.rename('以前の名前')).rejects.toThrow('account ranking identity unavailable');expect(fetch).not.toHaveBeenCalled();
});
