// Drives the built game in a headless browser through the opening and saves screenshots.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = process.argv[2] ?? '.';
const url = process.argv[3] ?? 'http://localhost:4179/';
const browser = await chromium.launch();
const errors = [];

async function session(name, viewport, touch) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
  await page.goto(url);
  await page.waitForSelector('[data-act="new"]');
  await page.screenshot({ path: `${out}/${name}-1-title.png` });
  return { ctx, page };
}

const tileXY = (page, x, y) => page.evaluate(([x, y]) => { const g = window.__game; return g.renderer.toScreen(g.view.cam, x, y); }, [x, y]);
const state = (page, fn) => page.evaluate(`(${fn})(window.__game.state)`);

{
  const { page } = await session('desktop', { width: 1280, height: 800 }, false);
  await page.click('[data-act="new"]');
  await page.evaluate(() => window.__game.start('normal', 1));
  const place = async (k, x, y) => {
    await page.click(`[data-act="build"][data-k="${k}"]`);
    const p = await tileXY(page, x + 1, y + 1);
    await page.mouse.move(p.x, p.y);
    await page.mouse.click(p.x, p.y);
  };
  for (const [k, x, y] of [['farm', 10, 32], ['solar', 3, 32], ['foundry', 10, 36], ['market', 6, 39], ['hab', 3, 36]]) await place(k, x, y);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/desktop-2-building.png` });
  await page.evaluate(() => window.__game.step(75));
  await place('hub', 6, 31);
  await page.evaluate(() => window.__game.step(20));
  // Select the hub by clicking it and queue three enforcers.
  const hub = await tileXY(page, 7, 32);
  await page.mouse.click(hub.x, hub.y - 10);
  for (let i = 0; i < 3; i++) await page.click('[data-act="train"][data-k="enforcer"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/desktop-3-hub.png` });
  await page.evaluate(() => window.__game.step(40));
  // Box-select the squad and right-click toward the nearest node.
  await page.click('[data-act="select-army"]');
  const node = await tileXY(page, 15.5, 29.5);
  await page.mouse.click(node.x, node.y, { button: 'right' });
  await page.evaluate(() => window.__game.step(25));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/desktop-4-squad.png` });
  console.log('desktop', JSON.stringify(await state(page, s => ({
    t: Math.round(s.time), built: s.buildings.filter(b => b.faction === 0).map(b => b.kind), units: s.units.filter(u => u.faction === 0).length,
    node: s.nodes.map(n => n.owner), obj: s.objectives.toString(2), res: Object.fromEntries(Object.entries(s.res).map(([k, v]) => [k, Math.round(v)])),
    rates: s.rates, citizens: s.citizens, morale: s.morale,
  }))));
  // Jump ahead: night, a raid, then look at the rival base.
  await page.evaluate(() => window.__game.step(110));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/desktop-5-night.png` });
  await page.evaluate(() => { const g = window.__game; g.view.cam.x = (36 - 8) * 32; g.view.cam.y = (36 + 8) * 16; });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/desktop-6-rival.png` });
}
{
  const { page } = await session('phone', { width: 390, height: 844 }, true);
  await page.tap('[data-act="new"]');
  await page.evaluate(() => window.__game.start('normal', 1));
  await page.tap('[data-act="build"][data-k="farm"]');
  const p = await tileXY(page, 11, 33);
  await page.touchscreen.tap(p.x, p.y);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${out}/phone-2-placing.png` });
  await page.tap('[data-act="confirm-build"]');
  await page.evaluate(() => window.__game.step(12));
  await page.tap('[data-act="select-army"]');
  const q = await tileXY(page, 13.5, 36.5);
  await page.touchscreen.tap(q.x, q.y);
  await page.evaluate(() => window.__game.step(3));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/phone-3-play.png` });
  console.log('phone', JSON.stringify(await state(page, s => ({ built: s.buildings.filter(b => b.faction === 0).map(b => b.kind), moved: s.units.filter(u => u.faction === 0).map(u => [u.x.toFixed(1), u.y.toFixed(1)]) }))));
}
console.log(errors.length ? 'ERRORS\n' + errors.join('\n') : 'no page errors');
await browser.close();
