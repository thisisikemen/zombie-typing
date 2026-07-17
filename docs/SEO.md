# SEO / Search Console / 独自ドメイン手順

公開URL: https://thisisikemen.github.io/zombie-typing/

## 実装済みのSEO対応(コード側で完了)

- title / description の検索向け調整(「無料ブラウザ日本語タイピングゲーム」)
- canonical URL、OGP / Twitter カード、1200x630 の OGP 画像
- JSON-LD 構造化データ: トップ=VideoGame、攻略ページ=Article + **FAQPage**
- sitemap.xml、robots.txt、favicon、web manifest
- 攻略・練習ガイドページ(how-to-play.html)— 検索エンジンが読める長文コンテンツ
- タイトル画面の**電光掲示板風ティッカー**(seo-ticker)
  - 画面上は控えめだが、静的HTMLに約400字の紹介文が可視テキストとして存在する
  - 「隠しテキスト」ではない(表示されて動いているだけ)ので Google のガイドライン上も安全。
    キーワードの詰め込みだけ避けて、自然な文章を保つこと
  - ループ用の2つ目の複製は JS が実行時に追加する(HTMLには1回だけ書く=重複テキスト対策)

## ユーザーがやること(コードでは代行できない)

1. **Google Search Console** で「URLプレフィックス」プロパティとして公開URLを登録
   - 所有権確認は HTML ファイル方式で対応済み(`googledbc28d6268e490e2.html` 配信中)
2. サイトマップ送信: `https://thisisikemen.github.io/zombie-typing/sitemap.xml`
3. URL検査 → トップと how-to-play.html の両方で「インデックス登録をリクエスト」
4. 数日後、Search Console の「ページ」でインデックス状況を確認

## Bing(= Microsoft Edge の検索)対応

Edge の既定検索は Bing。Google にインデックスされても Bing には別途登録が必要。

1. **Bing Webmaster Tools**(https://www.bing.com/webmasters)にサインイン
2. 「Google Search Console からインポート」を選ぶと、GSC で確認済みのサイトを
   **ワンクリックで所有権確認ごと引き継げる**(いちばん簡単。先に GSC 登録を済ませること)
3. サイトマップ `https://thisisikemen.github.io/zombie-typing/sitemap.xml` を送信
4. 「URL 検査」でトップと how-to-play.html を検査し、インデックス登録をリクエスト
5. 数日〜2週間で Bing / Edge の検索に出始める(新規サイトは Google より遅めが普通)

コード側の追加対応は不要(Bing も同じ sitemap / meta / 構造化データを読む)。

## 独自ドメインについて(結論: 取るなら今)

**GitHub Pages 自体は検索順位のペナルティ対象ではない。** ただし:

- `thisisikemen.github.io/zombie-typing/` への被リンク・評価は、後で独自ドメインに
  引っ越すと**リセットされる**(301リダイレクトも GitHub Pages のサブパスでは不完全)
- まとめ記事への掲載依頼を始める前にドメインを確定させないと、古いURLで紹介されてしまう
- なので「掲載営業を始める前」が移行のデッドライン

### 最安での取り方(年1,000〜1,700円目安)

| レジストラ | 特徴 |
|---|---|
| Cloudflare Registrar | 原価販売で更新料が最安クラス。ただし取得には Cloudflare アカウントが必要 |
| お名前.com / ムームードメイン | 初年度は安いが**更新料**を必ず確認(1円ドメインは更新で高くなりがち) |
| Squarespace Domains(旧Google Domains) | 分かりやすいが割高め |

- おすすめは `.com`(更新料が安定)。`.jp` は国内向け信頼感があるがやや高い
- 例: `zombie-typing.com` / `zombietyping.jp` など。**指名検索「ゾンビタイピング」と
  綴りが素直に結びつく名前**にする

### 取得後の設定(GitHub Pages はそのまま使える・無料)

1. リポジトリ Settings → Pages → Custom domain にドメインを入力(CNAME ファイルが自動生成される)
2. DNS 側で `CNAME → thisisikemen.github.io`(サブドメイン運用時)または
   A レコード 185.199.108.153 / 109 / 110 / 111(apex 運用時)を設定
3. 「Enforce HTTPS」を有効化
4. **その後コード側の修正が必要**(canonical / OGP / sitemap / robots のURL書き換え)
   → ドメインが決まったら Claude か Codex に「ドメインを◯◯に変えた」と伝えれば一括置換できる
5. Search Console に新ドメインのプロパティを追加し、サイトマップを再送信

## 注意

GitHub Pages のプロジェクトサイトでは、ホスト直下
`https://thisisikemen.github.io/robots.txt` は管理できない。
そのため Search Console では sitemap のURLを直接送信すること
(独自ドメイン移行後は robots.txt がドメイン直下に置けるようになり、この制約は消える)。

## 掲載営業(被リンク獲得)

手順とテンプレは `docs/PROMOTION.md` を参照。
