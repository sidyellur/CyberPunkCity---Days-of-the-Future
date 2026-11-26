// Screenshots and render cost of a district kit, from the preview page (headless, software GL).
//
//   npm run build && npx vite preview --port 4179 &
//   node scripts/kitshots.mjs <outDir> [kitId] [baseUrl] [intent]
//
// kitId defaults to "example"; "plain" shoots the plain towers. baseUrl defaults to
// http://localhost:4179 (or the KITS_URL environment variable). intent picks the game look
// (palette, heights) the kit is dressed in; default housing.
// Writes kit-<id>-<character>-L<level>.png for every character and level, a level-up in four frames
// (before, at the swap, mid-rise, done: the first two should look the same from the roof down),
// street and phone views, and prints draw calls and triangles for each, then any page errors.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = process.argv[2] ?? '.';
const kit = process.argv[3] ?? 'example';
const base = (process.argv[4] ?? process.env.KITS_URL ?? 'http://localhost:4179').replace(/\/(kits\.html)?$/, '');
const intent = process.argv[5] ?? 'housing';
const url = `${base}/kits.html?${kit === 'plain' ? 'plain=1' : `kit=${kit}`}&intent=${intent}&rain=0`;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
async function open(name, viewport, touch = false) {
  const page = await (await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 })).newPage();
  page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
  page.on('console', m => { if (/GL Driver Message/.test(m.text())) return; /* software-GL screenshot noise */ if (m.type() === 'error' || /shader|THREE\./i.test(m.text())) errors.push(`${name}: ${m.text()}`); });
  await page.goto(url);
  await page.waitForFunction(() => window.__kits, null, { timeout: 60000 });
  const have = await page.evaluate(() => window.__kits.kits);
  if (kit !== 'plain' && !have.includes(kit)) { console.log(`no kit "${kit}"; registered: ${have.join(', ')}`); await browser.close(); process.exit(1); }
  return page;
}
const row = (name, i) => console.log(name.padEnd(26), `per block ${String(i.perBlockCalls).padStart(5)} calls ${String(i.perBlockTriangles).padStart(6)} tris | worst lot ${i.worstLot} meshes ${String(Math.round(i.worstLotTriangles)).padStart(5)} tris | frame ${i.frameCalls} calls ${i.frameTriangles} tris${i.kit && i.worstLot > 3 ? '  OVER BUDGET (3 meshes per lot)' : ''}`);
async function shot(page, name) {
  // Let a few real frames go by so the picture and the frame counters are current.
  const f = await page.evaluate(() => window.__kits.frames);
  await page.waitForFunction(n => window.__kits.frames >= n + 3, f, { timeout: 60000 });
  await page.screenshot({ path: `${out}/kit-${kit}-${name}.png` });
  row(name, await page.evaluate(() => window.__kits.info));
}

const page = await open('desktop', { width: 1280, height: 800 });
console.log(`kit ${kit}, look ${intent}, 8 blocks around the plaza (a full city is about 80)`);
for (const character of ['efficient', 'balanced', 'green']) {
  for (let level = 1; level <= 4; level++) {
    await page.evaluate(([character, level]) => window.__kits.set({ character, level }), [character, level]);
    await shot(page, `${character}-L${level}`);
  }
}
// A level-up, as in the game: the taller build is swapped in sunk, then rises for 6 seconds.
for (const [view, from] of [['wide', 1], ['low', 2]]) {
  await page.evaluate(([view, from]) => { window.__kits.view(view); window.__kits.set({ character: 'balanced', level: from }); }, [view, from]);
  await shot(page, `grow-${view}-1-before`);
  await page.evaluate(from => { window.__kits.set({ level: from + 1 }, 6, true); }, from);
  await shot(page, `grow-${view}-2-swap`);
  await page.evaluate(() => window.__kits.advance(4.5));
  await shot(page, `grow-${view}-3-rising`);
  await page.evaluate(() => window.__kits.advance(20));
  await shot(page, `grow-${view}-4-done`);
}
// A first build from nothing, mid-rise, with the holograms.
await page.evaluate(() => { window.__kits.view('wide'); window.__kits.set({ level: 2 }, 6); window.__kits.advance(3.2); });
await shot(page, 'rise-from-nothing');
await page.evaluate(() => { window.__kits.view('street'); window.__kits.set({ level: 3 }); });
await shot(page, 'street-L3');
await page.evaluate(() => { window.__kits.view('top'); });
await shot(page, 'top-L3');

const phone = await open('phone', { width: 390, height: 844 }, true);
await phone.evaluate(() => window.__kits.set({ level: 3 }));
await shot(phone, 'phone-L3-cheap');

console.log(errors.length ? 'ERRORS\n' + [...new Set(errors)].join('\n') : 'no page errors');
await browser.close();
