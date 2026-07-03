# オンラインランキングのセットアップ(Supabase・無料)

ランキングのクライアント側は完成済みで、現在は「この端末内」(localStorage)で
動いている。世界ランキングにするには無料の Supabase プロジェクトを 1 つ作り、
下の SQL を実行して、URL と anon キーを `src/ui/ranking.ts` の `ONLINE_CONFIG` に
入れるだけ(値が入るとコードは自動でオンラインモードに切り替わる)。

## 仕組み(1人1枠・不正対策)

- 各端末は初回に `deviceKey`(ランダム UUID)を生成して保存する
- スコア送信は **RPC 関数 `submit_score` 経由のみ**。テーブルへの直接
  INSERT / UPDATE / DELETE は誰にもできない(開発者ツールで任意の行は作れない)
- `(deviceKey, 難易度)` ごとに 1 行だけ保持し、**ベストスコアのみ更新**される
  → 1 人(1 端末)がランキングを占拠できない
- 名前の変更は `rename_player` RPC で自分の deviceKey の行だけ変更できる
- サーバー側で値の妥当性(スコア上限・WPM 上限・撃破数との整合)を検証し、
  連投は 15 秒間隔でスロットルする

## 手順(約5分・無料・カード登録不要)

1. https://supabase.com → 「Start your project」→ GitHub アカウントでサインイン
2. **New project** → 名前 `zombie-typing`、リージョン Tokyo、DB パスワードは自動生成のまま
3. 左メニュー **SQL Editor** → 下の SQL を全部貼り付けて **Run**
4. **Project Settings → API** から次の 2 つをコピーして Claude Code に渡す
   - `Project URL`(https://xxxx.supabase.co)
   - `anon` `public` キー

## セットアップ SQL

```sql
-- スコアテーブル(1 端末 × 難易度につき 1 行)
create table public.scores (
  id bigint generated always as identity primary key,
  device_key uuid not null,
  difficulty text not null check (difficulty in ('easy', 'normal', 'hard')),
  name text not null check (char_length(name) between 1 and 10),
  score integer not null check (score between 1 and 500000),
  kills integer not null check (kills between 0 and 400),
  wpm integer not null check (wpm between 1 and 400),
  accuracy real not null check (accuracy between 0 and 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (device_key, difficulty),
  -- スコアが撃破数に対して理論上あり得る範囲か
  constraint plausible_score check (
    score <= kills * 1200 and (kills = 0 or score >= kills * 100)
  )
);

-- RLS: 読み取りのみ公開。書き込みは RPC(security definer)経由のみ
alter table public.scores enable row level security;

create policy "anyone can read scores"
  on public.scores for select using (true);

-- スコア送信(upsert・ベストのみ保持・順位を返す)
create or replace function public.submit_score(
  p_device_key uuid,
  p_difficulty text,
  p_name text,
  p_score int,
  p_kills int,
  p_wpm int,
  p_accuracy real
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_best int;
  v_rank int;
  v_last timestamptz;
begin
  -- 連投スロットル(15秒)
  select updated_at, score into v_last, v_best
    from scores where device_key = p_device_key and difficulty = p_difficulty;
  if v_last is not null and v_last > now() - interval '15 seconds' then
    raise exception 'too many submissions';
  end if;

  insert into scores (device_key, difficulty, name, score, kills, wpm, accuracy)
  values (p_device_key, p_difficulty, p_name, p_score, p_kills, p_wpm, p_accuracy)
  on conflict (device_key, difficulty) do update set
    name = excluded.name,
    updated_at = now(),
    -- ベストスコアのときだけ成績を更新
    score = greatest(scores.score, excluded.score),
    kills = case when excluded.score > scores.score then excluded.kills else scores.kills end,
    wpm = case when excluded.score > scores.score then excluded.wpm else scores.wpm end,
    accuracy = case when excluded.score > scores.score then excluded.accuracy else scores.accuracy end;

  select score into v_best
    from scores where device_key = p_device_key and difficulty = p_difficulty;
  select count(*) + 1 into v_rank
    from scores where difficulty = p_difficulty and score > v_best;
  return v_rank;
end $$;

-- 名前の変更(自分の deviceKey の行のみ)
create or replace function public.rename_player(
  p_device_key uuid,
  p_name text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if char_length(p_name) not between 1 and 10 then
    raise exception 'invalid name';
  end if;
  update scores set name = p_name, updated_at = now()
    where device_key = p_device_key;
end $$;

-- anon はテーブルへの直接書き込み不可、RPC のみ実行可
revoke insert, update, delete on public.scores from anon, authenticated;
grant execute on function public.submit_score to anon, authenticated;
grant execute on function public.rename_player to anon, authenticated;
```

## 不正防止について(正直な話)

このゲームはスコアを**ブラウザ側で計算する静的サイト**なので、
「あり得る範囲の偽スコアを RPC に送る」ことまでは完全には防げない
(防ぐには本物のサーバーでゲームログごと検証する必要があり、無料静的サイトの
範囲を超える。有名タイピングゲームの多くも同じ割り切り)。防御ライン:

- 他人のスコアの改ざん・削除は**不可能**(deviceKey を知らない限り触れない)
- 荒唐無稽な値(スコア 100 万・WPM 500 等)はサーバー側で**拒否**
- 1 端末 1 難易度 1 枠なので、ランキングの**占拠はできない**
- 連投スロットル 15 秒

明らかに不正なスコアは Supabase の Table Editor から手動削除できる。
