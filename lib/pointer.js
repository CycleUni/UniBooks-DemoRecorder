/**
 * The synthetic cursor, and the deliberate-looking movement around it.
 *
 * Playwright's mouse teleports: `click()` jumps straight to the target and the
 * real cursor is never painted into the recording at all. On camera that reads
 * as a page changing by itself. Everything here exists to make an automated
 * take look like someone using the app — a visible pointer, eased travel
 * between targets, and scrolling that ramps instead of snapping.
 *
 * The cursor is drawn in the product's own palette (see UniBooks-FE
 * src/styles.css): --accent deep green at rest, flashing --brand-warm kraft
 * orange on press. It used to be a generic blue, which was the one thing on
 * screen belonging to no design system at all.
 */

/** Straight from the frontend's design tokens; keep in sync with styles.css. */
const BRAND = {
  accent: '30, 92, 70', // --accent  #1E5C46
  warm: '200, 118, 63', // --brand-warm  #C8763F
  paper: '#FFFFFF', // --paper
};

/**
 * Inject the cursor overlay. Must be called before the first navigation: it
 * registers an init script, so it re-attaches itself on every document the
 * page loads rather than being wiped by the next route change.
 */
async function attachCursor(page) {
  await page.addInitScript(
    ({ accent, warm, paper }) => {
      const draw = () => {
        if (document.getElementById('demo-visual-cursor')) return;
        const cursor = document.createElement('div');
        cursor.id = 'demo-visual-cursor';
        cursor.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: rgba(${accent}, 0.72);
        border: 2px solid ${paper};
        box-shadow: 0 2px 12px rgba(31, 41, 51, 0.38);
        pointer-events: none;
        z-index: 2147483647;
        transform: translate(-50%, -50%);
        transition: transform 0.08s ease, background 0.15s ease;
      `;
        document.body.appendChild(cursor);

        window.addEventListener('mousemove', (e) => {
          cursor.style.left = `${e.clientX}px`;
          cursor.style.top = `${e.clientY}px`;
        });
        window.addEventListener('mousedown', () => {
          cursor.style.transform = 'translate(-50%, -50%) scale(0.72)';
          cursor.style.background = `rgba(${warm}, 0.92)`;
        });
        window.addEventListener('mouseup', () => {
          cursor.style.transform = 'translate(-50%, -50%) scale(1)';
          cursor.style.background = `rgba(${accent}, 0.72)`;
        });
      };

      if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', draw);
      } else {
        draw();
      }
    },
    BRAND,
  );
}

/** Resolve a selector, Locator, or {x, y} into viewport coordinates. */
async function resolvePoint(page, target) {
  if (target && typeof target === 'object' && 'x' in target && 'y' in target) {
    return target;
  }
  const locator = typeof target === 'string' ? page.locator(target).first() : target;
  const box = await locator.boundingBox().catch(() => null);
  if (!box) return null;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Travel to a target on an ease-in-out curve.
 *
 * Returns false when the target has no box — off-screen, not rendered, or the
 * selector missed. Callers decide what that means; a missing decorative target
 * is worth skipping, a missing button is worth failing over.
 */
async function moveTo(page, target, { steps = 20, settle = 0 } = {}) {
  const point = await resolvePoint(page, target);
  if (!point) return false;

  const from = page.__cursorAt || { x: 960, y: 540 };
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    await page.mouse.move(from.x + (point.x - from.x) * ease, from.y + (point.y - from.y) * ease);
    await page.waitForTimeout(14);
  }
  page.__cursorAt = point;
  if (settle) await page.waitForTimeout(settle);
  return true;
}

/**
 * Move to something and click it.
 *
 * The click goes through the Locator rather than `mouse.click()` so Playwright
 * still waits for actionability — the pointer travel is presentation, not a
 * substitute for knowing the element is ready.
 */
async function clickAt(page, target, { steps = 20, settle = 0, timeout = 15000 } = {}) {
  const locator = typeof target === 'string' ? page.locator(target).first() : target;
  await locator.waitFor({ state: 'visible', timeout });
  await moveTo(page, locator, { steps });
  await locator.click({ timeout });
  if (settle) await page.waitForTimeout(settle);
}

/**
 * Type into a field at a human cadence.
 *
 * `fill()` would drop the whole string in one frame, which on camera looks
 * like a paste rather than a person entering an ISBN.
 */
async function typeInto(page, target, text, { delay = 60, settle = 300, clear = false } = {}) {
  const locator = typeof target === 'string' ? page.locator(target).first() : target;
  await locator.waitFor({ state: 'visible' });
  await moveTo(page, locator);
  await locator.click();
  if (clear) await locator.fill('');
  await page.keyboard.type(text, { delay });
  if (settle) await page.waitForTimeout(settle);
}

/** Scroll with a ramp, so the page does not jump between two static frames. */
async function smoothScroll(page, distance, { steps = 24, stepDelay = 16 } = {}) {
  const step = distance / steps;
  for (let i = 0; i < steps; i++) {
    await page.evaluate((d) => window.scrollBy({ top: d, behavior: 'auto' }), step);
    await page.waitForTimeout(stepDelay);
  }
}

/**
 * Scroll an element into view and rest the cursor on it.
 *
 * Used to end a shot on the thing the shot was about — the meetup card, the
 * filled-in book title, the price — so the cut lands somewhere deliberate.
 */
async function restOn(page, target, { hold = 1200, steps = 22 } = {}) {
  const locator = typeof target === 'string' ? page.locator(target).first() : target;
  if ((await locator.count()) === 0) {
    await page.waitForTimeout(hold);
    return false;
  }
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(300);
  await moveTo(page, locator, { steps });
  await page.waitForTimeout(hold);
  return true;
}

module.exports = {
  attachCursor,
  moveTo,
  clickAt,
  typeInto,
  smoothScroll,
  restOn,
};
