import {expect,it} from 'vitest';
// @ts-expect-error Worker module is exercised in Node's standards-compatible runtime.
import worker from '../worker/index.mjs';
import {readFileSync} from 'node:fs';
it('Worker追加はAPIパスのみ、初期OFF、静的assetsを元の応答で返す',async()=>{
 const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
 expect(config.assets.run_worker_first).toEqual(['/api/activity/*']);expect(config.vars.ACTIVITY_ENABLED).toBe('false');
 const env={...config.vars,ASSETS:{fetch:async()=>new Response('asset',{status:404,headers:{'X-Test-Asset':'original'}})}};
 const result=await worker.fetch(new Request('https://zombietyping.jp/missing'),env);expect(result.status).toBe(404);expect(result.headers.get('X-Test-Asset')).toBe('original');
 const request=new Request('https://zombietyping.jp/api/activity/session',{method:'POST',headers:{origin:'https://zombietyping.jp','content-type':'application/json'},body:'{}'});
 const off=await worker.fetch(request,env);expect(off.status).toBe(503);expect(await off.json()).toEqual({error:'collection_disabled'});expect(off.headers.has('set-cookie')).toBe(false);
});
