/**
 * The edit, as data.
 *
 * This is the single source of truth for the finished film: what appears, in
 * what order, for how long, and how each piece enters. `record.js` reads it to
 * know which scenes to shoot; `build-video.js` reads it to assemble them.
 * Keeping one list means the two cannot drift — a scene added here without a
 * recorder implementation fails loudly rather than silently dropping out of
 * the cut.
 *
 * Two kinds of entry:
 *
 *   card   A still rendered from cards/<id>.html by render-cards.js. `duration`
 *          is exactly what it holds on screen.
 *
 *   scene  A browser recording produced by the scene function of the same name
 *          in record.js. `duration` is its length *in the cut*; the raw take is
 *          longer and gets sped up to fit. `speedHint` is what that speed factor
 *          is expected to land near, and is what the scene function paces itself
 *          against — it shoots for roughly `duration * speedHint` seconds of real
 *          time. build-video.js does not trust the hint: it measures the take and
 *          derives the true factor, warning when the two disagree badly enough
 *          that the take probably needs re-shooting rather than re-timing.
 *
 * Two optional fields sit on top of that:
 *
 *   badge      A corner label held for the whole shot, naming whose screen this
 *              is. The film follows one account through two opposite roles and
 *              then a conversation with a second person; without a standing
 *              marker, "who am I watching" is left to be inferred from which
 *              page happens to be open.
 *
 *   highlights Not declared here — the recorder measures them. A scene calls
 *              highlight() on the element its shot is actually about, and the
 *              box and label are drawn over the footage at the edit. See
 *              record.js.
 *
 * The hints are measured, not chosen. A first pass set them by eye — 2.2 for
 * form-filling, on the theory that nobody needs to watch a course name typed
 * out — and every one of those scenes came back with less footage than its
 * slot, which build-video.js would have had to fill by playing it in slow
 * motion. What the numbers below actually say is that a browser being driven
 * deliberately, with eased pointer travel and a beat on each result, is not
 * far off the pace a viewer can follow.
 */

const TRANSITIONS = {
  // Between the three pain cards: quick, so they land as one beat rather than
  // three separate statements.
  beat: { type: 'fade', duration: 0.5 },
  // Card to footage and back. Slower — this is a change of register.
  chapter: { type: 'fade', duration: 0.7 },
  // Between shots inside one flow. A horizontal wipe reads as a page turning,
  // which is the whole visual vocabulary of the product.
  page: { type: 'wipeleft', duration: 0.5 },
  // The last dissolve, into the closing card.
  close: { type: 'fade', duration: 0.8 },
};

const entries = [
  // ── Open ────────────────────────────────────────────────────────────────
  { kind: 'card', id: '01-brand', duration: 7, motion: 'push-in' },

  // ── The problem ─────────────────────────────────────────────────────────
  { kind: 'card', id: '02-pain-1', duration: 5, transition: TRANSITIONS.beat },
  { kind: 'card', id: '03-pain-2', duration: 5, transition: TRANSITIONS.beat },
  { kind: 'card', id: '04-pain-3', duration: 5, transition: TRANSITIONS.beat },

  // ── The claim, then the product itself ──────────────────────────────────
  { kind: 'card', id: '05-solution', duration: 5, transition: TRANSITIONS.chapter, motion: 'push-in' },
  { kind: 'scene', id: 's01_home_hero', duration: 8, speedHint: 1.2, transition: TRANSITIONS.chapter },

  // ── Act one: the seller ─────────────────────────────────────────────────
  { kind: 'card', id: '06-chapter-seller', duration: 4, transition: TRANSITIONS.chapter },
  { kind: 'scene', id: 's02_sell_isbn', duration: 10, speedHint: 1.4, badge: '賣家視角 · Test User', transition: TRANSITIONS.chapter },
  // Money shot: an ISBN resolving into a real title, author and cover art.
  // Plays at close to real speed or it stops reading as a lookup.
  { kind: 'scene', id: 's03_sell_autofill', duration: 7, speedHint: 1.15, badge: '賣家視角 · Test User', transition: TRANSITIONS.page },
  { kind: 'scene', id: 's04_sell_details', duration: 8, speedHint: 1.4, badge: '賣家視角 · Test User', transition: TRANSITIONS.page },
  { kind: 'scene', id: 's05_sell_publish', duration: 9, speedHint: 1.2, badge: '賣家視角 · Test User', transition: TRANSITIONS.page },

  // ── Act two: the buyer ──────────────────────────────────────────────────
  { kind: 'card', id: '07-chapter-buyer', duration: 4, transition: TRANSITIONS.chapter },
  { kind: 'scene', id: 's06_search', duration: 9, speedHint: 1.4, badge: '買家視角 · Test User', transition: TRANSITIONS.chapter },
  { kind: 'scene', id: 's07_book_detail', duration: 8, speedHint: 1.3, badge: '買家視角 · Test User', transition: TRANSITIONS.page },
  // Money shot: the seller's reply arrives in the buyer's open window with no
  // reload. Slowing this down would throw away the only evidence of it.
  { kind: 'scene', id: 's08_chat', duration: 12, speedHint: 1.3, badge: '買家視角 · Test User', transition: TRANSITIONS.page },
  { kind: 'scene', id: 's09_meetup', duration: 8, speedHint: 1.3, badge: '買家視角 · Test User', transition: TRANSITIONS.page },
  { kind: 'scene', id: 's10_order_loop', duration: 9, speedHint: 1.2, badge: '買家視角 · Test User', transition: TRANSITIONS.page },

  // ── Act three: what makes it a platform ─────────────────────────────────
  { kind: 'card', id: '08-chapter-platform', duration: 4, transition: TRANSITIONS.chapter },
  { kind: 'scene', id: 's11_verified', duration: 7, speedHint: 1.2, transition: TRANSITIONS.chapter },
  { kind: 'scene', id: 's12_waitlist', duration: 7, speedHint: 1.3, transition: TRANSITIONS.page },
  { kind: 'scene', id: 's13_theme_lang', duration: 12, speedHint: 1.3, transition: TRANSITIONS.page },

  // ── Close ───────────────────────────────────────────────────────────────
  { kind: 'card', id: '09-tech', duration: 9, transition: TRANSITIONS.chapter },
  { kind: 'card', id: '10-outro', duration: 7, transition: TRANSITIONS.close, motion: 'push-in' },
];

/** Every scene id the recorder is expected to produce, in shooting order. */
const sceneIds = entries.filter((e) => e.kind === 'scene').map((e) => e.id);

/** Every card id render-cards.js is expected to rasterise. */
const cardIds = entries.filter((e) => e.kind === 'card').map((e) => e.id);

/**
 * Runtime of the finished cut. Each transition overlaps the two clips it
 * joins, so it is paid for once out of the total rather than added to it.
 */
function totalDuration() {
  const sum = entries.reduce((acc, e) => acc + e.duration, 0);
  const overlap = entries.reduce((acc, e) => acc + (e.transition ? e.transition.duration : 0), 0);
  return sum - overlap;
}

module.exports = {
  fps: 30,
  width: 1920,
  height: 1080,
  entries,
  sceneIds,
  cardIds,
  totalDuration,
  TRANSITIONS,
};
