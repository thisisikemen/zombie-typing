# 公開・計測・広告の設定

## 通常の確認

```sh
npm ci
npm test
npm run build
npm run preview
```

正式公開URLは `https://zombietyping.jp/`。Cloudflareへの公開は [移行・公開手順](CLOUDFLARE-LAUNCH.md) の環境変数付きコマンドで行う。`main`へのpushで、Cloudflareの正式サイトと旧GitHub Pagesが自動更新される。Cloudflareはテスト・依存監査・ビルドが成功した場合だけ公開する。

## 設定の置き場所

ローカルは `.env.example` を `.env.local` にコピーする。GitHub Actionsはリポジトリの Settings → Secrets and variables → Actions → Variables に次を設定する。これらは**公開情報**で、DB管理者キーの置き場所ではない。

|変数|初期値・扱い|
|---|---|
|`SITE_URL`|本番は `https://zombietyping.jp/`。未設定時は互換用の旧GitHub Pages URL|
|`VITE_GA_MEASUREMENT_ID`|GA4の `G-...`。未設定なら無効。開発サーバーでは常に無効|
|`ADSENSE_PUBLISHER_ID`|所有確認用 `ca-pub-` + 16桁。未設定ならタグもads.txtも生成しない|

`npm run build` が公開URLをビルド結果へ反映する。Vite単体ビルドでは後処理が動かないため、必ずnpmコマンドを使う。

## 独自ドメインへの切り替え（完了）

本番はCloudflareへ移行済み。以下のGitHub Pages向け設定は移行前の参考手順であり、現在のドメインの向け先をGitHubへ戻さない。

1. ドメイン購入前に更新費・登録情報の公開範囲・アカウント保護を確認。
2. 配信先を確定。GitHub Pagesを継続できる用途かは [事業化の方針](BUSINESS-LAUNCH.md) を参照。
3. Pages継続の場合、GitHub個人設定のPagesでTXTによるドメイン所有確認を行い、リポジトリ Settings → Pages に Custom domain を登録。その後DNSを設定する。未設定のホストへDNSだけ先に向けない。
4. DNSは [GitHub公式の最新手順](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site) に従う。`www` は `thisisikemen.github.io` へのCNAME、apexは案内されているA/ALIAS/ANAME等。ワイルドカードDNSは使わない。
5. HTTPSが有効になったことを確認し、`SITE_URL=https://取得したドメイン/` を設定してデプロイ。カスタムActionsで配信しているので、CNAMEファイルだけで設定が終わるわけではない。
6. トップ・ガイド・プライバシー・OGP画像・sitemap・robots・ランキングを確認。旧URLの転送も確認する。
7. Search Consoleに新ドメインを登録し、新URLのsitemapを送信する。

**端末内データの移行は任意:** 新サイトのランキング（名前が空欄の場合）とアカウント画面の「前の記録を引き継ぐ」から旧サイトを開き、旧サイトの「記録を引き継ぐ」を押して新サイトへ戻る。以前遊んだブラウザで実行する。登録後にも実行でき、元の記録と高い自己ベストを守る。旧サイトは中央の引っ越し案内のみ表示し、ゲームは開始しない。ファイルによる方法は新サイトの設定に補助手段として残す。

移行前は旧サイトでもこの機能が公開されていることを確認し、記録の書き出しを告知する。旧URLからすぐ強制転送すると書き出せないため、移行告知期間を設ける。ファイルをなくした利用者の旧記録を第三者へ渡さない。

## GA4を有効にする

Cloudflareへの切り替えを進める場合は、先に [移行の設定値と検証手順](CLOUDFLARE-LAUNCH.md) を参照。GitHubリポジトリの変数はCloudflareへ自動転送されない。

2026-10-30、現行公開URL用のストリーム `G-ZCWQHK5BCF` を作成し、リポジトリ変数へ設定済み。既存プロパティを引き続き使い、2026-10-31にストリームURLを `https://zombietyping.jp/` へ更新済み。

