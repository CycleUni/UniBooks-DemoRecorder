/**
 * Rasterises cards/*.html into 1920x1080 PNGs.
 *
 * The cards are HTML rather than something drawn by ffmpeg for two reasons.
 * The local ffmpeg is built without libfreetype, so `drawtext` does not exist
 * and there is nothing to draw type with. And more to the point, writing them
 * as web pages means they inherit the product's own design tokens and
 * typefaces — the titles in the film are set in the same deep green, the same
 * Noto Serif TC and the same kraft-paper ground as the app they introduce,
 * instead of being subtitles bolted on afterwards.
 *
 * Nothing here animates. Movement is added at the edit, by ffmpeg, so that a
 * card and a screen recording can be crossfaded as two video clips of known
 * length rather than as a page that may or may not have finished its CSS
 * transition when the camera cut.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const cfg = require('./lib/config');
const timeline = require('./timeline');

const CARDS_SRC = path.join(__dirname, 'cards');

async function main() {
  cfg.ensureDirs();

  const requested = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const ids = requested.length ? requested : timeline.cardIds;

  const missing = ids.filter((id) => !fs.existsSync(path.join(CARDS_SRC, `${id}.html`)));
  if (missing.length) {
    console.error(`timeline.js expects cards that do not exist:\n  ${missing.join('\n  ')}`);
    process.exit(1);
  }

  console.log(`\n🖼  Rendering ${ids.length} card(s) at ${timeline.width}x${timeline.height}`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: timeline.width, height: timeline.height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    for (const id of ids) {
      const src = path.join(CARDS_SRC, `${id}.html`);
      const out = path.join(cfg.CARD_DIR, `${id}.png`);

      await page.goto(`file://${src}`, { waitUntil: 'networkidle' });

      // The webfonts arrive over the network. Screenshotting before they land
      // captures the fallback stack, which is the one thing that would make
      // the cards look like they belong to a different product.
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(250);

      await page.screenshot({ path: out, clip: { x: 0, y: 0, width: timeline.width, height: timeline.height } });
      console.log(`  ✓ ${id}.png`);
    }
  } finally {
    await browser.close();
  }

  console.log(`\n📁 ${cfg.CARD_DIR}`);
}

main().catch((err) => {
  console.error('Card rendering failed:', err);
  process.exit(1);
});
