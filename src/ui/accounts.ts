import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { ONLINE_CONFIG } from './ranking';
import { accountUpdates, cacheAccountRecords, NAME_KEY, pendingNameKey, readAccountRecords, validateAccountRecords, type AccountRecords } from './account-records';
import { RECORD_CHANGE, recordOwner, setRecordOwner } from './record-scope';

const ENABLED = import.meta.env.VITE_ACCOUNTS_ENABLED === 'true';
const PENDING = 'zombie-typing:registration-pending';
interface Registration { at: number; records: AccountRecords }
export interface AccountController { idle(): void }
/** 任意機能。認証・同期の通信をゲームの開始待ちに使わない。 */
export function initAccounts(canSwitch: () => boolean, refreshed: () => void): AccountController {
  const dialog = document.getElementById('account-dialog') as HTMLDialogElement;
  const status = document.getElementById('account-status')!;
  const guest = document.getElementById('account-guest')!;
  const member = document.getElementById('account-member')!;
  const message = document.getElementById('account-message')!;
  const create = document.getElementById('account-create') as HTMLButtonElement;
  const login = document.getElementById('account-login') as HTMLButtonElement;
  const logout = document.getElementById('account-logout') as HTMLButtonElement;
  const syncButton = document.getElementById('account-sync') as HTMLButtonElement;
  const consent = document.getElementById('account-import-consent') as HTMLInputElement;
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-account-open]')];
  // URLから認証コードを先に除き、解析や共有へ残さない。SDKには明示的に渡す。
  const url = new URL(location.href);
  const callback = url.searchParams.get('account') === 'return';
  const code = callback ? url.searchParams.get('code') : null;
  const authError = callback && (url.searchParams.has('error') || url.hash.includes('error='));
  if (callback) {
    for (const key of ['account','code','error','error_code','error_description']) url.searchParams.delete(key);
    url.hash = '';
    history.replaceState(null, '', url);
  }
  if (!ENABLED) return { idle() {} };
  const testing = import.meta.env.VITE_ACCOUNTS_TEST_MODE === 'true';
  document.getElementById('account-test-notice')?.toggleAttribute('hidden', !testing);
  buttons.forEach(b => { b.hidden = false; b.onclick = () => { render(); dialog.showModal(); }; });
  document.getElementById('account-close')!.onclick = () => dialog.close();
  dialog.addEventListener('keydown', e => e.stopPropagation());
  let client: SupabaseClient | null = null;
  let session: Session | null = null;
  let desired: string | null = null;
  let ready = false;
  let transitioning = false;
  let syncing = false;
  let authVersion = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let registration: Registration | null = null;
  let lastStatus = 'ログイン状態を確認しています。登録せずにプレイできます。';
  try {
    const raw = sessionStorage.getItem(PENDING);
    if (raw) {
      const parsed = JSON.parse(raw) as Registration;
      if (typeof parsed.at === 'number' && Date.now() - parsed.at < 30 * 60_000 && parsed.at <= Date.now()) {
        registration = { at: parsed.at, records: validateAccountRecords(parsed.records) };
      } else sessionStorage.removeItem(PENDING);
    }
  } catch { lastStatus = '引き継ぎ準備を読み込めませんでした。もう一度「新規登録」から進んでください。'; }
  function render(): void {
    const owner = recordOwner();
    guest.hidden = Boolean(owner);
    member.hidden = !owner;
    status.textContent = lastStatus;
    // メールアドレスはゲーム画面・ランキング・解析に表示しない。
    document.getElementById('account-identity')!.textContent = owner ? 'ログイン中。このアカウントの個人記録を使っています。' : '';
    create.disabled = !ready || transitioning || !consent.checked;
    login.disabled = !ready || transitioning;
    logout.disabled = transitioning;
    syncButton.hidden = !desired;
    syncButton.disabled = syncing || transitioning;
    buttons.forEach(b => { b.textContent = owner ? 'アカウント・記録同期' : testing ? 'ログイン・新規登録（テスト中）' : 'ログイン・新規登録'; });
  }
  consent.onchange = render;
  async function rpc(id: string, initial: AccountRecords | null, updates: AccountRecords) {
    const { data, error } = await client!.rpc('sync_player_records', { p_expected_user: id, p_initial: initial, p_updates: updates }).abortSignal(AbortSignal.timeout(12000));
    if (error) throw error;
    if (!data || typeof data.imported !== 'boolean') throw new Error('invalid sync response');
    return { entries: validateAccountRecords(data.entries), imported: data.imported as boolean, needsRegistration: data.needs_registration === true };
  }
  async function sync(): Promise<void> {
    const id = recordOwner();
    if (!client || !id || id !== desired || transitioning || syncing || !canSwitch()) return;
    const version = authVersion;
    syncing = true; lastStatus = '記録を同期しています…'; render();
    try {
      const updates = accountUpdates(localStorage, id);
      const sentName = updates[NAME_KEY];
      const result = await rpc(id, null, updates);
      if (result.needsRegistration) throw new Error('registration required');
      if (version !== authVersion || id !== recordOwner()) return;
      if (sentName !== undefined && localStorage.getItem(pendingNameKey(id)) === sentName) localStorage.removeItem(pendingNameKey(id));
      cacheAccountRecords(localStorage, id, result.entries);
      lastStatus = `同期済み（${new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}）`;
      refreshed();
    } catch {
      if (version === authVersion) lastStatus = '同期できませんでした。記録はこのブラウザに保持しています。「再同期」で再試行できます。';
    } finally { syncing = false; render(); }
  }
  async function activate(): Promise<void> {
    if (!ready || transitioning || !canSwitch()) return;
    const id = desired;
    if (recordOwner() === id) { render(); return; }
    const version = authVersion;
    transitioning = true; render();
    try {
      if (id) {
        // 失敗時はゲストのまま。登録端末の記録も引き継ぎ指示も失わない。
        const result = await rpc(id, registration?.records ?? null, {});
        if (version !== authVersion || !canSwitch()) return;
        if (result.needsRegistration) {
          lastStatus = '初めてのご利用です。この端末の記録を引き継ぐ説明を確認し、「新規登録」から進んでください。';
          return;
        }
        cacheAccountRecords(localStorage, id, result.entries);
        setRecordOwner(id);
        registration = null; sessionStorage.removeItem(PENDING);
        lastStatus = result.imported
          ? 'この端末の記録をアカウントに引き継ぎました。他の端末の未登録データは自動統合されません。'
          : 'アカウントの記録を読み込みました。この端末の未登録データは別に残しています。';
      } else {
        setRecordOwner(null);
        lastStatus = 'ログアウトしました。このブラウザの未登録データでプレイできます。';
      }
      document.getElementById('account-transfer-result')!.textContent = lastStatus;
      refreshed();
    } catch {
      if (version === authVersion) lastStatus = 'アカウントの記録を読み込めませんでした。現在の保存先を維持しています。「再同期」または再読み込みで再試行してください。';
    } finally { transitioning = false; render(); if (version !== authVersion) void activate().then(sync); }
  }
  async function signIn(register: boolean): Promise<void> {
    if (!client || !ready || recordOwner()) return;
    try {
      if (register) {
        if (!consent.checked) return;
        registration = { at: Date.now(), records: readAccountRecords(localStorage, null) };
        sessionStorage.setItem(PENDING, JSON.stringify(registration));
      } else { registration = null; sessionStorage.removeItem(PENDING); }
      if (register && desired) { await activate(); await sync(); return; }
      const redirect = new URL(import.meta.env.BASE_URL, location.origin);
      redirect.searchParams.set('account', 'return');
      const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirect.href } });
      if (error) throw error;
    } catch { lastStatus = 'ログイン画面を開けませんでした。少し待ってから再試行してください。'; render(); }
  }
  create.onclick = () => void signIn(true);
  login.onclick = () => void signIn(false);
  syncButton.onclick = () => { void activate().then(sync); };
  logout.onclick = async () => {
    if (!client) return;
    transitioning = true; render();
    try {
      // このブラウザからログアウト。他の端末のセッションは維持する。
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw error;
      registration = null; sessionStorage.removeItem(PENDING);
    } catch { lastStatus = 'ログアウトできませんでした。接続を確認して再試行してください。'; }
    finally { transitioning = false; void activate(); render(); }
  };
  window.addEventListener(RECORD_CHANGE, event => {
    const detail = (event as CustomEvent<{owner: string | null; key: string; value: string}>).detail;
    if (!detail.owner || detail.owner !== recordOwner()) return;
    if (detail.key === NAME_KEY) {
      try { localStorage.setItem(pendingNameKey(detail.owner), detail.value); } catch { /* cache remains */ }
    }
    clearTimeout(timer); timer = setTimeout(() => void sync(), 600);
  });
  window.addEventListener('online', () => void sync());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void sync(); });
  // Auth通知内で非同期Auth APIを呼ばず、次のタスクで処理する。
  void import('@supabase/supabase-js').then(async ({ createClient }) => {
    client = createClient(ONLINE_CONFIG.supabaseUrl, ONLINE_CONFIG.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce' },
    });
    client.auth.onAuthStateChange((_event, next) => {
      session = next;
      const nextId = next?.user.id ?? null;
      if (nextId !== desired) { desired = nextId; authVersion++; }
      if (ready) {
        if (!canSwitch() && nextId !== recordOwner()) { lastStatus = 'ログイン状態が変わりました。メニューに戻ると記録の保存先を切り替えます。'; render(); }
        setTimeout(() => { void activate().then(sync); }, 0);
      }
    });
    if (code) {
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (error) throw error;
    }
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    session = data.session; desired = session?.user.id ?? null;
    ready = true;
    if (authError) { lastStatus = 'ログインが完了しませんでした。未登録の記録はそのまま残っています。'; }
    else if (!desired) lastStatus = '登録なしでも、今までどおりすぐにプレイできます。';
    render(); await activate(); await sync();
    if (callback && canSwitch()) { render(); dialog.showModal(); }
  }).catch(() => {
    ready = Boolean(client);
    lastStatus = 'ログイン状態を確認できませんでした。未登録のままプレイできます。接続後に再読み込みしてください。';
    render();
  });
  message.textContent = '新規登録時に、このサイトで今使っているブラウザの自己ベスト・VS自己ベスト・名前を保存します。他の端末やブラウザの未登録データは自動統合せず、それぞれに残ります。旧サイトからの記録移行は任意で、記録がなくても登録できます。';
  render();
  return { idle() { void activate().then(sync); } };
}