同日の[公開処理](https://github.com/thisisikemen/zombie-typing/actions/runs/41068327494)は成功。公開サイトで未同意・不許可時にGoogleタグのscript要素がないこと、許可後に正しいIDのscript要素が追加されること、撤回後の再読み込みでタグがなくなることを確認した。GA4ホームの「過去30分のアクティブユーザー数」に1人の受信を確認。ベーシックで開始・再挑戦・終了を操作したが、管理画面の表示更新が止まったため、個別のゲームイベントの受信一覧とカスタムディメンションの登録は未確認。タグの追加確認と個別イベントの受信確認を混同しない。

1. 運営者がGA4プロパティとウェブストリームを作成し、測定IDを確認する。
2. 拡張計測機能をオフにし、Googleシグナルも無効のままとする。ページビューはサイト側のタグ設定で送る。名前やキーをユーザーID・イベントパラメータ・カスタムディメンションに設定しない。
3. `VITE_GA_MEASUREMENT_ID` を設定してデプロイ。
4. 新しいブラウザで未選択・不許可の間にGoogleタグへの通信がないことをNetworkで確認。
5. 許可後、GA4のリアルタイム等でプレイ開始・終了・再挑戦を確認。開発環境からの試験は `npm run build` → `npm run preview` を利用する。
6. ゲームの「アクセス解析の設定」から不許可へ戻し、以後の送信停止を確認。過去の送信は撤回できない。

イベントは `game_start`、`game_end`、`game_retry`、`share`。必要に応じGA4側で `mode`、`difficulty`、`outcome` をイベントスコープのカスタムディメンションとして登録する。

今回の計測対象はゲーム画面。ガイド・運営情報・プライバシーなどの静的ページには解析タグを読み込んでいないため、それらの閲覧数はこのGA4実装では集計しない。

## 広告審査の準備

所有確認と広告配信を分ける。実IDを `ADSENSE_PUBLISHER_ID` に設定すると、HTMLに所有確認メタタグ、サイト直下にads.txtを生成する。広告スクリプトは読み込まない。サブパスURLではads.txtをルートに置けないため、この設定はドメイン直下の `SITE_URL` でのみ利用できる。

1. ドメイン・配信先・問い合わせ窓口・素材の商用利用条件を確定。
   AdMobを利用中の場合は、先に関連する既存のAdSenseアカウントを確認する。[Googleの案内](https://support.google.com/admob/answer/6023158?hl=ja)に沿ってWebサイト向けの利用を申請し、重複アカウントを作らない。
2. 運営者がAdSenseでサイトを追加し、実IDを設定したサイトで所有確認・審査を申請。
3. [審査でReadyとなった後](https://support.google.com/adsense/answer/12131223)、配信コードと必要な同意管理を実装する。今回の解析用許可画面はAdSense用CMPの代替ではない。
4. 最初はタイトルまたは結果画面の**操作ボタンから離れた領域**を候補にする。現在は16:9のゲームが画面全体を使うため、ゲームを覆わない広告用レイアウトを別途用意する。プレイ中の遮蔽・突然の表示・クリックの強制は行わない。
5. プライバシーポリシーに広告事業者と実際のデータ処理を追記し、プレイ完了率・再挑戦率と収益を比較する。

スキンの決済・所持品・復元機能は未実装。ランキングの端末キーを決済や購入権限の認証に流用しない。

## 検索登録と広告審査の進捗（2026-10-31）

Search Consoleに `https://zombietyping.jp/` のURLプレフィックスを追加し、既存の `public/googledbc28d6268e490e2.html` で自動所有確認が完了。確認ファイルは削除しない。`sitemap.xml` の送信成功と5ページの検出を確認し、トップページのインデックス登録もリクエストした。送信完了と検索結果への掲載完了は別で、掲載はまだ未確認。

AdMobに関連する既存AdSense `pub-6491456634983694` でWeb向けの利用を追加し、`zombietyping.jp` を登録。新しいGoogleアカウントや支払先は作成・変更していない。既存アカウントの公開用IDをGitHub変数 `ADSENSE_PUBLISHER_ID=ca-pub-6491456634983694` に保存し、本番のメタタグと `/ads.txt` を公開した。AdSense側でメタタグによる所有確認が通り、サイト審査をリクエスト済み。広告スクリプトは未配信で、自動広告の設定も行っていない。審査通過と誤認しない。

自動公開の構成と、専用キーの扱いは [Cloudflareの運用](CLOUDFLARE-LAUNCH.md#自動公開github-actions) を参照。
