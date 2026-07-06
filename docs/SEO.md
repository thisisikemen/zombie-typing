# SEO / Search Console 手順

公開URL: https://thisisikemen.github.io/zombie-typing/

## まずやること

1. Google Search Console で「URL プレフィックス」を選び、公開URLを登録する。
2. 所有権確認は「HTML タグ」を選び、表示された `google-site-verification` の値を控える。
3. Codex にその値を渡して、`index.html` の `<head>` に検証用 meta タグを追加する。
4. デプロイ後、Search Console で所有権確認を完了する。
5. `https://thisisikemen.github.io/zombie-typing/sitemap.xml` をサイトマップとして送信する。
6. URL 検査で公開URLを検査し、「インデックス登録をリクエスト」を押す。

## 追加済みのSEO基礎対応

- title / description の検索向け調整
- canonical URL
- OGP / Twitter カード
- 1200x630 の OGP 画像
- JSON-LD 構造化データ(VideoGame)
- sitemap.xml
- robots.txt
- favicon / web manifest
- 遊び方モーダルから開ける攻略・練習ガイドページ

## 注意

GitHub Pages のプロジェクトサイトでは、このリポジトリからホスト直下
`https://thisisikemen.github.io/robots.txt` は管理できません。
そのため、Search Console では sitemap のURLを直接送信してください。
