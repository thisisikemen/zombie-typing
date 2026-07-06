# Suno AI 用 BGM プロンプト集

生成したら mp3 を渡してくれれば、モードごとの BGM 切り替えごと実装して差し替える
(ファイル名の想定: `bgm-endless.mp3` / `bgm-hardcore.mp3`)。

どちらも **Instrumental(歌なし)を ON** にして生成すること。
1曲 2〜3 分あればループ再生で違和感が出にくい。
「Exclude Styles」には `pop, edm, happy, upbeat, vocals` あたりを入れると事故が減る。

---

## 1. 夜は明けない(エンドレス)

**狙い**: 今の戦闘 BGM より「地獄感」。終わりのない夜。ただし単調にならず、
層がゆっくり変化し続けて飽きない。テンポは遅め、圧が徐々に増す。

Style of Music(コピペ用):

```
Dark ambient doom soundtrack for an endless zombie night. Slow funeral war drums,
deep droning low strings and sub bass, distant demonic choir swells, creaking metal
and cold wind textures, sparse dissonant piano notes echoing in ruins. Layers evolve
slowly and keep shifting so it never feels repetitive, gradually more oppressive and
hopeless. Cinematic horror game music, seamless loop, instrumental, 70 BPM.
```

バリエーション違いが欲しいときの差し替え語:
- より不穏に → `add ritualistic throat chanting, reversed bells, heartbeat pulse`
- より静かな絶望 → `remove drums, focus on drones and whispers, funeral organ`

---

## 2. ハードコア(最凶の夜)

**狙い**: 緊迫感と高揚感、恐怖。ラスボス戦。序盤に「カーン…」と鐘が鳴り、
そこから一気に地獄の進軍が始まる。

Style of Music(コピペ用):

```
Epic final boss battle theme. Opens with a slow tolling church bell over eerie
silence, then explodes into aggressive hybrid orchestra: industrial metal guitars,
relentless taiko and double-kick drums, frantic string ostinato, dissonant brass
stabs, dark Latin choir chants. Rising tension into a euphoric terrifying climax,
unstoppable zombie horde energy. Horror game boss music, 160 BPM, instrumental,
loopable.
```

バリエーション違いが欲しいときの差し替え語:
- 鐘を全編に → `the bell keeps tolling through the whole track`
- より電子的に → `add distorted synth bass and glitch percussion`
- よりオーケストラ寄りに → `remove metal guitars, full symphonic orchestra and pipe organ`

---

## 生成のコツ

- Suno は「Custom」モードで上の英文を **Style of Music** に貼り、Lyrics は空+
  Instrumental ON にするのが安定
- 同じプロンプトでも数回生成してベストテイクを選ぶ(2〜3 回引くのが普通)
- ループの継ぎ目が気になる場合は、曲末尾がフェードアウトするテイクを選ぶと
  ゲーム側のループでも違和感が少ない
