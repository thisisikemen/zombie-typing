# 引き継ぎ資料(次に開発を担当する人 / AI 向け)

このファイルは「ゾンビタイピング」の開発を別の担当(Codex 等)へ引き継ぐための
まとめです。**まずこのファイルと `README.md` `docs/RANKING.md` を読んでください。**

## 0. これは何か

- ブラウザで遊べる日本語タイピングゲーム「ゾンビタイピング」
- **公開URL**: https://thisisikemen.github.io/zombie-typing/
- **リポジトリ**: https://github.com/thisisikemen/zombie-typing (公開)
- 技術: TypeScript + Vite。フレームワークなし。ゲーム本編は Canvas 2D 描画。
- テスト: Vitest(現在 56 件・全通過)

## 1. フォルダの場所(重要)

このプロジェクトの実体は次の 1 箇所だけです:

```
/Users/kawabatakoushirou/名称未設定フォルダ 2
```

Finder では「名称未設定フォルダ 2」という名前で見えます(作成時のまま)。
`ゾンビタイピング` という名前のフォルダは**ありません**
(`ゾンビタイピング素材` は画像の元素材が入った別フォルダで、ゲーム本体ではない)。

> **おすすめ**: 名前が紛らわしく、日本語+スペースはターミナルで扱いにくいので、
> Finder でこのフォルダを `zombie-typing` にリネームすると扱いやすくなります。
> リネームしても Git やビルドには影響しません(中身は変わらないため)。

## 2. 開発・確認の基本コマンド

ターミナル(ターミナル.app)でフォルダに入ってから:

```bash
npm install          # 初回だけ(依存の取得)
npm run dev          # 開発サーバー起動 → 表示された http://localhost:5173/ を Chrome で開く
npm test             # ユニットテスト(ローマ字判定・ゲームロジック)
npm run build        # 本番ビルド(型チェック + dist/ 生成)。push 前に通ること
```

- `npm run dev` 中はコードを保存すると即座にブラウザへ反映される
- ゲームバランスの数値は `src/config.ts` に集約(遊びながら調整できる)

## 3. 公開への反映(デプロイ)= git push だけ

「公開されているもの」と「手元のコード」は**別物ではありません**。この 1 つの
リポジトリが唯一の正であり、`main` ブランチに push すると自動で公開されます。

```bash
git add .
git commit -m "変更内容"
git push
```

- push すると GitHub Actions(`.github/workflows/deploy.yml`)が自動でビルドして
  GitHub Pages へデプロイする。1〜2 分で公開サイトに反映される。
- **ハマりどころ**: `deploy-pages` がまれに `Deployment failed, try again later.` で
  失敗する(GitHub 側の一時エラー)。その時は次で再実行すれば直る:
  ```bash
  gh workflow run deploy.yml --repo thisisikemen/zombie-typing
  ```
- 認証: この端末の `gh` CLI は GitHub アカウント `thisisikemen` で認証済み。
  Codex も同じ端末で動くなら `git push` はそのまま通るはず。

## 4. アーキテクチャ地図(どこに何があるか)

状態更新ロジックと描画は完全に分離してある(`core/` は DOM/Canvas 非依存)。

