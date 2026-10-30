# オンラインランキングの運用

現行クライアントは `src/ui/ranking.ts` の公開設定からSupabaseに接続している。接続が未設定ならlocalStorageのランキングを利用する。

## 最初に確認すること

2026-10-30の確認で、公開APIから端末識別キーが読み取れる問題を発見し、本番の公開列権限を修正した。状況と修正は [セキュリティ確認](SECURITY-REVIEW.md) と [権限修正SQL](../supabase/migrations/202610300001_hide_device_keys.sql) を参照。

以前この文書にあった「他人の改ざんは不可能」「ランキングを占拠できない」という説明は正しくない。ブラウザで作るスコアの偽装やUUIDの再生成は可能であり、公開キーを隠すだけでは防げない。

## 現在のAPI

- 読み取り: `scores` の表示用列（name / score / kills / wpm / accuracy / updated_at / survival_seconds）。difficultyで絞り、scoreまたはsurvival_seconds順に上位100件を取得。
- 投稿: `submit_score(p_device_key, p_difficulty, p_name, p_score, p_kills, p_wpm, p_accuracy, p_survival_seconds)`。
- 名前変更: `rename_player(p_device_key, p_name)`。
- `device_key` はlocalStorageに保持する。公開テーブルからは読めない権限にする必要がある。
- 端末内のキーを消したりドメインを変えたりすると、既存の記録と同じ所有者として更新できなくなる。

ベスト記録は難易度ごとに保持する。エンドレスは生存時間を指標にする。旧バックエンド向けの互換フォールバックはクライアントに残っている。

## 障害時

ネットワークが使えなくてもゲーム本体と端末内の自己ベストは動く。オンライン投稿に失敗したとき、現在は自動再送しない。ランキングの成績を直すときは管理画面で対象を確認し、無関係な記録をまとめて削除しない。

新規DBを作る場合は、このリポジトリだけで本番のスキーマ全体を再構築できる状態にはなっていない。旧セットアップSQLの再利用で同じ公開権限の問題を作らず、本人確認・RLS・列権限・RPC実行権限まで含めて設計する。
