// Screenshots of the visual slice at a few moments and camera positions (headless, software GL).
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = process.argv[2] ?? '.';
const url = process.argv[3] ?? 'http://localhost:4179/slice.html';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
async function open(name, viewport, touch = false) {
  const page = await (await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 })).newPage();
  page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
  await page.goto(url);
  await page.waitForFunction(() => window.__slice, null, { timeout: 60000 });
  return page;
}
const shot = async (page, name) => { await page.waitForTimeout(2500); await page.screenshot({ path: `${out}/slice-${name}.png` }); };

const page = await open('desktop', { width: 1280, height: 800 });
await shot(page, '1-opening');
await page.evaluate(() => window.__slice.advance(18));
await shot(page, '2-rising');
await page.evaluate(() => window.__slice.advance(1e4));
await shot(page, '3-complete');
await page.evaluate(() => { const s = window.__slice; s.controls.autoRotate = false; s.camera.position.set(190, 60, 260); s.controls.target.set(0, 150, 0); });
await shot(page, '4-low');
await page.click('#view-street');
await shot(page, '5-street');
console.log('desktop', JSON.stringify(await page.evaluate(() => window.__slice.info)));
const phone = await open('phone', { width: 390, height: 844 }, true);
await phone.evaluate(() => window.__slice.advance(1e4));
await shot(phone, '6-phone');
console.log(errors.length ? 'ERRORS\n' + [...new Set(errors)].join('\n') : 'no page errors');
await browser.close();
