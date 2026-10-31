-- 会員ごとのランキング識別情報。公開ランキングには識別キーを出さない。
begin;
create table public.player_ranking_identity (
 user_id uuid primary key references auth.users(id) on delete cascade,
 device_key uuid not null unique default gen_random_uuid(),
 legacy_claimed boolean not null default false
);
alter table public.player_ranking_identity enable row level security;
revoke all on public.player_ranking_identity from public, anon, authenticated;
grant select on public.player_ranking_identity to authenticated;
create policy ranking_identity_read_own on public.player_ranking_identity for select to authenticated using ((select auth.uid()) = user_id);
create function public.claim_ranking_identity(p_expected_user uuid, p_legacy_key uuid default null, p_existing_key uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); identity public.player_ranking_identity;
begin
 if uid is null or uid is distinct from p_expected_user then raise exception 'authentication changed' using errcode = '42501'; end if;
 insert into public.player_ranking_identity(user_id, device_key) values(uid, coalesce(p_existing_key, gen_random_uuid())) on conflict(user_id) do nothing;
 select * into identity from public.player_ranking_identity where user_id = uid for update;
 if p_legacy_key is not null then
   if identity.legacy_claimed and identity.device_key <> p_legacy_key then raise exception 'already linked' using errcode = '22023'; end if;
   update public.player_ranking_identity set device_key = p_legacy_key, legacy_claimed = true where user_id = uid;
 end if;
 return (select device_key from public.player_ranking_identity where user_id = uid);
end $$;
revoke all on function public.claim_ranking_identity(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_ranking_identity(uuid,uuid,uuid) to authenticated;
commit;
