# 開発・運用の引き継ぎ

更新: 2026-10-31。過去のセットアップ手順より、実際のコードと次の文書を優先する。

## 目的と現在の構成

無料の一人プレイを育て、広告の収益を検証する。スキン販売は早くても約1か月後に検討し、リアルタイム対戦は急がない。ゲーム性の大幅変更は行わない。

2026-10-31の追加方針: 任意アカウントによる端末間共有、将来の購入スキン・抽選要素、ゲージと技等による継続要素を検討する。初期提案は任意ログイン＋個人記録同期、別モードでの技の試作、無料スキン、固定スキン販売の順。有料ガチャは後の判断とする。これは検討であり、本番の認証・決済・ゲームルール変更はまだ行っていない。詳細は [アカウント・成長要素の検討](docs/ACCOUNT-AND-PROGRESSION.md)。

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

`SITE_URL`、`VITE_GA_MEASUREMENT_ID`、`ADSENSE_PUBLISHER_ID` の使い方は運用手順を参照。未設定の解析・広告は動かない。`zombietyping.jp` は本人が取得済み。Cloudflareの接続設定済みで、DNS反映・HTTPS確認待ち。広告配信・決済は未実装。

2026-10-30、GA4のウェブストリームを作成し、GitHubリポジトリ変数 `VITE_GA_MEASUREMENT_ID=G-ZCWQHK5BCF` を設定して公開した。測定IDは公開用であり秘密鍵ではない。新しいGA4アカウントを重複作成しない。

2026-10-31、既存CloudflareアカウントとWranglerの既存認証を利用し、Workers Static Assetsで https://zombie-typing.kawabata-dev.workers.dev/ を検証公開した。正式URLは引き続きGitHub Pages。Cloudflare側はnoindex、解析・広告は無効。静的ファイルのみでサーバーコードは追加していない。`npm run deploy:cloudflare` で再公開できる。CloudflareのGitHub連携はエラー8000011のため未接続で、自動更新されない。本人が2026-10-31にXServerで `zombietyping.jp` を取得済み（有効期限2027-10-31）。Cloudflareの無料DNSゾーンを作成し、XServerのネームサーバーを `arvind.ns.cloudflare.com` / `vera.ns.cloudflare.com` に変更済み。WorkerのCustom Domain設定も完了。設定時はCloudflareがpending・公開DNSがNXDOMAIN。その後の再確認で公開NSにCloudflareの2件とHTTPSのHTTP 200を確認。新ドメインはまだnoindexの検証版で、正式公開の確認は未完了。反映後に本番URL・GA4を設定して再公開する。Cloudflareの有料契約・新しいAPIトークンの作成は行っていない。

GitHub Pagesには事業用途の制限がある。収益化前に配信先を確定する。移行する場合も静的な `dist/` の配信先変更と、オンライン対戦用のバックエンド変更を分けて考える。

ドメイン・決済等の契約や本人確認は利用者が行う。コード変更・検証・公開は、この会話で利用者が許可した範囲で進めてよい。

## 任意ログインの実装（公開前）

本人の追加要望により、任意のGoogleログイン、新規登録端末の個人ベスト・VS記録・名前の初回引き継ぎ、他端末のゲストデータを統合しない説明、セッション復元・更新、会員別キャッシュ、自己ベスト同期を実装した。`VITE_ACCOUNTS_ENABLED` は未設定/falseで入口非表示。132件のローカルテスト成功（PGliteのRLS/RPC検証とSDKモックを含む）。本番マイグレーションは適用済みで権限カタログと未ログインAPI拒否を確認した。Google OAuth設定は完了。本人の実登録・同じブラウザの再読込でのセッション復元・同期成功は確認済み。別ブラウザの記録復元は未確認。Google専用プロジェクト `maximal-cabinet-513216-j6` を作成し、本人がGoogleポリシー同意・初期構成を完了。本人1件をテスト利用者に登録し、本人がクライアント作成とSupabaseへのID/シークレット入力を完了。認証後の許可する戻り先は本番とlocalhost5175の2件を保存済み。Supabaseの公開設定APIでGoogleプロバイダー有効を確認した。Chrome旧サイトの本人記録はUIから書き出して新URLへ読み込み、本人がGoogle初回連携に同意して登録完了。登録後にUIから再度書き出し、6個の自己ベスト・1個のVS記録・名前の計8項目が元ファイルと一致した。旧URLからの自己ベスト・VS記録・設定の移行は任意であり、登録やプレイの前提にしない。公開ランキングは既存DBを維持する。Cloudflare検証版では入口を有効化し、`VITE_ACCOUNTS_TEST_MODE=true` で先行テストの説明を表示する。詳細・手順は [任意ログインの運用](docs/ACCOUNTS.md)。

2026-10-31、追加した解析・記録引き継ぎ・アカウントの各ダイアログを既存設定と同じパネル・金属調ボタンへ統一。GA4は明示許可まで未読込を維持し、初回の自動モーダルをタイトル上の非モーダル案内へ変更。未選択でも開始でき、メニュー・プレイ・他のダイアログ表示中は案内を隠す。許可/拒否は同じ大きさ・スタイルとし、設定から変更可能。

2026-10-31、本人の要望でアカウント画面の文章を短く・平易に修正。見出しは未ログイン時「ログイン」、ログイン中「アカウント」。詳細説明は「記録について」に折りたたみ、引き継ぐ記録と他端末の記録をまとめない説明は登録ボタンの前に表示する。

実機確認: 新ドメインと保存領域が別の localhost:5175 で既存Googleアカウントへログインし、サーバーから戻った自己ベスト6件・VS記録1件・名前の8項目が元ファイルと一致した。ローカルのゲスト記録は初期登録に使っていない。同一ブラウザ内の別オリジンでの確認であり、別の実端末での確認はまだ行っていない。

2026-10-31、ホーム右上とモード選択右上へ既存の金属プレートのアカウントボタンを配置。モード選択ではランキングをその左に置く。既存の設定・結果画面の入口も維持する。DNSのCloudflare NSとAレコード、独自ドメインのHTTPS 200を再確認済み。
