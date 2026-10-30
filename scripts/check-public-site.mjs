import assert from 'node:assert/strict';
import { siteUrl } from './site-config.mjs';

const url = siteUrl(process.env.SITE_URL);
assert.equal(url, 'https://zombietyping.jp/', 'Check the intended production URL');
async function read(path) {
  const response = await fetch(new URL(path, url), {
    headers: { 'User-Agent': 'ZombieTyping-Deploy-Check' },
    signal: AbortSignal.timeout(20_000),
  });
  assert.equal(response.status, 200, `${path || '/'} must be available`);
  assert(!response.headers.get('X-Robots-Tag')?.includes('noindex'), 'Production must be indexable');
  return response.text();
}
const html = await read('');
assert(html.includes(`rel="canonical" href="${url}"`), 'Canonical must point to production');
assert(!html.includes('name="robots" content="noindex"'), 'Production HTML must be indexable');
assert(!html.includes('adsbygoogle.js'), 'This release does not enable ad delivery');
assert((await read('robots.txt')).includes(`${url}sitemap.xml`), 'robots.txt must reference the current sitemap');
assert((await read('sitemap.xml')).includes(`<loc>${url}</loc>`), 'Sitemap must include the homepage');
const publisher = process.env.ADSENSE_PUBLISHER_ID;
if (publisher) {
  assert(html.includes(`name="google-adsense-account" content="${publisher}"`), 'Ownership tag must remain published');
  assert((await read('ads.txt')).includes(`google.com, ${publisher.slice(3)}, DIRECT`), 'ads.txt must authorize the existing account');
}
console.log('PASS production HTTPS, canonical, robots, sitemap and ad ownership preparation');
