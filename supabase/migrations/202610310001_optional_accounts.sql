-- 任意ログインの個人記録のみ。旧scores・課金権限には触れない。
begin;
create table public.player_records (
  user_id uuid primary key references auth.users(id) on delete cascade,
  entries jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(entries) = 'object' and octet_length(entries::text) <= 2097152)
);
alter table public.player_records enable row level security;
revoke all on public.player_records from public, anon, authenticated;
grant select on public.player_records to authenticated;
create policy player_records_read_own on public.player_records for select to authenticated
  using ((select auth.uid()) = user_id);

create function public.validate_player_records(p_entries jsonb) returns void
language plpgsql set search_path = '' as $$
declare k text; raw jsonb; r jsonb; f text; n numeric; v jsonb;
begin
  if p_entries is null or jsonb_typeof(p_entries) <> 'object' or octet_length(p_entries::text) > 2097152 then
    raise exception 'invalid records' using errcode = '22023';
  end if;
  for k, raw in select * from jsonb_each(p_entries) loop
    if jsonb_typeof(raw) <> 'string' then raise exception 'invalid record value' using errcode = '22023'; end if;
    if k = 'zombie-typing:player-name' then
      if char_length(raw #>> '{}') > 10 or (raw #>> '{}') ~ '[[:cntrl:]]' then raise exception 'invalid name' using errcode = '22023'; end if;
      continue;
    end if;
    if k !~ '^zombie-typing:(best:(dawn:(basic|easy|normal|hard|hardcore)|endless:endless)|vs-best:(easy|normal|hard|hardcore))$' then
      raise exception 'invalid record key' using errcode = '22023';
    end if;
    r := (raw #>> '{}')::jsonb;
    if jsonb_typeof(r) <> 'object' then raise exception 'invalid record' using errcode = '22023'; end if;
    if k like 'zombie-typing:vs-best:%' then
      if r->>'version' is distinct from '1' then raise exception 'invalid version' using errcode = '22023'; end if;
      foreach f in array array['kills','wpm','accuracy','keysPerKill'] loop
        if jsonb_typeof(r->f) is distinct from 'number' then raise exception 'invalid number' using errcode = '22023'; end if;
      end loop;
      foreach f in array array['shotTimesMs','killTimesMs'] loop
        if jsonb_typeof(r->f) is distinct from 'array' then raise exception 'invalid timeline' using errcode = '22023'; end if;
        if jsonb_array_length(r->f) not between 1 and 50000 then raise exception 'invalid timeline size' using errcode = '22023'; end if;
        for v in select * from jsonb_array_elements(r->f) loop
          if jsonb_typeof(v) <> 'number' then raise exception 'invalid timeline number' using errcode = '22023'; end if;
          if (v::text)::numeric not between 0 and 86400000 then raise exception 'invalid timeline range' using errcode = '22023'; end if;
        end loop;
      end loop;
      if exists (select 1 from jsonb_object_keys(r) as x where x not in ('version','kills','wpm','accuracy','keysPerKill','shotTimesMs','killTimesMs')) then raise exception 'invalid fields' using errcode = '22023'; end if;
    else
      foreach f in array array['score','kills','maxCombo','accuracy'] loop
        if jsonb_typeof(r->f) is distinct from 'number' then raise exception 'invalid number' using errcode = '22023'; end if;
      end loop;
      if jsonb_typeof(r->'cleared') is distinct from 'boolean' then raise exception 'invalid cleared' using errcode = '22023'; end if;
      if exists (select 1 from jsonb_object_keys(r) as x where x not in ('score','kills','maxCombo','accuracy','cleared','survival','wpm')) then raise exception 'invalid fields' using errcode = '22023'; end if;
    end if;
    foreach f in array array['score','kills','maxCombo','accuracy','wpm','survival','keysPerKill'] loop
      if not r ? f then continue; end if;
      if jsonb_typeof(r->f) is distinct from 'number' then raise exception 'invalid number' using errcode = '22023'; end if;
      n := (r->>f)::numeric;
      if n < 0 or n > (case when f = 'accuracy' then 1 when f in ('wpm','keysPerKill') then 10000 when f = 'survival' then 86400 else 1000000000 end)
        or (f = 'keysPerKill' and n < 1) then raise exception 'invalid number range' using errcode = '22023'; end if;
    end loop;
  end loop;
end $$;
revoke all on function public.validate_player_records(jsonb) from public, anon, authenticated;

create function public.sync_player_records(p_expected_user uuid, p_initial jsonb default null, p_updates jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); current_entries jsonb; k text; raw jsonb; old_record jsonb; new_record jsonb; metric text; inserted boolean;
begin
  if uid is null or uid is distinct from p_expected_user then raise exception 'authentication changed' using errcode = '42501'; end if;
  if p_initial is not null then perform public.validate_player_records(p_initial); end if;
  perform public.validate_player_records(p_updates);
  insert into public.player_records(user_id, entries) values (uid, coalesce(p_initial, '{}'::jsonb)) on conflict (user_id) do nothing;
  inserted := found;
  select entries into current_entries from public.player_records where user_id = uid for update;
  for k, raw in select * from jsonb_each(p_updates) loop
    if k = 'zombie-typing:player-name' or not current_entries ? k then
      current_entries := jsonb_set(current_entries, array[k], raw);
    else
      old_record := (current_entries->>k)::jsonb; new_record := (raw #>> '{}')::jsonb;
      metric := case when k like 'zombie-typing:vs-best:%' then 'kills' when k = 'zombie-typing:best:endless:endless' then 'survival' else 'score' end;
      if coalesce((new_record->>metric)::numeric, 0) > coalesce((old_record->>metric)::numeric, 0) then
        current_entries := jsonb_set(current_entries, array[k], raw);
      end if;
    end if;
  end loop;
  update public.player_records set entries = current_entries, updated_at = now() where user_id = uid;
  return jsonb_build_object('entries', current_entries, 'imported', inserted and p_initial is not null);
end $$;
revoke all on function public.sync_player_records(uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.sync_player_records(uuid,jsonb,jsonb) to authenticated;
commit;
