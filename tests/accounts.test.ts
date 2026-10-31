// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ createClient:vi.fn(), rpc:vi.fn(), callback:null as null | ((event: string, session: any) => void), session:null as any, auth:{ getSession:vi.fn(), signInWithOAuth:vi.fn(), signOut:vi.fn(), exchangeCodeForSession:vi.fn(), signInWithOtp:vi.fn(), verifyOtp:vi.fn() } }));
vi.mock('@supabase/supabase-js', () => ({createClient:mock.createClient}));
const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
const key='zombie-typing:best:dawn:normal';
const rec=JSON.stringify({score:100,kills:1,maxCombo:1,accuracy:1,cleared:true});
const flush = async () => { for (let i=0;i<20;i++) await new Promise(r=>setTimeout(r,0)); };
async function setup() {
  const {initAccounts}=await import('../src/ui/accounts');
  const scope=await import('../src/ui/record-scope');
  const controller=initAccounts(()=>true,()=>{});
  await flush();
  return {controller,scope};
}
beforeEach(()=>{
  vi.resetModules(); vi.stubEnv('VITE_ACCOUNTS_ENABLED','true');
  localStorage.clear(); sessionStorage.clear(); history.replaceState(null,'','/');
  document.body.innerHTML=`<button data-account-open hidden></button><dialog id="account-dialog"><h2 id="account-heading"></h2><p id="account-status"></p><div id="account-guest"></div><div id="account-member"></div><p id="account-message"></p><p id="account-identity"></p><p id="account-transfer-result"></p><button id="account-create"></button><button id="account-login"></button><button id="account-logout"></button><button id="account-sync"></button><button id="account-close"></button><input type="checkbox" id="account-import-consent"></dialog>`;
  mock.session=null; mock.callback=null;
  mock.rpc.mockReset().mockImplementation((name:string)=>({abortSignal:()=>Promise.resolve({data:name === 'claim_ranking_identity' ? 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' : {entries:{[key]:rec},imported:false},error:null})}));
  mock.auth.signInWithOtp.mockReset().mockResolvedValue({error:null});
  mock.auth.verifyOtp.mockReset().mockResolvedValue({error:null});
  mock.auth.getSession.mockReset().mockImplementation(async()=>({data:{session:mock.session},error:null}));
  mock.auth.signInWithOAuth.mockReset().mockResolvedValue({error:null});
  mock.auth.exchangeCodeForSession.mockReset().mockResolvedValue({error:null});
  mock.auth.signOut.mockReset().mockImplementation(async()=>{mock.callback?.('SIGNED_OUT',null);return {error:null};});
  mock.createClient.mockReset().mockReturnValue({auth:{...mock.auth,onAuthStateChange:(cb:any)=>{mock.callback=cb;}},rpc:mock.rpc});
});
afterEach(()=>{vi.unstubAllEnvs();});
describe('任意ログインの画面とセッション復元',()=>{
  it('未ログインでは勝手にOAuthや同期を始めず、説明確認後の新規登録だけが端末記録を保存する',async()=>{
    localStorage.setItem(key,rec);
    await setup();
    expect(mock.rpc).not.toHaveBeenCalled();expect(mock.auth.signInWithOAuth).not.toHaveBeenCalled();
    const button=document.getElementById('account-create') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    const consent=document.getElementById('account-import-consent') as HTMLInputElement;
    consent.checked=true;consent.dispatchEvent(new Event('change'));button.click();await flush();
    const pending=JSON.parse(sessionStorage.getItem('zombie-typing:registration-pending')!);
    expect(pending.records).toEqual({[key]:rec});
    expect(mock.auth.signInWithOAuth).toHaveBeenCalledWith(expect.objectContaining({provider:'google'}));
    expect(document.getElementById('account-message')?.textContent).toContain('今の名前・自己ベスト');
  });
  it('保存済みセッションを復元し、ログイン時には別端末の未登録記録を送らない',async()=>{
    mock.session={user:{id:A}};localStorage.setItem(key,rec);
    const {scope}=await setup();
    expect(scope.recordOwner()).toBe(A);
    expect(mock.createClient).toHaveBeenCalledWith(expect.any(String),expect.any(String),expect.objectContaining({auth:expect.objectContaining({persistSession:true,autoRefreshToken:true})}));
    expect(mock.rpc.mock.calls[0][1]).toMatchObject({p_expected_user:A,p_initial:null,p_updates:{}});
    (document.getElementById('account-logout') as HTMLButtonElement).click();await flush();
    expect(scope.recordOwner()).toBeNull();expect(localStorage.getItem(key)).toBe(rec);
  });
  it('登録の戻り先で記録を引き継ぎ、成功後だけ引き継ぎ待ちを消す',async()=>{
    mock.session={user:{id:A}};
    sessionStorage.setItem('zombie-typing:registration-pending',JSON.stringify({at:Date.now(),records:{[key]:rec}}));
    await setup();
    expect(mock.rpc.mock.calls[0][1].p_initial).toEqual({[key]:rec});
    expect(sessionStorage.getItem('zombie-typing:registration-pending')).toBeNull();
  });
  it('初回のログインでも引き継ぎ確認へ戻し、確認後は再認証せず登録する',async()=>{
    mock.session={user:{id:A}};localStorage.setItem(key,rec);
    mock.rpc.mockImplementation((_name:string,args:any)=>({abortSignal:()=>Promise.resolve({data:_name === 'claim_ranking_identity' ? 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' : args.p_initial
      ? {entries:args.p_initial,imported:true,needs_registration:false}
      : {entries:{},imported:false,needs_registration:true},error:null})}));
    const {scope}=await setup();expect(scope.recordOwner()).toBeNull();
    expect(document.getElementById('account-status')?.textContent).toContain('初めて');
    const consent=document.getElementById('account-import-consent') as HTMLInputElement;
    consent.checked=true;consent.dispatchEvent(new Event('change'));
    (document.getElementById('account-create') as HTMLButtonElement).click();await flush();
    expect(scope.recordOwner()).toBe(A);
    expect(mock.rpc.mock.calls.some(call=>call[1].p_initial?.[key]===rec)).toBe(true);
    expect(mock.auth.signInWithOAuth).not.toHaveBeenCalled();
  });
  it('同期に失敗しても未登録の記録と登録待ちの記録を消さない',async()=>{
    mock.session={user:{id:A}};localStorage.setItem(key,rec);
    sessionStorage.setItem('zombie-typing:registration-pending',JSON.stringify({at:Date.now(),records:{[key]:rec}}));
    mock.rpc.mockImplementation(()=>({abortSignal:()=>Promise.resolve({error:new Error('offline')})}));
    const {scope}=await setup();
    expect(scope.recordOwner()).toBeNull();expect(localStorage.getItem(key)).toBe(rec);
    expect(sessionStorage.getItem('zombie-typing:registration-pending')).not.toBeNull();
  });
  it('プレイ中のアカウント変更をメニューへ戻るまで保留する',async()=>{
    mock.session={user:{id:A}};
    const {initAccounts}=await import('../src/ui/accounts');const scope=await import('../src/ui/record-scope');
    let idle=true;const c=initAccounts(()=>idle,()=>{});await flush();expect(scope.recordOwner()).toBe(A);
    idle=false;mock.callback?.('SIGNED_IN',{user:{id:B}});await flush();expect(scope.recordOwner()).toBe(A);
    idle=true;c.idle();await flush();expect(scope.recordOwner()).toBe(B);
  });
  it('読み込み中にユーザーが変わっても古い応答を次の会員へ適用しない',async()=>{
    mock.session={user:{id:A}};
    let resolveOld: (value: any)=>void = ()=>{};
    mock.rpc.mockImplementation((_name:string,args:any)=>({abortSignal:()=>_name === 'claim_ranking_identity' ? Promise.resolve({data:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',error:null}) : args.p_expected_user===A
      ? new Promise(resolve=>{resolveOld=resolve;})
      : Promise.resolve({data:{entries:{},imported:false},error:null})}));
    const {initAccounts}=await import('../src/ui/accounts');const scope=await import('../src/ui/record-scope');
    initAccounts(()=>true,()=>{});await flush();
    mock.callback?.('SIGNED_IN',{user:{id:B}});await flush();
    resolveOld({data:{entries:{[key]:rec},imported:false},error:null});await flush();
    expect(scope.recordOwner()).toBe(B);
    expect(localStorage.getItem(scope.scopedKey(key,B))).toBeNull();
  });
  it('認証コードを履歴から消してから交換し、画面URLに残さない',async()=>{
    history.replaceState(null,'','/?account=return&code=test-code');
    const {initAccounts}=await import('../src/ui/accounts');initAccounts(()=>true,()=>{});
    expect(location.search).toBe('');await flush();
    expect(mock.auth.exchangeCodeForSession).toHaveBeenCalledWith('test-code');
  });
});

describe('確認番号によるメール登録の準備',()=>{
 function emailUI() { document.getElementById('account-guest')!.innerHTML='<div id="account-email" hidden><form id="account-email-form"><input id="account-email-address" type="email" required><button id="account-email-register"></button></form><button id="account-email-login"></button><form id="account-code-form" hidden><input id="account-email-code" pattern="[0-9]{6,10}" required></form><p id="account-email-status"></p></div>'; }
 it('送信準備がない本番ではメール入力を表示せず送信しない',async()=>{
  emailUI();await setup();expect(document.getElementById('account-email')!.hidden).toBe(true);expect(mock.auth.signInWithOtp).not.toHaveBeenCalled();
 });
 it('メール登録も記録の確認後だけ送信し、ログインでは新規アカウントを作らない',async()=>{
  vi.stubEnv('VITE_EMAIL_AUTH_ENABLED','true');emailUI();await setup();
  (document.getElementById('account-email-address') as HTMLInputElement).value='player@example.com';
  const form=document.getElementById('account-email-form')!;
  form.dispatchEvent(new Event('submit',{cancelable:true}));await flush();expect(mock.auth.signInWithOtp).not.toHaveBeenCalled();
  (document.getElementById('account-import-consent') as HTMLInputElement).checked=true;
  form.dispatchEvent(new Event('submit',{cancelable:true}));await flush();
  expect(mock.auth.signInWithOtp).toHaveBeenCalledWith({email:'player@example.com',options:{shouldCreateUser:true}});
 });
 it('メールログインは登録をせず、メールアドレスを変えても送信先の番号で確認する',async()=>{
  vi.stubEnv('VITE_EMAIL_AUTH_ENABLED','true');emailUI();await setup();
  const address=document.getElementById('account-email-address') as HTMLInputElement;address.value='player@example.com';
  document.getElementById('account-email-login')!.click();await flush();
  expect(mock.auth.signInWithOtp).toHaveBeenCalledWith({email:'player@example.com',options:{shouldCreateUser:false}});
  address.value='other@example.com';(document.getElementById('account-email-code') as HTMLInputElement).value='123456';
  document.getElementById('account-code-form')!.dispatchEvent(new Event('submit',{cancelable:true}));await flush();
  expect(mock.auth.verifyOtp).toHaveBeenCalledWith({email:'player@example.com',token:'123456',type:'email'});
 });
});

describe('登録後の旧サイト引き継ぎ',()=>{
 it('登録済みでも旧ランキングのキーを関連付け、本人の同期先へ記録を送る',async()=>{
  mock.session={user:{id:A}};
  const {controller}=await setup();
  const oldKey='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  mock.rpc.mockClear();
  await controller.importRecords({format:'zombie-typing-records',version:1,entries:{[key]:rec,'zombie-typing:device-key':oldKey,'zombie-typing:player-name':'以前の名前'}});
  expect(mock.rpc).toHaveBeenCalledWith('claim_ranking_identity',expect.objectContaining({p_expected_user:A,p_legacy_key:oldKey}));
  expect(mock.rpc).toHaveBeenCalledWith('sync_player_records',expect.objectContaining({p_expected_user:A,p_initial:null,p_updates:{[key]:rec,'zombie-typing:player-name':'以前の名前'}}));
 });
 it('未登録の引き継ぎでは送信せず、先に遊んだ高い自己ベストを守る',async()=>{
  const {controller}=await setup();localStorage.setItem(key,rec);mock.rpc.mockClear();
  await controller.importRecords({format:'zombie-typing-records',version:1,entries:{[key]:JSON.stringify({...JSON.parse(rec),score:50}),'zombie-typing:player-name':'以前の名前'}});
  expect(mock.rpc).not.toHaveBeenCalled();expect(JSON.parse(localStorage.getItem(key)!).score).toBe(100);
  expect(localStorage.getItem('zombie-typing:player-name')).toBe('以前の名前');
 });
});

it('新サイトで遊んでから登録しても、旧サイト引き継ぎの枠を使わない',async()=>{
 const initialKey='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 mock.session={user:{id:A}};sessionStorage.setItem('zombie-typing:registration-pending',JSON.stringify({at:Date.now(),records:{[key]:rec},rankingKey:initialKey}));
 await setup();
 expect(mock.rpc).toHaveBeenCalledWith('claim_ranking_identity',expect.objectContaining({p_expected_user:A,p_legacy_key:null,p_existing_key:initialKey}));
});
