-- 実プレイ時間。名前・メールを含めず、本人だけが取得・同期する。
begin;
create table public.player_play_time (
 user_id uuid not null references auth.users(id) on delete cascade,
 counter_id uuid not null,
 difficulty text not null check (difficulty in ('basic','easy','normal','hard','hardcore','endless')),
 elapsed_ms bigint not null check (elapsed_ms between 0 and 3155760000000),
 primary key(user_id,counter_id,difficulty)
);
alter table public.player_play_time enable row level security;
revoke all on public.player_play_time from public, anon, authenticated;

create function public.sync_player_play_time(p_expected_user uuid, p_counters jsonb default '[]'::jsonb, p_read boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); item jsonb; counter uuid; stage text; elapsed numeric; result jsonb;
begin
 if uid is null or uid is distinct from p_expected_user then raise exception 'authentication changed' using errcode='42501'; end if;
 -- 退会と同期を直列化。未登録・削除済み会員の記録を新しく作らない。
 perform 1 from public.player_records where user_id=uid for key share;
 if not found then raise exception 'registration required' using errcode='42501'; end if;
 if p_counters is null or jsonb_typeof(p_counters)<>'array' or jsonb_array_length(p_counters)>500 then raise exception 'invalid counters' using errcode='22023'; end if;
 for item in select * from jsonb_array_elements(p_counters) loop
  if jsonb_typeof(item)<>'object' or jsonb_typeof(item->'counter_id') is distinct from 'string'
   or jsonb_typeof(item->'difficulty') is distinct from 'string' or jsonb_typeof(item->'elapsed_ms') is distinct from 'number'
   or exists(select 1 from jsonb_object_keys(item) k where k not in ('counter_id','difficulty','elapsed_ms')) then raise exception 'invalid counter' using errcode='22023'; end if;
  counter := (item->>'counter_id')::uuid; stage := item->>'difficulty'; elapsed := (item->>'elapsed_ms')::numeric;
  if counter is null or stage not in ('basic','easy','normal','hard','hardcore','endless') or elapsed<0 or elapsed>3155760000000 or elapsed<>trunc(elapsed) then raise exception 'invalid counter' using errcode='22023'; end if;
  insert into public.player_play_time as current(user_id,counter_id,difficulty,elapsed_ms) values(uid,counter,stage,elapsed::bigint)
   on conflict(user_id,counter_id,difficulty) do update set elapsed_ms=greatest(current.elapsed_ms,excluded.elapsed_ms);
 end loop;
 if p_read then
  select coalesce(jsonb_agg(jsonb_build_object('counter_id',counter_id,'difficulty',difficulty,'elapsed_ms',elapsed_ms)), '[]'::jsonb)
   into result from public.player_play_time where user_id=uid;
  return jsonb_build_object('counters',result);
 end if;
 return '{}'::jsonb;
end $$;
revoke all on function public.sync_player_play_time(uuid,jsonb,boolean) from public, anon, authenticated;
grant execute on function public.sync_player_play_time(uuid,jsonb,boolean) to authenticated;
commit;
