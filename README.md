# ゾンビタイピング

ブラウザで遊べる日本語タイピングゲーム。右から迫るゾンビを、頭上の単語をローマ字で打ち切って撃ち倒す。夜明けまで生き延びたらクリア。

**▶ 遊ぶ: https://thisisikemen.github.io/zombie-typing/**

`main` ブランチに push すると GitHub Actions が自動でビルドして公開サイトを更新する。

## 遊び方(開発サーバー)

```bash
npm install
npm run dev
```

ブラウザで表示された URL を開く。**PC キーボード専用**(ローマ字入力)。

- 最初の1打で狙うゾンビが決まる(ロックオン)
- `Enter` でターゲット解除(進捗は保持され、後で続きから打てる)
- ゾンビが防衛ラインを越えるとダメージ(打った分だけ軽減)
- ノーミス撃破の連続でコンボ → 一定数ごとにボーナス発動
- リザルトで `R` → 同じ設定で即リスタート

## コマンド

```bash
npm run dev      # 開発サーバー
npm test         # ユニットテスト(ローマ字判定エンジン等 48 件)
npm run build    # 型チェック + 本番ビルド(dist/)
npm run preview  # ビルド結果の確認
```

## デプロイ

静的サイトなので `npm run build` の `dist/` を Vercel / Cloudflare Pages / GitHub Pages にそのまま置けば動く(`vite.config.ts` で `base: './'` 済み)。

## 画像素材

`public/assets/` に PNG を置くと自動で使われる(無ければコード生成のスプライトで動く)。ファイル名・規約は [public/assets/README.txt](public/assets/README.txt) を参照。

## 構成(SPEC.md 準拠)

```
src/
  config.ts        全バランス値・色・演出パラメータの集約
  core/            純粋ロジック(DOM/Canvas 非依存。将来サーバー移植可)
    typing/        ローマ字判定エンジン(候補展開方式)+ かなテーブル
    game.ts        状態更新・ターゲティング・スポーン(難易度予算)・ダメージ
    words.ts       単語プール(初手キー排他フィルタ)
    modes.ts       モード/難易度定義(タブ追加=配列に1つ足すだけ)
    bot.ts         タイトル背景の自動デモプレイ
  render/          Canvas 描画(空の変化・レーザー・エフェクト・HUD)
  audio/           WebAudio 合成の効果音・BGM(外部素材なし)
  input/           keydown 直接処理(IME 非起動)
  ui/              タイトル/モード選択/リザルト等の DOM オーバーレイ
  data/words.json  単語リスト(1000 語超)
tests/             Vitest(ん・っ・拗音・分解揺れ、ゲームロジック、単語検証)
```

## バランス調整

`src/config.ts` にすべて集約(HP、Tier ごとのダメージ/速度/コスト/スコア、スポーン予算、コンボ閾値、ボーナス効果の種類、色、空のキーフレーム…)。ボーナス効果は `BONUS.effect` を `'heal' | 'shield' | 'overcharge'` で差し替え可能。
