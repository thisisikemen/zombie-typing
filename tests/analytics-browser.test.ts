import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });

describe('解析タグの読み込み制御', () => {
  it('未同意ではタグを作らず、許可で一度だけ読み込み、撤回で停止する', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST123');
    vi.stubEnv('PROD', true);
    const elements = new Map<string, any>();
    const dialog = { showModal: vi.fn(), close: vi.fn(), addEventListener: vi.fn(), open: false };
    elements.set('analytics-dialog', dialog);
    const get = (key: string) => {
      if (!elements.has(key)) elements.set(key, { onclick: undefined, hidden: false, textContent: '' });
      return elements.get(key);
    };
    const append = vi.fn();
    const document = { getElementById: get, querySelectorAll: () => [],
      createElement: () => ({}), head: { appendChild: append },
      referrer: 'https://source.example/path?private=1', cookie: '' };
    const reload = vi.fn();
    vi.stubGlobal('document', document);
    vi.stubGlobal('location', { href: 'https://game.example/play/?private=2#secret', pathname: '/play/', hash: '', reload });
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
    vi.stubGlobal('window', { addEventListener: vi.fn() });
    vi.stubGlobal('dataLayer', undefined);
    vi.stubGlobal('gtag', undefined);
    const { initAnalytics, analytics } = await import('../src/analytics');
    initAnalytics();
    expect(dialog.showModal).toHaveBeenCalledOnce();
    expect(append).not.toHaveBeenCalled();
    get('analytics-denied').onclick();
    expect(append).not.toHaveBeenCalled();
    get('analytics-granted').onclick();
    get('analytics-granted').onclick();
    expect(append).toHaveBeenCalledOnce();
    const queue = (globalThis as any).dataLayer.map((args: IArguments) => Array.from(args));
    expect(queue[2][2]).toMatchObject({ page_location: 'https://game.example/play/', page_referrer: 'https://source.example/path', allow_google_signals: false });
    get('analytics-denied').onclick();
    expect(analytics.choice).toBe('denied');
    expect(reload).toHaveBeenCalledOnce();
  });
});
