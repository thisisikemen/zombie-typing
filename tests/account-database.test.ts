import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const key = 'zombie-typing:best:dawn:normal';
const records = (score: number) => ({ [key]: JSON.stringify({score,kills:1,maxCombo:1,accuracy:1,cleared:true}) });
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    insert into auth.users values ('${A}'), ('${B}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to authenticated,anon;
    grant execute on function auth.uid() to authenticated,anon;`);
  await db.exec(readFileSync('supabase/migrations/202610310001_optional_accounts.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/202610310002_require_registration_consent.sql','utf8'));
}, 20000);
afterAll(async () => db?.close());
async function asUser(id: string, action: () => Promise<unknown>) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${id}';`);
  try { return await action(); } finally { await db.exec('reset role; reset request.jwt.claim.sub;'); }
}
async function sync(id: string, initial: unknown = null, updates: unknown = {}) {
  const result = await db.query<{result:{entries:Record<string,string>;imported:boolean;needs_registration:boolean}}>('select public.sync_player_records($1,$2::jsonb,$3::jsonb) as result',[id,initial === null ? null : JSON.stringify(initial),JSON.stringify(updates)]);
  return result.rows[0].result;
}
describe('PostgreSQLによる本人確認・初回引き継ぎ・同期', () => {
  it('初回の登録端末だけを引き継ぎ、二度目や別端末からの初期記録で上書きしない', async () => {
    await asUser(A,async () => {
      expect((await sync(A,records(100))).imported).toBe(true);
      const again = await sync(A,records(999));
      expect(again.imported).toBe(false);
      expect(JSON.parse(again.entries[key]).score).toBe(100);
    });
  });
  it('既存ログインでは空のゲスト端末から初期記録を追加せず、ベストは単調に更新する', async () => {
    await asUser(A,async () => {
      expect(JSON.parse((await sync(A,null,records(200))).entries[key]).score).toBe(200);
      expect(JSON.parse((await sync(A,null,records(50))).entries[key]).score).toBe(200);
    });
  });
  it('BはAの記録を読めず、所有者を指定して更新することもできない', async () => {
    await asUser(B,async () => {
      const read = await db.query('select * from public.player_records where user_id = $1',[A]);
      expect(read.rows).toHaveLength(0);
      await expect(sync(A,null,records(999))).rejects.toThrow('authentication changed');
    });
  });
  it('本人にもテーブルへの直接書き込み権限を与えない', async () => {
    await asUser(A,async () => {
      await expect(db.exec('update public.player_records set entries = \'{}\'')).rejects.toThrow('permission denied');
    });
  });
  it('未ログインのRPCとテーブル読み取りを拒否する', async () => {
    await db.exec('set role anon');
    try {
      await expect(sync(A)).rejects.toThrow('permission denied');
      await expect(db.exec('select * from public.player_records')).rejects.toThrow('permission denied');
    } finally { await db.exec('reset role'); }
  });
  it('購入権限の混入・不正数値・未知のモードを拒否して以前の記録を残す', async () => {
    await asUser(A,async () => {
      for (const bad of [{paidSkins:'all'}, {[key]:'{"score":-1}'}, {'zombie-typing:best:admin:easy':'{}'}]) {
        await expect(sync(A,null,bad)).rejects.toThrow();
      }
      expect(JSON.parse((await sync(A)).entries[key]).score).toBe(200);
    });
  });
  it('ログインを先に選んだ新規ユーザーは確認まで初期化せず、確認後の端末記録を引き継ぐ', async () => {
    await asUser(B,async () => {
      expect((await sync(B)).needs_registration).toBe(true);
      expect((await db.query('select * from public.player_records')).rows).toHaveLength(0);
      const registered = await sync(B,records(321));
      expect(registered.imported).toBe(true);
      expect(JSON.parse(registered.entries[key]).score).toBe(321);
    });
  });
});
