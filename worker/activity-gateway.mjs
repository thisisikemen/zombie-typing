/** UNDEPLOYED v2 gateway. No production configuration or secrets are included. */
const PREFIX='/api/activity/';
const COOKIE='__Host-zta_activity_v2';
const DAY=86400, COLLECT_TTL=90*DAY, DELETE_TTL=180*DAY;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MODES=new Set(['basic','easy','normal','hard','hardcore','endless']);
const encoder=new TextEncoder();
const hex=b=>[...new Uint8Array(b)].map(v=>v.toString(16).padStart(2,'0')).join('');
const bytes=h=>Uint8Array.from(h.match(/../g)||[],s=>parseInt(s,16));
const fields=(o,list)=>!!o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).sort().join(',')===[...list].sort().join(',');
const dayAt=t=>new Date(t+32400000).toISOString().slice(0,10);
async function key(secret,c){return c.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify'])}
export async function signature(text,secret,c=crypto){return hex(await c.subtle.sign('HMAC',await key(secret,c),encoder.encode(text)))}
async function verify(text,sig,secret,c){return typeof sig==='string'&&/^[a-f0-9]{64}$/.test(sig)&&c.subtle.verify('HMAC',await key(secret,c),bytes(sig),encoder.encode(text))}
function response(status,body,cookie){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(cookie?{'Set-Cookie':cookie}:{})}})}
const header=(value,maxAge=DELETE_TTL)=>`${COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
async function readBody(request,limit,timeout){
 const reader=request.body?.getReader();if(!reader)throw Error('invalid_body');
 let timer;const chunks=[];let size=0;
 const read=(async()=>{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit)throw Error('payload_too_large');chunks.push(value)}const all=new Uint8Array(size);let offset=0;for(const c of chunks){all.set(c,offset);offset+=c.length}return JSON.parse(new TextDecoder().decode(all));})();
 try{return await Promise.race([read,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('body_timeout')),timeout)})]);}
 finally{clearTimeout(timer);void reader.cancel().catch(()=>{});}
}
export function validRows(rows,now){
 if(!Array.isArray(rows)||!rows.length||rows.length>12)return false;
 const dates=[dayAt(now),dayAt(now-86400000)],keys=new Set();
 for(const r of rows){
  if(!fields(r,['day','difficulty','writer_id','elapsed_ms','starts','finishes'])||!dates.includes(r.day)||!MODES.has(r.difficulty)||!UUID.test(r.writer_id))return false;
  for(const [field,max] of [['elapsed_ms',86400000],['starts',1000],['finishes',1000]])if(!Number.isSafeInteger(r[field])||r[field]<0||r[field]>max)return false;
  if(r.elapsed_ms===0&&r.starts===0&&r.finishes===0)return false;
  const k=r.day+'|'+r.difficulty+'|'+r.writer_id;if(keys.has(k))return false;keys.add(k);
 }return true;
}
export function createActivityGateway({fetchImpl=fetch,now=Date.now,cryptoImpl=crypto,bodyTimeoutMs=2000,rpcTimeoutMs=3000}={}){
 async function renewedCookie(identity,issued,env){
  const value={id:identity.id,epoch:identity.epoch,issued,collect_until:issued+COLLECT_TTL,delete_until:issued+DELETE_TTL};
  const p=btoa(JSON.stringify(value)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  return header(p+'.'+await signature(p,env.ACTIVITY_COOKIE_KEY,cryptoImpl));
 }
 async function decode(request,env){
  const raw=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
  if(!raw||raw.length>1024)return null;
  try{const [p,s,...extra]=raw.split('.');if(extra.length||!await verify(p,s,env.ACTIVITY_COOKIE_KEY,cryptoImpl))return null;const v=JSON.parse(atob(p.replace(/-/g,'+').replace(/_/g,'/'))),t=Math.floor(now()/1000);
   if(!fields(v,['id','epoch','issued','collect_until','delete_until'])||!UUID.test(v.id)||!UUID.test(v.epoch)||![v.issued,v.collect_until,v.delete_until].every(Number.isSafeInteger)||v.issued>t+5||v.collect_until!==v.issued+COLLECT_TTL||v.delete_until!==v.issued+DELETE_TTL||v.delete_until<=t)return null;return v;
  }catch{return null;}
 }
 async function rpc(operation,fields,env){
  const issued=Math.floor(now()/1000),payload=JSON.stringify({v:2,operation,issued_at:issued,expires_at:issued+120,...fields});
  const sig=await signature(payload,env.ACTIVITY_RPC_KEY,cryptoImpl),abort=new AbortController();let timer;
  try{const task=fetchImpl(env.ACTIVITY_DB_RPC_URL,{method:'POST',headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_payload:payload,p_signature:sig}),signal:abort.signal}).then(async r=>r.ok?await r.json():null);
   const result=await Promise.race([task,new Promise(resolve=>{timer=setTimeout(()=>{abort.abort();resolve(null)},rpcTimeoutMs)})]);return result?.ok===true?result:null;
  }catch{return null;}finally{clearTimeout(timer)}
 }
 return {async fetch(request,env){
  const url=new URL(request.url);if(!url.pathname.startsWith(PREFIX))return env.ASSETS.fetch(request);
  const op=url.pathname.slice(PREFIX.length);
  if(!['session','enroll','write','revoke'].includes(op))return response(404,{error:'not_found'});
  if(request.method!=='POST')return response(405,{error:'method_not_allowed'});
  if(url.origin!==env.SITE_ORIGIN||request.headers.get('origin')!==env.SITE_ORIGIN||(request.headers.get('sec-fetch-site')&&request.headers.get('sec-fetch-site')!=='same-origin'))return response(403,{error:'origin_denied'});
  if(env.ACTIVITY_ENABLED!=='true'&&op!=='revoke')return response(503,{error:'collection_disabled'});
  if(!env.ACTIVITY_COOKIE_KEY||env.ACTIVITY_COOKIE_KEY.length<32||!env.ACTIVITY_RPC_KEY||env.ACTIVITY_RPC_KEY.length<32||!env.ACTIVITY_RATE_LIMITER)return response(503,{error:'not_configured'});
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))return response(415,{error:'json_required'});
  if(Number(request.headers.get('content-length'))>4096)return response(413,{error:'payload_too_large'});
  // Use platform-verified client address only as a rotating keyed rate-limit value.
  const ip=request.headers.get('CF-Connecting-IP');if(!ip)return response(503,{error:'rate_identity_unavailable'});
  try{const rateKey=await signature(dayAt(now())+'|'+ip,env.ACTIVITY_COOKIE_KEY,cryptoImpl);if(!(await env.ACTIVITY_RATE_LIMITER.limit({key:op+'|'+rateKey})).success)return response(429,{error:'rate_limited'});}catch{return response(503,{error:'rate_limit_unavailable'})}
  let body;try{body=await readBody(request,4096,bodyTimeoutMs);}catch(e){return response(e.message==='payload_too_large'?413:e.message==='body_timeout'?408:400,{error:e.message==='body_timeout'?'body_timeout':'invalid_body'})}
  const cookie=await decode(request,env),seconds=Math.floor(now()/1000);
  if(op==='session'){
   if(!fields(body,[]))return response(400,{error:'empty_body_required'});
   if(cookie)return response(cookie.collect_until>seconds?200:409,{ok:cookie.collect_until>seconds,error:cookie.collect_until<=seconds?'collection_expired_delete_first':undefined});
   const issued=seconds,value={id:cryptoImpl.randomUUID(),epoch:cryptoImpl.randomUUID(),issued,collect_until:issued+COLLECT_TTL,delete_until:issued+DELETE_TTL};
   const p=btoa(JSON.stringify(value)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
   // This first step writes no DB identity. The same cookie is retained across enroll retries.
   return response(200,{ok:true},header(p+'.'+await signature(p,env.ACTIVITY_COOKIE_KEY,cryptoImpl)));
  }
  if(op==='revoke'){
   if(!fields(body,[]))return response(400,{error:'empty_body_required'});
   if(!cookie)return response(200,{ok:true,identified:false},header('',0));
   // Expired collection credential remains withdrawal-only for all retained rows.
   const result=await rpc('revoke',{visitor_id:cookie.id,epoch:cookie.epoch},env);
   return result?response(200,{ok:true,identified:true},header('',0)):response(503,{error:'deletion_pending'});
  }
  if(!cookie||cookie.collect_until<=seconds)return response(401,{error:'session_required'});
  if(op==='enroll'){
   if(!fields(body,['version'])||body.version!=='activity-v2')return response(400,{error:'invalid_policy_version'});
   const result=await rpc('grant',{visitor_id:cookie.id,epoch:cookie.epoch,previous_epoch:null,policy_version:'activity-v2'},env);
   return result?response(200,{ok:true,epoch:cookie.epoch},await renewedCookie(cookie,seconds,env)):response(503,{error:'enrollment_pending'});
  }
  if(!fields(body,['version','rows'])||body.version!=='activity-v2'||!validRows(body.rows,now()))return response(400,{error:'invalid_measurement'});
  const result=await rpc('write',{visitor_id:cookie.id,epoch:cookie.epoch,rows:body.rows},env);
  // Use the pre-RPC timestamp: a delayed response cannot extend past a concurrent revocation tombstone.
  return result?response(200,{ok:true},await renewedCookie(cookie,seconds,env)):response(503,{error:'measurement_not_confirmed'});
 }};
}