```
src/
  config.ts          全バランス値・色・演出パラメータの集約 ★調整はまずここ
  main.ts            画面フローの状態機械 + requestAnimationFrame ループ
  core/              純粋ロジック(DOM非依存・テスト対象)
    typing/          ローマ字判定エンジン(engine.ts)+ かなテーブル(table.ts)
    game.ts          状態更新・ターゲティング・スポーン(難易度予算)・ダメージ・スコア
    words.ts         単語プール(初手キー排他フィルタ)
    modes.ts         モード/難易度の定義        ★エンドレス追加の起点
    bot.ts           タイトル背景の自動デモ
  render/
    renderer.ts      Canvas 描画のメイン(HUD・ラベル・レーザー・演出)
    sky.ts           空の色の時間変化           ★エンドレスで要調整(夜が明けない)
    effects.ts       パーティクル等
    assets.ts        画像ローダー(無い画像はコード生成にフォールバック)
  audio/sfx.ts       WebAudio 合成 SFX + mp3 の BGM/銃声/ボタン音
  input/keyboard.ts  keydown 直接処理(IME 非起動)
  ui/
    screens.ts       タイトル/モード選択/リザルト/ポーズ/各モーダルの制御 + ランキング
    ranking.ts       ランキングのバックエンド(ローカル / Supabase 切替)
    tips.ts          メニュー下部のアドバイス文
    store.ts         設定・ベストスコアの localStorage 保存
  data/words.json    単語リスト(1000語超)
public/
  assets/            背景・兵士・ゾンビ・UI画像(assets/ui/ 配下が UI パーツ)
  audio/             bgm-menu.mp3 / bgm-battle.mp3 / shot.mp3 / bolt.mp3 / ready.mp3 / shell.mp3
tools/process_assets.py  素材加工スクリプト(キーイング+スプライト分割)
docs/                PROMPTS.md(素材生成プロンプト)/ GUIDE.md(公開)/ RANKING.md(ランキング)
tests/               Vitest
```

## 5. ランキング(Supabase)— Codex も触ってよい

- 接続情報は `src/ui/ranking.ts` の `ONLINE_CONFIG` にある:
  - URL: `https://vizhznqrgasepakokygv.supabase.co`
  - キー: `sb_publishable_...`(**publishable = 公開用キー。コードに入れて/公開して安全**。
    ブラウザで動かす前提のキーで、書き込み権限は持たない)
- **秘密にすべきは `service_role`(secret)キーだけ**。これはコードに入れない・Codex にも渡さない・
  push しない。ランキングの読み書きには不要。
- 仕組み: 読み取りは公開、書き込みは **RPC 関数 `submit_score` / `rename_player` 経由のみ**
  (テーブルへの直接 INSERT/UPDATE/DELETE は不可)。1 端末 1 難易度 1 枠・ベストのみ保持。
  端末識別は `deviceKey`(ローカルの UUID)。サーバー側 CHECK 制約で異常値を拒否。
- テーブル定義・RPC の SQL は **`docs/RANKING.md`** に全文あり。
- **DDL(テーブル/制約/RPC の変更)は publishable キーでは実行できない**。
  Supabase ダッシュボードの SQL Editor から手動で流す必要がある
  (プロジェクトのオーナーはユーザー本人。ログインは本人にしかできない)。
  → 新しい SQL が必要になったら、その SQL を用意してユーザーに「SQL Editor で実行して」と依頼する。

## 6. 次にやること:エンドレスモード「夜は明けない」

ユーザーの要望(2026-07 時点):

> 時間制限がなく、夜が明けない(＝クリアが無い)ゲームモード。
> ランキングの評価基準は「生き残った時間」。テトリスのように、緩やかにだが
> どこまでも難しくなり続ける。背景画像・BGM・基本操作は「夜明けまで」と同じ。

### 実装方針(提案。ユーザーに確認しつつ進めてよい)

1. **モード定義**: `src/core/modes.ts` の `MODES` にモード `endless`(ラベル「夜は明けない」)を
   1 つ追加する。難易度カードの構造は「夜明けまで」と同じ 3 枚でも、エンドレスは 1 本でもよい
   (ユーザーに確認)。モード選択画面はタブが 1 個増えるだけで動く設計になっている
   (`ui/screens.ts` の `buildModeSelect` が MODES を列挙して描いている)。
   - タブ画像は現状「夜明けまで」用の 1 枚しか無い(`public/assets/ui/tab-active.png`)。
     エンドレス用タブ画像は後で追加でよい(暫定は既存タブ流用 or テキスト)。

