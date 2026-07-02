このフォルダに PNG 素材を置くと、ゲームが自動でそれを使います。
無いファイルはコード生成のピクセルアート風スプライトで代替されます
(素材が未完成でもゲームは動きます)。

【現在の状態】全素材配置済み(「ゾンビタイピング素材」フォルダから
tools/process_assets.py で変換したもの)。
新しいシートを差し替えるときは docs/PROMPTS.md と tools/process_assets.py を参照。

期待するファイル名と規約
------------------------------------------------------------
bg_night.png
  夜の廃墟背景(キャラなしの空舞台)。推奨 1920x1080。
  空の面積が広い構図が望ましい(空の色は時間経過でコードが変化させる)。

soldier_body.png
  兵士の胴体(銃を持つ腕なし)。右向き・透過 PNG。

soldier_arms_gun.png
  銃 + 両腕(肩から先)のみ。透過 PNG。
  肩の回転基準点を画像の「左端・上下中央」付近に置くこと。
  銃口は画像の右端付近に。
  ※ピボット/銃口の正確な位置は src/config.ts の SOLDIER
    (armsPivotRatioX/Y, muzzleRatioX/Y)で調整できます。

zombie1_walk_1.png 〜 zombie1_walk_4.png
  Tier1(弱)ゾンビの歩行 4 フレーム。
  - 左向き
  - 透過 PNG
  - 全フレーム同一キャンバスサイズ
  - 足元の位置を全フレームで揃える(下端基準で描画されます)
  ※1枚のスプライトシートとして横並びで生成してから分割するのが
    画風が揃いやすくおすすめ。

zombie2_walk_1..4.png / zombie3_walk_1..4.png(任意)
  Tier2(中)/ Tier3(強)。規約は zombie1 と同じ。
  無い場合は zombie1 の色変えで自動生成されます。

描画サイズの調整
------------------------------------------------------------
src/config.ts:
  SOLDIER.bodyHeight   … 兵士の描画高さ
  SOLDIER.armsHeight   … 腕+銃の描画高さ
  ZOMBIE_ANIM.baseHeight … ゾンビ(Tier1)の描画高さ
  TIERS[n].scale       … Tier ごとの大きさ倍率
