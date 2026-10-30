# 公開・計測・広告の設定

## 通常の確認

```sh
npm ci
npm test
npm run build
npm run preview
```

`main`へのpushは本番デプロイを起動する。現時点の公開URLは `https://thisisikemen.github.io/zombie-typing/`。

## 設定の置き場所

ローカルは `.env.example` を `.env.local` にコピーする。GitHub Actionsはリポジトリの Settings → Secrets and variables → Actions → Variables に次を設定する。これらは**公開情報**で、DB管理者キーの置き場所ではない。

|変数|初期値・扱い|
|---|---|
|`SITE_URL`|未設定なら現在のGitHub Pages URL。末尾の `/` は自動補完|
|`VITE_GA_MEASUREMENT_ID`|GA4の `G-...`。未設定なら無効。開発サーバーでは常に無効|
|`ADSENSE_PUBLISHER_ID`|所有確認用 `ca-pub-` + 16桁。未設定ならタグもads.txtも生成しない|

`npm run build` が公開URLをビルド結果へ反映する。Vite単体ビルドでは後処理が動かないため、必ずnpmコマンドを使う。

## 独自ドメインへの切り替え

1. ドメイン購入前に更新費・登録情報の公開範囲・アカウント保護を確認。
2. 配信先を確定。GitHub Pagesを継続できる用途かは [事業化の方針](BUSINESS-LAUNCH.md) を参照。
3. Pages継続の場合、GitHub個人設定のPagesでTXTによるドメイン所有確認を行い、リポジトリ Settings → Pages に Custom domain を登録。その後DNSを設定する。未設定のホストへDNSだけ先に向けない。
4. DNSは [GitHub公式の最新手順](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site) に従う。`www` は `thisisikemen.github.io` へのCNAME、apexは案内されているA/ALIAS/ANAME等。ワイルドカードDNSは使わない。
5. HTTPSが有効になったことを確認し、`SITE_URL=https://取得したドメイン/` を設定してデプロイ。カスタムActionsで配信しているので、CNAMEファイルだけで設定が終わるわけではない。
6. トップ・ガイド・プライバシー・OGP画像・sitemap・robots・ランキングを確認。旧URLの転送も確認する。
7. Search Consoleに新ドメインを登録し、新URLのsitemapを送信する。

**端末内データの移行:** localStorageはオリジンごとのため自動移行しない。旧サイトの「設定」→「記録の引き継ぎ」で書き出し、新サイトの同じ画面で読み込む。ファイルには自己ベスト・設定・名前・端末キー・自己ベスト対戦の記録が入り、解析への許可と無関係なサイトデータは入らない。読み込み自体はランキングへ投稿せず、同じ保存項目を上書きする。URLへキーを入れない。

移行前は旧サイトでもこの機能が公開されていることを確認し、記録の書き出しを告知する。旧URLからすぐ強制転送すると書き出せないため、移行告知期間を設ける。ファイルをなくした利用者の旧記録を第三者へ渡さない。

## GA4を有効にする

1. 運営者がGA4プロパティとウェブストリームを作成し、測定IDを確認する。
2. 拡張計測のフォーム操作・サイト内検索など不要な自動計測を無効にし、Googleシグナルも無効のままとする。名前やキーをユーザーID・イベントパラメータ・カスタムディメンションに設定しない。
3. `VITE_GA_MEASUREMENT_ID` を設定してデプロイ。
4. 新しいブラウザで未選択・不許可の間にGoogleタグへの通信がないことをNetworkで確認。
5. 許可後、GA4のリアルタイム等でプレイ開始・終了・再挑戦を確認。開発環境からの試験は `npm run build` → `npm run preview` を利用する。
6. ゲームの「アクセス解析の設定」から不許可へ戻し、以後の送信停止を確認。過去の送信は撤回できない。

イベントは `game_start`、`game_end`、`game_retry`、`share`。必要に応じGA4側で `mode`、`difficulty`、`outcome` をイベントスコープのカスタムディメンションとして登録する。

今回の計測対象はゲーム画面。ガイド・運営情報・プライバシーなどの静的ページには解析タグを読み込んでいないため、それらの閲覧数はこのGA4実装では集計しない。

## 広告審査の準備

所有確認と広告配信を分ける。実IDを `ADSENSE_PUBLISHER_ID` に設定すると、HTMLに所有確認メタタグ、サイト直下にads.txtを生成する。広告スクリプトは読み込まない。サブパスURLではads.txtをルートに置けないため、この設定はドメイン直下の `SITE_URL` でのみ利用できる。

1. ドメイン・配信先・問い合わせ窓口・素材の商用利用条件を確定。
2. 運営者がAdSenseでサイトを追加し、実IDを設定したサイトで所有確認・審査を申請。
3. [審査でReadyとなった後](https://support.google.com/adsense/answer/12131223)、配信コードと必要な同意管理を実装する。今回の解析用許可画面はAdSense用CMPの代替ではない。
4. 最初はタイトルまたは結果画面の**操作ボタンから離れた領域**を候補にする。現在は16:9のゲームが画面全体を使うため、ゲームを覆わない広告用レイアウトを別途用意する。プレイ中の遮蔽・突然の表示・クリックの強制は行わない。
5. プライバシーポリシーに広告事業者と実際のデータ処理を追記し、プレイ完了率・再挑戦率と収益を比較する。

スキンの決済・所持品・復元機能は未実装。ランキングの端末キーを決済や購入権限の認証に流用しない。
