/**
 * ランキング。
 * - リザルトで自動登録される(名前は保存された名前、無ければ既定名)
 * - 「1 人(1 端末)につき難易度ごとに 1 枠」: 端末ごとの deviceKey で
 *   ベストスコアだけが残る(オンライン時。ローカル時は自分の履歴を保持)
 * - バックエンドは差し替え可能。ONLINE_CONFIG に Supabase の URL / anon
 *   キーを入れると自動でオンラインモードになる(手順は docs/RANKING.md)
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
  /** 登録済みスコアの名前を変更する */
  rename(name: string): Promise<void>;
  readonly online: boolean;
}

/** オンライン化するときにここを埋める(docs/RANKING.md 参照) */
export const ONLINE_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: '',
};

const MAX_ENTRIES = 100;
const NAME_KEY = 'zombie-typing:player-name';
const DEVICE_KEY = 'zombie-typing:device-key';

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

/** この端末を識別するキー(1人1枠の実現用) */
function deviceKey(): string {
  try {
    let key = localStorage.getItem(DEVICE_KEY);
    if (!key) {
      key = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, key);
    }
    return key;
  } catch {
    return '00000000-0000-4000-8000-000000000000';
  }
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

  async rename(name: string): Promise<void> {
    // ローカルの記録は全部この端末のものなので、まとめて改名する
    for (const diff of ['easy', 'normal', 'hard']) {
      try {
        const raw = localStorage.getItem(this.key(diff));
        if (!raw) continue;
        const list = (JSON.parse(raw) as RankEntry[]).map((e) => ({ ...e, name }));
        localStorage.setItem(this.key(diff), JSON.stringify(list));
      } catch {
        /* ignore */
      }
    }
  }
}

// ---------------------------------------------------------------
// オンライン(Supabase)バックエンド。設定が入ると自動で使われる。
// 書き込みは RPC(submit_score / rename_player)経由のみ。テーブルへの
// 直接 INSERT/UPDATE は許可しないので、開発者ツールから任意の行は作れない。
// deviceKey により 1 端末 1 難易度 1 枠(ベストスコアのみ保持)。
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
        `&select=name,score,kills,wpm,accuracy,updated_at&order=score.desc&limit=${MAX_ENTRIES}`,
      { headers: this.headers() },
    );
    if (!res.ok) throw new Error(`ranking load failed: ${res.status}`);
    const rows = (await res.json()) as {
      name: string;
      score: number;
      kills: number;
      wpm: number;
      accuracy: number;
      updated_at: string;
    }[];
    return rows.map((r) => ({
      name: r.name,
      score: r.score,
      kills: r.kills,
      wpm: r.wpm,
      accuracy: r.accuracy,
      ts: Date.parse(r.updated_at),
    }));
  }

  async submit(difficulty: string, entry: RankEntry): Promise<number> {
    const res = await fetch(`${this.url}/rest/v1/rpc/submit_score`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        p_device_key: deviceKey(),
        p_difficulty: difficulty,
        p_name: entry.name,
        p_score: entry.score,
        p_kills: entry.kills,
        p_wpm: entry.wpm,
        p_accuracy: entry.accuracy,
      }),
    });
    if (!res.ok) throw new Error(`ranking submit failed: ${res.status}`);
    const rank = (await res.json()) as number;
    return rank;
  }

  async rename(name: string): Promise<void> {
    await fetch(`${this.url}/rest/v1/rpc/rename_player`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ p_device_key: deviceKey(), p_name: name }),
    });
  }
}

export const rankingBackend: RankingBackend =
  ONLINE_CONFIG.supabaseUrl && ONLINE_CONFIG.supabaseAnonKey
    ? new OnlineBackend(ONLINE_CONFIG.supabaseUrl, ONLINE_CONFIG.supabaseAnonKey)
    : new LocalBackend();
