-- OPERATIONAL PROPOSAL ONLY. Execute only with authorized production-change approval.
-- Emergency stop for NEW public calls. UI flag OFF alone cannot stop direct RPC abuse.
begin;
set local lock_timeout='100ms';
set local statement_timeout='1500ms';
revoke execute on function public.ranking_context(text,integer) from public,anon,authenticated;
revoke execute on function public.ranking_own_best(text,uuid,uuid) from public,anon,authenticated;
revoke execute on function public.ranking_run_position(text,integer,uuid,uuid) from public,anon,authenticated;
commit;
-- Existing in-flight queries are not cancelled by REVOKE. Observe existing configured
-- role timeout; any selective cancellation requires a separately reviewed procedure.
-- Privileged owner/service access is intentionally not changed.
-- Verify denial using a single anon call and an authorized authenticated call;
-- no score writes. Existing scores/submit_score/top-100 API grants remain untouched.

-- Recovery only after root cause is resolved and restoration is explicitly approved:
-- begin;
-- grant execute on function public.ranking_context(text,integer) to anon,authenticated;
-- grant execute on function public.ranking_own_best(text,uuid,uuid) to anon,authenticated;
-- commit;
-- Do NOT grant PUBLIC or broaden table permissions.
