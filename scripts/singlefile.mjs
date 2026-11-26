// Inlines the built JS and CSS into one self-contained HTML file: dist/neon-arcology.html
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
let html = readFileSync(join(dist, 'index.html'), 'utf8');
html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/([^"]+)"[^>]*>/, (_, f) => `<style>${readFileSync(join(dist, f), 'utf8')}</style>`);
let js = '';
html = html.replace(/<script type="module"[^>]*src="\.\/([^"]+)"[^>]*><\/script>/, (_, f) => { js = readFileSync(join(dist, f), 'utf8'); return ''; });
html = html.replace('</body>', () => `<script type="module">${js.replace(/<\/script/g, '<\\/script')}</script>\n</body>`);
writeFileSync(join(dist, 'neon-arcology.html'), html);
console.log('wrote dist/neon-arcology.html', (html.length / 1024).toFixed(0) + ' kB');

// A head-less fragment (title, style, body content, script) for hosts that wrap pages in their own skeleton.
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const body = html.match(/<body>([\s\S]*?)<script type="module">/)[1];
writeFileSync(join(dist, 'neon-arcology.fragment.html'),
  `<title>Neon Arcology</title>\n<style>${css}</style>\n${body}<script type="module">${js.replace(/<\/script/g, '<\\/script')}</script>\n`);
