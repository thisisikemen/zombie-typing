/** Same-origin transport; no ranking key, name, user email, or auth token. Unwired. */
export function createTransport({fetchImpl=fetch,timeoutMs=3000}={}){
 async function post(path,data,outerSignal){
  const controller=new AbortController(),abort=()=>controller.abort();
  if(outerSignal?.aborted)throw Error('aborted');outerSignal?.addEventListener('abort',abort,{once:true});
  let timer;
  try{
   const task=fetchImpl('/api/activity/'+path,{method:'POST',credentials:'same-origin',keepalive:path==='write',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:controller.signal}).then(async r=>{const body=await r.json();if(!r.ok||body.ok!==true)throw Error('activity_request_failed');return body;});
   return await Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('activity_timeout'))},timeoutMs)})]);
  }finally{clearTimeout(timer);outerSignal?.removeEventListener('abort',abort);}
 }
 return{
  async enroll(signal){await post('session',{},signal);if(signal?.aborted)throw Error('aborted');const result=await post('enroll',{version:'activity-v2'},signal);if(typeof result.epoch!=='string')throw Error('invalid_epoch');return result.epoch;},
  async write({version,rows},signal){return post('write',{version,rows},signal);},
  async revoke(){const result=await post('revoke',{});if(result.identified!==true)throw Error('identity_unavailable_deletion_unverified');return result;}
 };
}
