// Plays the Layer 1 game in a headless browser: brief by hand, approve proposals, grow, save and reload.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = process.argv[2] ?? '.';
const url = process.argv[3] ?? 'http://localhost:4179/index.html';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
async function open(name, viewport, touch = false) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
  await page.goto(url);
  await page.waitForFunction(() => window.__city, null, { timeout: 60000 });
  return page;
}
const shot = async (page, name) => { await page.waitForTimeout(1500); await page.screenshot({ path: `${out}/city-${name}.png` }); };
const summary = page => page.evaluate(() => { const s = window.__city.state; return { t: Math.round(s.time), citizens: Math.round(s.citizens), districts: s.districts.filter(d => d).length, architect: s.architect, morale: Math.round(s.morale), objective: s.objectives.toString(2) }; });

const page = await open('desktop', { width: 1280, height: 800 });
await shot(page, '1-intro');
await page.click('[data-act="new"]');
await page.evaluate(() => window.__city.start(5));
// Brief by hand: click an empty lot, choose farms, issue the brief.
const p = await page.evaluate(() => window.__city.screen(31));
await page.mouse.click(p.x, p.y);
await page.click('[data-act="intent"][data-k="farms"]');
await shot(page, '2-brief');
await page.click('[data-act="brief"]');
await page.evaluate(() => window.__city.run(6));
await shot(page, '3-rising');
// Then let the Architect lead: approve whatever it proposes for a while.
for (let i = 0; i < 40; i++) await page.evaluate(() => { const c = window.__city; c.run(8); c.approve(); });
await page.keyboard.press('Escape');
await shot(page, '4-town');
console.log('after approvals', JSON.stringify(await summary(page)));
for (let i = 0; i < 160; i++) await page.evaluate(() => { const c = window.__city; c.run(8); c.approve(); });
await page.evaluate(() => { const s = window.__city.stage; s.camera.position.set(420, 300, 520); s.controls.target.set(0, 90, 0); });
await shot(page, '5-city');
const before = await summary(page);
console.log('later', JSON.stringify(before));
await page.click('#view');
await shot(page, '6-street');
// Save, reload, continue.
await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
await page.reload();
await page.waitForFunction(() => window.__city);
await page.click('[data-act="continue"]');
const after = await summary(page);
console.log('reloaded', JSON.stringify(after), after.districts === before.districts ? 'save ok' : 'SAVE MISMATCH');

const phone = await open('phone', { width: 390, height: 844 }, true);
await phone.tap('[data-act="new"]');
await phone.evaluate(() => window.__city.start(5));
await shot(phone, '7-phone');
const q = await phone.evaluate(() => window.__city.screen(31));
await phone.touchscreen.tap(q.x, q.y);
await shot(phone, '8-phone-brief');
await phone.tap('[data-act="brief"]');
console.log('phone', JSON.stringify(await summary(phone)));
console.log(errors.length ? 'ERRORS\n' + [...new Set(errors)].join('\n') : 'no page errors');
await browser.close();
