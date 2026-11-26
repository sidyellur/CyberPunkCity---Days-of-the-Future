// Builds each page on its own (so nothing is split into shared chunks) and inlines its JS and CSS
// into one self-contained HTML file in dist/, plus a skeleton-free fragment (title, styles, body
// content, script) for hosts that wrap pages themselves.
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { build } from 'vite';

const root = resolve(new URL('..', import.meta.url).pathname);
const dist = join(root, 'dist');
const pages = { 'index.html': 'cyberpunk-city', 'classic.html': 'cyberpunk-city-classic', 'slice.html': 'cyberpunk-city-skyline' };

for (const [page, name] of Object.entries(pages)) {
  const tmp = join(dist, `.single-${name}`);
  await build({
    root, logLevel: 'warn', configFile: false, base: './',
    build: { target: 'es2020', outDir: tmp, emptyOutDir: true, assetsInlineLimit: 0, chunkSizeWarningLimit: 2000, rollupOptions: { input: join(root, page) } },
  });
  const html = readFileSync(join(tmp, page), 'utf8');
  const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
  const fonts = (html.match(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/) ?? [''])[0];
  const css = [...html.matchAll(/<link rel="stylesheet"[^>]*href="\.\/([^"]+)"[^>]*>/g)].map(m => readFileSync(join(tmp, m[1]), 'utf8')).join('\n');
  const scripts = [...html.matchAll(/<script type="module"[^>]*src="\.\/([^"]+)"[^>]*><\/script>/g)].map(m => readFileSync(join(tmp, m[1]), 'utf8'));
  const js = scripts.join('\n').replace(/<\/script/g, '<\\/script');
  if (/\bfrom\s*["']\.\/|import\(["']\.\//.test(js)) throw new Error(`${page}: the bundle still imports another chunk`);
  const body = html.match(/<body>([\s\S]*?)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, '');
  const head = html.match(/<head>([\s\S]*?)<\/head>/)[1].replace(/<link rel="stylesheet"[^>]*>|<script[\s\S]*?<\/script>|<link rel="modulepreload"[^>]*>/g, '');
  const inner = `<style>${css}</style>\n${body}<script type="module">${js}</script>\n`;
  writeFileSync(join(dist, `${name}.html`), `<!doctype html>\n<html lang="en">\n<head>${head}${fonts}</head>\n<body>\n${inner}</body>\n</html>\n`);
  writeFileSync(join(dist, `${name}.fragment.html`), `${title}\n${fonts}\n${inner}`);
  rmSync(tmp, { recursive: true, force: true });
  console.log(`wrote dist/${name}.html`, (inner.length / 1024).toFixed(0) + ' kB');
}
