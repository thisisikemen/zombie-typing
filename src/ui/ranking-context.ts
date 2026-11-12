import { ONLINE_CONFIG, deviceKey } from './ranking';
import { recordOwner } from './record-scope';
let accessTokenFor: ((owner:string)=>Promise<string>) | null=null;
export function setRankingContextAuth(provider: (owner:string)=>Promise<string>): void { accessTokenFor=provider; }
export async function fetchOwnBest(difficulty:string, expectedOwner:string|null):Promise<{name:string;value:number}> {
 if(recordOwner()!==expectedOwner)throw Error('account changed');
 const token=expectedOwner ? await accessTokenFor?.(expectedOwner) : ONLINE_CONFIG.supabaseAnonKey;
 if(!token || recordOwner()!==expectedOwner)throw Error('authentication unavailable');
 const res=await fetch(`${ONLINE_CONFIG.supabaseUrl}/rest/v1/rpc/ranking_own_best`,{method:'POST',headers:{apikey:ONLINE_CONFIG.supabaseAnonKey,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({p_difficulty:difficulty,p_expected_user:expectedOwner,p_guest_key:expectedOwner?null:deviceKey()}),signal:AbortSignal.timeout(5000)});
 if(!res.ok || recordOwner()!==expectedOwner)throw Error('own best unavailable');
 const best=await res.json();
 if(!best || typeof best.name!=='string' || !Number.isSafeInteger(best.value) || best.value<0)throw Error('own best unavailable');
 return best;
}

export interface RankingContext { total: number; rank: number; tied: number; neighbors: { name: string; value: number; rank: number }[] }
const contextCache=new Map<string,{until:number;result:Promise<RankingContext>}>();
/** Public display data only; bounded one-minute cache coalesces identical reads. Not anti-abuse enforcement. */
export function clearRankingContextCache(): void { contextCache.clear(); }
export function fetchRankingContext(difficulty:string,value:number):Promise<RankingContext> {
  const key=JSON.stringify([difficulty,Math.round(value)]), now=Date.now();
  const cached=contextCache.get(key); if(cached && cached.until>now)return cached.result;
  if(contextCache.size>=16)contextCache.delete(contextCache.keys().next().value!);
  const result=requestRankingContext(difficulty,value).catch(error=>{contextCache.delete(key);throw error;});
  contextCache.set(key,{until:now+60000,result}); return result;
}
async function requestRankingContext(difficulty: string, value: number): Promise<RankingContext> {
  const { supabaseUrl, supabaseAnonKey } = ONLINE_CONFIG;
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/ranking_context`, {
    method: 'POST', headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_difficulty: difficulty, p_value: Math.round(value) }), signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error('ranking context unavailable');
  const c = await res.json() as RankingContext;
  if (![c.total,c.rank,c.tied].every(Number.isSafeInteger) || c.total<0 || c.rank<1 || c.rank>c.total+1 || c.tied<0 ||
      !Array.isArray(c.neighbors) || c.neighbors.length>9 || c.neighbors.some(n => typeof n.name!=='string' || !Number.isFinite(n.value) || !Number.isSafeInteger(n.rank) || n.rank<1)) throw new Error('invalid ranking context');
  return c;
}
/** One explicit read per result, no polling/retry; stale results cannot replace newer screens. */
export function mountRankingContext(host: HTMLElement, difficulty: string, value: number, savedBestRank?: number): void {
  const expectedOwner=recordOwner();
  host.replaceChildren();
  const button = document.createElement('button');
  button.className = 'plate-btn compact-btn'; button.textContent = '詳しい順位と近い記録を見る';
  const output = document.createElement('div'); output.className='ranking-context-output'; output.setAttribute('aria-live','polite');
  host.append(button, output);
  let started = false;
  button.onclick = async () => {
    if (started) return; started=true; button.disabled=true; button.textContent='順位を確認中…';
    try {
      const best=await fetchOwnBest(difficulty,expectedOwner);
      const c=await fetchRankingContext(difficulty,best.value);
      if (!host.contains(button) || recordOwner()!==expectedOwner) return;
      const title=document.createElement('strong');
      title.textContent=`自己ベスト：${c.rank.toLocaleString('ja-JP')}位 / ${c.total.toLocaleString('ja-JP')}記録`;
      const note=document.createElement('p');
      note.textContent=`${best.name}：${best.value.toLocaleString('ja-JP')}${difficulty==='endless'?'秒':'点'}。同点 ${c.tied}件。人数は端末・アカウント単位の目安です。順位は最大1分前の集計です。`;
      const list=document.createElement('ul');
      for (const n of c.neighbors) {
        const row=document.createElement('li');
        row.textContent=`${n.rank}位　${n.name}　${n.value.toLocaleString('ja-JP')}${difficulty==='endless'?'秒':'点'}`; list.append(row);
      }
      const explanation=document.createElement('p'); explanation.textContent='自己ベストに近い公開記録（最大9件）。同点は一部のみの表示です。あなたの記録が一覧に出ない場合もありますが、あなたの自己ベストは上に表示しています。';
      output.append(title);
      if (savedBestRank !== undefined) { const best=document.createElement('p'); best.textContent=`今回：${Math.round(value).toLocaleString('ja-JP')}${difficulty==='endless'?'秒':'点'}。自己ベスト登録時：${savedBestRank.toLocaleString('ja-JP')}位`; output.append(best); }
      const target=document.createElement('p');
      const higher=c.neighbors.filter(n=>n.value>best.value).map(n=>n.value);
      target.textContent=higher.length ? `次の高い記録まで あと${(Math.min(...higher)-best.value).toLocaleString('ja-JP')}${difficulty==='endless'?'秒':'点'}` : 'この難易度の最高記録です';
      output.append(target,note,list,explanation); button.textContent='この結果の順位を取得済み';
    } catch { if(host.contains(button) && recordOwner()===expectedOwner) { output.textContent='詳しい順位は今は取得できません。プレイや記録保存には影響ありません。'; button.textContent='詳しい順位を取得できませんでした'; } }
  };
}

/** Current run replaces this owner's stored slot for comparison; no extra participant. */
export function captureRankingIdentity(){return {owner:recordOwner(),key:deviceKey()};}
export async function fetchRunPosition(difficulty:string,value:number,identity=captureRankingIdentity()):Promise<{rank:number;total:number}> {
 const expectedOwner=identity.owner;
 if(recordOwner()!==expectedOwner || deviceKey()!==identity.key)throw Error('account changed');
 const token=expectedOwner ? await accessTokenFor?.(expectedOwner) : ONLINE_CONFIG.supabaseAnonKey;
 if(!token || recordOwner()!==expectedOwner)throw Error('authentication unavailable');
 const res=await fetch(`${ONLINE_CONFIG.supabaseUrl}/rest/v1/rpc/ranking_run_position`,{method:'POST',headers:{apikey:ONLINE_CONFIG.supabaseAnonKey,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({p_difficulty:difficulty,p_value:Math.round(value),p_expected_user:expectedOwner,p_guest_key:expectedOwner?null:identity.key}),signal:AbortSignal.timeout(5000)});
 if(!res.ok || recordOwner()!==expectedOwner || deviceKey()!==identity.key)throw Error('run position unavailable');
 const c=await res.json();
 if(recordOwner()!==expectedOwner || deviceKey()!==identity.key)throw Error('account changed');
 if(!Number.isSafeInteger(c.rank)||!Number.isSafeInteger(c.total)||c.total<1||c.rank<1||c.rank>c.total)throw Error('invalid run position');
 return {rank:c.rank,total:c.total};
}
export function runPositionLabel(c:{rank:number;total:number}):string {return `今回の順位：${c.total.toLocaleString('ja-JP')}人中 ${c.rank.toLocaleString('ja-JP')}位`;}
