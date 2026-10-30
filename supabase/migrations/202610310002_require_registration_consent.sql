-- 初回のGoogleログインでも、登録端末の引き継ぎ確認まで個人記録を初期化しない。
begin;
create or replace function public.sync_player_records(p_expected_user uuid, p_initial jsonb default null, p_updates jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); current_entries jsonb; k text; raw jsonb; old_record jsonb; new_record jsonb; metric text; inserted boolean;
begin
  if uid is null or uid is distinct from p_expected_user then raise exception 'authentication changed' using errcode = '42501'; end if;
  if p_initial is not null then perform public.validate_player_records(p_initial); end if;
  perform public.validate_player_records(p_updates);
  -- OAuthのログインから初めて来た場合も、空の記録を確定させない。
  if p_initial is null and not exists (select 1 from public.player_records where user_id = uid) then
    return jsonb_build_object('entries', '{}'::jsonb, 'imported', false, 'needs_registration', true);
  end if;
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
  return jsonb_build_object('entries', current_entries, 'imported', inserted and p_initial is not null, 'needs_registration', false);
end $$;
revoke all on function public.sync_player_records(uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.sync_player_records(uuid,jsonb,jsonb) to authenticated;
commit;
