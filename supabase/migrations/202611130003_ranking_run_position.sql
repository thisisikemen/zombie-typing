-- Current run comparison only. No writes, names, nearby rows or new participants.
begin;
create function public.ranking_run_position(p_difficulty text,p_value integer,p_expected_user uuid default null,p_guest_key uuid default null) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare own jsonb; own_value integer; total bigint; higher bigint; col text;
begin
 if p_value is null or p_value<0 then raise exception 'invalid value' using errcode='22023';end if;
 -- Existing narrowly scoped identity check. The aggregate below remains INVOKER/RLS protected.
 own:=public.ranking_own_best(p_difficulty,p_expected_user,p_guest_key);
 own_value:=(own->>'value')::integer;
 if own_value is null then raise exception 'saved record unavailable' using errcode='22023';end if;
 col:=case when p_difficulty='endless' then 'survival_seconds' else 'score' end;
 execute format('select count(*),count(*) filter(where %I>$2) from public.scores where difficulty=$1 and %I is not null',col,col) into total,higher using p_difficulty,p_value;
 higher:=higher-case when own_value>p_value then 1 else 0 end;
 if total<1 or higher<0 or higher>=total then raise exception 'ranking unavailable' using errcode='22023';end if;
 return jsonb_build_object('rank',higher+1,'total',total);
end $$;
revoke all on function public.ranking_run_position(text,integer,uuid,uuid) from public;
grant execute on function public.ranking_run_position(text,integer,uuid,uuid) to anon,authenticated;
commit;
