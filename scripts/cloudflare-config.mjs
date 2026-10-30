import { DEFAULT_SITE_URL, siteUrl } from './site-config.mjs';

/** 独自ドメインの確定前とPR用ビルドは、公開計測や広告を有効にしない。 */
export function cloudflareSettings(env, forcePreview = false) {
  const url = siteUrl(env.SITE_URL || DEFAULT_SITE_URL);
  const branch = env.CF_PAGES_BRANCH || env.WORKERS_CI_BRANCH;
  const preview = forcePreview || url === DEFAULT_SITE_URL || /\.(pages|workers)\.dev$/.test(new URL(url).hostname) ||
    (Boolean(branch) && branch !== 'main');
  if (!preview && new URL(url).pathname !== '/') {
    throw new Error('Cloudflare production SITE_URL must be a domain-root URL');
  }
  return {
    preview,
    env: {
      ...env, SITE_URL: url,
      VITE_GA_MEASUREMENT_ID: preview ? '' : (env.VITE_GA_MEASUREMENT_ID || ''),
      ADSENSE_PUBLISHER_ID: preview ? '' : (env.ADSENSE_PUBLISHER_ID || ''),
    },
    headers: `/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n${preview
      ? '  X-Robots-Tag: noindex\n'
      : '\nhttps://:project.pages.dev/*\n  X-Robots-Tag: noindex\n\nhttps://:deployment.:project.pages.dev/*\n  X-Robots-Tag: noindex\n\nhttps://:worker.:account.workers.dev/*\n  X-Robots-Tag: noindex\n\nhttps://:preview.:worker.:account.workers.dev/*\n  X-Robots-Tag: noindex\n'}`,
  };
}
