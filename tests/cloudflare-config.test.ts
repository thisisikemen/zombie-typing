import { describe, expect, it } from 'vitest';
// @ts-expect-error Nodeのビルド設定を検証する。
import { cloudflareSettings } from '../scripts/cloudflare-config.mjs';

describe('Cloudflareへの段階的な移行', () => {
  const configured = { SITE_URL: 'https://zombie.example/', VITE_GA_MEASUREMENT_ID: 'G-TEST123', ADSENSE_PUBLISHER_ID: 'ca-pub-1234567890123456' };
  it('ドメイン未設定の初回公開では既存URLを保ち、計測・広告・検索登録を停止する', () => {
    const result = cloudflareSettings({ VITE_GA_MEASUREMENT_ID: 'G-TEST123' });
    expect(result.preview).toBe(true);
    expect(result.env.VITE_GA_MEASUREMENT_ID).toBe('');
    expect(result.env.ADSENSE_PUBLISHER_ID).toBe('');
    expect(result.headers).toContain('X-Robots-Tag: noindex');
  });
  it('PRやローカル検証で本番の計測設定を引き継がない', () => {
    for (const result of [cloudflareSettings({ ...configured, CF_PAGES_BRANCH: 'fix-menu' }), cloudflareSettings(configured, true), cloudflareSettings({ ...configured, SITE_URL: 'https://test.pages.dev/' })]) {
      expect(result.preview).toBe(true);
      expect(result.env.VITE_GA_MEASUREMENT_ID).toBe('');
      expect(result.env.ADSENSE_PUBLISHER_ID).toBe('');
    }
  });
  it('mainの独自ドメインだけ本番設定を使い、pages.devの重複掲載を抑える', () => {
    const result = cloudflareSettings({ ...configured, CF_PAGES_BRANCH: 'main' });
    expect(result.preview).toBe(false);
    expect(result.env.VITE_GA_MEASUREMENT_ID).toBe(configured.VITE_GA_MEASUREMENT_ID);
    expect(result.env.SITE_URL).toBe('https://zombie.example/');
    expect(result.headers).toContain('https://:project.pages.dev/*');
    expect(() => cloudflareSettings({ SITE_URL: 'https://zombie.example/sub/' })).toThrow();
  });
});
