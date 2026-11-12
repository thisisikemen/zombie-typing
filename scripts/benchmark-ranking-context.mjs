// Synthetic local PostgreSQL (PGlite), never production. Not a Supabase capacity guarantee.
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,writeFileSync} from 'node:fs';
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create table scores(difficulty text,name text,score integer,survival_seconds integer);create index scores_profile_score_idx on scores(difficulty,score desc);create index scores_profile_survival_idx on scores(difficulty,survival_seconds desc);grant usage on schema public to anon,authenticated;grant select(difficulty,name,score,survival_seconds) on scores to anon,authenticated;`);
await db.exec(readFileSync('supabase/migrations/202611130001_ranking_context.sql','utf8'));
const results=[];
for(const n of [1000,10000,100000]){
await db.exec(`truncate scores;insert into scores select case when i%5=0 then 'endless' else 'easy' end,'survivor '||i,(i%10000),i%300 from generate_series(1,${n}) i;analyze scores;set role anon;`);
for(const [difficulty,value] of [['easy',100],['easy',5000],['endless',10]]){
const times=[];let payload;
for(let i=0;i<6;i++){const t=performance.now();payload=(await db.query('select ranking_context($1,$2) c',[difficulty,value])).rows[0].c;times.push(performance.now()-t);}
results.push({rows:n,difficulty,value,firstMs:+times[0].toFixed(2),medianWarmMs:+times.slice(1).sort((a,b)=>a-b)[2].toFixed(2),payloadBytes:Buffer.byteLength(JSON.stringify(payload)),neighbors:payload.neighbors.length});
}
await db.exec('reset role');
}
const plan=await db.query(`explain (analyze,buffers,format json) select count(*) from scores where difficulty='easy' and score>100`);
writeFileSync('ranking-context-benchmark.json',JSON.stringify({engine:'PGlite local WASM; synthetic data; not production Supabase',results,examplePlan:plan.rows},null,2));console.log(JSON.stringify(results,null,2));await db.close();
