import { describe, expect, it } from 'vitest';
// @ts-expect-error ビルドスクリプトをNodeとVitestの両方で利用する。
import { DEFAULT_SITE_URL, measurementId, publisherId, siteUrl } from '../scripts/site-config.mjs';

describe('公開URLの設定', () => {
  it('現行サブパスと独自ドメインの両方に対応する', () => {
    expect(siteUrl()).toBe(DEFAULT_SITE_URL);
    expect(siteUrl('https://zombie.example')).toBe('https://zombie.example/');
    expect(siteUrl('https://zombie.example/game')).toBe('https://zombie.example/game/');
  });
  it('認証情報やトラッキング文字列がメタデータに入らない', () => {
    for (const url of ['http://example.com', 'https://u:p@example.com', 'https://example.com/?token=x', 'https://example.com/#secret']) {
      expect(() => siteUrl(url)).toThrow();
    }
    expect(() => measurementId('invalid')).toThrow();
    expect(measurementId('')).toBe('');
    expect(measurementId('G-ABC123')).toBe('G-ABC123');
    expect(publisherId('')).toBe('');
    expect(publisherId('ca-pub-1234567890123456')).toBe('ca-pub-1234567890123456');
    expect(() => publisherId('ca-pub-123')).toThrow();
  });
});
