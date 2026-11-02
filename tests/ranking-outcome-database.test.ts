import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
let db: PGlite;
const device='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create table public.revoked_ranking_keys(device_key uuid primary key);
  create table public.scores(id bigint generated always as identity,device_key uuid,difficulty text,name text,score integer,kills integer,wpm integer,accuracy real,survival_seconds integer,updated_at timestamptz not null default now(),primary key(device_key,difficulty));`);
 await db.exec(readFileSync('supabase/migrations/202611020002_ranking_outcome.sql','utf8'));
 await db.exec(readFileSync('supabase/migrations/202611020004_legacy_outcome_compatibility.sql','utf8'));
},20000);
afterAll(async()=>db?.close());
const submit=async(diff:string,score:number,survival:number,clear:boolean)=>{
 await db.query("update public.scores set updated_at=now()-interval '1 minute' where device_key=$1",[device]);
 return db.query('select public.submit_score_with_outcome($1,$2,$3,$4,$5,$6,$7,$8,$9)',[device,diff,'生存者',score,1,100,1,survival,clear]);
};
const row=async(diff:string)=>(await db.query<{score:number;survival_seconds:number;cleared:boolean}>('select score,survival_seconds,cleared from public.scores where difficulty=$1',[diff])).rows[0];
describe('ランキング結果を自己ベストと一緒に保存',()=>{
 it('クリア結果を保存し、スコアが低い回の結果・時間では上書きしない',async()=>{
  await submit('normal',100,120,true);await submit('normal',50,40,false);
  expect(await row('normal')).toMatchObject({score:100,survival_seconds:120,cleared:true});
  await submit('normal',200,120,false);expect(await row('normal')).toMatchObject({score:200,cleared:false});
 });
 it('同点の回は元の自己ベストの結果を残す',async()=>{
  await submit('normal',200,120,true);expect((await row('normal')).cleared).toBe(false);
 });
 it('エンドレスはスコアではなく、生存時間を更新条件に使う',async()=>{
  await submit('endless',100,300,false);await submit('endless',200,200,false);
  expect(await row('endless')).toMatchObject({score:100,survival_seconds:300});
  await submit('endless',50,400,false);expect(await row('endless')).toMatchObject({score:50,survival_seconds:400});
 });
 it('旧RPCの拒否を回避せず、途中で失敗した回の結果を残さない',async()=>{
  await submit('normal',200,120,false);
  await expect(db.query('select public.submit_score_with_outcome($1,$2,$3,$4,$5,$6,$7,$8,$9)',[device,'normal','生存者',300,1,100,1,120,true])).rejects.toThrow('too many submissions');
  expect((await row('normal')).cleared).toBe(false);
 });
 it('旧画面から高い記録を投稿しても、前の回のクリア結果を使わない',async()=>{
  await submit('easy',100,90,true);
  await db.query("update public.scores set updated_at=now()-interval '1 minute' where device_key=$1",[device]);
  await db.query('select public.submit_score($1,$2,$3,$4,$5,$6,$7,$8)',[device,'easy','旧画面',200,1,100,1,60]);
  expect(await row('easy')).toMatchObject({score:200,survival_seconds:60,cleared:null});
 });
 it('公開APIは結果の列だけを読み、本人識別キーの列権限を広げない',async()=>{
  await db.exec('set role anon');
  try {
   expect((await db.query('select cleared from public.scores')).rows.length).toBe(3);
   await expect(db.query('select device_key from public.scores')).rejects.toThrow('permission denied');
  } finally {await db.exec('reset role');}
 });
});
