/** 同意するまでタグ自体を読み込まず、ゲームの集計値だけを送る。 */
export type AnalyticsEvent = 'game_start' | 'game_end' | 'game_retry' | 'share';
export interface PlayMetrics {
  mode: string;
  difficulty: string;
  outcome?: 'clear' | 'gameover' | 'quit';
  score?: number;
  duration_sec?: number;
  wpm?: number;
  accuracy?: number;
}
type Consent = 'granted' | 'denied';
const CONSENT_KEY = 'zombie-typing:analytics-consent:v1';

export class Analytics {
  private consent: Consent | null = null;
  constructor(
    private readonly storage: Pick<Storage, 'getItem' | 'setItem'>,
    private readonly send: (event: AnalyticsEvent, metrics: PlayMetrics) => void,
  ) {
    try {
      const saved = storage.getItem(CONSENT_KEY);
      if (saved === 'granted' || saved === 'denied') this.consent = saved;
    } catch { /* 保存できない環境でもゲームは動かす */ }
  }
  get choice(): Consent | null { return this.consent; }
  choose(consent: Consent): void {
    this.consent = consent;
    try { this.storage.setItem(CONSENT_KEY, consent); } catch { /* セッション中のみ保持 */ }
  }
  track(event: AnalyticsEvent, metrics: PlayMetrics): void {
    if (this.consent !== 'granted') return;
    // 呼び出し側が余分な値を渡しても名前・端末キー・打鍵ログは送信しない。
    const safe: PlayMetrics = { mode: metrics.mode, difficulty: metrics.difficulty };
    if (metrics.outcome) safe.outcome = metrics.outcome;
    for (const key of ['score', 'duration_sec', 'wpm', 'accuracy'] as const) {
      const value = metrics[key];
      if (typeof value === 'number' && Number.isFinite(value)) safe[key] = value;
    }
    this.send(event, safe);
  }
}

type Gtag = (...args: unknown[]) => void;
const gaWindow = globalThis as unknown as Window & { dataLayer?: unknown[]; gtag?: Gtag };
const id = import.meta.env.VITE_GA_MEASUREMENT_ID ?? '';
const configured = import.meta.env.PROD && /^G-[A-Z0-9]+$/.test(id);
let started = false;
// localStorage プロパティ自体へのアクセスが禁止されている場合にも対応。
const storage = {
  getItem: (key: string) => localStorage.getItem(key),
  setItem: (key: string, value: string) => localStorage.setItem(key, value),
};
export const analytics = new Analytics(storage, (event, metrics) => {
  if (configured && started) gaWindow.gtag?.('event', event, metrics);
});

function cleanUrl(raw: string): string {
  try { const url = new URL(raw); return `${url.origin}${url.pathname}`; } catch { return ''; }
}

function start(): void {
  if (!configured || started || analytics.choice !== 'granted') return;
  started = true;
  gaWindow.dataLayer ??= [];
  gaWindow.gtag = function () { gaWindow.dataLayer!.push(arguments); };
  gaWindow.gtag('consent', 'default', {
    analytics_storage: 'granted', ad_storage: 'denied',
    ad_user_data: 'denied', ad_personalization: 'denied',
  });
  gaWindow.gtag('js', new Date());
  gaWindow.gtag('config', id, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    page_location: cleanUrl(location.href),
    page_referrer: cleanUrl(document.referrer),
    cookie_domain: 'none',
    cookie_path: location.pathname.replace(/[^/]*$/, '') || '/',
  });
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
  document.head.appendChild(script);
}

export function initAnalytics(): void {
  const dialog = document.getElementById('analytics-dialog') as HTMLDialogElement;
  const status = document.getElementById('analytics-status')!;
  const notice = document.getElementById('analytics-notice')!;
  const close = document.getElementById('analytics-close')!;
  function openSettings(): void { dialog.showModal(); close.focus(); }
  function refreshNotice(): void { notice.hidden = !configured || analytics.choice !== null; }
  status.textContent = configured
    ? 'ゲーム改善のため、Google Analyticsでプレイ回数・難易度・成績を集計します。Cookieを使用します。名前や打鍵内容は送りません。許可は任意で、後から変更できます。'
    : '現在、アクセス解析は無効です。ゲームの名前や成績をGoogle Analyticsへ送信していません。';
  document.querySelectorAll<HTMLElement>('[data-analytics-settings]').forEach((button) => {
    button.onclick = openSettings;
  });
  document.getElementById('analytics-close')!.onclick = () => dialog.close();
  for (const choice of ['granted', 'denied'] as const) {
    document.querySelectorAll<HTMLButtonElement>(`[data-analytics-choice="${choice}"]`).forEach(button => {
      button.hidden = !configured;
      button.onclick = () => {
        const wasStarted = started;
        analytics.choose(choice);
        refreshNotice();
        dialog.close();
        if (choice === 'granted') start();
        else if (wasStarted) {
          Object.assign(window, { [`ga-disable-${id}`]: true });
          for (const name of ['_ga', `_ga_${id.slice(2)}`]) {
            for (const path of new Set(['/', location.pathname.replace(/[^/]*$/, '') || '/'])) {
              document.cookie = `${name}=; Max-Age=0; Path=${path}; SameSite=Lax`;
            }
          }
          location.reload();
        }
      };
    });
  }
  // ダイアログの Enter / Escape をゲーム操作に流さない。
  dialog.addEventListener('keydown', (event) => event.stopPropagation());
  refreshNotice();
  if (location.hash === '#analytics') openSettings();
  window.addEventListener('hashchange', () => {
    if (location.hash === '#analytics' && !dialog.open) openSettings();
  });
  start();
}
