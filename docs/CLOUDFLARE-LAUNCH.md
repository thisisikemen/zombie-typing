# 独自ドメインとCloudflareへの移行準備

確認日: 2026-10-30。現行GitHub Pagesを公開したまま、別の配信先で検証してから切り替える。Supabaseとゲームの仕組みは継続利用する。

## 今回の提案

|項目|提案|費用・状態|
|---|---|---|
|ゲームのURL|`https://zombietyping.jp/`|未取得。JPRS WHOISは確認時点で `No match!!`。購入画面で再確認|
|配信・HTTPS・DNS|Cloudflare Pages / Free|静的配信の費用は無料枠を想定。アカウント・プロジェクトは未作成|
|ドメインの購入先|XServerドメインを第一候補、さくらを比較候補|下表参照。サーバー契約は今回の構成に含めない|
|ランキング|既存Supabase|今回の移行で新規DBは作らない|
|アクセス解析|既存GA4|同じプロパティ・測定IDを継続|

ドメイン料金は毎年発生する。初年度キャンペーンだけで判断せず、購入画面の総額・更新額・Whois公開設定を確認してから本人が申し込む。利用履歴や対象名によりキャンペーンが適用されないことがある。

|購入先|ローマ字.jpの取得|更新/年|公式情報|
|---|---|---|---|
|XServerドメイン|初回条件を満たす場合0円、対象外の通常取得1,980円|3,102円|[料金と適用条件](https://www.xdomain.ne.jp/domain/price.php)|
|さくらのドメイン|3,982円|3,982円|[税込価格表](https://domain.sakura.ad.jp/specification/)|

JPの公開連絡窓口の代理公開と登録者名の非表示は別の設定。[JPRSの説明](https://jprs.jp/about/dom-rule/whois-concealment/)を参照。購入前に希望する設定が使えることを確認する。さくらは[指定事業者変更の説明](https://help.sakura.ad.jp/domain/2283/)で登録者名の非表示に対応しないと案内している。

## リポジトリ側の準備

- `npm run build:cloudflare`: Cloudflare用に `dist/` を作る。上限20,000ファイル・単一ファイル25 MiBを超えると失敗する。
- `npm run build:hosting-preview`: `.hosting-preview/site/` にローカル検証用の一式を作る。通常の `dist/` と分離する。
- 独自ドメイン未設定、`*.pages.dev` の `SITE_URL`、main以外のブランチ、ローカル検証用ビルドはステージング扱い。解析ID・広告IDを空にし、通常のHTMLページに `noindex`、Cloudflareの応答にも `X-Robots-Tag: noindex` を付ける。Search Consoleの所有確認ファイルは内容を変更しない。
- 本番は `SITE_URL` を確定したドメイン直下のHTTPS URLへ変更する。`pages.dev` のホストだけは `noindex` を維持する。
- 存在しないURLには `404.html` を用意。ゲームへのリンクは公開URLの設定に従って切り替える。
- Cloudflare用の応答ヘッダーにMIMEの誤解釈防止・参照元情報の制限・未使用のカメラ/マイク/位置情報の停止を指定。これらのヘッダーはGitHub Pagesでは適用されない。

## アカウント作成後の設定

日々のコード変更を自動公開できるよう、最初から **PagesのGit連携** を使う。[Git連携の公式手順](https://developers.cloudflare.com/pages/get-started/git-integration/)に従う。Direct Uploadで作ったプロジェクトは後からGit連携へ切り替えられないため、検証用ZIPをそのまま本番プロジェクト作成に使わない。

|設定|値|
|---|---|
|リポジトリ|`thisisikemen/zombie-typing` だけを選ぶ|
|プロジェクト名|`zombie-typing`（利用可能な場合）|
|本番ブランチ|`main`|
|フレームワーク|なし|
|ビルドコマンド|`npm test && npm run build:cloudflare`|
|出力ディレクトリ|`dist`|
|Node環境変数|`NODE_VERSION=22`|
|初回のSITE_URL|未設定でよい。既存GitHub Pagesをcanonicalとして検証する|
|初回の解析・広告変数|未設定。検証中の流入を本番集計へ混ぜない|

CloudflareへのGitHubアプリの許可は、このリポジトリだけを対象にする。利用者によるアカウント作成・認証・規約確認が済んだ後に設定する。Cloudflareのプロジェクトは今回まだ作っていない。

## 切り替え順序

1. `pages.dev` で画像・音・ゲーム・ランキングの読み取り・記録の書き出し/読み込みを確認。ランキングへ架空の成績を投稿しない。
2. `zombietyping.jp` を本人が取得。Cloudflareへサイトを追加して、割り当てられたネームサーバーを購入先に設定する。既存メール等があるドメインを使う場合は、先にDNSレコードを引き継ぐ。
3. PagesのCustom domainsにドメインを追加してHTTPSを確認する。[公式手順](https://developers.cloudflare.com/pages/configuration/custom-domains/)では、ルートドメインにはCloudflareのネームサーバーが必要。
4. Cloudflareの本番変数を `SITE_URL=https://zombietyping.jp/`、`VITE_GA_MEASUREMENT_ID=G-ZCWQHK5BCF` にし、再ビルド。広告IDは審査準備が整ってから設定する。GA4ストリームURLも変更する。
5. canonical・OGP・sitemap・robots・404・GA同意・端末記録・ランキングを実機確認。プライバシーポリシーの配信事業者をCloudflareに更新する。
6. 旧サイトに記録の書き出しと新URLの案内を出す。ローカル記録はドメインをまたいで自動移行しないため、当面は旧サイトから書き出せる状態を保つ。すぐに強制転送しない。
7. 新ドメインをSearch Consoleへ登録し、sitemap送信と移行後の検索流入を確認。AdMobに紐づく既存AdSenseの利用状態を確認して広告審査へ進む。

不具合時は新URLの告知を止め、旧サイトを案内する。切り替え前に旧配信を削除しない。新ドメインで作った記録は、再び旧URLへ戻る場合も書き出し/読み込みが必要。

## 検証と未完了

ローカルのステージング・独自ドメイン用ビルドでメタデータ切り替えを確認する。Cloudflareのヘッダー規則・404のステータス・HTTPS・DNSは実配信後に検証する。ローカルViteプレビューはCloudflareのヘッダー規則を適用しない。

参照: [Pages無料枠の上限](https://developers.cloudflare.com/pages/platform/limits/)、[静的リクエストの料金](https://developers.cloudflare.com/pages/functions/pricing/)、[ヘッダー規則](https://developers.cloudflare.com/pages/configuration/headers/)。
