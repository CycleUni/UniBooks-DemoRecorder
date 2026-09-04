/**
 * Shoots the thirteen takes the edit is built from.
 *
 * This is not a test suite. There are no assertions, nothing gates CI on it,
 * and a successful run is not evidence that anything works — if a flow is
 * broken the recording shows the breakage instead of failing.
 *
 * ── Why one context per scene ──────────────────────────────────────────────
 *
 * The previous version drove two very long flows in two contexts, so a
 * selector that moved in the middle of the buyer journey cost the whole
 * journey. Each scene now owns its browser, its recording and its setup, which
 * means a scene can be re-shot on its own (`npm run record -- s08_chat`) and
 * each one can be paced differently.
 *
 * ── Why scenes mark themselves in ──────────────────────────────────────────
 *
 * Playwright records a context from creation to close; there is no way to
 * start the camera partway through. But most scenes need the app put into some
 * state first — signed in, three steps into a wizard, holding an open
 * conversation — and none of that belongs on screen. So every scene runs in
 * two phases: a setup phase that moves as fast as the app allows, then a call
 * to `mark()`, then the performance. The offset `mark()` records goes into
 * scenes.json and build-video.js trims everything before it. Setup being ugly
 * and instant is the point; it never reaches the cut.
 *
 * ── Why the chat scene opens a second browser ─────────────────────────────
 *
 * A single browser can only show a message being sent. The claim being made is
 * that messaging is live — delivered over CFEdgeChat rather than appearing on
 * the next reload — and the only way to film that is to have someone else send
 * one. So the seller is driven in a second, unrecorded context, and the reply
 * lands in the buyer's already-open window with nothing having been refreshed.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const cfg = require('./lib/config');
const P = require('./lib/pointer');
const timeline = require('./timeline');

const VIEWPORT = { width: timeline.width, height: timeline.height };

// ───────────────────────────────────────────────────────────── sign-in state

/**
 * Sign in once per account and keep the resulting storage state in memory.
 *
 * Scenes reuse it so that thirteen recordings cost two logins rather than
 * thirteen — both because the login screen has no business appearing at the
 * head of every take, and because the backend rate-limits authentication and
 * would start rejecting the later scenes.
 */
const stateCache = new Map();

async function storageStateFor(browser, creds) {
  if (stateCache.has(creds.email)) return stateCache.get(creds.email);

  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  await page.goto(cfg.regionUrl('/login'), { waitUntil: 'domcontentloaded' });

  await page.locator('.auth-box ui-input input').first().fill(creds.email);
  await page.locator('.auth-box input[type="password"]').first().fill(creds.password);
  await page.locator('.auth-box ui-button button').first().click();

  // The token lands in localStorage; wait for it rather than for a URL, since
  // where login returns you to depends on how you arrived.
  await page
    .waitForFunction(() => !!localStorage.getItem('access_token'), { timeout: 20000 })
    .catch(() => {
      throw new Error(
        `Sign-in failed for ${creds.email}. Check DEMO_EMAIL / DEMO_PASSWORD and that the ` +
          `account exists in the database at ${cfg.BASE_URL}.`,
      );
    });

  const state = await context.storageState();
  await context.close();
  stateCache.set(creds.email, state);
  console.log(`  ✓ signed in as ${creds.email}`);
  return state;
}

// ──────────────────────────────────────────────────────────────── recording

