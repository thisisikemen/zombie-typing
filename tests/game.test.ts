import { describe, expect, it } from 'vitest';
import { FIELD, PLAYER, TIERS, type Tier } from '../src/config';
import { Game, type Zombie } from '../src/core/game';
import { getDifficulty, getMode } from '../src/core/modes';
import { TypingSession } from '../src/core/typing/engine';
import { WordPool } from '../src/core/words';

const normal = getDifficulty(getMode('dawn'), 'normal');

/** 決定的な擬似乱数(テスト用) */
function lcg(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

let zid = 100;
function makeZombie(kana: string, tier: Tier = 1, x = 1000): Zombie {
  return {
    id: zid++,
    tier,
    word: { display: kana, kana },
    session: new TypingSession(kana),
    x,
    y: 500,
    speed: TIERS[tier].speed,
    speedMultiplier: 1,
    walkTime: 0,
    exclusive: true,
  };
}

function emptyPoolGame(): Game {
  return new Game(normal, new WordPool([]), lcg());
}

describe('ターゲティング', () => {
  it('初手キーで一意ならロックオンし、打ち切りで撃破する', () => {
    const g = emptyPoolGame();
    const a = makeZombie('ねこ');
    const b = makeZombie('さくら');
    g.zombies.push(a, b);

    g.handleKey('n');
    expect(g.targetId).toBe(a.id);
    g.handleKey('e');
    g.handleKey('k');
    g.handleKey('o');
    expect(g.zombies.map((z) => z.id)).toEqual([b.id]);
    expect(g.kills).toBe(1);
    expect(g.combo).toBe(1);
    expect(g.targetId).toBeNull();
  });

  it('初手が重複したら複数候補となり、絞られた時点でロックオンに移行する', () => {
    const g = emptyPoolGame();
    const a = makeZombie('かき');
    const b = makeZombie('かめ');
    g.zombies.push(a, b);

    g.handleKey('k');
    expect(g.candidateIds.sort()).toEqual([a.id, b.id].sort());
    expect(g.targetId).toBeNull();
    g.handleKey('a'); // 両方進む
    expect(g.candidateIds.length).toBe(2);
    g.handleKey('k'); // かき だけが受理 → 一意確定
    expect(g.targetId).toBe(a.id);
    expect(g.candidateIds).toEqual([]);
    g.handleKey('i');
    expect(g.getZombie(a.id)).toBeUndefined();
    // 撃破されなかった方は進捗(ka)を保持している
    expect(g.getZombie(b.id)!.session.typedRomaji()).toBe('ka');
  });

  it('重複候補中のミスでは候補を消さない(打ち切るまで断定しない)', () => {
    const g = emptyPoolGame();
    g.zombies.push(makeZombie('かき'), makeZombie('かめ'));
    g.handleKey('k');
    const before = [...g.candidateIds];
    g.handleKey('z'); // どの候補も受け付けない → ミス
    expect(g.missKeys).toBe(1);
    expect(g.candidateIds).toEqual(before);
  });

  it('Enter でターゲット解除しても進捗が保持され、続きから打てる', () => {
    const g = emptyPoolGame();
    const a = makeZombie('さかな');
    g.zombies.push(a);
    g.handleKey('s');
    g.handleKey('a');
    expect(g.targetId).toBe(a.id);
    g.releaseTarget();
    expect(g.targetId).toBeNull();
    // 残り「かな」の初手 k で再ロックオン
    g.handleKey('k');
    expect(g.targetId).toBe(a.id);
    g.handleKey('a');
    g.handleKey('n');
    g.handleKey('a');
    expect(g.kills).toBe(1);
  });

  it('ミスで単語の進捗はリセットされず、コンボのみ切れる', () => {
    const g = emptyPoolGame();
    g.combo = 5;
    const a = makeZombie('ねこ');
    g.zombies.push(a);
    g.handleKey('n');
    g.handleKey('q'); // ミス
    expect(g.combo).toBe(0);
    expect(a.session.typedRomaji()).toBe('n');
  });
});

describe('自動ターゲット切替', () => {
  it('共有プレフィックスの単語なら、ミスの瞬間に文脈ごと乗り移る', () => {
    const g = emptyPoolGame();
    const a = makeZombie('おつかれさまです');
    g.zombies.push(a);
    for (const k of 'otu') g.handleKey(k); // A をロックして「おつ」まで
    expect(g.targetId).toBe(a.id);

    const b = makeZombie('おつとめごくろう');
    g.zombies.push(b); // 後から出現
    g.handleKey('t'); // A では miss だが「おつと」として B に切替
    expect(g.targetId).toBe(b.id);
    expect(b.session.typedRomaji()).toBe('otut');
    expect(g.missKeys).toBe(0);
    expect(g.correctKeys).toBe(4);
  });

  it('誤ロック後に別の単語を打ち始めると 2 打で乗り移る', () => {
    const g = emptyPoolGame();
    const a = makeZombie('ちず');
    const b = makeZombie('さくら');
    g.zombies.push(a, b);

    g.handleKey('c'); // ち(chi) で A にロック(本当は さくら を打ちたかった)
    expect(g.targetId).toBe(a.id);
    g.handleKey('s'); // miss(1打目は様子見)
    expect(g.missKeys).toBe(1);
    expect(g.targetId).toBe(a.id);
    g.handleKey('a'); // ミス列 "sa" が さくら の正しい入力 → 切替
    expect(g.targetId).toBe(b.id);
    expect(b.session.typedRomaji()).toBe('sa');
    for (const k of 'kura') g.handleKey(k);
    expect(g.kills).toBe(1);
    // A の進捗(c)は保持されている
    expect(g.getZombie(a.id)!.session.typedRomaji()).toBe('c');
  });

  it('無関係なミスが先行していても、打ち直し部分だけで乗り移れる', () => {
    const g = emptyPoolGame();
    const a = makeZombie('ちず');
    const b = makeZombie('さくら');
    g.zombies.push(a, b);
    g.handleKey('c'); // A にロック
    g.handleKey('q'); // 無関係なミス
    g.handleKey('q'); // 無関係なミス
    g.handleKey('s'); // さくら の打ち直し開始(まだ1打なので様子見)
    expect(g.targetId).toBe(a.id);
    g.handleKey('a'); // 末尾 "sa" が一致 → 切替
    expect(g.targetId).toBe(b.id);
    expect(b.session.typedRomaji()).toBe('sa');
  });

  it('どの単語とも一致しないミスは通常のミスのまま', () => {
    const g = emptyPoolGame();
    g.zombies.push(makeZombie('ねこ'), makeZombie('さくら'));
    g.handleKey('n');
    g.handleKey('q');
    g.handleKey('q');
    expect(g.missKeys).toBe(2);
    expect(g.targetId).not.toBeNull();
  });

  it('切替キーで単語が完成した場合はそのまま撃破される', () => {
    const g = emptyPoolGame();
    const a = makeZombie('とけい');
    const b = makeZombie('かき');
    g.zombies.push(a, b);
    g.handleKey('t'); // A にロック
    g.handleKey('k'); // miss (1打目)
    g.handleKey('a'); // miss列 "ka"… まだ B は未完
    expect(g.targetId).toBe(b.id);
    g.handleKey('k');
    g.handleKey('i'); // かき 完成
    expect(g.kills).toBe(1);
  });
});

describe('ダメージ・終了判定', () => {
  it('ライン超えで Tier 基礎ダメージ × (1 − 進捗) を受ける', () => {
    const g = emptyPoolGame();
    const a = makeZombie('とけい', 3, FIELD.lineX + 1); // Tier3 = 20 dmg
    g.zombies.push(a);
    g.handleKey('t');
    g.handleKey('o'); // 進捗 1/3
    g.update(0.1); // ライン超え
    const expected = Math.round(TIERS[3].damage * (1 - 1 / 3));
    expect(g.hp).toBe(PLAYER.maxHp - expected);
    expect(g.zombies).toEqual([]);
  });

  it('HP が尽きるとゲームオーバー', () => {
    const g = emptyPoolGame();
    g.hp = 1;
    g.zombies.push(makeZombie('とけい', 3, FIELD.lineX + 1));
    g.update(0.1);
    expect(g.status).toBe('gameover');
  });

  it('制限時間を生き延びたらクリア', () => {
    const g = emptyPoolGame();
    for (let t = 0; t < normal.duration + 1; t += 0.5) g.update(0.5);
    expect(g.status).toBe('clear');
  });
});

describe('スポーン制御', () => {
  it('時間経過でゾンビがスポーンし、同時数上限を守る', () => {
    const g = new Game(normal, new WordPool(), lcg(7));
    for (let i = 0; i < 40; i++) g.update(0.1); // 4秒
    expect(g.zombies.length).toBeGreaterThan(0);
    // 序盤 4 秒時点の同時数上限は 1 体
    expect(g.zombies.length).toBeLessThanOrEqual(1);
  });

  it('スポーンされる単語の初手キーは画面上のゾンビと重複しない(在庫がある限り)', () => {
    const g = new Game(normal, new WordPool(), lcg(42));
    for (let i = 0; i < 600; i++) {
      g.update(0.1);
      const keySets = g.zombies.map((z) => [...z.session.currentKeys()]);
      const flat = keySets.flat();
      // 排他スポーンが効いていれば、どの2体も受け付けキーが交わらない
      for (const z of g.zombies) {
        if (!z.exclusive) continue;
        const mine = [...z.session.currentKeys()];
        const others = flat.filter((k) => !mine.includes(k));
        expect(others.length).toBe(flat.length - mine.length);
      }
    }
  });
});

describe('単語プールの排他選択', () => {
  it('初手が被らない単語を優先し、尽きたら重複を許可する', () => {
    const pool = new WordPool([
      { display: 'かき', kana: 'かき' },
      { display: 'かめ', kana: 'かめ' },
      { display: 'さる', kana: 'さる' },
    ]);
    const rng = lcg(1);
    const blocked = new Set(['k', 'c']);
    const r1 = pool.pick(rng, [2, 2], blocked, new Set(), new Set());
    expect(r1!.word.kana).toBe('さる');
    expect(r1!.exclusive).toBe(true);
    // s も塞ぐと在庫が尽きる → フォールバックで重複許可
    const r2 = pool.pick(rng, [2, 2], new Set(['k', 'c', 's']), new Set(), new Set());
    expect(r2!.exclusive).toBe(false);
  });
});
