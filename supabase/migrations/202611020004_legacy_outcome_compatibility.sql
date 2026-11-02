-- 更新前の画面から旧RPCへ投稿しても、別の回のクリア結果を流用しない。
begin;
create or replace function public.submit_score(p_device_key uuid, p_difficulty text, p_name text, p_score integer, p_kills integer, p_wpm integer, p_accuracy real, p_survival_seconds integer default 0)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_row public.scores%rowtype; v_better boolean; v_rank integer;
begin
 if exists (select 1 from public.revoked_ranking_keys where device_key=p_device_key) then raise exception 'ranking identity revoked' using errcode='42501'; end if;
 select * into v_row from public.scores where device_key = p_device_key and difficulty = p_difficulty;
 if found then
   if v_row.updated_at > now() - interval '15 seconds' then raise exception 'too many submissions'; end if;
   v_better := case when p_difficulty = 'endless' then p_survival_seconds > v_row.survival_seconds else p_score > v_row.score end;
   if v_better then
     update public.scores set name=p_name, score=p_score, kills=p_kills, wpm=p_wpm, accuracy=p_accuracy,
       survival_seconds=p_survival_seconds, cleared=null, updated_at=now() where id=v_row.id;
   else
     update public.scores set name=p_name, updated_at=now() where id=v_row.id;
   end if;
 else
   insert into public.scores(device_key,difficulty,name,score,kills,wpm,accuracy,survival_seconds)
   values(p_device_key,p_difficulty,p_name,p_score,p_kills,p_wpm,p_accuracy,p_survival_seconds);
 end if;
 if p_difficulty = 'endless' then
   select count(*)+1 into v_rank from public.scores s where s.difficulty=p_difficulty
     and s.survival_seconds > (select survival_seconds from public.scores where device_key=p_device_key and difficulty=p_difficulty);
 else
   select count(*)+1 into v_rank from public.scores s where s.difficulty=p_difficulty
     and s.score > (select score from public.scores where device_key=p_device_key and difficulty=p_difficulty);
 end if;
 return v_rank;
end $$;
revoke all on function public.submit_score(uuid,text,text,integer,integer,integer,real,integer) from public,anon,authenticated;
grant execute on function public.submit_score(uuid,text,text,integer,integer,integer,real,integer) to anon,authenticated;
commit;
