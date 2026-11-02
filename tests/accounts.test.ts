// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
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
  // CIの公開設定を引き継がず、各テストが使う画面と機能を明示する。
  vi.stubEnv('VITE_EMAIL_AUTH_ENABLED','false');
  localStorage.clear(); sessionStorage.clear(); history.replaceState(null,'','/');
  document.body.innerHTML = readFileSync('index.html', 'utf8').split('<body>')[1].split('</body>')[0].replace(/<script[\s\S]*?<\/script>/g, '');
  mock.session=null; mock.callback=null;
  mock.rpc.mockReset().mockImplementation((name:string)=>({abortSignal:()=>Promise.resolve({data:name === 'player_account_overview' ? {rankings:[],transfer_choice:'pending'} : name === 'claim_ranking_identity' ? 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' : {entries:{[key]:rec},imported:false},error:null})}));
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
    expect(button.disabled).toBe(false);
    button.click();
    expect(document.getElementById('account-register')!.hidden).toBe(false);
    expect(mock.auth.signInWithOAuth).not.toHaveBeenCalled();
    document.getElementById('account-confirm-create')!.click();await flush();
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
    document.getElementById('account-create')!.click();
    document.getElementById('account-confirm-create')!.click();await flush();
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
 function emailUI() {}
 it('送信準備がない本番ではメール入力を表示せず送信しない',async()=>{
  emailUI();await setup();expect(document.getElementById('account-email')!.hidden).toBe(true);expect(mock.auth.signInWithOtp).not.toHaveBeenCalled();
 });
 it('メール登録も記録の確認後だけ送信し、ログインでは新規アカウントを作らない',async()=>{
  vi.stubEnv('VITE_EMAIL_AUTH_ENABLED','true');emailUI();await setup();
  (document.getElementById('account-email-address') as HTMLInputElement).value='player@example.com';
  const form=document.getElementById('account-email-form')!;
  form.dispatchEvent(new Event('submit',{cancelable:true}));await flush();expect(mock.auth.signInWithOtp).not.toHaveBeenCalled();
  document.getElementById('account-email-register')!.click();
  form.dispatchEvent(new Event('submit',{cancelable:true}));await flush();
  expect(mock.auth.signInWithOtp).toHaveBeenCalledWith({email:'player@example.com',options:{shouldCreateUser:true}});
 });
 it('メールログインは登録をせず、メールアドレスを変えても送信先の番号で確認する',async()=>{
  vi.stubEnv('VITE_EMAIL_AUTH_ENABLED','true');emailUI();await setup();
  const address=document.getElementById('account-email-address') as HTMLInputElement;address.value='player@example.com';
  document.getElementById('account-email-login')!.click();
  document.getElementById('account-email-form')!.dispatchEvent(new Event('submit',{cancelable:true}));await flush();
  expect(mock.auth.signInWithOtp).toHaveBeenCalledWith({email:'player@example.com',options:{shouldCreateUser:false}});
  address.value='other@example.com';(document.getElementById('account-email-code') as HTMLInputElement).value='123456';
  document.getElementById('account-code-form')!.dispatchEvent(new Event('submit',{cancelable:true}));await flush();
  expect(mock.auth.verifyOtp).toHaveBeenCalledWith({email:'player@example.com',token:'123456',type:'email'});
  expect(document.getElementById('account-email-status')!.textContent).not.toBe('ログインしました。');
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

it('旧サイトから新タブを開いた直後の引き継ぎは、ログイン復元を待って本人へ保存する',async()=>{
 mock.session={user:{id:A}};
 const {initAccounts}=await import('../src/ui/accounts');
 const scope=await import('../src/ui/record-scope');
 const controller=initAccounts(()=>true,()=>{});
 const pending=controller.importRecords({format:'zombie-typing-records',version:1,entries:{'zombie-typing:player-name':'旧サイト'}});
 await pending;
 expect(scope.recordOwner()).toBe(A);
 expect(mock.rpc).toHaveBeenCalledWith('sync_player_records',expect.objectContaining({p_expected_user:A,p_updates:{'zombie-typing:player-name':'旧サイト'}}));
 expect(localStorage.getItem('zombie-typing:player-name')).toBeNull();
});

it('引き継ぎ済みのゲストには案内を隠し、確認画面から持ってきた記録で登録する',async()=>{
 await setup();expect(document.getElementById('account-old-hint')!.hidden).toBe(false);
 localStorage.setItem(key,rec);localStorage.setItem('zombie-typing:old-site-moved','true');
 window.dispatchEvent(new Event('zombie-records-imported'));
 expect(document.getElementById('account-old-hint')!.hidden).toBe(true);
 expect(document.getElementById('account-message')!.textContent).toContain('引き継いだ名前');
 document.getElementById('account-create')!.click();document.getElementById('account-confirm-create')!.click();await flush();
 expect(JSON.parse(sessionStorage.getItem('zombie-typing:registration-pending')!).records[key]).toBe(rec);
});

it('Googleでログインを押すとアカウント選択を要求し、自動ログインの復元では要求しない',async()=>{
 await setup();document.getElementById('account-login')!.click();await flush();
 expect(mock.auth.signInWithOAuth).toHaveBeenCalledWith(expect.objectContaining({provider:'google',options:expect.objectContaining({queryParams:{prompt:'select_account'}})}));
});
it('本人用の画面にログイン先を表示し、ランキングの名前には使わない',async()=>{
 mock.session={user:{id:A,email:'player@example.com'}};const {scope}=await setup();
 expect(document.getElementById('account-identity')!.textContent).toBe('');
 expect(document.getElementById('account-member')!.textContent).not.toContain('player@example.com');
 document.getElementById('account-details-open')!.click();
 expect(document.getElementById('account-identity')!.textContent).toBe('ログイン中：player@example.com');
 (document.getElementById('account-details-dialog') as HTMLDialogElement).close();await flush();
 expect(document.getElementById('account-identity')!.textContent).toBe('');
 expect(localStorage.getItem(scope.scopedKey('zombie-typing:player-name',A))).not.toBe('player@example.com');
 expect(mock.auth.signInWithOAuth).not.toHaveBeenCalled();
});
it('ログアウト成功後はSDK通知が遅くてもログイン表示を解除する',async()=>{
 mock.session={user:{id:A,email:'player@example.com'}};
 mock.auth.signOut.mockImplementation(async()=>({error:null}));
 const {scope}=await setup();document.getElementById('account-details-open')!.click();document.getElementById('account-logout')!.click();await flush();
 expect(mock.auth.signOut).toHaveBeenCalledWith({scope:'local'});
 expect(scope.recordOwner()).toBeNull();
 expect(document.getElementById('account-identity')!.textContent).toBe('');
 expect(document.querySelector('[data-account-open]')!.textContent).toBe('ログイン・登録');
 expect(document.getElementById('account-status')!.textContent).toContain('ログアウトしました');
});
it('ログアウト失敗時はログイン表示と本人の記録を維持する',async()=>{
 mock.session={user:{id:A,email:'player@example.com'}};
 mock.auth.signOut.mockImplementation(async()=>({error:new Error('offline')}));
 const {scope}=await setup();document.getElementById('account-details-open')!.click();document.getElementById('account-logout')!.click();await flush();
 expect(scope.recordOwner()).toBe(A);
 expect(document.getElementById('account-identity')!.textContent).toContain('player@example.com');
 expect(document.getElementById('account-status')!.textContent).toContain('ログアウトできません');
});


it('ログイン中は旧サイトの案内をプロフィールに出さず、全5ステージの自己ベストを表示する', async () => {
 mock.session={user:{id:A}};await setup();
 expect(document.getElementById('account-old-hint')!.hidden).toBe(true);
 expect(document.querySelectorAll('.profile-record')).toHaveLength(5);
 expect(document.getElementById('account-records')!.textContent).toContain('100 pt');
});
it('不要を選んだ案内は隠し、会員を切り替えても他人の選択を使わない', async () => {
 await setup();
 document.querySelector<HTMLButtonElement>('#account-old-hint [data-dismiss-transfer]')!.click();await flush();
 expect(document.getElementById('account-old-hint')!.hidden).toBe(true);
 mock.callback?.('SIGNED_IN',{user:{id:A}});await flush();
 expect(document.querySelector<HTMLElement>('#modal-settings [data-transfer-prompt]')!.hidden).toBe(false);
});
it('退会の失敗では本人の記録を残し、成功したときだけ会員キャッシュを消してゲストに戻す', async () => {
 mock.session={user:{id:A}};localStorage.setItem(key,rec);const {scope}=await setup();
 const input=document.getElementById('account-delete-confirm') as HTMLInputElement;
 const form=document.getElementById('account-delete-form')!;
 document.getElementById('account-delete-open')!.click();
 form.dispatchEvent(new Event('submit',{cancelable:true}));await flush();
 expect(mock.rpc.mock.calls.some(call=>call[0]==='delete_player_account')).toBe(false);
 input.value='退会';input.dispatchEvent(new Event('input'));
 const original=mock.rpc.getMockImplementation()!;
 mock.rpc.mockImplementation((name:string,args:any)=>name==='delete_player_account' ? {abortSignal:()=>Promise.resolve({error:new Error('offline')})} : original(name,args));
 form.dispatchEvent(new Event('submit',{cancelable:true}));await flush();
 expect(scope.recordOwner()).toBe(A);expect(localStorage.getItem(scope.scopedKey(key,A))).toBe(rec);
 mock.rpc.mockImplementation((name:string,args:any)=>name==='delete_player_account' ? {abortSignal:()=>Promise.resolve({error:null})} : original(name,args));
 form.dispatchEvent(new Event('submit',{cancelable:true}));await flush();
 expect(scope.recordOwner()).toBeNull();expect(localStorage.getItem(scope.scopedKey(key,A))).toBeNull();
 expect(localStorage.getItem(key)).toBe(rec);
 expect(mock.rpc).toHaveBeenCalledWith('delete_player_account',{p_expected_user:A,p_confirmation:'退会'});
});

it('退会確認を開いた後に会員が変わったら、以前の確認で別の会員を退会させない',async()=>{
 mock.session={user:{id:A}};const {scope}=await setup();
 document.getElementById('account-delete-open')!.click();
 const input=document.getElementById('account-delete-confirm') as HTMLInputElement;input.value='退会';input.dispatchEvent(new Event('input'));
 mock.callback?.('SIGNED_IN',{user:{id:B}});await flush();
 document.getElementById('account-delete-form')!.dispatchEvent(new Event('submit',{cancelable:true}));await flush();
 expect(scope.recordOwner()).toBe(B);expect(mock.rpc.mock.calls.some(call=>call[0]==='delete_player_account')).toBe(false);
 expect((document.getElementById('account-delete-dialog') as HTMLDialogElement).open).toBe(false);
});

it('旧サイトを引き継いでから初めて登録した場合は、旧ランキングの1回の枠を確定する',async()=>{
 const legacy='cccccccc-cccc-4ccc-8ccc-cccccccccccc';mock.session={user:{id:A}};
 sessionStorage.setItem('zombie-typing:registration-pending',JSON.stringify({at:Date.now(),records:{[key]:rec},rankingKey:legacy,transferChoice:'completed'}));
 const original=mock.rpc.getMockImplementation()!;
 mock.rpc.mockImplementation((name:string,args:any)=>name==='sync_player_records' && args.p_initial ? {abortSignal:()=>Promise.resolve({data:{entries:args.p_initial,imported:true},error:null})} : original(name,args));
 await setup();expect(mock.rpc).toHaveBeenCalledWith('claim_ranking_identity',expect.objectContaining({p_expected_user:A,p_legacy_key:legacy}));
});

it('プロフィールには名前欄を一つだけ置き、個人情報・ログアウト・退会・Q&Aは詳細に集める',async()=>{
 mock.session={user:{id:A,email:'private@example.com'}};await setup();
 const profile=document.getElementById('account-dialog')!;
 expect(profile.querySelectorAll('#account-name')).toHaveLength(1);
 for(const id of ['account-identity','account-logout','account-delete-open','account-help-open'])expect(profile.querySelector(`#${id}`)).toBeNull();
 expect(profile.textContent).not.toContain('private@example.com');
 document.getElementById('account-details-open')!.click();expect(document.getElementById('account-identity')!.textContent).toContain('private@example.com');
 mock.callback?.('SIGNED_IN',{user:{id:B,email:'other@example.com'}});await flush();
 expect((document.getElementById('account-details-dialog') as HTMLDialogElement).open).toBe(false);
 expect(document.getElementById('account-identity')!.textContent).toBe('');
});
