-- Candidate only: do not apply before production plan/RLS/performance review.
-- Public display data only. INVOKER preserves scores RLS and column grants.
begin;
create function public.ranking_context(p_difficulty text, p_value integer) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare col text; result jsonb;
begin
 if p_difficulty not in ('easy','normal','hard','hardcore','endless') or p_difficulty is null
    or p_value is null or p_value < 0 then
   raise exception 'invalid ranking context' using errcode = '22023';
 end if;
 col := case when p_difficulty = 'endless' then 'survival_seconds' else 'score' end;
 -- Exact counts still cost database work. No full leaderboard is transferred.
 execute format($q$
 with counts as (
   select count(*) as total, count(*) filter(where %1$I > $2) as higher,
     count(*) filter(where %1$I = $2) as tied from public.scores where difficulty = $1 and %1$I is not null
 ), nearby as (
   (select name, %1$I as value from public.scores where difficulty=$1 and %1$I > $2 order by %1$I asc, name asc limit 3)
   union all
   (select name, %1$I as value from public.scores where difficulty=$1 and %1$I = $2 order by name asc limit 3)
   union all
   (select name, %1$I as value from public.scores where difficulty=$1 and %1$I < $2 order by %1$I desc, name asc limit 3)
 ), groups as (
   select distinct value from nearby
 ), sizes as (
   select g.value,(select count(*) from public.scores s where s.difficulty=$1 and s.%1$I=g.value) as size from groups g
 ), ranked as (
   select n.name,n.value, case when n.value>$2 then
     (select higher+1 from counts)-(select sum(size) from sizes where value>$2 and value<=n.value)
     when n.value=$2 then (select higher+1 from counts)
     else (select higher+tied+1 from counts)+coalesce((select sum(size) from sizes where value<$2 and value>n.value),0)
   end as rank from nearby n
 )
 select jsonb_build_object('total',total,'rank',higher+1,'tied',tied,'neighbors',
   coalesce((select jsonb_agg(jsonb_build_object('name',name,'value',value,'rank',rank) order by value desc,name asc) from ranked),'[]'::jsonb)) from counts
 $q$, col) into result using p_difficulty,p_value;
 return result;
end $$;
revoke all on function public.ranking_context(text,integer) from public;
grant execute on function public.ranking_context(text,integer) to anon, authenticated;
commit;
