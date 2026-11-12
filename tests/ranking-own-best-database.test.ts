import { PGlite } from '@electric-sql/pglite';
import { beforeAll,afterAll,it,expect } from 'vitest';import {readFileSync} from 'node:fs';
let db:PGlite;const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',AK='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',GK='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
beforeAll(async()=>{db=new PGlite();await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${A}'),('${B}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table player_ranking_identity(user_id uuid primary key,device_key uuid unique);insert into player_ranking_identity values('${A}','${AK}');create table scores(device_key uuid,difficulty text,name text,score integer,survival_seconds integer,unique(device_key,difficulty));insert into scores values('${AK}','easy','A',500,12),('${GK}','easy','Guest',300,9),('${AK}','endless','A',999,70);revoke all on scores,player_ranking_identity from anon,authenticated;grant usage on schema public to anon,authenticated;`);await db.exec(readFileSync('supabase/migrations/202611130002_ranking_own_best.sql','utf8'));},20000);afterAll(async()=>db.close());
async function own(d:string,user:string|null,key:string|null){return(await db.query<{c:any}>('select ranking_own_best($1,$2,$3)c',[d,user,key])).rows[0].c;}
it('anonymous guest reads public best by existing UUID capability, never account keys',async()=>{await db.exec('set role anon');try{expect(await own('easy',null,GK)).toEqual({name:'Guest',value:300});await expect(own('easy',null,AK)).rejects.toThrow('guest identity');await expect(own('easy',A,null)).rejects.toThrow('authentication');await expect(db.query('select device_key from scores')).rejects.toThrow('permission');}finally{await db.exec('reset role');}});
it('authenticated A can read A but not B, guest keys, or mismatched session',async()=>{await db.exec(`set role authenticated;set request.jwt.claim.sub='${A}'`);try{expect(await own('easy',A,null)).toEqual({name:'A',value:500});expect(await own('endless',A,null)).toEqual({name:'A',value:70});await expect(own('easy',B,null)).rejects.toThrow('authentication');await expect(own('easy',null,GK)).rejects.toThrow('guest identity');await expect(own('easy',A,GK)).rejects.toThrow('authentication');expect(await own('hard',A,null)).toBeNull();}finally{await db.exec('reset role;reset request.jwt.claim.sub');}});
it('unknown or deleted accounts fail closed',async()=>{await db.exec(`set role authenticated;set request.jwt.claim.sub='${B}'`);try{await expect(own('easy',B,null)).rejects.toThrow('identity unavailable');}finally{await db.exec('reset role;reset request.jwt.claim.sub');}});

it('emergency revoke also disables the own-best RPC without deleting scores',async()=>{await db.exec('revoke execute on function ranking_own_best(text,uuid,uuid) from public,anon,authenticated;set role anon');try{await expect(own('easy',null,GK)).rejects.toThrow('permission denied');}finally{await db.exec('reset role');}await db.exec(`set role authenticated;set request.jwt.claim.sub='${A}'`);try{await expect(own('easy',A,null)).rejects.toThrow('permission denied');}finally{await db.exec('reset role;reset request.jwt.claim.sub');}await db.exec('grant execute on function ranking_own_best(text,uuid,uuid) to anon,authenticated;set role anon');try{expect(await own('easy',null,GK)).toEqual({name:'Guest',value:300});}finally{await db.exec('reset role');}});

it('current run replaces own slot, including worst result, ties and Endless',async()=>{
 await db.exec(readFileSync('supabase/migrations/202611130003_ranking_run_position.sql','utf8'));
 await db.exec('grant select(difficulty,score,survival_seconds) on scores to anon,authenticated;set role anon');
 const run=async(d:string,v:number)=>(await db.query<{c:any}>('select ranking_run_position($1,$2,null,$3)c',[d,v,GK])).rows[0].c;
 try {
  expect(await run('easy',100)).toEqual({rank:2,total:2});
  expect(await run('easy',500)).toEqual({rank:1,total:2});
  expect(await run('easy',600)).toEqual({rank:1,total:2});
  await expect(run('hard',100)).rejects.toThrow('saved record unavailable');
  await expect(run('easy',-1)).rejects.toThrow('invalid value');
  await expect(db.query('select device_key from scores')).rejects.toThrow('permission denied');
 }finally{await db.exec('reset role');}
 await db.exec(`set role authenticated;set request.jwt.claim.sub='${A}'`);
 try {expect((await db.query<{c:any}>(`select ranking_run_position('endless',1,$1,null)c`,[A])).rows[0].c).toEqual({rank:1,total:1});await expect(db.query(`select ranking_run_position('easy',100,$1,null)`,[B])).rejects.toThrow('authentication');}finally{await db.exec('reset role;reset request.jwt.claim.sub');}
 await db.exec('revoke execute on function ranking_run_position(text,integer,uuid,uuid) from anon,authenticated;set role anon');try{await expect(run('easy',100)).rejects.toThrow('permission denied');}finally{await db.exec('reset role');}
});
