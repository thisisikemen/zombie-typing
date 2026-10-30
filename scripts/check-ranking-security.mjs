// 読み取りだけの本番確認。返された記録や端末キーは出力しない。
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../src/ui/ranking.ts', import.meta.url), 'utf8');
const url = source.match(/supabaseUrl: '([^']+)'/)?.[1];
const key = source.match(/supabaseAnonKey: '([^']+)'/)?.[1];
if (!url || !key) throw new Error('Public ranking config is missing');
const headers = { apikey: key, Authorization: `Bearer ${key}` };
const checks = [
  ['表示列の取得', 'select=name,score,kills,wpm,accuracy,updated_at,survival_seconds&difficulty=eq.easy&order=score.desc', false],
  ['生存時間順の取得', 'select=name,score,kills,wpm,accuracy,updated_at,survival_seconds&difficulty=eq.endless&order=survival_seconds.desc', false],
  ['端末キーの取得禁止', 'select=device_key', true],
  ['全列の取得禁止', 'select=*', true],
];
const results = await Promise.all(checks.map(async ([name, query, denied]) => {
  const response = await fetch(`${url}/rest/v1/scores?${query}&limit=1`, { headers, signal: AbortSignal.timeout(15000) });
  const body = await response.json();
  // 未認証のanonに対する権限拒否は401、認証済みでは403になり得る。
  // HTTPステータスだけでなくPostgreSQLのinsufficient_privilegeも確認する。
  const ok = denied
    ? [401, 403].includes(response.status) && body.code === '42501'
    : response.status === 200 && Array.isArray(body);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: HTTP ${response.status}${denied ? ` / permission_denied=${body.code === '42501'}` : ''}`);
  return ok;
}));
if (results.some((ok) => !ok)) process.exitCode = 1;
