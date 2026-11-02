-- 時間の四捨五入で「夜明け直前の終了」をクリア扱いしない。
begin;
alter table public.scores add column cleared boolean;
grant select (cleared) on public.scores to anon, authenticated;
create function public.submit_score_with_outcome(
 p_device_key uuid, p_difficulty text, p_name text, p_score integer,
 p_kills integer, p_wpm integer, p_accuracy real, p_survival_seconds integer, p_cleared boolean
) returns integer language plpgsql security definer set search_path = '' as $$
declare old_score integer; old_survival integer; had_record boolean; result integer;
begin
 -- 同じ端末・難易度の新形式投稿を直列化。従来RPCの制限・順位計算を利用する。
 perform pg_advisory_xact_lock(hashtext(p_device_key::text || ':' || p_difficulty));
 select score, survival_seconds into old_score, old_survival from public.scores
 where device_key = p_device_key and difficulty = p_difficulty for update;
 had_record := found;
 result := public.submit_score(p_device_key, p_difficulty, p_name, p_score, p_kills, p_wpm, p_accuracy, p_survival_seconds);
 if not had_record or (case when p_difficulty = 'endless' then p_survival_seconds > coalesce(old_survival, 0) else p_score > old_score end) then
   update public.scores set cleared = p_cleared where device_key = p_device_key and difficulty = p_difficulty
     and score = p_score and survival_seconds = p_survival_seconds;
 end if;
 return result;
end $$;
revoke all on function public.submit_score_with_outcome(uuid,text,text,integer,integer,integer,real,integer,boolean) from public, anon, authenticated;
grant execute on function public.submit_score_with_outcome(uuid,text,text,integer,integer,integer,real,integer,boolean) to anon, authenticated;
commit;
