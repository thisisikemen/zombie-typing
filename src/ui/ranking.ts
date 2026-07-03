/**
 * ランキング。
 * バックエンドは差し替え可能な構造にしてあり、現在は「この端末内」
 * (localStorage)で動作する。オンライン化するときは ONLINE_CONFIG に
 * Supabase の URL / anon キーを入れて OnlineBackend を有効化する
 * (セットアップ手順は docs/RANKING.md)。
 */

export interface RankEntry {
  name: string;
  score: number;
  kills: number;
  wpm: number;
  accuracy: number; // 0〜1
  ts: number;
}

export interface RankingBackend {
  /** スコア順の上位リストを返す */
  load(difficulty: string): Promise<RankEntry[]>;
  /** 登録して順位(1始まり)を返す */
  submit(difficulty: string, entry: RankEntry): Promise<number>;
  readonly online: boolean;
}

/** オンライン化するときにここを埋める(docs/RANKING.md 参照) */
export const ONLINE_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: '',
};

const MAX_ENTRIES = 100;
const NAME_KEY = 'zombie-typing:player-name';

export function loadPlayerName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function savePlayerName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* ignore */
  }
}

/** 名前の整形(空なら既定名、最大10文字) */
export function sanitizeName(raw: string): string {
  const name = raw.trim().slice(0, 10);
  return name.length > 0 ? name : '名無しの生存者';
}

// ---------------------------------------------------------------
// ローカル(この端末)バックエンド
// ---------------------------------------------------------------

class LocalBackend implements RankingBackend {
  readonly online = false;

  private key(difficulty: string): string {
    return `zombie-typing:ranking:${difficulty}`;
  }

  async load(difficulty: string): Promise<RankEntry[]> {
    try {
      const raw = localStorage.getItem(this.key(difficulty));
      const list = raw ? (JSON.parse(raw) as RankEntry[]) : [];
      return list.sort((a, b) => b.score - a.score || a.ts - b.ts);
    } catch {
      return [];
    }
  }

  async submit(difficulty: string, entry: RankEntry): Promise<number> {
    const list = await this.load(difficulty);
    list.push(entry);
    list.sort((a, b) => b.score - a.score || a.ts - b.ts);
    const rank = list.indexOf(entry) + 1;
    try {
      localStorage.setItem(this.key(difficulty), JSON.stringify(list.slice(0, MAX_ENTRIES)));
    } catch {
      /* ignore */
    }
    return rank;
  }
}

// ---------------------------------------------------------------
// オンライン(Supabase REST)バックエンド。設定が入ると自動で使われる。
// 注意: クライアントでスコアを計算する構造上、完全な不正防止は不可能。
// サーバー側の CHECK 制約 + 挿入専用ポリシーで「現実的な範囲」を守る。
// ---------------------------------------------------------------

class OnlineBackend implements RankingBackend {
  readonly online = true;

  constructor(
    private readonly url: string,
    private readonly anonKey: string,
  ) {}

  private headers(): Record<string, string> {
    return {
      apikey: this.anonKey,
      Authorization: `Bearer ${this.anonKey}`,
      'Content-Type': 'application/json',
    };
  }

  async load(difficulty: string): Promise<RankEntry[]> {
    const res = await fetch(
      `${this.url}/rest/v1/scores?difficulty=eq.${difficulty}` +
        `&select=name,score,kills,wpm,accuracy,created_at&order=score.desc&limit=${MAX_ENTRIES}`,
      { headers: this.headers() },
    );
    if (!res.ok) throw new Error(`ranking load failed: ${res.status}`);
    const rows = (await res.json()) as {
      name: string;
      score: number;
      kills: number;
      wpm: number;
      accuracy: number;
      created_at: string;
    }[];
    return rows.map((r) => ({
      name: r.name,
      score: r.score,
      kills: r.kills,
      wpm: r.wpm,
      accuracy: r.accuracy,
      ts: Date.parse(r.created_at),
    }));
  }

  async submit(difficulty: string, entry: RankEntry): Promise<number> {
    const res = await fetch(`${this.url}/rest/v1/scores`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        difficulty,
        name: entry.name,
        score: entry.score,
        kills: entry.kills,
        wpm: entry.wpm,
        accuracy: entry.accuracy,
      }),
    });
    if (!res.ok) throw new Error(`ranking submit failed: ${res.status}`);
    // 自分より上のスコア数 + 1 = 順位
    const countRes = await fetch(
      `${this.url}/rest/v1/scores?difficulty=eq.${difficulty}&score=gt.${entry.score}&select=id`,
      { headers: { ...this.headers(), Prefer: 'count=exact', Range: '0-0' } },
    );
    const contentRange = countRes.headers.get('content-range');
    const total = contentRange ? Number(contentRange.split('/')[1]) : 0;
    return (Number.isFinite(total) ? total : 0) + 1;
  }
}

export const rankingBackend: RankingBackend =
  ONLINE_CONFIG.supabaseUrl && ONLINE_CONFIG.supabaseAnonKey
    ? new OnlineBackend(ONLINE_CONFIG.supabaseUrl, ONLINE_CONFIG.supabaseAnonKey)
    : new LocalBackend();
