-- 旧キーへの付け替えで、新サイトで更新済みのランキングを失わない。
begin;
-- 削除済みのキーだけを非公開で失効させ、別端末の古い送信からの復活を防ぐ。
create table public.revoked_ranking_keys (device_key uuid primary key);
alter table public.revoked_ranking_keys enable row level security;
revoke all on public.revoked_ranking_keys from public,anon,authenticated;
create or replace function public.claim_ranking_identity(p_expected_user uuid, p_legacy_key uuid default null, p_existing_key uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); identity public.player_ranking_identity;
begin
 if uid is null or uid is distinct from p_expected_user then raise exception 'authentication changed' using errcode = '42501'; end if;
 if p_legacy_key is not null and exists (select 1 from public.revoked_ranking_keys where device_key=p_legacy_key) then raise exception 'ranking identity revoked' using errcode='42501'; end if;
 if p_existing_key is not null and exists (select 1 from public.revoked_ranking_keys where device_key=p_existing_key) then p_existing_key := null; end if;
 insert into public.player_ranking_identity(user_id, device_key) values(uid, coalesce(p_existing_key, gen_random_uuid())) on conflict(user_id) do nothing;
 select * into identity from public.player_ranking_identity where user_id = uid for update;
 if p_legacy_key is not null then
   if identity.legacy_claimed and identity.device_key <> p_legacy_key then raise exception 'already linked' using errcode = '22023'; end if;
   if exists (select 1 from public.player_ranking_identity where device_key = p_legacy_key and user_id <> uid) then raise exception 'already linked' using errcode = '22023'; end if;
   if identity.device_key <> p_legacy_key then
     insert into public.scores(device_key,difficulty,name,score,kills,wpm,accuracy,survival_seconds,cleared)
     select p_legacy_key,difficulty,name,score,kills,wpm,accuracy,survival_seconds,cleared
     from public.scores where device_key = identity.device_key
     on conflict(device_key,difficulty) do update set
       name=excluded.name,score=excluded.score,kills=excluded.kills,wpm=excluded.wpm,
       accuracy=excluded.accuracy,survival_seconds=excluded.survival_seconds,cleared=excluded.cleared
     where (case when excluded.difficulty='endless' then excluded.survival_seconds > scores.survival_seconds else excluded.score > scores.score end);
     delete from public.scores where device_key = identity.device_key;
   end if;
   update public.player_ranking_identity set device_key = p_legacy_key, legacy_claimed = true where user_id = uid;
 end if;
 return (select device_key from public.player_ranking_identity where user_id = uid);
end $$;
revoke all on function public.claim_ranking_identity(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_ranking_identity(uuid,uuid,uuid) to authenticated;
create or replace function public.delete_player_account(p_expected_user uuid, p_confirmation text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
 if uid is null or uid is distinct from p_expected_user then
   raise exception 'authentication changed' using errcode = '42501';
 end if;
 if p_confirmation is distinct from '退会' then raise exception 'confirmation required' using errcode = '22023'; end if;
 -- 応答を受け取れなかった利用者が安全に再試行できるよう、削除済みなら成功。
 if not exists (select 1 from auth.users where id = uid) then return; end if;
 -- sync/引き継ぎと直列化し、途中で別キーへ移ることを防ぐ。
 perform 1 from public.player_records where user_id = uid for update;
 perform 1 from public.player_ranking_identity where user_id = uid for update;
 insert into public.revoked_ranking_keys(device_key) select device_key from public.player_ranking_identity where user_id=uid on conflict do nothing;
 delete from public.scores where device_key in (select device_key from public.player_ranking_identity where user_id = uid);
 -- authのセッション・identityと個人記録は外部キーのcascadeで同時削除。
 delete from auth.users where id = uid;
end $$;
revoke all on function public.delete_player_account(uuid,text) from public, anon, authenticated;
grant execute on function public.delete_player_account(uuid,text) to authenticated;
commit;
