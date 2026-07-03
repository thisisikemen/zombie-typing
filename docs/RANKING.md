# オンラインランキングのセットアップ(Supabase・無料)

現在ランキングは「この端末内」(localStorage)で動いている。
世界ランキングにするには、無料の Supabase プロジェクトを 1 つ作って
URL と anon キーを `src/ui/ranking.ts` の `ONLINE_CONFIG` に入れるだけでよい
(コード側は接続先が入ると自動でオンラインモードに切り替わる)。

## 手順(約5分・無料・カード登録不要)

1. https://supabase.com で「Start your project」→ GitHub アカウントでサインイン
2. **New project** → 名前は `zombie-typing` など、リージョンは Tokyo、
   データベースパスワードは適当に生成(使わないので控えなくてよい)
3. プロジェクトが起動したら、左メニュー **SQL Editor** → 下の SQL を貼り付けて **Run**
4. 左メニュー **Project Settings → API** から
   - `Project URL`(https://xxxx.supabase.co)
   - `anon public` キー
   の 2 つをコピーして Claude Code に渡す(または `src/ui/ranking.ts` の
   `ONLINE_CONFIG` に自分で貼って push)

## セットアップ SQL(不正対策込み)

```sql
-- スコアテーブル
create table public.scores (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  difficulty text not null check (difficulty in ('easy', 'normal', 'hard')),
  name text not null check (char_length(name) between 1 and 10),
  score integer not null check (score between 1 and 500000),
  kills integer not null check (kills between 0 and 400),
  wpm integer not null check (wpm between 1 and 400),
  accuracy real not null check (accuracy between 0 and 1),

  -- 妥当性: スコアは撃破数に対して理論上あり得る範囲か
  -- (最低: 全部Tier1コンボなし=100点/体、最高: 全部Tier3+コンボ上限=1200点/体)
  constraint plausible_score check (
    score <= kills * 1200 and (kills = 0 or score >= kills * 100)
  )
);

-- 匿名キーでは「挿入」と「読み取り」のみ許可(更新・削除は不可)
alter table public.scores enable row level security;

create policy "anyone can read scores"
  on public.scores for select using (true);

create policy "anyone can insert scores"
  on public.scores for insert with check (true);

-- 連投対策: 同名の登録は1分に1回まで(トリガー)
create or replace function public.throttle_scores()
returns trigger language plpgsql security definer as $$
begin
  if exists (
    select 1 from public.scores
    where name = new.name
      and difficulty = new.difficulty
      and created_at > now() - interval '60 seconds'
  ) then
    raise exception 'too many submissions';
  end if;
  return new;
end $$;

create trigger throttle_scores before insert on public.scores
  for each row execute function public.throttle_scores();
```

## 不正防止について(正直な話)

このゲームはスコアを**ブラウザ側で計算する静的サイト**なので、
「開発者ツールや curl で偽スコアを送る」ことを完全に防ぐ方法は存在しない
(署名鍵をクライアントに置いても取り出せるため)。上の構成での防御ライン:

- **改ざん・削除は不可**: 匿名キーは挿入と閲覧のみ。他人のスコアは消せない
- **荒唐無稽な値は弾く**: CHECK 制約で「撃破数に対してあり得ないスコア」
  「WPM 400 超」などをサーバー側で拒否(コンソールから
  `score: 99999999` を送っても入らない)
- **連投は弾く**: 同名 1 分 1 回のスロットル
- それでも「理論上あり得る範囲の偽スコア」を手で組み立てて送ることは可能。
  ここから先を守るには本物のサーバーでゲームロジックごと検証する必要があり、
  無料静的サイトの範囲を超える(有名タイピングゲームの多くも同じ割り切り)

明らかに不正なスコアを見つけたら、Supabase の Table Editor から手動で削除できる。
