-- Candidate only. Does not grant public table access or change score rows.
begin;
create function public.ranking_own_best(p_difficulty text,p_expected_user uuid default null,p_guest_key uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid(); key uuid; result jsonb;
begin
 if p_difficulty is null or p_difficulty not in ('easy','normal','hard','hardcore','endless') then raise exception 'invalid difficulty' using errcode='22023'; end if;
 if p_expected_user is not null then
   if uid is null or uid is distinct from p_expected_user or p_guest_key is not null then raise exception 'authentication changed' using errcode='42501'; end if;
   select i.device_key into key from public.player_ranking_identity i join auth.users u on u.id=i.user_id where i.user_id=uid;
   if key is null then raise exception 'identity unavailable' using errcode='42501'; end if;
 else
   -- Guest UUID possession is the existing guest capability, not verified human identity.
   if uid is not null or p_guest_key is null or exists(select 1 from public.player_ranking_identity i where i.device_key=p_guest_key) then raise exception 'guest identity unavailable' using errcode='42501'; end if;
   key:=p_guest_key;
 end if;
 select jsonb_build_object('name',s.name,'value',case when p_difficulty='endless' then s.survival_seconds else s.score end)
 into result from public.scores s where s.device_key=key and s.difficulty=p_difficulty;
 return result;
end $$;
revoke all on function public.ranking_own_best(text,uuid,uuid) from public;
grant execute on function public.ranking_own_best(text,uuid,uuid) to anon,authenticated;
commit;
