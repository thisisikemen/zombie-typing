import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
let db: PGlite;
const device='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
beforeAll(async()=>{
 db=new PGlite();
 // 既存の8引数RPCと同じ、ベストだけを置換する契約を持つ旧サーバー。
 await db.exec(`create role anon;create role authenticated;
  create table public.scores(device_key uuid,difficulty text,name text,score integer,kills integer,wpm integer,accuracy real,survival_seconds integer,primary key(device_key,difficulty));
  create function public.submit_score(p_device_key uuid,p_difficulty text,p_name text,p_score integer,p_kills integer,p_wpm integer,p_accuracy real,p_survival_seconds integer) returns integer language plpgsql security definer as $$
  begin
   if p_score < 0 then raise exception 'invalid score'; end if;
   insert into public.scores values(p_device_key,p_difficulty,p_name,p_score,p_kills,p_wpm,p_accuracy,p_survival_seconds)
   on conflict(device_key,difficulty) do update set score=excluded.score,survival_seconds=excluded.survival_seconds
   where (case when excluded.difficulty='endless' then excluded.survival_seconds>scores.survival_seconds else excluded.score>scores.score end);
   return 1;
  end $$;`);
 await db.exec(readFileSync('supabase/migrations/202611020002_ranking_outcome.sql','utf8'));
},20000);
afterAll(async()=>db?.close());
const submit=async(diff:string,score:number,survival:number,clear:boolean)=>db.query('select public.submit_score_with_outcome($1,$2,$3,$4,$5,$6,$7,$8,$9)',[device,diff,'生存者',score,1,100,1,survival,clear]);
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
  await expect(submit('normal',-1,120,true)).rejects.toThrow('invalid score');
  expect((await row('normal')).cleared).toBe(false);
 });
 it('公開APIは結果の列だけを読み、本人識別キーの列権限を広げない',async()=>{
  await db.exec('set role anon');
  try {
   expect((await db.query('select cleared from public.scores')).rows.length).toBe(2);
   await expect(db.query('select device_key from public.scores')).rejects.toThrow('permission denied');
  } finally {await db.exec('reset role');}
 });
});
