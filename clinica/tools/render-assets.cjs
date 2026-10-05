/*
 * Renderiza as imagens de assets/img com Playwright + Chromium.
 *   npm i -D playwright && node tools/render-assets.cjs
 * Se a rede bloquear as CDNs, defina THREE_PATH=/caminho/para/three.min.js (r128).
 */
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'assets/img');
const JOBS = [
  { asset: 'molar', w: 900, h: 900, out: 'molar.png' },
  { asset: 'molar-antes', w: 900, h: 900, out: 'molar-antes.png' },
  { asset: 'implant', w: 800, h: 1000, out: 'implante.png' },
  { asset: 'smile', w: 1400, h: 900, out: 'sorriso.jpg' },
  ...[1, 2, 3, 4].flatMap(seed => [
    { asset: 'case-antes', seed, w: 1100, h: 700, out: `caso-${seed}-antes.jpg` },
    { asset: 'case-depois', seed, w: 1100, h: 700, out: `caso-${seed}-depois.jpg` },
  ]),
];

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  if (process.env.THREE_PATH) await page.route(/three\.min\.js$/, r => r.fulfill({ path: process.env.THREE_PATH, contentType: 'application/javascript' }));
  page.on('pageerror', e => console.error('pageerror', e.message));
  for (const j of JOBS) {
    await page.setViewportSize({ width: j.w, height: j.h });
    const url = 'file://' + path.join(__dirname, 'render-assets.html') + `?asset=${j.asset}&seed=${j.seed || 1}&w=${j.w}&h=${j.h}`;
    await page.goto(url);
    await page.waitForFunction(() => window.__done === true, null, { timeout: 120000 });
    const isJpg = j.out.endsWith('.jpg');
    await page.locator('#c').screenshot({ path: path.join(OUT, j.out), omitBackground: !isJpg, type: isJpg ? 'jpeg' : 'png', quality: isJpg ? 86 : undefined });
    console.log('✓', j.out);
  }
  await browser.close();
})();
