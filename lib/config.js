/**
 * Everything environment-specific, resolved in one place.
 *
 * Two rules here, both learned the hard way:
 *
 *   Paths to other checkouts get no default. This repository does not sit
 *   beside UniBooks-BE, and a guessed path is how a cleanup reports success
 *   having cleaned nothing.
 *
 *   The *content* of the recording does get defaults, because they describe
 *   the seeded development database this is shot against, and a run that
 *   silently picks a different book produces a video where the narration and
 *   the footage disagree. Override them when the data changes; see README.
 */

const path = require('path');
const fs = require('fs');

const BASE_URL = (process.env.DEMO_BASE_URL || 'http://localhost:4200').replace(/\/$/, '');
const REGION = process.env.DEMO_REGION || 'tw';

const OUTPUT_DIR = path.resolve(
  process.env.DEMO_OUTPUT_DIR || path.join(__dirname, '..', 'demo_videos'),
);
const RAW_DIR = path.join(OUTPUT_DIR, 'raw');
const SCENE_DIR = path.join(OUTPUT_DIR, 'scenes');
const CARD_DIR = path.join(OUTPUT_DIR, 'cards');
const WORK_DIR = path.join(OUTPUT_DIR, 'work');

const FFMPEG = process.env.FFMPEG_BIN || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_BIN || 'ffprobe';

const BE_DIR = process.env.UNIBOOKS_BE_DIR || '';
const BE_PYTHON = process.env.UNIBOOKS_BE_PYTHON || '.venv/bin/python';

/** The account the camera follows: lists a book, then buys a different one. */
const BUYER = {
  email: process.env.DEMO_EMAIL || 'test@test.com',
  password: process.env.DEMO_PASSWORD || 'Password123!',
};

/**
 * The counterparty. Driven in a second, unrecorded browser so a reply can
 * arrive in the buyer's open chat window — the only way to show on camera that
 * the messaging is live rather than polled on reload.
 */
const SELLER = {
  email: process.env.DEMO_SELLER_EMAIL || 'demo_tw_seller2@test.com',
  password: process.env.DEMO_SELLER_PASSWORD || 'demopassword',
};

/**
 * What gets listed in the seller act. Chosen because the lookup resolves it to
 * a real title, author *and* cover art: the shot is about metadata appearing
 * on its own, and an ISBN that comes back without a cover lands on the
 * unjacketed-board placeholder instead, which reads as a failed lookup.
 */
const SELL = {
  isbn: process.env.DEMO_SELL_ISBN || '9780132350884',
  titleFragment: process.env.DEMO_SELL_TITLE || 'Clean Code',
  course: process.env.DEMO_SELL_COURSE || '軟體工程',
  professor: process.env.DEMO_SELL_PROFESSOR || '林教授',
  price: process.env.DEMO_SELL_PRICE || '380',
};

/**
 * What gets bought in the buyer act.
 *
 * The search term is deliberately the one whose results page shows both states
 * at once: a book with a seller and a price, and a book with nobody selling and
 * people waiting. That single frame is the argument for the waitlist, so the
 * later waitlist shot stays in the same search rather than teleporting to an
 * unrelated title.
 */
const BUY = {
  query: process.env.DEMO_SEARCH_QUERY || 'Calculus',
  isbn: process.env.DEMO_TARGET_ISBN || '9781285741550',
  titleFragment: process.env.DEMO_TARGET_TITLE || 'Early Transcendentals',
  waitlistIsbn: process.env.DEMO_WAITLIST_ISBN || '9780486404530',
};

/** What the buyer types into the chat, and what the seller answers. */
const CHAT = {
  buyerMessage: process.env.DEMO_CHAT_BUYER || '學長好，這本微積分今天下午在總圖可以面交嗎？',
  sellerReply: process.env.DEMO_CHAT_SELLER || '可以喔，我三點在總圖一樓，書況近全新',
};

function regionUrl(pathname = '') {
  const clean = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${BASE_URL}/${REGION}${clean === '/' ? '' : clean}`;
}

function ensureDirs() {
  for (const dir of [OUTPUT_DIR, RAW_DIR, SCENE_DIR, CARD_DIR, WORK_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

module.exports = {
  BASE_URL,
  REGION,
  OUTPUT_DIR,
  RAW_DIR,
  SCENE_DIR,
  CARD_DIR,
  WORK_DIR,
  FFMPEG,
  FFPROBE,
  BE_DIR,
  BE_PYTHON,
  BUYER,
  SELLER,
  SELL,
  BUY,
  CHAT,
  regionUrl,
  ensureDirs,
};
