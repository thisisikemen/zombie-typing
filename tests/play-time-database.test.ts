import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', D = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    create table public.player_records(user_id uuid primary key references auth.users(id) on delete cascade);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to authenticated,anon;
    grant execute on function auth.uid() to authenticated,anon;`);
  await db.exec(readFileSync('supabase/migrations/202611050001_play_time.sql', 'utf8'));
}, 20000);
beforeEach(async () => {
  await db.exec(`delete from public.player_play_time; insert into auth.users values('${A}'),('${B}') on conflict do nothing;
    insert into public.player_records values('${A}') on conflict do nothing;`);
});
afterAll(async () => db?.close());
async function asUser(id: string, action: () => Promise<void>) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${id}';`);
  try { await action(); } finally { await db.exec('reset role; reset request.jwt.claim.sub;'); }
}
async function sync(owner: string, counters: unknown) {
  return (await db.query<{ result: { counters: Array<{counter_id:string;difficulty:string;elapsed_ms:number}> } }>('select public.sync_player_play_time($1,$2::jsonb) as result', [owner, JSON.stringify(counters)])).rows[0].result;
}
describe('本人だけのプレイ時間・再送の安全性', () => {
  it('再送はmax、別端末は合計できる値として返し、古い応答で巻き戻らない', async () => {
    await asUser(A, async () => {
      const c = { counter_id: C, difficulty: 'basic', elapsed_ms: 120000 };
      await sync(A, [c]); await sync(A, [c]); await sync(A, [{...c, elapsed_ms: 10000}]);
      const result = await sync(A, [{ counter_id: D, difficulty: 'basic', elapsed_ms: 30000 }]);
      expect(result.counters.reduce((sum, r) => sum + r.elapsed_ms, 0)).toBe(150000);
    });
  });
  it('負の値・小数・不明な難易度・余計な情報を一切保存しない', async () => {
    await asUser(A, async () => {
      const valid = {counter_id:C,difficulty:'easy',elapsed_ms:1000};
      await sync(A, [valid]);
      for (const invalid of [{...valid,elapsed_ms:-1}, {...valid,elapsed_ms:1.5}, {...valid,difficulty:'vs'}, {...valid,email:'secret'}, {...valid,counter_id:'bad'}]) {
        await expect(sync(A, [invalid])).rejects.toThrow();
      }
      expect((await sync(A, [])).counters).toEqual([valid]);
    });
  });
  it('別会員・未登録・匿名の取得と書き込みを拒否する', async () => {
    await asUser(B, async () => {
      await expect(sync(A, [])).rejects.toThrow('authentication changed');
      await expect(sync(B, [])).rejects.toThrow('registration required');
      await expect(db.exec('select * from public.player_play_time')).rejects.toThrow('permission denied');
    });
    await db.exec('set role anon');
    try { await expect(sync(A, [])).rejects.toThrow('permission denied'); } finally { await db.exec('reset role'); }
  });
  it('退会で時間も消え、削除済みの会員への再投稿を拒否する', async () => {
    await asUser(A, async () => { await sync(A, [{counter_id:C,difficulty:'normal',elapsed_ms:120000}]); });
    await db.exec(`delete from auth.users where id='${A}'`);
    expect((await db.query('select * from public.player_play_time')).rows).toHaveLength(0);
    await asUser(A, async () => { await expect(sync(A, [])).rejects.toThrow('registration required'); });
  });
});
