# 起動・公開ガイド

VS Code などのエディタは**不要**。Mac 標準の「ターミナル」だけで完結する。

## 1. Chrome で遊ぶ(ローカル)

1. **ターミナル.app** を開く(Spotlight で「ターミナル」と検索)
2. プロジェクトフォルダへ移動して開発サーバーを起動:

   ```bash
   cd "/Users/kawabatakoushirou/名称未設定フォルダ 2"
   npm run dev
   ```

3. `Local: http://localhost:5173/` と表示されたら、その URL を **Chrome のアドレスバーに入力**して開く(⌘クリックでも開ける)
4. 終了するときはターミナルで `Ctrl + C`

- コードや `src/config.ts` の数値を変更すると、**保存した瞬間にブラウザへ自動反映**される(リロード不要)。バランス調整はゲームを遊びながらできる
- 同じ Wi-Fi の別端末で試したい場合は `npm run dev -- --host` で起動し、表示される Network の URL を開く

## 2. 公開について(公開済み)

このゲームは GitHub Pages で公開済み:

**https://thisisikemen.github.io/zombie-typing/**

- リポジトリ: https://github.com/thisisikemen/zombie-typing (公開リポジトリ)
- `main` ブランチに push すると GitHub Actions が自動でビルドして公開サイトを更新する
  (設定は `.github/workflows/deploy.yml`。手動で再実行したいときはリポジトリの
  Actions タブ → Deploy to GitHub Pages → Run workflow)

### 更新のしかた

コードや素材を直したら:

```bash
cd "/Users/kawabatakoushirou/名称未設定フォルダ 2"
git add .
git commit -m "変更内容をひとこと"
git push
```

1〜2分後に公開サイトへ反映される。Claude Code に「〜を直して公開して」と頼めば
この一連の作業ごと代行できる。

### 管理あれこれ

- **消したい/非公開にしたい**: リポジトリの Settings → 最下部 Danger Zone から
  いつでも削除・非公開化できる(非公開化すると無料プランでは Pages も停止する)
- **URL を変えたい**: リポジトリ名を変えると URL も変わる(Settings → Rename)
- **独自ドメイン**(例: zombie-typing.com)も Pages の設定から無料で紐付けられる
  (ドメイン代のみ年1,500円前後)
- **費用**: 個人の趣味プロジェクトの規模なら GitHub Pages は完全無料

### 参考: Netlify Drop との違い

Netlify Drop(dist をドラッグ&ドロップ)はお試し公開には手軽だが、
アカウントに紐付けない場合は後から管理・削除ができず短期間で自動削除される。
継続的に更新していく本作は GitHub Pages 運用が適している。
