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
  buttons.forEach(b => {
    b.hidden = false;
    b.onclick = () => { render(); dialog.showModal(); };
    // Enterでボタンを押すとき、ゲーム開始のキー操作へ流さない。
    b.addEventListener('keydown', e => e.stopPropagation());
  });
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
  let lastStatus = 'ログインを確認しています。待たずに遊べます。';
  try {
    const raw = sessionStorage.getItem(PENDING);
    if (raw) {
      const parsed = JSON.parse(raw) as Registration;
      if (typeof parsed.at === 'number' && Date.now() - parsed.at < 30 * 60_000 && parsed.at <= Date.now()) {
        registration = { at: parsed.at, records: validateAccountRecords(parsed.records) };
      } else sessionStorage.removeItem(PENDING);
    }
  } catch { lastStatus = '記録を準備できませんでした。もう一度「Googleで登録」を押してください。'; }
  function render(): void {
    const owner = recordOwner();
    guest.hidden = Boolean(owner);
    document.getElementById('account-heading')!.textContent = owner ? 'アカウント' : 'ログイン';
    member.hidden = !owner;
    status.textContent = lastStatus;
    // メールアドレスはゲーム画面・ランキング・解析に表示しない。
    document.getElementById('account-identity')!.textContent = owner ? '記録はアカウントに保存されます。' : '';
    create.disabled = !ready || transitioning || !consent.checked;
    login.disabled = !ready || transitioning;
    logout.disabled = transitioning;
    syncButton.hidden = !desired;
    syncButton.disabled = syncing || transitioning;
    buttons.forEach(b => { b.textContent = owner ? 'アカウント' : 'ログイン・登録'; });
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
    syncing = true; lastStatus = '記録を保存しています…'; render();
    try {
      const updates = accountUpdates(localStorage, id);
      const sentName = updates[NAME_KEY];
      const result = await rpc(id, null, updates);
      if (result.needsRegistration) throw new Error('registration required');
      if (version !== authVersion || id !== recordOwner()) return;
      if (sentName !== undefined && localStorage.getItem(pendingNameKey(id)) === sentName) localStorage.removeItem(pendingNameKey(id));
      cacheAccountRecords(localStorage, id, result.entries);
      lastStatus = `保存しました（${new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}）`;
      refreshed();
    } catch {
      if (version === authVersion) lastStatus = '保存できませんでした。記録はこのブラウザに残っています。「記録を読み直す」を押して、もう一度お試しください。';
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
          lastStatus = '初めての方は、下の説明を読んで「Googleで登録」を押してください。';
          return;
        }
        cacheAccountRecords(localStorage, id, result.entries);
        setRecordOwner(id);
        registration = null; sessionStorage.removeItem(PENDING);
        lastStatus = result.imported
          ? 'このブラウザの記録を引き継ぎました。'
          : 'アカウントの記録で遊べます。';
      } else {
        setRecordOwner(null);
        lastStatus = 'ログアウトしました。登録前の記録で遊べます。';
      }
      document.getElementById('account-transfer-result')!.textContent = lastStatus;
      refreshed();
    } catch {
      if (version === authVersion) lastStatus = '記録を読み込めませんでした。今ある記録は消えていません。「記録を読み直す」を押してください。';
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
    } catch { lastStatus = 'ログイン画面を開けませんでした。少し待って、もう一度お試しください。'; render(); }
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
    } catch { lastStatus = 'ログアウトできませんでした。ネットにつないで、もう一度お試しください。'; }
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
        if (!canSwitch() && nextId !== recordOwner()) { lastStatus = 'ログインが切り替わりました。メニューに戻ると、使う記録が変わります。'; render(); }
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
    if (authError) { lastStatus = 'ログインできませんでした。今ある記録はそのまま残っています。'; }
    else if (!desired) lastStatus = '登録しなくても、すぐに遊べます。';
    render(); await activate(); await sync();
    if (callback && canSwitch()) { render(); dialog.showModal(); }
  }).catch(() => {
    ready = Boolean(client);
    lastStatus = 'ログインを確認できませんでした。そのまま遊べます。ネットにつないで、ページを開き直してください。';
    render();
  });
  message.textContent = 'このブラウザの自己ベスト・VS自己ベスト・名前を引き継ぎます。ほかの端末の記録はまとめず、その端末に残ります。';
  render();
  return { idle() { void activate().then(sync); } };
}
