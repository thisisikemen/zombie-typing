-- 優先修正: device_key は rename_player / submit_score の所有確認に使われる。
-- ブラウザ公開キーからの SELECT を表示用の列だけに限定する。
-- Supabase SQL Editor で実行。全体を一括実行し、失敗時はロールバックする。
begin;

alter table public.scores enable row level security;

-- テーブル単位の SELECT は列単位の REVOKE より優先されるため先に外す。
revoke select on table public.scores from public, anon, authenticated;
-- 過去に列単位で許可した場合も識別キーを閉じる。
revoke select (device_key) on public.scores from public, anon, authenticated;
grant select (difficulty, name, score, kills, wpm, accuracy, updated_at, survival_seconds)
  on public.scores to anon, authenticated;

commit;

-- 確認: 次は両方 false であること。
select
  has_column_privilege('anon', 'public.scores', 'device_key', 'SELECT') as anon_can_read_device_key,
  has_column_privilege('authenticated', 'public.scores', 'device_key', 'SELECT') as authenticated_can_read_device_key;
