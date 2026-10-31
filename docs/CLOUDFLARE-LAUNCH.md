# 独自ドメインとCloudflareへの移行

更新: 2026-10-31。独自ドメインを正式公開。旧GitHub Pagesも記録の書き出し用に維持する。ゲームとSupabaseは継続利用する。

## 現在の状態

- 正式公開URL: https://zombietyping.jp/
- Cloudflareの補助URL（検索対象外）: https://zombie-typing.kawabata-dev.workers.dev/
- Cloudflareの既存アカウントを利用。手動公開には既存CLI認証、自動公開には本人が作成・保存した専用APIトークンを使う。
- 配信方式は **Workers Static Assets**。新規プロジェクトにはWorkersを使うという[現在の公式案内](https://developers.cloudflare.com/pages/get-started/)に従い、静的ファイルだけを配信する。
- DNS反映とHTTPS 200を確認済み。正式URLのcanonical・OGP・sitemap・robotsは新ドメインへ切り替え済み。GA4は明示許可後のみ有効、広告は未配信。Googleログインは本人の了承後に本番環境へ切り替えた。
- `wrangler.jsonc` に配信設定を保存。Wranglerは開発依存にバージョンを固定。ゲーム用サーバーコードやDBは追加していない。
- GitHub ActionsでCloudflareの正式サイトと旧GitHub Pagesを自動更新する。

## ドメインと費用の提案

検証URLのHTTPS、トップページと案内ページのHTTP 200、存在しないページのHTTP 404、noindex等のヘッダーを実配信で確認した。ベーシックで開始・入力・撃破・一時停止・終了を確認し、既存ランキングも読み取れることを確認する。ローカルだけの確認と区別する。

**zombietyping.jp** を本人が2026-10-31に取得した。XServer管理画面で「有効」、有効期限2027-10-31を確認。初年度0円で、本人がクレジットカードによる自動更新を設定した。更新料金の案内は年3,102円。XServerでネームサーバーをCloudflare指定の2件へ変更済み。公開DNSへの反映を確認済み。

|項目|提案|費用|
|---|---|---|
|配信・HTTPS・DNS|Cloudflareの静的配信|[静的ファイルへのリクエストと保存は無料](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)。今回、有料プランを契約していない|
|ドメイン購入先の第一候補|XServerドメイン|ローマ字.jpは初回条件を満たせば取得0円、通常取得1,980円。更新は年3,102円（[料金表と適用条件](https://www.xdomain.ne.jp/domain/price.php)）|
|ドメイン購入先の比較候補|さくらのドメイン|取得・更新とも年3,982円（[税込価格表](https://domain.sakura.ad.jp/specification/)）|

ドメイン費用は更新時に継続して発生する。ドメインのみの申込で、サーバー契約は追加していない。

JPの公開連絡窓口の代理公開と登録者名の非表示は別の設定。[JPRSの説明](https://jprs.jp/about/dom-rule/whois-concealment/)を参照。公開連絡窓口はXServerの代理情報を確認済み。登録者名の非表示は公開WHOISへの反映後に別途確認する。さくらは[指定事業者変更の説明](https://help.sakura.ad.jp/domain/2283/)で登録者名の非表示に対応しないと案内している。

## 再公開するコマンド

```sh
npm ci
npm test
SITE_URL=https://zombietyping.jp/ VITE_GA_MEASUREMENT_ID=G-ZCWQHK5BCF VITE_ACCOUNTS_ENABLED=true VITE_ACCOUNTS_TEST_MODE=false ADSENSE_PUBLISHER_ID=ca-pub-6491456634983694 npm run deploy:cloudflare
```

CLIの既存ログインを利用する。認証情報をGit、HTML、ログ、チャットに貼り付けない。別のアカウントにもアクセスできる環境では、公開先を確認する。

- `npm run build:cloudflare`: `dist/` を生成。ファイル数20,000・単一ファイル25 MiBの上限を検証する。
- `npm run build:hosting-preview`: `.hosting-preview/site/` にローカル検証用の一式を作る。通常の `dist/` と分離する。
- 独自ドメイン未設定、SITE_URLがpages.dev/workers.dev、main以外のPages/Workers Builds、ローカル検証用ビルドはステージング扱い。解析ID・広告IDを空にする。
- ステージングのHTMLページと応答ヘッダーにnoindexを指定。所有確認ファイルは内容を変更しない。
- 本番もpages.dev/workers.devの既定ホストにはnoindexを維持する。
- `.html` の既存URLを保つ設定とし、トップページだけ `_redirects` で `/index.html` に内部転送する。存在しないURLには404ページを返す。
- MIMEの誤解釈防止、参照元情報の制限、未使用のカメラ/マイク/位置情報の停止を応答ヘッダーへ設定。これらの設定はGitHub Pagesでは適用されない。

## 自動公開（GitHub Actions）

`.github/workflows/cloudflare.yml` を用意した。`main`へのpushまたは手動実行で、テスト・依存監査・本番ビルド・Cloudflareへの公開・公開URLの確認を順に行う。PRからは本番公開しない。`contents: read` のみを付け、Cloudflareのキーは公開ステップだけへ渡す。

- 本番Worker: `zombie-typing`、Cloudflareアカウント: `84aa8a6bf3a0c928949c3794815ad590`。
- 公開用のGitHub変数: `SITE_URL=https://zombietyping.jp/`、`VITE_GA_MEASUREMENT_ID=G-ZCWQHK5BCF`、`ADSENSE_PUBLISHER_ID=ca-pub-6491456634983694`（すべて設定済み）。
- 認証情報: GitHub ActionsのリポジトリSecret `CLOUDFLARE_API_TOKEN`。チャット、Git、公開変数へ入れない。
- キーはCloudflareのWorker設定→Builds→「API token for external CI/CD」の「Create token」で作る。対象は `zombie-typing` と `zombietyping.jp` のみ、権限はIndividual Workers Editor / Workers Routes Write。アカウント全体や他のWorkerを追加しない。作成・Secretへの入力は本人が行う。
- 有効化スイッチはGitHub変数 `CLOUDFLARE_AUTO_DEPLOY=true`（設定済み）。本人が専用キーをSecretへ保存し、[初回自動公開と実配信確認](https://github.com/thisisikemen/zombie-typing/actions/runs/41147900648)が成功。停止する場合はこの変数を `false` にする。既存の配信は停止せず、次の自動公開だけを止める。
- 同時公開を避けるconcurrencyを設定。公開中のジョブはキャンセルしない。
- `scripts/check-public-site.mjs` でHTTPS・canonical・検索対象外指定の有無・robots・sitemap・広告所有確認を確認する。

CloudflareのネイティブBuilds接続では、標準の自動作成トークンに他のWorker・DB・ストレージ・全ゾーンへの権限が含まれていたため、接続を確定せず中止した。本人の了承後、GitHubアプリは `thisisikemen/zombie-typing` の1件だけで認可済みだが、外部CI方式ではこのアプリは不要。アカウント所有トークンはネイティブBuildsでは未対応のため、GitHub Actionsへ直接渡す方式を使う。

通常はmainへのpushで公開する。手動で公開し直す場合は、広告所有確認IDも含む上記コマンドを使う。

## 独自ドメインへの切り替え順序

1. 検証URLでゲーム・画像・音声ファイル・ランキング読み取り・記録引き継ぎを確認。ランキングに架空の成績を投稿しない。
2. ドメイン取得済み。Cloudflareへ無料のサイト（DNSゾーン）を追加し、割り当てられたネームサーバーを購入先に設定。既存メール等があるドメインを使う場合は、先にDNSレコードを引き継ぐ。
3. WorkerのDomains & Routesへドメインを追加し、[Custom Domainsの公式手順](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)に従ってHTTPSを確認する。
4. ビルド環境を `SITE_URL=https://zombietyping.jp/`、`VITE_GA_MEASUREMENT_ID=G-ZCWQHK5BCF` にして再公開。広告IDは審査準備が整ってから設定。GA4ストリームURLも変更する。
5. canonical・OGP・sitemap・robots・404・GA同意・記録引き継ぎ・ランキングを実機確認する。
6. 旧サイトに記録の書き出しと新URLの案内を出す。記録はドメインをまたいで自動移行しないため、当面は旧サイトから書き出せる状態を保つ。すぐに強制転送しない。
7. Search Consoleへ新ドメインを登録してsitemap送信。AdMobに紐づく既存AdSenseの利用状態を確認し、広告審査へ進む。

不具合時は新URLの告知を止め、旧サイトを案内する。切り替え前に旧配信を削除しない。新ドメインで作った記録は、旧URLへ戻る場合も書き出し/読み込みが必要。

## DNS接続の作業状況（2026-10-31）

- Cloudflareへ無料のDNSゾーンを追加済み。購入・移管・有料プランの追加はしていない。
- 指定ネームサーバーは `arvind.ns.cloudflare.com` と `vera.ns.cloudflare.com`。XServerへ2件だけを設定し、管理画面で保存結果を確認した。
- Worker `zombie-typing` に `zombietyping.jp` のCustom Domainを設定済み。Wranglerの公開成功とCloudflare DNS画面のWorkerレコードを確認した。
- 設定直後はDNS・HTTPSが未反映だったが、公開NS・Aレコード・HTTPS 200を確認済み。現在は反映待ちではない。
- 本番のcanonical・OGP・sitemap・robotsを新ドメインへ切り替え、noindexを解除。workers.devの補助URLはnoindexを維持。
- Google Authを本番環境へ切り替え、テスト利用者限定の案内を非表示にした。個人記録のRLSは維持する。
- GA4の既存ストリームURLを `https://zombietyping.jp/` へ変更。測定IDは継続利用する。許可前の実画面でGoogleタグ未読込を確認済み。個別ゲームイベントの受信確認は引き続き別作業。
- GitHubの `SITE_URL` 変数も新ドメインに設定。旧サイトは相対パスで動作と記録書き出しを維持し、ホームに「新サイトへ」のリンクを表示する。
- Search ConsoleはURLプレフィックス `https://zombietyping.jp/` をHTMLファイルで確認済み。sitemap送信成功・5ページ検出・トップページのインデックス登録リクエスト完了。検索掲載はまだ未確認。
- AdSenseは既存AdMobのアカウントをWeb向けに追加利用。所有確認が通り、サイト審査を申し込み済み。広告配信は開始していない。
- 自動公開はGitHub Actionsで有効。専用キーの保存・初回公開・公開URL確認がすべて完了。ほかのWorkerの設定やキーは変更していない。

既存CLI認証ではDNSゾーンの新規作成が権限不足だったため、本人がログインした内蔵ブラウザで無料ゾーンを作成した。初期接続時はCLI認証の権限を拡張せず、WorkerのCustom Domainの設定には既存CLI認証を利用した。後から自動公開専用のトークンを別途作成した。