function ffmpeg(args) {
  execFileSync(cfg.FFMPEG, ['-loglevel', 'error', '-nostats', ...args], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
}

/**
 * Run one scene and leave an mp4 plus the offset its performance starts at.
 */
async function shoot(browser, entry) {
  const scene = SCENES[entry.id];
  if (!scene) throw new Error(`timeline.js lists scene "${entry.id}" but record.js has no such scene`);

  const budget = (entry.duration * (entry.speedHint || 1)).toFixed(1);
  console.log(`\n▶ ${entry.id}  (cut ${entry.duration}s · aiming for ~${budget}s of footage)`);

  const context = await browser.newContext({
    viewport: VIEWPORT,
    storageState: await storageStateFor(browser, cfg.BUYER),
    recordVideo: { dir: cfg.RAW_DIR, size: VIEWPORT },
    locale: 'zh-TW',
    // The takes are shot on a machine that may be doing other things. Freezing
    // the timezone keeps "posted 3 minutes ago" style copy stable between the
    // scenes that were shot minutes apart.
    timezoneId: 'Asia/Taipei',
  });

  const page = await context.newPage();
  const startedAt = Date.now();
  await P.attachCursor(page);

  let markedAt = null;
  const mark = async (settle = 500) => {
    // A beat of stillness before the performance starts, so the trim never
    // lands mid-animation and the cut opens on a settled frame.
    await page.waitForTimeout(settle);
    markedAt = (Date.now() - startedAt) / 1000;
  };

  /**
   * Rest on an element and record where it was, so the edit can draw a box
   * around it and caption what it is.
   *
   * The last act shows three mechanisms — an email binding, a waitlist
   * subscription, a theme and language switch — and each of them is a small
   * piece of a full page. Seven seconds is not enough for a viewer to find
   * them unaided, and the scenes were read as "some settings screens".
   *
   * The measuring has to happen here rather than being written down in the
   * timeline: the box depends on where the browser actually laid the element
   * out, and hard-coded coordinates would silently drift off target the first
   * time a font or a container width changed. Times are recorded raw, in
   * seconds since the context opened; build-video.js maps them onto the cut
   * once it knows the trim and the speed.
   */
  const highlights = [];
  const highlight = async (target, label, { hold = 2800, steps = 22 } = {}) => {
    const locator = typeof target === 'string' ? page.locator(target).first() : target;
    if ((await locator.count()) === 0) {
      console.warn(`  ⚠️  nothing matched "${target}" to highlight; holding without a box`);
      await page.waitForTimeout(hold);
      return false;
    }
    await locator.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(400);

    // Measured after the scroll settles and before the hold, which is the only
    // window in which the element is both in its final position and not moving.
    const box = await locator.boundingBox();
    if (!box) {
      await page.waitForTimeout(hold);
      return false;
    }

    await P.moveTo(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, { steps });
    const startRaw = (Date.now() - startedAt) / 1000;
    await page.waitForTimeout(hold);
    highlights.push({ label, box, startRaw, endRaw: (Date.now() - startedAt) / 1000 });
    return true;
  };

  let failure = null;
  try {
    await scene({ page, context, browser, mark, highlight });
  } catch (err) {
    // A broken scene should not cost the twelve that work. Keep the partial
    // footage — it is usually the fastest way to see what moved.
    failure = err;
    console.error(`  ✗ ${entry.id} failed: ${err.message}`);
  }

  const video = page.video();
  await page.close();
  await context.close();

  const raw = await video.path();
  const out = path.join(cfg.SCENE_DIR, `${entry.id}.mp4`);
  ffmpeg(['-y', '-i', raw, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'fast', '-crf', '18', '-an', out]);

  const markIn = markedAt === null ? 0 : markedAt;
  console.log(`  ✓ ${path.basename(out)}  (performance starts at ${markIn.toFixed(1)}s)`);

  return {
    id: entry.id,
    file: out,
    markIn,
    highlights,
    failed: !!failure,
    error: failure ? failure.message : null,
  };
}

// ─────────────────────────────────────────────────────────── shared set-ups

/**
 * Wait for a selector, reloading once if it does not turn up.
 *
 * Freshly created records lose a race against the view meant to list them.
 * Arriving at /messages?chat=<id> moments after the conversation was created,
 * the inbox request can come back without it; messages.html then renders the
 * empty-inbox state rather than the thread, so the chat input never exists to
 * be waited for. The record is real and the next load finds it, so reloading
 * is the whole fix — and it is the right fix rather than a longer timeout,
 * which would only wait longer on a view that has already decided it has
 * nothing to show. The same race cost three takes in one run: the chat input,
 * the checkout form and the inbox list.
 */
async function waitOrReload(page, selector, { timeout = 15000 } = {}) {
  try {
    await page.locator(selector).first().waitFor({ timeout });
  } catch {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator(selector).first().waitFor({ timeout: timeout + 10000 });
  }
}

/**
 * Wait until the page agrees the account is verified, or say why not.
 *
 * Verification gates both acts: the sell wizard renders all three steps but
 * refuses the final submit, and the book page's "contact seller" button
 * returns without doing anything at all. Both then fail somewhere later and
 * further away — a success screen that never arrives, a chat input that never
 * appears — so the check belongs up front, where the cause is still legible.
 *
 * The settle and the reload are both load-bearing. The state comes from the
 * /auth/me response, so checking the moment the page has structure asks the
 * question before the answer exists. And sell.ts and book.ts both decide with
 * `authStore.isVerifiedIn(regionService.region())`, where isUserVerifiedIn()
 * returns false for a null region — so when the profile response wins the race
 * against the region resolving, a verified account renders as unverified. That
 * shows up when scenes are shot back to back and the app boots slower; loading
 * again, with the region already warm, resolves it. One retry, then give up
 * loudly: past that it is a real verification problem and no number of reloads
 * will fix it.
 */
async function assertVerified(page, settledSelector) {
  const blocked = () =>
    page.locator('ui-verification-prompt').first().isVisible().catch(() => false);

  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(600);
  if (!(await blocked())) return;

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator(settledSelector).first().waitFor({ timeout: 25000 });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1200);
  if (!(await blocked())) return;

  throw new Error(
    `${cfg.BUYER.email} is rendering as unverified at ${page.url()}, so this flow cannot ` +
      `complete. Check that the account is verified in region ${cfg.REGION}.`,
  );
}

