import { spawnSync } from 'node:child_process';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { loadEnv } from 'vite';
import { cloudflareSettings } from './cloudflare-config.mjs';

const localPreview = process.argv.includes('--preview');
const outputDir = localPreview ? '.hosting-preview/site' : 'dist';
const settings = cloudflareSettings(loadEnv('production', process.cwd(), ''), localPreview);
const env = { ...process.env, ...settings.env };
for (const args of [
  ['node_modules/typescript/bin/tsc', '--noEmit'],
  ['node_modules/vite/bin/vite.js', 'build', '--outDir', outputDir],
  ['scripts/prepare-site.mjs', outputDir],
]) {
  const result = spawnSync(process.execPath, args, { env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
await writeFile(`${outputDir}/_headers`, settings.headers);
if (settings.preview) {
  for (const entry of await readdir(outputDir)) {
    if (!entry.endsWith('.html')) continue;
    const path = `${outputDir}/${entry}`;
    const source = await readFile(path, 'utf8');
    // Search Consoleの所有確認ファイルは指定された内容をそのまま保つ。
    if (!source.includes('</head>')) continue;
    const withoutRobots = source.replace(/<meta\b[^>]*\bname=["']robots["'][^>]*>/gi, '');
    await writeFile(path, withoutRobots.replace('</head>', '  <meta name="robots" content="noindex" />\n</head>'));
  }
}
let count = 0;
let largest = 0;
async function inspect(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) await inspect(path);
    else {
      const bytes = (await stat(path)).size;
      count++;
      largest = Math.max(largest, bytes);
      if (bytes > 25 * 1024 * 1024) throw new Error(`Cloudflare asset exceeds 25 MiB: ${path}`);
    }
  }
}
await inspect(outputDir);
if (count > 20_000) throw new Error('Cloudflare Free file count exceeds 20,000');
console.log(`Cloudflare ${settings.preview ? 'staging (noindex, analytics/ads disabled)' : 'production'}: ${count} files, largest ${(largest / 1024 / 1024).toFixed(2)} MiB, output ${outputDir}`);
