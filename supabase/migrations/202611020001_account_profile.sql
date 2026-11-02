-- プロフィール・引き継ぎ案内・本人だけの退会。既存記録の値は変更しない。
begin;
alter table public.player_records add column transfer_choice text not null default 'pending'
  check (transfer_choice in ('pending', 'completed', 'dismissed'));
-- 既に移行済みの会員だけ初期化。今後は記録の同期成功後にcompletedへ進める。
update public.player_records p set transfer_choice = 'completed'
from public.player_ranking_identity i where i.user_id = p.user_id and i.legacy_claimed;
create index if not exists scores_profile_score_idx on public.scores (difficulty, score desc);
create index if not exists scores_profile_survival_idx on public.scores (difficulty, survival_seconds desc);

create function public.player_account_overview(p_expected_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); choice text; ranks jsonb;
begin
 if uid is null or uid is distinct from p_expected_user or not exists (select 1 from auth.users where id = uid) then
   raise exception 'authentication changed' using errcode = '42501';
 end if;
 select transfer_choice into choice from public.player_records where user_id = uid;
 -- 同点は同順位。上位100件の取得とは独立し、本人の5難易度だけを集計する。
 select coalesce(jsonb_agg(jsonb_build_object('difficulty', mine.difficulty, 'score', mine.score,
   'survival', coalesce(mine.survival_seconds, 0), 'rank', 1 + case when mine.difficulty = 'endless' then (
     select count(*) from public.scores higher where higher.difficulty = mine.difficulty and higher.survival_seconds > coalesce(mine.survival_seconds, 0)
   ) else (
     select count(*) from public.scores higher where higher.difficulty = mine.difficulty and higher.score > mine.score
   ) end)), '[]'::jsonb) into ranks
 from public.scores mine join public.player_ranking_identity i on i.device_key = mine.device_key where i.user_id = uid;
 return jsonb_build_object('transfer_choice', coalesce(choice, 'pending'), 'rankings', ranks);
end $$;
revoke all on function public.player_account_overview(uuid) from public, anon, authenticated;
grant execute on function public.player_account_overview(uuid) to authenticated;

create function public.set_player_transfer_choice(p_expected_user uuid, p_choice text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
 if uid is null or uid is distinct from p_expected_user or not exists (select 1 from auth.users where id = uid) then
   raise exception 'authentication changed' using errcode = '42501';
 end if;
 if p_choice not in ('completed', 'dismissed') or p_choice is null then raise exception 'invalid choice' using errcode = '22023'; end if;
 update public.player_records set transfer_choice = case when transfer_choice = 'completed' then transfer_choice else p_choice end where user_id = uid;
 if not found then raise exception 'registration required' using errcode = '22023'; end if;
end $$;
revoke all on function public.set_player_transfer_choice(uuid,text) from public, anon, authenticated;
grant execute on function public.set_player_transfer_choice(uuid,text) to authenticated;

create function public.delete_player_account(p_expected_user uuid, p_confirmation text) returns void
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
 delete from public.scores where device_key in (select device_key from public.player_ranking_identity where user_id = uid);
 -- authのセッション・identityと個人記録は外部キーのcascadeで同時削除。
 delete from auth.users where id = uid;
end $$;
revoke all on function public.delete_player_account(uuid,text) from public, anon, authenticated;
grant execute on function public.delete_player_account(uuid,text) to authenticated;
commit;