/** Put the sell wizard into `step`, as fast as the app will allow. */
async function openSellWizardAt(page, step) {
  await page.goto(cfg.regionUrl('/sell'), { waitUntil: 'domcontentloaded' });
  await page.locator('.step-content').first().waitFor({ timeout: 20000 });

  await assertVerified(page, '.step-content');

  // A draft left by an interrupted run would otherwise reopen mid-wizard.
  const discard = page.locator('.draft-banner-actions ui-button button').first();
  if (await discard.count()) await discard.click().catch(() => {});

  if (step === 1) return;

  await page.locator('.step-content ui-input input').first().fill(cfg.SELL.isbn);
  await page.locator('ui-button button', { hasText: /搜尋書目|Search/ }).first().click();
  await page.locator('button.book-match.selectable').first().waitFor({ timeout: 25000 });
  await page.locator('button.book-match.selectable').first().click();
  await page.locator('.actions ui-button button').first().click();
  await page.locator('ui-condition-picker').waitFor({ timeout: 15000 });

  if (step === 2) return;

  await page.locator('ui-condition-picker .chip').nth(1).click();
  await page.locator('.step-content ui-input input').nth(0).fill(cfg.SELL.course);
  await page.locator('.actions.split ui-button:last-child button').first().click();
  await page.locator('input.price-input').waitFor({ timeout: 15000 });
}

