# 独自ドメインとCloudflareへの移行

更新: 2026-10-31。既存GitHub Pagesを公開したまま、Cloudflareで実配信を検証する。ゲームとSupabaseは継続利用する。

## 現在の状態

- 正式公開URL: https://thisisikemen.github.io/zombie-typing/
- Cloudflareでの検証URL: https://zombie-typing.kawabata-dev.workers.dev/
- Cloudflareの既存アカウント・既存CLI認証を利用。新しいアカウントやAPIトークンは作っていない。
- 配信方式は **Workers Static Assets**。新規プロジェクトにはWorkersを使うという[現在の公式案内](https://developers.cloudflare.com/pages/get-started/)に従い、静的ファイルだけを配信する。
- 検証版はnoindex、GA4・広告は無効。独自ドメインは未取得。
- `wrangler.jsonc` に配信設定を保存。Wranglerは開発依存にバージョンを固定。ゲーム用サーバーコードやDBは追加していない。
- GitHub Pagesへの自動公開は継続。Cloudflareへの自動公開はまだ接続していない。

## ドメインと費用の提案

検証URLのHTTPS、トップページと案内ページのHTTP 200、存在しないページのHTTP 404、noindex等のヘッダーを実配信で確認した。ベーシックで開始・入力・撃破・一時停止・終了を確認し、既存ランキングも読み取れることを確認する。ローカルだけの確認と区別する。

第一候補は **zombietyping.jp**。第二候補は `zombie-typing.jp`。JPRS WHOISは2026-10-30の確認時点で第一候補が `No match!!` だった。購入時に取得可否と価格を再確認する。

|項目|提案|費用|
|---|---|---|
|配信・HTTPS・DNS|Cloudflareの静的配信|[静的ファイルへのリクエストと保存は無料](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)。今回、有料プランを契約していない|
|ドメイン購入先の第一候補|XServerドメイン|ローマ字.jpは初回条件を満たせば取得0円、通常取得1,980円。更新は年3,102円（[料金表と適用条件](https://www.xdomain.ne.jp/domain/price.php)）|
|ドメイン購入先の比較候補|さくらのドメイン|取得・更新とも年3,982円（[税込価格表](https://domain.sakura.ad.jp/specification/)）|

ドメイン費用は継続して発生する。購入画面の総額・更新額・Whois公開設定を確認してから本人が申し込む。サーバー契約は今回の構成に含めない。

JPの公開連絡窓口の代理公開と登録者名の非表示は別の設定。[JPRSの説明](https://jprs.jp/about/dom-rule/whois-concealment/)を参照。購入前に希望する設定が使えることを確認する。さくらは[指定事業者変更の説明](https://help.sakura.ad.jp/domain/2283/)で登録者名の非表示に対応しないと案内している。

## 再公開するコマンド

```sh
npm ci
npm test
npm run deploy:cloudflare
```

CLIの既存ログインを利用する。認証情報をGit、HTML、ログ、チャットに貼り付けない。別のアカウントにもアクセスできる環境では、公開先を確認する。

- `npm run build:cloudflare`: `dist/` を生成。ファイル数20,000・単一ファイル25 MiBの上限を検証する。
- `npm run build:hosting-preview`: `.hosting-preview/site/` にローカル検証用の一式を作る。通常の `dist/` と分離する。
- 独自ドメイン未設定、SITE_URLがpages.dev/workers.dev、main以外のPages/Workers Builds、ローカル検証用ビルドはステージング扱い。解析ID・広告IDを空にする。
- ステージングのHTMLページと応答ヘッダーにnoindexを指定。所有確認ファイルは内容を変更しない。
- 本番もpages.dev/workers.devの既定ホストにはnoindexを維持する。
- `.html` の既存URLを保つ設定とし、トップページだけ `_redirects` で `/index.html` に内部転送する。存在しないURLには404ページを返す。
- MIMEの誤解釈防止、参照元情報の制限、未使用のカメラ/マイク/位置情報の停止を応答ヘッダーへ設定。これらの設定はGitHub Pagesでは適用されない。

## 自動公開の接続（未完了）

PagesのGit連携での作成はCloudflareからエラー8000011（Git installationの内部エラー）が返り、作成できなかった。既存の他プロジェクトやGitHubアプリ設定は変更していない。現在はWorkersへのCLI公開が利用できる。

自動化する際はWorkers Buildsの[Git連携手順](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/)に従い、対象を `thisisikemen/zombie-typing` だけに限定する。GitHubアプリの新しいアクセス許可は、実際の許可画面で本人が範囲を確認する。

|設定|値|
|---|---|
|Worker名|`zombie-typing`|
|本番ブランチ|`main`|
|ビルドコマンド|`npm test && npm run build:cloudflare`|
|デプロイコマンド|`npx wrangler deploy`|
|Nodeバージョン|`22`|
|現時点のSITE_URL|未設定。既存GitHub PagesのURLをcanonicalとして使う|
|解析・広告ID|現時点では未設定|

GitHubリポジトリの変数はCloudflareのビルド環境へ自動転送されない。自動公開の接続前は、mainの更新後に上のCLIでCloudflareも再公開する。

## 独自ドメインへの切り替え順序

1. 検証URLでゲーム・画像・音声ファイル・ランキング読み取り・記録引き継ぎを確認。ランキングに架空の成績を投稿しない。
2. 本人がドメインを取得。Cloudflareへサイトを追加し、割り当てられたネームサーバーを購入先に設定。既存メール等があるドメインを使う場合は、先にDNSレコードを引き継ぐ。
3. WorkerのDomains & Routesへドメインを追加し、[Custom Domainsの公式手順](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)に従ってHTTPSを確認する。
4. ビルド環境を `SITE_URL=https://zombietyping.jp/`、`VITE_GA_MEASUREMENT_ID=G-ZCWQHK5BCF` にして再公開。広告IDは審査準備が整ってから設定。GA4ストリームURLも変更する。
5. canonical・OGP・sitemap・robots・404・GA同意・記録引き継ぎ・ランキングを実機確認する。
6. 旧サイトに記録の書き出しと新URLの案内を出す。記録はドメインをまたいで自動移行しないため、当面は旧サイトから書き出せる状態を保つ。すぐに強制転送しない。
7. Search Consoleへ新ドメインを登録してsitemap送信。AdMobに紐づく既存AdSenseの利用状態を確認し、広告審査へ進む。

不具合時は新URLの告知を止め、旧サイトを案内する。切り替え前に旧配信を削除しない。新ドメインで作った記録は、旧URLへ戻る場合も書き出し/読み込みが必要。
