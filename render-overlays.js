/**
 * Draws the things that go *over* the footage: corner badges and highlights.
 *
 * Both are transparent 1920×1080 PNGs, composited by build-video.js. They are
 * drawn as web pages for the same reason the title cards are — the local
 * ffmpeg has no libfreetype, so `drawtext` does not exist, and `drawbox` can
 * only manage a hard rectangle. A page can do the rounded corner, the dimmed
 * surround and the type, all in the product's own palette.
 *
 * ── Badges ────────────────────────────────────────────────────────────────
 *
 * One per scene that declares `badge` in timeline.js, held for the whole shot.
 * The film follows a single account through two opposite roles; without a
 * standing marker the viewer has to infer which one they are watching from
 * whichever page happens to be open.
 *
 * ── Highlights ────────────────────────────────────────────────────────────
 *
 * One per `highlight()` call the recorder made, positioned from the box it
 * measured at the time. This step therefore runs *after* recording, not with
 * the cards: the coordinates are whatever the browser laid out on the day, and
 * writing them down in advance is how a box ends up framing empty space after
 * a font or a container width changes.
 *
 * The surround is dimmed rather than only outlined. Each of these shots makes
 * a claim about one small control on an otherwise full page, and a viewer with
 * seven seconds and no idea where to look will not find it from a rectangle
 * alone.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const cfg = require('./lib/config');
const timeline = require('./timeline');

const W = timeline.width;
const H = timeline.height;

/** Copied from UniBooks-FE src/styles.css; keep in step with the cards. */
const TOKENS = `
  --ink: #1F2933;
  --ink-soft: #4A555F;
  --paper: #FFFFFF;
  --paper-warm: #F7F5F0;
  --line-strong: #948A76;
  --accent: #1E5C46;
  --brand-warm: #C8763F;
  --on-accent: #FFFFFF;
`;

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&display=swap');`;
const SANS = `'Noto Sans TC', -apple-system, 'PingFang TC', sans-serif`;

function page(body, extraCss = '') {
  return `<!doctype html><html lang="zh-TW"><head><meta charset="utf-8"><style>
    ${FONTS}
    :root { ${TOKENS} }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: ${W}px; height: ${H}px; overflow: hidden;
      background: transparent;
      font-family: ${SANS};
    }
    ${extraCss}
  </style></head><body>${body}</body></html>`;
}

/** The standing "whose screen is this" label. */
function badgeHtml(label) {
  return page(
    `<div class="badge"><span class="dot"></span>${escapeHtml(label)}</div>`,
    `
    .badge {
      position: absolute; top: 34px; left: 40px;
      display: flex; align-items: center; gap: 12px;
      padding: 12px 24px;
      background: var(--paper);
      border: 1px solid var(--line-strong);
      border-radius: 999px;
      box-shadow: 0 2px 14px rgba(31, 41, 51, 0.16);
      font-size: 24px; font-weight: 500; color: var(--ink);
      letter-spacing: 0.02em;
    }
    .dot { width: 12px; height: 12px; border-radius: 50%; background: var(--accent); }
  `,
  );
}

/**
 * A box around one element, captioned.
 *
 * The caption goes below the box when there is room and above when there is
 * not, and is nudged back inside the frame when the element sits near an edge
 * — the language switcher is in the footer, the theme control in the top right
 * corner, and a caption pinned to either would otherwise run off screen.
 */
function highlightHtml({ label, box }) {
  const pad = 12;
  const x = Math.max(0, box.x - pad);
  const y = Math.max(0, box.y - pad);
  const w = Math.min(W - x, box.width + pad * 2);
  const h = Math.min(H - y, box.height + pad * 2);

  // Two-part labels are written with a double ideographic space in record.js:
  // a short name for the mechanism, then the sentence explaining it.
  const [head, ...rest] = label.split('　　');
  const tail = rest.join('　　');

  const below = y + h + 132 < H - 40;
  const captionTop = below ? y + h + 20 : Math.max(40, y - 96);

  // Anchor the caption to whichever side of the frame the element is nearer.
  // Left-anchoring everything sent the theme switcher's caption — a control
  // 46px wide in the top right corner — straight off the right edge, and the
  // rendered width is not known here to clamp against.
  const rightHalf = x + w / 2 > W / 2;
  const captionAnchor = rightHalf
    ? `right: ${Math.max(40, W - Math.min(W - 40, x + w))}px;`
    : `left: ${Math.min(Math.max(40, x), W - 40)}px;`;

  return page(
    `<div class="box"></div>
     <div class="caption">
       <span class="head">${escapeHtml(head)}</span>${tail ? `<span class="tail">${escapeHtml(tail)}</span>` : ''}
     </div>`,
    `
    /* One element carries both the ring and the dimmed surround: an enormous
       spread shadow paints everything outside the box and nothing inside it,
       so the two can never drift apart. */
    .box {
      position: absolute;
      left: ${x}px; top: ${y}px; width: ${w}px; height: ${h}px;
      border: 3px solid var(--brand-warm);
      border-radius: 8px;
      box-shadow: 0 0 0 9999px rgba(31, 41, 51, 0.30);
    }
    .caption {
      position: absolute;
      top: ${captionTop}px; ${captionAnchor}
      max-width: ${W - 80}px;
      display: inline-flex; align-items: baseline; gap: 16px;
      padding: 16px 26px;
      background: var(--accent);
      border-radius: 6px;
      box-shadow: 0 6px 24px rgba(31, 41, 51, 0.34);
      white-space: nowrap;
    }
    .head {
      font-size: 28px; font-weight: 700; color: var(--on-accent);
      letter-spacing: 0.02em;
    }
    .tail {
      font-size: 24px; font-weight: 400; color: rgba(255, 255, 255, 0.86);
    }
  `,
  );
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

async function main() {
  cfg.ensureDirs();

  const manifestPath = path.join(cfg.SCENE_DIR, 'scenes.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};

  const jobs = [];
  for (const entry of timeline.entries) {
    if (entry.kind !== 'scene') continue;
    if (entry.badge) {
      jobs.push({ file: `badge-${entry.id}.png`, html: badgeHtml(entry.badge) });
    }
    const highlights = manifest[entry.id]?.highlights || [];
    highlights.forEach((h, i) => {
      jobs.push({ file: `highlight-${entry.id}-${i}.png`, html: highlightHtml(h) });
    });
  }

  if (jobs.length === 0) {
    console.log('\nNo overlays to draw. Badges come from timeline.js and highlights from a recording,');
    console.log('so if you expected some, record first.');
    return;
  }

  console.log(`\n🏷  Drawing ${jobs.length} overlay(s) at ${W}x${H}`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
  });
  const page_ = await context.newPage();

  try {
    for (const job of jobs) {
      await page_.setContent(job.html, { waitUntil: 'networkidle' });
      await page_.evaluate(() => document.fonts.ready);
      await page_.waitForTimeout(150);
      await page_.screenshot({
        path: path.join(cfg.OVERLAY_DIR, job.file),
        omitBackground: true, // the whole point: everything but the drawing is transparent
        clip: { x: 0, y: 0, width: W, height: H },
      });
      console.log(`  ✓ ${job.file}`);
    }
  } finally {
    await browser.close();
  }

  console.log(`\n📁 ${cfg.OVERLAY_DIR}`);
}

main().catch((err) => {
  console.error('Overlay rendering failed:', err);
  process.exit(1);
});