/** Open the target book's detail page. */
async function openTargetBook(page) {
  await page.goto(`${cfg.regionUrl('/book')}?isbn=${cfg.BUY.isbn}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.listings-grid ui-listing-card').first().waitFor({ timeout: 25000 });
  await assertVerified(page, '.listings-grid ui-listing-card');
}

/**
 * Get the buyer into the conversation for the target listing.
 *
 * Arrival is confirmed by the chat input existing, not by `waitForURL`. Every
 * route change in this app is an Angular pushState, and pushState does not
 * re-fire `load` — which is the lifecycle event waitForURL waits for by
 * default. It therefore times out on a navigation that already happened.
 */
async function openConversation(page) {
  await openTargetBook(page);
  await page.locator('.button-group ui-button:first-child button').first().click();
  await waitOrReload(page, '.message-input-area ui-input input');
}

// ───────────────────────────────────────────────────────────────── the takes

const SCENES = {
  /** The product's own front door: what it is, and what you can ask it. */
  async s01_home_hero({ page, mark }) {
    await page.goto(cfg.regionUrl('/'), { waitUntil: 'domcontentloaded' });
    await page.locator('.hero-search').waitFor({ timeout: 25000 });
    // Cover art is fetched per book; without this the hero's tilted stack
    // pops in halfway through the shot.
    await page.waitForLoadState('networkidle').catch(() => {});
    await mark();

    await P.moveTo(page, '.search-title', { steps: 26, settle: 1400 });
    await P.moveTo(page, '.hero-input input', { steps: 22, settle: 1100 });
    await P.moveTo(page, '.popular-tags .tag-btn', { steps: 18, settle: 1000 });
    await P.moveTo(page, '.hero-trust li', { steps: 20, settle: 1400 });
    await P.smoothScroll(page, 180, { steps: 26 });
    await page.waitForTimeout(2800);
  },

  /** An ISBN is the whole of the input. */
  async s02_sell_isbn({ page, mark }) {
    await page.goto(cfg.regionUrl('/'), { waitUntil: 'domcontentloaded' });
    await page.locator('.hero-search').waitFor({ timeout: 25000 });
    await mark();

    await P.clickAt(page, '.nav-links a[href*="/sell"]', { settle: 1400 });
    await page.locator('.step-content').first().waitFor({ timeout: 20000 });
    await assertVerified(page, '.step-content');
    const discard = page.locator('.draft-banner-actions ui-button button').first();
    if (await discard.count()) await discard.click().catch(() => {});
    await page.waitForTimeout(900);

    // Walk the three steps before touching anything: the shot is partly about
    // how short the wizard is, and that only reads if you see all of it first.
    await P.moveTo(page, page.locator('.stepper .step').nth(0), { steps: 18, settle: 650 });
    await P.moveTo(page, page.locator('.stepper .step').nth(1), { steps: 14, settle: 650 });
    await P.moveTo(page, page.locator('.stepper .step').nth(2), { steps: 14, settle: 900 });

    await P.moveTo(page, '.step-content .desc', { steps: 18, settle: 1200 });
    await P.typeInto(page, '.step-content ui-input input', cfg.SELL.isbn, { delay: 130, settle: 1400 });
    await P.clickAt(page, page.locator('ui-button button', { hasText: /搜尋書目|Search/ }).first(), {
      settle: 2600,
    });
  },

  /**
   * The take the seller act exists for: an ISBN turning into a title, an
   * author and cover art without anyone typing them. It plays at close to real
   * speed — sped up it stops reading as a lookup and starts reading as a cut.
   */
  async s03_sell_autofill({ page, mark }) {
    await openSellWizardAt(page, 1);
    await page.locator('.step-content ui-input input').first().fill(cfg.SELL.isbn);
    await mark();

    await P.clickAt(page, page.locator('ui-button button', { hasText: /搜尋書目|Search/ }).first());
    await page.locator('button.book-match.selectable').first().waitFor({ timeout: 25000 });
    await page.waitForTimeout(2000);

    await P.clickAt(page, 'button.book-match.selectable', { settle: 1600 });
    // Rest on the filled-in title and cover: this is the assertion the shot is
    // making, so the cut should end looking straight at it.
    await P.restOn(page, '.book-match .book-title-serif', { hold: 3000 });
  },

  /** Condition, course, professor — the campus-specific metadata. */
  async s04_sell_details({ page, mark }) {
    await openSellWizardAt(page, 2);
    await mark();

    // Read along the condition chips before picking one, so the grading scale
    // registers as a scale rather than as a button that happened to be there.
    await P.moveTo(page, page.locator('ui-condition-picker .chip').nth(0), { steps: 18, settle: 600 });
    await P.clickAt(page, page.locator('ui-condition-picker .chip').nth(1), { settle: 1300 });

    await P.typeInto(page, page.locator('.step-content ui-input input').nth(0), cfg.SELL.course, {
      delay: 90,
      settle: 1000,
    });
    await P.typeInto(page, page.locator('.step-content ui-input input').nth(1), cfg.SELL.professor, {
      delay: 90,
      settle: 1200,
    });

    await P.smoothScroll(page, 220, { steps: 20 });
    // The photo slots are the part of this step nobody would guess at from a
    // description, so the pointer goes there rather than straight to Next.
    await P.moveTo(page, '.photo-upload .dropzone', { steps: 20, settle: 1200 });
    await page.waitForTimeout(1400);
    await P.clickAt(page, '.actions.split ui-button:last-child button', { settle: 1600 });
  },

  /** A price, a button, and the listing is live. */
  async s05_sell_publish({ page, mark }) {
    await openSellWizardAt(page, 3);
    await mark();

    await P.typeInto(page, 'input.price-input', cfg.SELL.price, { delay: 140, settle: 1200, clear: true });
    await P.clickAt(page, '.actions.split ui-button:last-child button', { settle: 800 });

    await page.locator('.step-content.text-center h2').waitFor({ timeout: 30000 });
    await page.waitForTimeout(2800);

    // The claim is that it is on the shelf, so go and look at the shelf.
    await page.goto(cfg.regionUrl('/account/listings'), { waitUntil: 'domcontentloaded' });
    await page.locator('ui-listing-row').first().waitFor({ timeout: 25000 });
    await P.restOn(page, 'ui-listing-row', { hold: 3200 });
  },

  /**
   * One results page carrying both halves of the argument: a book with a
   * seller and a price, and a book with nobody selling and people waiting.
   */
  async s06_search({ page, mark }) {
    await page.goto(cfg.regionUrl('/'), { waitUntil: 'domcontentloaded' });
    await page.locator('.hero-input input').waitFor({ timeout: 25000 });
    await mark();

    await P.typeInto(page, '.hero-input input', cfg.BUY.query, { delay: 110, settle: 700 });
    await P.clickAt(page, '.search-submit button');
    // Results appearing is the proof of arrival; see openConversation for why
    // waitForURL is not used for Angular's client-side route changes.
    await page.locator('ui-book-tile').first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(2600);

    await P.moveTo(page, '.sidebar .filter-group', { steps: 22, settle: 1200 });
    await P.smoothScroll(page, 260, { steps: 24 });
    await page.waitForTimeout(1000);

    // The two tiles are the argument: one book has a seller and a price, the
    // next has nobody selling and a queue. Resting on each in turn is what
    // makes the waitlist shot later read as an answer rather than a feature.
    await P.moveTo(page, page.locator('ui-book-tile').nth(0), { steps: 22, settle: 2000 });
    await P.moveTo(page, page.locator('ui-book-tile').nth(1), { steps: 20, settle: 2400 });
  },

  /** Who is actually selling it, in what condition, for how much. */
  async s07_book_detail({ page, mark }) {
    await page.goto(`${cfg.regionUrl('/search')}?q=${encodeURIComponent(cfg.BUY.query)}`, {
      waitUntil: 'domcontentloaded',
    });
    await page.locator('ui-book-tile').first().waitFor({ timeout: 25000 });
    await mark();

    const target = page
      .locator('ui-book-tile')
      .filter({ hasText: cfg.BUY.titleFragment })
      .first();
    if (await target.count()) {
      await P.clickAt(page, target, { settle: 600 });
    } else {
      await page.goto(`${cfg.regionUrl('/book')}?isbn=${cfg.BUY.isbn}`, { waitUntil: 'domcontentloaded' });
    }

    await page.locator('.listings-grid ui-listing-card').first().waitFor({ timeout: 25000 });
    await page.waitForTimeout(1400);

    await P.moveTo(page, '.book-header .book-title', { steps: 22, settle: 1400 });
    await P.moveTo(page, '.meta-list .meta-row:last-child', { steps: 18, settle: 1600 });

    await P.smoothScroll(page, 320, { steps: 24 });
    await P.moveTo(page, '.listings-grid ui-listing-card .seller-info', { steps: 20, settle: 1800 });
    await P.restOn(page, '.listings-grid ui-listing-card .price', { hold: 2400 });
  },

  /**
   * The live-messaging take. Two browsers; only this one is on camera.
   */
  async s08_chat({ page, browser, mark }) {
    await openConversation(page);

    const sellerContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      storageState: await storageStateFor(browser, cfg.SELLER),
    });
    const sellerPage = await sellerContext.newPage();
    await sellerPage.goto(cfg.regionUrl('/messages'), { waitUntil: 'domcontentloaded' });
    await waitOrReload(sellerPage, '.chat-item');
    await sellerPage.locator('.chat-item').first().click();
    await sellerPage.locator('.message-input-area ui-input input').waitFor({ timeout: 25000 });

    await mark();

    try {
      // The banner above the thread carries the book, the price and the
      // condition, which is what makes this a marketplace conversation rather
      // than a chat window that happens to be in the same app.
      await P.moveTo(page, '.listing-banner .listing-details', { steps: 22, settle: 1800 });

      await P.typeInto(page, '.message-input-area ui-input input', cfg.CHAT.buyerMessage, {
        delay: 70,
        settle: 900,
      });
      await P.clickAt(page, '.message-input-area ui-button button', { settle: 2200 });

      // The seller answers while the buyer's window sits untouched. Nothing
      // below reloads the buyer's page — that is the entire point of the shot.
      await sellerPage.locator('.message-input-area ui-input input').fill(cfg.CHAT.sellerReply);
      await sellerPage.locator('.message-input-area ui-button button').first().click();

      await page
        .locator('.msg-bubble', { hasText: cfg.CHAT.sellerReply.slice(0, 8) })
        .first()
        .waitFor({ timeout: 20000 });
      await page.waitForTimeout(1200);
      await P.restOn(page, '.message-history .msg-bubble:last-child', { hold: 3600 });
    } finally {
      await sellerContext.close();
    }
  },

  /** Agreeing to meet, as a request the seller has to accept. */
  async s09_meetup({ page, mark }) {
    await openTargetBook(page);
    await mark();

    await P.clickAt(page, '.button-group ui-button:nth-child(2) button', { settle: 1200 });
    await waitOrReload(page, '.form-card');
    await page.waitForTimeout(1100);

    await P.moveTo(page, '.summary-card .book-title-serif', { steps: 22, settle: 1300 });
    await P.moveTo(page, '.summary-card .price', { steps: 18, settle: 1600 });
    await P.moveTo(page, '.form-card', { steps: 20, settle: 1400 });
    await P.clickAt(page, '.form-card ui-button.mt-5 button', { settle: 1200 });
    await page.locator('.success-box').waitFor({ timeout: 30000 });
    await page.waitForTimeout(2600);
  },

  /** The loop closing: the order exists, and the chat says so by itself. */
  async s10_order_loop({ page, mark }) {
    await page.goto(cfg.regionUrl('/account/orders'), { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    await mark();

    await P.smoothScroll(page, 160, { steps: 18 });
    await page.waitForTimeout(2600);

    await P.clickAt(page, '.nav-links a[href*="/messages"]', { settle: 1600 });
    await waitOrReload(page, '.chat-item');
    await P.clickAt(page, '.chat-item', { settle: 1400 });

    // The meetup request posts itself into the conversation as a system card:
    // buying and talking are the same thread, not two places to check.
    await P.restOn(page, 'ui-meetup-card', { hold: 3000 });
  },

  /**
   * Who you are dealing with, and how the platform knows.
   *
   * Shot on the account's own verification panel rather than on a seller's
   * card. The card carries the school name, which is the *result* of campus
   * email verification, but nothing on it says where that name came from; the
   * panel names the bound .edu.tw address and the moment it was checked, which
   * is the mechanism the claim actually rests on.
   */
  async s11_verified({ page, mark, highlight }) {
    await page.goto(cfg.regionUrl('/account/settings'), { waitUntil: 'domcontentloaded' });
    await page.locator('.verify-section').waitFor({ timeout: 25000 });
    await page.waitForLoadState('networkidle').catch(() => {});
    await mark();

    await page.waitForTimeout(1200);
    await highlight(
      '.verify-section .alert-box',
      '校園信箱驗證　　學校身分綁定 .edu.tw 信箱，不是自己填的',
      { hold: 3000 },
    );
    await P.moveTo(page, '.verify-section .alert-box p', { steps: 20, settle: 2000 });
  },

  /** Nobody selling it yet is a state the platform has an answer for. */
  async s12_waitlist({ page, mark, highlight }) {
    await page.goto(`${cfg.regionUrl('/book')}?isbn=${cfg.BUY.waitlistIsbn}`, {
      waitUntil: 'domcontentloaded',
    });
    await page.locator('.waitlist-banner').waitFor({ timeout: 25000 });
    await page.waitForLoadState('networkidle').catch(() => {});
    await mark();

    // The empty state first, so the banner reads as an answer to it.
    await P.moveTo(page, '.listings-section .section-heading', { steps: 22, settle: 1600 });
    await highlight(
      '.waitlist-banner',
      '沒人賣的書　　訂閱到貨通知，有人上架就通知你',
      { hold: 3000 },
    );
    await P.clickAt(page, '.waitlist-banner ui-button button', { settle: 2800 });
  },

  /** Read at night, read in three languages. */
  async s13_theme_lang({ page, mark, highlight }) {
    await page.goto(cfg.regionUrl('/'), { waitUntil: 'domcontentloaded' });
    await page.locator('.hero-search').waitFor({ timeout: 25000 });
    await page.waitForLoadState('networkidle').catch(() => {});
    await mark();

    await highlight('.theme-dropdown', '深色模式　　整站主題，記在這個瀏覽器裡', { hold: 2600 });
    await P.clickAt(page, '.theme-dropdown .theme-icon-wrap', { settle: 700 });
    const dark = page.locator('[role="option"], .dropdown-option', { hasText: /深色|Dark/ }).first();
    if (await dark.count()) await P.clickAt(page, dark, { settle: 2400 });

    await P.smoothScroll(page, 200, { steps: 20 });
    await page.waitForTimeout(800);

    await highlight('ui-prefs-selector', '三個語系　　繁中・港中・英文，各自帶自己的地區', { hold: 2600 });
    await P.clickAt(page, 'ui-prefs-selector .lang-icon-wrap', { settle: 700 });
    const english = page.locator('[role="option"], .dropdown-option', { hasText: /English/ }).first();
    if (await english.count()) await P.clickAt(page, english, { settle: 2400 });
  },
};

// ────────────────────────────────────────────────────────────────── cleanup

/**
 * Undo what the previous run left in the database.
 *
 * Left in place, last run's listing, order, conversation and waitlist
 * subscription all show up in this run's footage — a duplicate listing on the
 * shelf, a "you are already waiting" banner where the shot needs an unpressed
 * button. Skipped rather than guessed when UNIBOOKS_BE_DIR is unset: this
 * repository does not sit beside the backend, and a wrong path would report a
 * cleanup that did nothing.
 */
function cleanBackendData() {
  console.log('\n🧹 Clearing what the last recording left behind…');
  if (!cfg.BE_DIR) {
    console.warn('⚠️  UNIBOOKS_BE_DIR is not set, so the cleanup is being skipped.');
    console.warn('   The recording will run against whatever state the database is in,');
    console.warn('   and may show leftovers from the previous run.');
    return;
  }

  const script = `
from listings.models import Listing
from orders.models import Order
from messaging.models import Conversation
from subscriptions.models import Subscription
from accounts.models import User

buyer = User.objects.filter(email=${JSON.stringify(cfg.BUYER.email)}).first()
if buyer:
    Order.objects.filter(buyer=buyer).delete()
    Order.objects.filter(listing__seller=buyer).delete()
    Conversation.objects.filter(buyer=buyer).delete()
    # The other side too. Threads where the demo account is the seller are not
    # created by this script, but they outlive the listings they refer to and
    # sit in the inbox during the chat scene, still captioned with a book that
    # is no longer on sale.
    Conversation.objects.filter(listing__seller=buyer).delete()
    Listing.objects.filter(seller=buyer, book__title__icontains=${JSON.stringify(cfg.SELL.titleFragment)}).delete()
    Subscription.objects.filter(user=buyer, book__isbn13=${JSON.stringify(cfg.BUY.waitlistIsbn)}).delete()
    print('cleaned up after', buyer.email)
else:
    print('no such user; nothing to clean')
`;

  try {
    execFileSync(cfg.BE_PYTHON, ['manage.py', 'shell', '-c', script], {
      cwd: cfg.BE_DIR,
      stdio: 'inherit',
    });
  } catch (err) {
    console.warn(`⚠️  Cleanup did not complete: ${err.message}`);
  }
}

// ───────────────────────────────────────────────────────────────────── main

async function main() {
  cfg.ensureDirs();

  // Shoot everything, or just the scene ids named on the command line.
  const args = process.argv.slice(2);
  const requested = args.filter((a) => !a.startsWith('-'));
  const entries = timeline.entries.filter(
    (e) => e.kind === 'scene' && (requested.length === 0 || requested.includes(e.id)),
  );

  if (entries.length === 0 && !args.includes('--clean')) {
    console.error(`No scenes matched. Known scenes:\n  ${timeline.sceneIds.join('\n  ')}`);
    process.exit(1);
  }

  // A full run always cleans. Naming scenes does not, because re-shooting one
  // take should not wipe the state the others were shot against — but then
  // re-shooting the chat scene four times leaves four identical exchanges
  // stacked up in the thread, which is what --clean is for.
  if (requested.length === 0 || args.includes('--clean')) cleanBackendData();
  if (entries.length === 0) return;

  console.log(`\n🎥 Recording ${entries.length} scene(s) against ${cfg.BASE_URL}`);
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const entry of entries) {
      results.push(await shoot(browser, entry));
    }
  } finally {
    await browser.close();
  }

  // Merge into any manifest already there, so re-shooting one scene does not
  // discard the takes that were fine.
  const manifestPath = path.join(cfg.SCENE_DIR, 'scenes.json');
  const previous = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
  for (const r of results) previous[r.id] = r;
  fs.writeFileSync(manifestPath, `${JSON.stringify(previous, null, 2)}\n`);

  const failed = results.filter((r) => r.failed);
  console.log(`\n📁 ${cfg.SCENE_DIR}`);
  if (failed.length) {
    console.log(`\n⚠️  ${failed.length} scene(s) failed; their footage is kept but will look wrong:`);
    for (const f of failed) console.log(`   ${f.id}: ${f.error}`);
    console.log(`\n   Re-shoot just those with:  npm run record -- ${failed.map((f) => f.id).join(' ')}`);
  } else {
    console.log('\n✓ All scenes recorded.');
  }
}

main().catch((err) => {
  console.error('Recording failed:', err);
  process.exit(1);
});
