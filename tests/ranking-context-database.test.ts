import { PGlite } from '@electric-sql/pglite';
import { beforeAll,afterAll,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
let db:PGlite;
beforeAll(async()=>{db=new PGlite();await db.exec(`
create role anon; create role authenticated;
create table scores(device_key text,difficulty text,name text,score integer,survival_seconds integer);
create index scores_profile_score_idx on scores(difficulty,score desc);
create index scores_profile_survival_idx on scores(difficulty,survival_seconds desc);
insert into scores values ('private-a','easy','A',300,10),('private-b','easy','B',200,20),('private-c','easy','C',200,30),('private-d','easy','D',100,40),('private-e','endless','E',999,15),('private-f','endless','F',1,90);
alter table scores enable row level security;
create policy display on scores for select using (true);
grant usage on schema public to anon,authenticated;
grant select(difficulty,name,score,survival_seconds) on scores to anon,authenticated;`);
await db.exec(readFileSync('supabase/migrations/202611130001_ranking_context.sql','utf8'));},20000);
afterAll(async()=>db.close());
async function query(d:string,v:number){return (await db.query<{c:any}>('select ranking_context($1,$2) c',[d,v])).rows[0].c;}
it('anon and authenticated receive exact competition ranks, totals and bounded public fields',async()=>{
for(const role of ['anon','authenticated']) {await db.exec(`set role ${role}`);try{
const c=await query('easy',200);expect(c).toMatchObject({rank:2,total:4,tied:2});expect(c.neighbors.map((n:any)=>n.rank)).toEqual([1,2,2,4]);expect(JSON.stringify(c)).not.toContain('private');
await expect(db.query('select device_key from scores')).rejects.toThrow('permission denied');
}finally{await db.exec('reset role');}}
});
it('a weaker run is distinct from a saved best and can be N+1',async()=>{expect(await query('easy',50)).toMatchObject({rank:5,total:4,tied:0});});
it('Endless uses survival seconds, never score',async()=>{expect(await query('endless',90)).toMatchObject({rank:1,total:2,tied:1});});
it('empty and invalid difficulties are not invented participants',async()=>{expect(await query('hard',10)).toMatchObject({rank:1,total:0,tied:0,neighbors:[]});await expect(query('basic',1)).rejects.toThrow('invalid');await expect(query('easy',-1)).rejects.toThrow('invalid');});
it('invoker respects row policies rather than bypassing RLS',async()=>{await db.exec('drop policy display on scores;set role anon');try{expect(await query('easy',200)).toMatchObject({total:0,neighbors:[]});}finally{await db.exec('reset role;create policy display on scores for select using(true)');}});

it('large tie groups produce exact nearby ranks without scanning all higher rows per neighbor',async()=>{await db.exec("insert into scores select 'tie'||i,'normal','T'||i,case when i<=20 then 300 when i<=70 then 200 else 100 end,0 from generate_series(1,100)i");for(const value of [50,100,150,200,250,300,350]){const c=await query('normal',value);for(const n of c.neighbors){const expected=(await db.query<{r:number}>("select 1+count(*)::int r from scores where difficulty='normal' and score>$1",[n.value])).rows[0].r;expect(n.rank).toBe(expected);}}});

it('legacy missing survival is not counted as a measured Endless result',async()=>{await db.exec("insert into scores values('old','endless','old',500,null)");expect(await query('endless',90)).toMatchObject({total:2,rank:1});});

it('tie-limited names may omit the owner without changing their correct rank',async()=>{await db.exec("insert into scores values('mine','normal','ZZZ-myself',200,0)");const c=await query('normal',200);expect(c).toMatchObject({total:101,rank:21,tied:51});expect(c.neighbors.some((n:any)=>n.name==='ZZZ-myself')).toBe(false);expect(c.neighbors.filter((n:any)=>n.value===200)).toHaveLength(3);expect(c.neighbors.filter((n:any)=>n.value===200).every((n:any)=>n.rank===21)).toBe(true);});

it('emergency EXECUTE revoke blocks direct anonymous and authenticated aggregate calls, then exact restore works',async()=>{const before=await query('easy',200);await db.exec('revoke execute on function ranking_context(text,integer) from public,anon,authenticated');for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);try{await expect(query('easy',200)).rejects.toThrow('permission denied');}finally{await db.exec('reset role');}}await db.exec('grant execute on function ranking_context(text,integer) to anon,authenticated;set role anon');try{expect(await query('easy',200)).toEqual(before);}finally{await db.exec('reset role');}});
