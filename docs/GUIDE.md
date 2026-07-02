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

## 2. 無料で公開する

このゲームは「静的サイト」なので、無料ホスティングにそのまま置ける。2通り紹介する。

### 方法A: Netlify Drop(最速・ドラッグ&ドロップだけ)

1. ビルドする:

   ```bash
   cd "/Users/kawabatakoushirou/名称未設定フォルダ 2"
   npm run build
   ```

   → `dist` フォルダが出来上がる(これが完成品一式)
2. ブラウザで https://app.netlify.com/drop を開く(無料アカウント登録が必要)
3. Finder で `dist` フォルダをページに**ドラッグ&ドロップ**
4. 数十秒で `https://xxxx.netlify.app` という URL が発行される → 誰でも遊べる

- 更新するとき: `npm run build` し直して、サイト管理画面の Deploys にまた `dist` をドロップ
- サイト名(URL の xxxx 部分)は管理画面 → Site configuration → Change site name で変更可能

### 方法B: GitHub + Vercel(更新が自動になる本格運用)

コードを GitHub に置いておくと、push するだけで自動的に公開が更新される。

1. https://github.com で無料アカウントを作り、新しいリポジトリを作成(例: `zombie-typing`)
2. ターミナルで:

   ```bash
   cd "/Users/kawabatakoushirou/名称未設定フォルダ 2"
   git init
   git add .
   git commit -m "ゾンビタイピング"
   git remote add origin https://github.com/あなたのID/zombie-typing.git
   git push -u origin main
   ```

3. https://vercel.com に GitHub アカウントでログイン → **Add New → Project** → リポジトリを Import
4. Framework Preset に **Vite** が自動検出される(Build: `npm run build` / Output: `dist`)→ **Deploy**
5. `https://zombie-typing-xxxx.vercel.app` が発行される

- 以後の更新: コードを直して `git add . && git commit -m "更新" && git push` するだけで、1〜2分後に公開サイトも更新される

### どちらも無料?

- **Netlify / Vercel / GitHub とも、個人の趣味プロジェクトなら完全無料**(商用や大量アクセスで有料枠が必要になるが、このゲームの規模ではまず届かない)
- 独自ドメイン(例: zombie-typing.com)を付けたい場合だけ、ドメイン代(年1,500円前後)がかかる

## 3. X(Twitter)シェアの URL について

リザルト画面のシェアボタンは、公開後の URL でそのまま機能する。公開 URL を固定したら
`src/ui/screens.ts` の share 部分に URL を明示的に入れるとより確実(相談してくれれば対応)。