2. **終了条件と時間**: `game.ts` は現在 `duration` で「制限時間を超えたらクリア」。
   エンドレスは **クリアを無くし、HP 0 のゲームオーバーだけ**にする。
   `duration` を無限扱い(または `mode.endless` フラグで分岐)にして、
   `progressRatio()` を時間ではなく「経過に応じた難易度カーブ」に使い替える。

3. **難易度エスカレーション**: 現在スポーンは「難易度予算方式」(`SPAWN`, 各難易度の
   `regenScale` / `speedScale` / `maxZombies` / `concurrentRampSec`)。
   エンドレスでは経過時間に対してこれらを**緩やかに増やし続ける**
   (例: 30〜60 秒ごとに予算回復・速度・同時数上限を少しずつ上げる。上限は付けてよいが高めに)。
   単語の Tier 構成比も時間で難化させる(序盤は短い語中心 → 徐々に長い語)。
   数式・カーブは `config.ts` に定数として置き、調整しやすくする。

4. **空の演出**: `render/sky.ts` は 0→1 の進行で「日没→夜明け」に変化する。
   エンドレスは**夜が明けてはいけない**ので、夜明けに向かわないようにする
   (深夜の色で固定 or ゆっくり循環)。`renderer.ts` の空描画も進行度に依存しているので要調整。

5. **スコア/ランキング = 生存時間**:
   - リザルトの主指標を「生存時間」にする(スコアの代わり、または併記)。
   - ランキングは生存時間の長い順。**現在のランキングはスコア降順**なので、エンドレスだけ
     生存時間で並べる必要がある。テーブルに生存秒数のカラムが無いため、スキーマ変更が要る。
   - 必要な Supabase 変更(SQL Editor で実行してもらう):

     ```sql
     -- 難易度に endless を追加
     alter table public.scores drop constraint scores_difficulty_check;
     alter table public.scores add constraint scores_difficulty_check
       check (difficulty in ('easy','normal','hard','endless'));

     -- 生存秒数カラムを追加(エンドレスの順位付け用)
     alter table public.scores
       add column if not exists survival_seconds integer not null default 0
       check (survival_seconds between 0 and 86400);

     -- endless はスコアと撃破数の整合(plausible_score)の対象外にする
     alter table public.scores drop constraint plausible_score;
     alter table public.scores add constraint plausible_score check (
       difficulty = 'endless'
       or (score <= kills * 1200 and (kills = 0 or score >= kills * 100))
     );
     ```

   - あわせて `submit_score` RPC に `p_survival_seconds` を追加し、endless のときは
     `survival_seconds` を保存・順位付けに使うよう改修する(`docs/RANKING.md` の RPC を差し替え)。
   - クライアント側は `ui/ranking.ts`(submit のペイロード/並べ替え)と
     `ui/screens.ts`(ランキング表示のサブ情報)を調整。

6. **BGM / 効果音 / 操作**: 「夜明けまで」と同じものを流用(`audio/sfx.ts` の `setBgm('battle')`)。
   ユーザーが別 BGM を用意したら差し替える。

### 進め方のコツ

- まず `core/` のロジック(モード分岐・エスカレーション・生存時間)を実装して
  `npm test` を通す(必要ならエンドレス用のテストを `tests/` に足す)。
- 次に描画(空の固定)とリザルト表示、最後にランキングのオンライン対応(SQL 依頼込み)。
- 各段階で `npm run build` を通し、区切りで commit → push(自動デプロイ)。

## 7. 直近の状態(この引き継ぎ時点)

- リザルトの「CLEAR / GAME OVER」の文字が大きすぎたのを縮小し、パネルが画面内に
  収まるよう調整済み(`src/styles.css` の `#result-heading` と `.result-panel`)。
- ランキングはオンライン(Supabase)で開通済み・動作確認済み。
- テスト 56 件全通過。公開サイトは最新。

## 8. さらに詳しい背景

- ゲーム仕様の原本: `~/Downloads/SPEC.md`(ユーザーの Downloads にある元の仕様書)
- 素材追加のプロンプト: `docs/PROMPTS.md`
- 公開まわり: `docs/GUIDE.md`
