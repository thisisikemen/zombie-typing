# 開発・運用の引き継ぎ

更新: 2026-10-30。過去のセットアップ手順より、実際のコードと次の文書を優先する。

## 目的と現在の構成

無料の一人プレイを育て、広告の収益を検証する。スキン販売は早くても約1か月後に検討し、リアルタイム対戦は急がない。ゲーム性の大幅変更は行わない。

- 作業フォルダ: `/Users/kawabatakoushirou/zombie-typing`
- リポジトリ: https://github.com/thisisikemen/zombie-typing
- 現行公開URL: https://thisisikemen.github.io/zombie-typing/
- TypeScript + Vite、Canvas描画、Supabaseランキング。React・PHPは使っていない。
- `main`へのpush後、GitHub ActionsがビルドしてGitHub Pagesへ公開する。

## 最初に読む文書

- [事業化の方針・未完了の作業](docs/BUSINESS-LAUNCH.md)
- [公開URL・GA4・広告審査・記録引き継ぎの設定](docs/OPERATIONS.md)
- [Cloudflareへの移行準備・ドメイン費用・設定値](docs/CLOUDFLARE-LAUNCH.md)
- [セキュリティ確認・本番へ適用した修正・残る課題](docs/SECURITY-REVIEW.md)
- [ランキングAPIと運用](docs/RANKING.md)

## 確認コマンド

```sh
npm ci
npm test
npm run build
npm run check:ranking-security
npm run dev
```

`build`は型チェック、Viteビルド、検索用URL等の後処理を行う。Vite単体ビルドで公開しない。テスト件数や公開状態は実行結果から確認する。

## コードの場所

- `src/config.ts`: バランス・演出値。
- `src/core/`: ゲーム・入力判定・モード定義。DOM非依存。
- `src/render/`、`src/audio/`: 描画と音。
- `src/main.ts`: 画面遷移・ゲームループ・計測イベント。
- `src/ui/screens.ts`: メニュー・結果・ランキング。
- `src/ui/ranking.ts`: Supabase公開API・端末キー。
- `src/ui/store.ts`: 設定・自己ベスト・自己ベスト対戦の記録。
- `src/ui/backup.ts`、`record-transfer.ts`: ローカルファイルでの記録引き継ぎ。解析許可は移さない。
- `src/analytics.ts`: 利用者が許可した後だけGA4タグを読み込む。
- `public/`: 素材、ガイド、運営情報、プライバシー、利用案内。

## 安全に扱うもの

Supabaseのpublishableキーはブラウザ公開用。安全性はRLS・列権限・RPCに依存し、「公開キーだから書き込めない」とは限らない。secret/service_roleはフロントやGitへ入れない。

2026-10-30、公開されていた端末キーの列権限をSQLで制限し、本番APIで拒否されることを確認した。適用済みSQLは `supabase/migrations/202610300001_hide_device_keys.sql`。

既に取得された可能性のあるキーの失効、本人確認、偽スコア・連投対策は残る。購入権限に端末キーを流用しない。実ユーザーのスコアを使う書き込みテストはしない。

## 公開・外部設定

`SITE_URL`、`VITE_GA_MEASUREMENT_ID`、`ADSENSE_PUBLISHER_ID` の使い方は運用手順を参照。未設定の解析・広告は動かない。独自ドメインは未取得。広告配信・決済は未実装。

2026-10-30、GA4のウェブストリームを作成し、GitHubリポジトリ変数 `VITE_GA_MEASUREMENT_ID=G-ZCWQHK5BCF` を設定して公開した。測定IDは公開用であり秘密鍵ではない。新しいGA4アカウントを重複作成しない。

GitHub Pagesには事業用途の制限がある。収益化前に配信先を確定する。移行する場合も静的な `dist/` の配信先変更と、オンライン対戦用のバックエンド変更を分けて考える。

ドメイン・決済等の契約や本人確認は利用者が行う。コード変更・検証・公開は、この会話で利用者が許可した範囲で進めてよい。
