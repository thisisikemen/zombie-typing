import { MODES } from '../core/modes';

export const BACKUP_MAX_BYTES = 2 * 1024 * 1024;
const PREFIX = 'zombie-typing:';
const SETTINGS = `${PREFIX}settings`;
const NAME = `${PREFIX}player-name`;
const DEVICE = `${PREFIX}device-key`;
const bestKeys = MODES.flatMap((mode) => mode.difficulties.map((diff) => `${PREFIX}best:${mode.id}:${diff.id}`));
const vsKeys = MODES.flatMap((mode) => mode.difficulties.map((diff) => `${PREFIX}vs-best:${diff.id}`));
const allowedKeys = new Set([SETTINGS, NAME, DEVICE, ...bestKeys, ...vsKeys]);
type RecordStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export interface RecordBackup {
  format: 'zombie-typing-records';
  version: 1;
  entries: Record<string, string>;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('記録ファイルの形式が違います。');
  return value as Record<string, unknown>;
}
function number(value: unknown, max = 1_000_000_000, min = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error('記録に不正な数値が含まれています。');
  return value;
}
function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('設定の形式が違います。');
  return value;
}
function timeline(value: unknown): number[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50000) throw new Error('対戦記録の形式が違います。');
  return value.map((item) => number(item, 86_400_000));
}

function normalize(key: string, raw: string): string {
  if (key === NAME) {
    if (Array.from(raw).length > 10 || /[\u0000-\u001f\u007f]/.test(raw)) throw new Error('名前の形式が違います。');
    return raw;
  }
  if (key === DEVICE) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) throw new Error('ランキング識別情報の形式が違います。');
    return raw;
  }
  const rec = object(JSON.parse(raw));
  if (key === SETTINGS) return JSON.stringify({
    volume: number(rec.volume, 1), sfx: boolean(rec.sfx), bgm: boolean(rec.bgm), romaji: boolean(rec.romaji),
  });
  if (key.startsWith(`${PREFIX}vs-best:`)) {
    if (rec.version !== 1) throw new Error('この対戦記録には対応していません。');
    return JSON.stringify({ version: 1, kills: number(rec.kills), wpm: number(rec.wpm, 10000),
      accuracy: number(rec.accuracy, 1), keysPerKill: number(rec.keysPerKill, 10000, 1),
      shotTimesMs: timeline(rec.shotTimesMs), killTimesMs: timeline(rec.killTimesMs) });
  }
  return JSON.stringify({ score: number(rec.score), kills: number(rec.kills), maxCombo: number(rec.maxCombo),
    accuracy: number(rec.accuracy, 1), cleared: boolean(rec.cleared),
    ...(rec.survival === undefined ? {} : { survival: number(rec.survival, 86400) }),
    ...(rec.wpm === undefined ? {} : { wpm: number(rec.wpm, 10000) }) });
}

export function parseBackup(text: string): RecordBackup {
  if (new TextEncoder().encode(text).length > BACKUP_MAX_BYTES) throw new Error('記録ファイルは2MB以内にしてください。');
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('記録ファイルを読み取れませんでした。'); }
  const root = object(value);
  if (root.format !== 'zombie-typing-records' || root.version !== 1) throw new Error('ゾンビタイピングから書き出した記録ファイルを選んでください。');
  const entries: Record<string, string> = {};
  for (const [key, raw] of Object.entries(object(root.entries))) {
    if (!allowedKeys.has(key) || typeof raw !== 'string') throw new Error('対象外のデータが含まれています。');
    try { entries[key] = normalize(key, raw); } catch (error) {
      if (error instanceof SyntaxError) throw new Error('記録の内容を読み取れませんでした。');
      throw error;
    }
  }
  if (Object.keys(entries).length === 0) throw new Error('引き継げる記録がありません。');
  return { format: 'zombie-typing-records', version: 1, entries };
}

export function createBackup(storage: Pick<Storage, 'getItem'>): RecordBackup {
  const entries: Record<string, string> = {};
  for (const key of allowedKeys) {
    const value = storage.getItem(key);
    if (value !== null) entries[key] = value;
  }
  return parseBackup(JSON.stringify({ format: 'zombie-typing-records', version: 1, entries }));
}

/** 対象キーだけを復元する。途中で容量不足になった場合は書き込んだ分を戻す。 */
export function restoreBackup(storage: RecordStorage, backup: RecordBackup): void {
  const entries = Object.entries(parseBackup(JSON.stringify(backup)).entries);
  const previous = new Map(entries.map(([key]) => [key, storage.getItem(key)]));
  const written: string[] = [];
  try {
    for (const [key, value] of entries) { storage.setItem(key, value); written.push(key); }
  } catch {
    try {
      for (const key of written) storage.removeItem(key);
      for (const key of written) {
        const value = previous.get(key);
        if (value !== null && value !== undefined) storage.setItem(key, value);
      }
    } catch { throw new Error('保存できませんでした。サイトデータの保存設定を確認し、元の記録ファイルを保管してください。'); }
    throw new Error('記録を保存できませんでした。ブラウザの空き容量と保存設定を確認してください。');
  }
}
