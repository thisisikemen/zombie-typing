import { IMPORT_DONE } from './site-move';
import { rankingBackend, loadPlayerName, savePlayerName, sanitizeName } from './ranking';
import { cacheTransferChoice, refreshTransferPrompts, transferChoice, TRANSFER_CHANGE, type TransferChoice } from './transfer-state';
import { renderProfile, type PersonalRank } from './profile';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { ONLINE_CONFIG } from './ranking';
import { accountUpdates, cacheAccountRecords, NAME_KEY, pendingNameKey, readAccountRecords, validateAccountRecords, type AccountRecords } from './account-records';
import { mergeBackup, restoreBackup, type RecordBackup } from './backup';
import { RECORD_CHANGE, recordOwner, setRecordOwner, scopedKey } from './record-scope';

const ENABLED = import.meta.env.VITE_ACCOUNTS_ENABLED === 'true';
const PENDING = 'zombie-typing:registration-pending';
interface Registration { at: number; records: AccountRecords; rankingKey?: string; transferChoice?: TransferChoice }
export interface AccountController { idle(): void; importRecords(backup: RecordBackup, oldSite?: boolean): Promise<void> }
/** 任意機能。認証・同期の通信をゲームの開始待ちに使わない。 */
export function initAccounts(canSwitch: () => boolean, refreshed: () => void): AccountController {
  const dialog = document.getElementById('account-dialog') as HTMLDialogElement;
  const status = document.getElementById('account-status')!;
  const guest = document.getElementById('account-guest')!;
  const member = document.getElementById('account-member')!;
  const details = document.getElementById('account-details-dialog') as HTMLDialogElement;
  const message = document.getElementById('account-message')!;
  let page: 'home' | 'register' | 'email' = 'home';
  let emailRegister = false;
  let personalRanks: PersonalRank[] | null = null;
  let rankError = false;
  let profileOwner: string | null = null;
  let overviewRequest = 0;
  let deleteOwner: string | null = null;
  let deleteVersion = 0;
  const create = document.getElementById('account-create') as HTMLButtonElement;
  const login = document.getElementById('account-login') as HTMLButtonElement;
  const logout = document.getElementById('account-logout') as HTMLButtonElement;
  const syncButton = document.getElementById('account-sync') as HTMLButtonElement;
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
  if (!ENABLED) return { idle() {}, async importRecords(backup) { restoreBackup(localStorage, mergeBackup(localStorage, backup)); } };
  const testing = import.meta.env.VITE_ACCOUNTS_TEST_MODE === 'true';
  document.getElementById('account-test-notice')?.toggleAttribute('hidden', !testing);
  buttons.forEach(b => {
    b.hidden = false;
    b.onclick = () => { showPage('home'); render(); dialog.showModal(); if (recordOwner()) void loadOverview(); };
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
  let initializationFailed = false;
  let finishInitialization!: () => void;
  const initialized = new Promise<void>(resolve => { finishInitialization = resolve; });
  let lastStatus = 'ログインを確認しています。待たずに遊べます。';
  try {
    const raw = sessionStorage.getItem(PENDING);
    if (raw) {
      const parsed = JSON.parse(raw) as Registration;
      if (typeof parsed.at === 'number' && Date.now() - parsed.at < 30 * 60_000 && parsed.at <= Date.now()) {
        registration = { at: parsed.at, records: validateAccountRecords(parsed.records), rankingKey: validRankingKey(parsed.rankingKey), transferChoice: parsed.transferChoice };
      } else sessionStorage.removeItem(PENDING);
    }
  } catch { lastStatus = '記録を準備できませんでした。もう一度「Googleで登録」を押してください。'; }
  function validRankingKey(value: unknown): string | undefined {
    return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : undefined;
  }
  async function rankingIdentity(id: string, legacy?: string, existing?: string): Promise<void> {
    const { data, error } = await client!.rpc('claim_ranking_identity', { p_expected_user: id, p_legacy_key: legacy ?? null, p_existing_key: existing ?? validRankingKey(localStorage.getItem(scopedKey('zombie-typing:device-key', id))) ?? null }).abortSignal(AbortSignal.timeout(12000));
    if (error || !validRankingKey(data)) throw new Error('ランキングを引き継げませんでした。すでに別のアカウントに移した記録は使えません。');
    localStorage.setItem(scopedKey('zombie-typing:device-key', id), data);
  }
  async function importRecords(backup: RecordBackup, oldSite?: boolean): Promise<void> {
    // 旧サイトから新タブを開いた直後も、ログイン復元を待って正しい保存先へ渡す。
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('ログインを確認できませんでした。もう一度押してください。')), 15_000);
      void initialized.then(() => { clearTimeout(timeout); resolve(); });
    });
    if (!ready || initializationFailed || (desired && desired !== recordOwner())) throw new Error('ログインを確認できませんでした。もう一度押してください。');
    if (transitioning || syncing || !canSwitch()) throw new Error('メニューに戻って、もう一度押してください。');
    const id = recordOwner();
    if (!id) { restoreBackup(localStorage, mergeBackup(localStorage, backup)); if (oldSite) cacheTransferChoice('completed', null); return; }
    const version = authVersion;
    transitioning = true; render();
    try {
      // 旧端末の秘密キーを所持する本人だけが、1つの会員へ関連付けできる。
      await rankingIdentity(id, validRankingKey(backup.entries['zombie-typing:device-key']));
      if (version !== authVersion || id !== recordOwner()) throw new Error('ログインが変わりました。もう一度引き継いでください。');
      const entries = Object.fromEntries(Object.entries(backup.entries).filter(([key]) => key !== 'zombie-typing:device-key' && key !== 'zombie-typing:settings'));
      const result = await rpc(id, null, validateAccountRecords(entries));
      if (version !== authVersion || id !== recordOwner()) throw new Error('ログインが変わりました。もう一度引き継いでください。');
      // 明示的に引き継いだ名前を優先し、スコアはサーバー側で大きい方を残す。
      localStorage.removeItem(pendingNameKey(id));
      cacheAccountRecords(localStorage, id, result.entries);
      const settings = backup.entries['zombie-typing:settings'];
      if (settings) localStorage.setItem('zombie-typing:settings', settings);
      if (oldSite) await saveTransferChoice('completed', id);
      lastStatus = '前の記録を引き継ぎました。'; refreshed(); void loadOverview();
    } finally { transitioning = false; render(); }
  }
  function showPage(next: typeof page): void {
    page = next;
    for (const name of ['home', 'register', 'email'] as const) document.getElementById(`account-${name}`)!.hidden = page !== name;
    document.getElementById('account-back-row')!.hidden = page === 'home';
    if (dialog.open) {
      if (page === 'email') document.getElementById('account-email-address')!.focus();
      else if (page === 'register') document.getElementById('account-confirm-create')!.focus();
      else create.focus();
    }
  }
  function render(): void {
    const owner = recordOwner();
    const ownerChanged = profileOwner !== owner;
    if (ownerChanged) {
      profileOwner = owner; personalRanks = null; rankError = false;
      document.getElementById('account-name-status')!.textContent = '';
    }
    if (deleteOwner && (deleteOwner !== owner || deleteVersion !== authVersion)) {
      (document.getElementById('account-delete-dialog') as HTMLDialogElement).close();
      deleteOwner = null;
    }
    message.textContent = transferChoice(null) === 'completed'
      ? '引き継いだ名前・自己ベストをアカウントに保存します。'
      : '今の名前・自己ベストをアカウントに保存します。';
    guest.hidden = Boolean(owner);
    member.hidden = !owner;
    dialog.classList.toggle('member-view', Boolean(owner));
    document.getElementById('account-guest-help-open')!.hidden = Boolean(owner);
    document.getElementById('account-details-open')!.hidden = !owner;
    if (ownerChanged) { details.close(); (details.querySelector('details') as HTMLDetailsElement).open = false; }
    document.getElementById('account-heading')!.textContent = owner ? 'アカウント' : page === 'home' ? 'ログイン・登録' : page === 'register' ? '新しく登録' : emailRegister ? 'メールで登録' : 'メールでログイン';
    status.textContent = lastStatus;
    document.getElementById('account-details-status')!.textContent = details.open ? lastStatus : '';
    document.getElementById('account-identity')!.textContent = owner && details.open
      ? (session?.user.id === owner && session.user.email ? `ログイン中：${session.user.email}` : 'ログイン中です。') : '';
    const name = document.getElementById('account-name') as HTMLInputElement;
    if (ownerChanged || document.activeElement !== name) name.value = loadPlayerName();
    for (const id of ['account-create', 'account-login', 'account-confirm-create', 'account-email-register', 'account-email-login']) {
      (document.getElementById(id) as HTMLButtonElement).disabled = !ready || transitioning;
    }
    logout.disabled = transitioning || syncing;
    (document.getElementById('account-retry') as HTMLButtonElement).hidden = !desired || Boolean(owner);
    (document.getElementById('account-retry') as HTMLButtonElement).disabled = transitioning || syncing;
    syncButton.hidden = !desired;
    syncButton.disabled = syncing || transitioning;
    syncButton.setAttribute('aria-busy', String(syncing || transitioning));
    (document.getElementById('account-details-open') as HTMLButtonElement).disabled = transitioning;
    (document.getElementById('account-delete-open') as HTMLButtonElement).disabled = transitioning || syncing;
    (document.getElementById('account-name-save') as HTMLButtonElement).disabled = transitioning;
    buttons.forEach(b => { b.textContent = owner ? 'アカウント' : 'ログイン・登録'; });
    refreshTransferPrompts();
    if (owner) renderProfile(personalRanks, rankError);
  }
  async function saveTransferChoice(choice: 'completed' | 'dismissed', id = recordOwner()): Promise<void> {
    overviewRequest++;
    if (id) {
      const { error } = await client!.rpc('set_player_transfer_choice', { p_expected_user: id, p_choice: choice }).abortSignal(AbortSignal.timeout(12000));
      if (error) throw error;
    }
    cacheTransferChoice(choice, id);
  }
  async function loadOverview(): Promise<void> {
    const id = recordOwner(); const version = authVersion; const request = ++overviewRequest;
    if (!id || !client) return;
    try {
      const { data, error } = await client.rpc('player_account_overview', { p_expected_user: id }).abortSignal(AbortSignal.timeout(12000));
      if (id !== recordOwner() || version !== authVersion || request !== overviewRequest) return;
      if (error || !data || !Array.isArray(data.rankings)) throw error ?? new Error('invalid profile');
      personalRanks = data.rankings.filter((r: PersonalRank) => typeof r.difficulty === 'string' && Number.isSafeInteger(r.rank) && r.rank > 0);
      rankError = false;
      if (['pending', 'completed', 'dismissed'].includes(data.transfer_choice)) cacheTransferChoice(data.transfer_choice, id);
    } catch {
      if (id !== recordOwner() || version !== authVersion || request !== overviewRequest) return;
      rankError = true;
    }
    render();
  }
  document.getElementById('account-back')!.onclick = () => { showPage('home'); render(); };
  const help = document.getElementById('account-help-dialog') as HTMLDialogElement;
  for (const id of ['account-help-open', 'account-guest-help-open']) document.getElementById(id)!.onclick = () => help.showModal();
  document.getElementById('account-details-open')!.onclick = () => { if (!recordOwner()) return; details.showModal(); render(); };
  details.addEventListener('close', () => {
    document.getElementById('account-identity')!.textContent = '';
    document.getElementById('account-details-status')!.textContent = '';
  });
  dialog.addEventListener('close', () => details.close());
  for (const el of document.querySelectorAll<HTMLButtonElement>('[data-dismiss-transfer]')) el.onclick = async () => {
    el.disabled = true;
    try { await saveTransferChoice('dismissed'); (document.getElementById('records-dialog') as HTMLDialogElement).close(); }
    catch { lastStatus = '設定を保存できませんでした。ネットにつないで、もう一度お試しください。'; }
    finally { el.disabled = false; render(); }
  };
  document.getElementById('account-name-form')!.onsubmit = async event => {
    event.preventDefault();
    if (!recordOwner() || transitioning) return;
    const id = recordOwner();
    const name = sanitizeName((document.getElementById('account-name') as HTMLInputElement).value);
    savePlayerName(name); refreshed(); render();
    const feedback = document.getElementById('account-name-status')!;
    feedback.textContent = '名前を保存中…';
    try { await rankingBackend.rename(name); if (recordOwner() === id) feedback.textContent = '名前を変更しました。'; }
    catch { if (recordOwner() === id) feedback.textContent = '名前は保存しました。ランキングへの反映は、もう一度「変更」を押してください。'; }
  };
  window.addEventListener(IMPORT_DONE, render);
  window.addEventListener(TRANSFER_CHANGE, refreshTransferPrompts);
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
      lastStatus = `記録を保存しました（${new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}）`;
      refreshed(); void loadOverview();
    } catch {
      if (version === authVersion) lastStatus = '保存できませんでした。記録はこのブラウザに残っています。更新ボタン（↻）を押して、もう一度お試しください。';
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
          lastStatus = '初めての方は、使う記録を確認して登録してください。';
          return;
        }
        // 登録前に新サイトで遊んだキーは通常の初期値。旧サイト移行の1回枠を使わない。
        const migratedGuest = result.imported && registration?.transferChoice === 'completed';
        await rankingIdentity(id, migratedGuest ? registration?.rankingKey : undefined, migratedGuest ? undefined : registration?.rankingKey);
        if (version !== authVersion || !canSwitch()) return;
        cacheAccountRecords(localStorage, id, result.entries);
        setRecordOwner(id);
        if (result.imported && registration?.transferChoice && registration.transferChoice !== 'pending') {
          try { await saveTransferChoice(registration.transferChoice, id); } catch { /* Registration already succeeded; leave the recovery route available. */ }
        }
        showPage('home');
        registration = null; sessionStorage.removeItem(PENDING);
        lastStatus = result.imported
          ? 'このブラウザの記録を引き継ぎました。'
          : 'アカウントの記録で遊べます。';
      } else {
        setRecordOwner(null);
        lastStatus = 'ログアウトしました。登録せずに遊べます。';
      }
      refreshed(); void loadOverview();
    } catch {
      if (version === authVersion) lastStatus = '記録を読み込めませんでした。今ある記録は消えていません。「記録を読み直す」を押してください。';
    } finally { transitioning = false; render(); if (version !== authVersion) void activate().then(sync); }
  }
  async function signIn(register: boolean): Promise<void> {
    if (!client || !ready || recordOwner()) return;
    try {
      if (register) {
        registration = { at: Date.now(), records: readAccountRecords(localStorage, null), rankingKey: validRankingKey(localStorage.getItem('zombie-typing:device-key')), transferChoice: transferChoice(null) };
        sessionStorage.setItem(PENDING, JSON.stringify(registration));
      } else { registration = null; sessionStorage.removeItem(PENDING); }
      if (register && desired) { await activate(); await sync(); return; }
      const redirect = new URL(import.meta.env.BASE_URL, location.origin);
      redirect.searchParams.set('account', 'return');
      const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirect.href, queryParams: { prompt: 'select_account' } } });
      if (error) throw error;
    } catch { lastStatus = 'ログイン画面を開けませんでした。少し待って、もう一度お試しください。'; render(); }
  }
  create.onclick = () => { showPage('register'); render(); };
  document.getElementById('account-confirm-create')!.onclick = () => void signIn(true);
  login.onclick = () => void signIn(false);
  // 実配信が有効な環境だけ、メールの入口を表示する。
  if (import.meta.env.VITE_EMAIL_AUTH_ENABLED === 'true') {
    const emailForm = document.getElementById('account-email-form') as HTMLFormElement;
    const codeForm = document.getElementById('account-code-form') as HTMLFormElement;
    const address = document.getElementById('account-email-address') as HTMLInputElement;
    const token = document.getElementById('account-email-code') as HTMLInputElement;
    const feedback = document.getElementById('account-email-status')!;
    let emailBusy = false; let sentTo = ''; let nextSend = 0;
    let activeEmailRegister = false;
    const emailButtons = ['account-email-send', 'account-email-verify', 'account-email-resend', 'account-back'];
    const setEmailBusy = (busy: boolean) => {
      emailBusy = busy;
      for (const id of emailButtons) (document.getElementById(id) as HTMLButtonElement).disabled = busy;
    };
    function openEmail(register: boolean): void {
      emailRegister = register; sentTo = ''; token.value = ''; feedback.textContent = '';
      codeForm.hidden = true; emailForm.hidden = false;
      document.getElementById('account-email-description')!.textContent = register
        ? '今の名前・自己ベストを保存します。メールに届く番号で登録できます。'
        : '登録したメールアドレスへ、ログイン用の番号を送ります。';
      (document.getElementById('account-email-send') as HTMLButtonElement).textContent = register ? '確認番号を送って登録' : 'ログイン用の番号を送る';
      showPage('email'); render();
    }
    document.querySelectorAll<HTMLElement>('[data-email-entry]').forEach(el => { el.hidden = false; });
    document.getElementById('account-email-register')!.onclick = () => openEmail(true);
    document.getElementById('account-email-login')!.onclick = () => openEmail(false);
    async function sendEmail(): Promise<void> {
      if (!client || !ready || recordOwner() || emailBusy || page !== 'email' || !address.reportValidity()) return;
      if (Date.now() < nextSend) { feedback.textContent = '送り直すときは1分待ってください。'; return; }
      const register = emailRegister;
      setEmailBusy(true);
      try {
        if (register) {
          registration = { at: Date.now(), records: readAccountRecords(localStorage, null), rankingKey: validRankingKey(localStorage.getItem('zombie-typing:device-key')), transferChoice: transferChoice(null) };
          sessionStorage.setItem(PENDING, JSON.stringify(registration));
        } else { registration = null; sessionStorage.removeItem(PENDING); }
        const email = address.value.trim();
        const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: register } });
        if (error) throw error;
        sentTo = email; activeEmailRegister = register; nextSend = Date.now() + 60_000;
        emailForm.hidden = true; codeForm.hidden = false;
        feedback.textContent = `${email} に送った番号を入力してください。`;
        token.focus();
      } catch { feedback.textContent = '送れませんでした。アドレスを確認して、少し待ってからお試しください。'; }
      finally { setEmailBusy(false); }
    }
    emailForm.onsubmit = event => { event.preventDefault(); void sendEmail(); };
    document.getElementById('account-email-resend')!.onclick = () => void sendEmail();
    codeForm.onsubmit = async event => {
      event.preventDefault();
      if (!client || !sentTo || emailBusy || !codeForm.reportValidity()) return;
      setEmailBusy(true);
      try {
        const { error } = await client.auth.verifyOtp({ email: sentTo, token: token.value.trim(), type: 'email' });
        if (error) throw error;
        token.value = ''; await activate(); await sync();
        feedback.textContent = desired && recordOwner() === desired ? 'ログインしました。' : '本人確認はできました。記録はまだ読み込めていません。';
        if (recordOwner()) { showPage('home'); render(); }
        else if (!activeEmailRegister && desired) { showPage('register'); render(); }
      } catch { feedback.textContent = '番号を確認してください。期限が切れたときは、もう一度メールを送ってください。'; }
      finally { setEmailBusy(false); }
    };
  }
  syncButton.onclick = () => { void activate().then(sync); };
  document.getElementById('account-retry')!.onclick = syncButton.onclick;
  logout.onclick = async () => {
    if (!client || transitioning || syncing) return;
    transitioning = true; render();
    try {
      // このブラウザからログアウト。他の端末のセッションは維持する。
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw error;
      session = null;
      if (desired !== null) { desired = null; authVersion++; }
      registration = null; sessionStorage.removeItem(PENDING); details.close();
    } catch { lastStatus = 'ログアウトできませんでした。ネットにつないで、もう一度お試しください。'; }
    finally { transitioning = false; void activate(); render(); }
  };
  const deleteDialog = document.getElementById('account-delete-dialog') as HTMLDialogElement;
  const deleteConfirm = document.getElementById('account-delete-confirm') as HTMLInputElement;
  const deleteSubmit = document.getElementById('account-delete-submit') as HTMLButtonElement;
  const deleteStatus = document.getElementById('account-delete-status')!;
  document.getElementById('account-delete-open')!.onclick = () => {
    deleteOwner = recordOwner(); deleteVersion = authVersion;
    deleteConfirm.value = ''; deleteSubmit.disabled = true; deleteStatus.textContent = ''; deleteDialog.showModal(); deleteConfirm.focus();
  };
  deleteConfirm.oninput = () => { deleteSubmit.disabled = deleteConfirm.value !== '退会'; };
  document.getElementById('account-delete-form')!.onsubmit = async event => {
    event.preventDefault(); const id = recordOwner();
    if (!client || !id || deleteOwner !== id || deleteVersion !== authVersion || desired !== id || transitioning || syncing || deleteConfirm.value !== '退会') return;
    const version = authVersion;
    transitioning = true; deleteSubmit.disabled = true; deleteStatus.textContent = 'アカウントを削除しています…'; render();
    try {
      const { error } = await client.rpc('delete_player_account', { p_expected_user: id, p_confirmation: '退会' }).abortSignal(AbortSignal.timeout(12000));
      if (error) throw error;
      if (version !== authVersion || recordOwner() !== id) return;
      const deletedRankingKey = localStorage.getItem(scopedKey('zombie-typing:device-key', id));
      clearTimeout(timer); authVersion++; desired = null; session = null; registration = null;
      sessionStorage.removeItem(PENDING);
      for (const key of Object.keys(localStorage)) if (key.startsWith(`zombie-typing:account:${id}:`) || key === `zombie-typing:transfer-choice:${id}`) localStorage.removeItem(key);
      if (deletedRankingKey && localStorage.getItem('zombie-typing:device-key') === deletedRankingKey) localStorage.removeItem('zombie-typing:device-key');
      setRecordOwner(null);
      await client.auth.signOut({ scope: 'local' }).catch(() => {});
      // 削除成功後の通信断でも、削除済みセッションを次の起動で復元しない。
      const authKey = `sb-${new URL(ONLINE_CONFIG.supabaseUrl).hostname.split('.')[0]}-auth-token`;
      for (const key of Object.keys(localStorage)) if (key === authKey || key.startsWith(`${authKey}-`)) localStorage.removeItem(key);
      lastStatus = '退会しました。アカウントと関連する記録を削除しました。';
      deleteDialog.close(); showPage('home'); refreshed();
    } catch { deleteStatus.textContent = '削除を確認できませんでした。ネットにつないで、もう一度お試しください。'; }
    finally { transitioning = false; deleteSubmit.disabled = deleteConfirm.value !== '退会'; render(); }
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
    else if (!desired) lastStatus = '';
    render(); await activate(); await sync();
    finishInitialization();
    if (callback && canSwitch()) { render(); dialog.showModal(); }
  }).catch(() => {
    ready = Boolean(client);
    initializationFailed = true;
    finishInitialization();
    lastStatus = 'ログインを確認できませんでした。そのまま遊べます。ネットにつないで、ページを開き直してください。';
    render();
  });
  render();
  return { idle() { void activate().then(sync); }, importRecords };
}
