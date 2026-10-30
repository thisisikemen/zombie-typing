import { readdir, readFile, writeFile } from 'node:fs/promises';
import { loadEnv } from 'vite';
import { DEFAULT_SITE_URL, measurementId, publisherId, siteUrl } from './site-config.mjs';

// Vite と同じ優先順位で .env / .env.production / CI の環境変数を解決する。
const env = loadEnv('production', process.cwd(), '');
const outputDir = process.argv[2] || 'dist';
const url = siteUrl(env.SITE_URL || DEFAULT_SITE_URL);
measurementId(env.VITE_GA_MEASUREMENT_ID);
const publisher = publisherId(env.ADSENSE_PUBLISHER_ID);
if (publisher && new URL(url).pathname !== '/') {
  throw new Error('AdSense preparation requires a domain-root SITE_URL so /ads.txt is reachable');
}
for (const entry of await readdir(outputDir)) {
  if (!/\.(html|xml|txt)$/.test(entry)) continue;
  const path = `${outputDir}/${entry}`;
  const source = await readFile(path, 'utf8');
  let output = source.replaceAll(DEFAULT_SITE_URL, url);
  if (publisher && entry.endsWith('.html')) {
    output = output.replace('</head>', `  <meta name="google-adsense-account" content="${publisher}" />\n</head>`);
  }
  await writeFile(path, output);
}
await writeFile(`${outputDir}/robots.txt`, `User-agent: *\nAllow: /\n\nSitemap: ${url}sitemap.xml\n`);
if (publisher) await writeFile(`${outputDir}/ads.txt`, `google.com, ${publisher.slice(3)}, DIRECT, f08c47fec0942fa0\n`);
console.log(`Public metadata prepared for ${url}`);
