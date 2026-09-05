/**
 * The edit, as data — measured in bars.
 *
 * This is the single source of truth for the finished film: what appears, in
 * what order, for how long, and how each piece enters. `record.js` reads it to
 * know which scenes to shoot; `build-video.js` reads it to assemble them.
 * Keeping one list means the two cannot drift — a scene added here without a
 * recorder implementation fails loudly rather than silently dropping out of
 * the cut.
 *
 * ── Why bars and not seconds ──────────────────────────────────────────────
 *
 * The film is cut to a 115 BPM track with a strict eight-bar phrase structure,
 * and a cut that lands a third of a second off the beat is more noticeable
 * than one that is nowhere near it. Lengths are therefore given in bars, and
 * the seconds are derived. Every cut lands on a bar line by construction
 * rather than by being nudged there afterwards.
 *
 * The track's own structure sets three of the numbers below:
 *
 *   bar 1    the riser ends and the band comes in, under the opening card
 *   bar 33   the arrangement drops to a quiet passage for eight bars
 *   bar 41   it comes back
 *   bar 73   it begins winding down
 *   bar 78   silence
 *
 * So the buyer act opens on the drop; searching runs through the quiet passage
 * at almost real speed, which is the only place in the film a shot gets to
 * breathe; and the arrangement comes back on the cut to the book's real seller
 * and real price. Those are the alignments worth having, and the rest of the
 * numbers follow from them rather than the other way round.
 *
 * ── Kinds of entry ────────────────────────────────────────────────────────
 *
 *   card   A still rendered from cards/<id>.html by render-cards.js.
 *
 *   scene  A browser recording produced by the scene function of the same name
 *          in record.js. Its slot is what it occupies in the cut; the raw take
 *          is longer and gets sped up to fit. `speedHint` is what that factor
 *          is expected to land near, and is what the scene function paces
 *          itself against. build-video.js does not trust the hint: it measures
 *          the take and derives the true factor, warning when the two disagree
 *          badly enough that the take wants re-shooting rather than re-timing.
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

/** The track the cut is built against. See lib/config.js for its path. */
const MUSIC = {
  bpm: 115,
  beatsPerBar: 4,
};

const BAR = (60 / MUSIC.bpm) * MUSIC.beatsPerBar; // 2.0870s

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
  { kind: 'card', id: '01-brand', bars: 3, motion: 'push-in' },

  // ── The problem ─────────────────────────────────────────────────────────
  { kind: 'card', id: '02-pain-1', bars: 2, transition: TRANSITIONS.beat },
  { kind: 'card', id: '03-pain-2', bars: 2, transition: TRANSITIONS.beat },
  { kind: 'card', id: '04-pain-3', bars: 2, transition: TRANSITIONS.beat },

  // ── The claim, then the product itself ──────────────────────────────────
  { kind: 'card', id: '05-solution', bars: 2, transition: TRANSITIONS.chapter, motion: 'push-in' },
  { kind: 'scene', id: 's01_home_hero', bars: 4, speedHint: 1.2, transition: TRANSITIONS.chapter },

  // ── Act one: the seller ─────────────────────────────────────────────────
  { kind: 'card', id: '06-chapter-seller', bars: 2, transition: TRANSITIONS.chapter },
  { kind: 'scene', id: 's02_sell_isbn', bars: 4, speedHint: 1.5, badge: '賣家視角 · Test User', transition: TRANSITIONS.chapter },
  // Money shot: an ISBN resolving into a real title, author and cover art.
  // Plays at close to real speed or it stops reading as a lookup.
  { kind: 'scene', id: 's03_sell_autofill', bars: 4, speedHint: 1.25, badge: '賣家視角 · Test User', transition: TRANSITIONS.page },
  { kind: 'scene', id: 's04_sell_details', bars: 4, speedHint: 1.4, badge: '賣家視角 · Test User', transition: TRANSITIONS.page },
  { kind: 'scene', id: 's05_sell_publish', bars: 4, speedHint: 1.2, badge: '賣家視角 · Test User', transition: TRANSITIONS.page },

  // ── Act two: the buyer ──────────────────────────────────────────────────
  { kind: 'card', id: '07-chapter-buyer', bars: 2, transition: TRANSITIONS.chapter },
  { kind: 'scene', id: 's06_search', bars: 6, speedHint: 1.4, badge: '買家視角 · Test User', transition: TRANSITIONS.chapter },
  { kind: 'scene', id: 's07_book_detail', bars: 4, speedHint: 1.3, badge: '買家視角 · Test User', transition: TRANSITIONS.page },
  // Money shot: the seller's reply arrives in the buyer's open window with no
  // reload. Slowing this down would throw away the only evidence of it.
  { kind: 'scene', id: 's08_chat', bars: 5, speedHint: 1.3, badge: '買家視角 · Test User', transition: TRANSITIONS.page },
  { kind: 'scene', id: 's09_meetup', bars: 4, speedHint: 1.3, badge: '買家視角 · Test User', transition: TRANSITIONS.page },
  { kind: 'scene', id: 's10_order_loop', bars: 3, speedHint: 1.2, badge: '買家視角 · Test User', transition: TRANSITIONS.page },

  // ── Act three: what makes it a platform ─────────────────────────────────
  { kind: 'card', id: '08-chapter-platform', bars: 2, transition: TRANSITIONS.chapter },
  { kind: 'scene', id: 's11_verified', bars: 3, speedHint: 1.2, transition: TRANSITIONS.chapter },
  { kind: 'scene', id: 's12_waitlist', bars: 3, speedHint: 1.3, transition: TRANSITIONS.page },
  { kind: 'scene', id: 's13_theme_lang', bars: 5, speedHint: 1.3, transition: TRANSITIONS.page },

  // ── Close ───────────────────────────────────────────────────────────────
  { kind: 'card', id: '09-tech', bars: 4, transition: TRANSITIONS.chapter },
  { kind: 'card', id: '10-outro', bars: 4, transition: TRANSITIONS.close, motion: 'push-in' },
];

/**
 * Turn the bar counts into the seconds the rest of the tool works in.
 *
 * `slot` is what an entry occupies on the timeline. `duration` is the clip
 * that has to be rendered for it, which is a transition longer than its slot
 * because a crossfade overlaps the two clips it joins — the outgoing clip has
 * to still have frames while the incoming one fades up over them.
 */
let cursor = 0;
for (let i = 0; i < entries.length; i++) {
  const e = entries[i];
  const next = entries[i + 1];
  e.slot = e.bars * BAR;
  e.startsAt = cursor;
  e.startsAtBar = Math.round(cursor / BAR);
  e.duration = e.slot + (next && next.transition ? next.transition.duration : 0);
  cursor += e.slot;
}

/** Every scene id the recorder is expected to produce, in shooting order. */
const sceneIds = entries.filter((e) => e.kind === 'scene').map((e) => e.id);

/** Every card id render-cards.js is expected to rasterise. */
const cardIds = entries.filter((e) => e.kind === 'card').map((e) => e.id);

/** Runtime of the finished cut: the grid, and nothing else. */
function totalDuration() {
  return entries.reduce((acc, e) => acc + e.slot, 0);
}

module.exports = {
  fps: 30,
  MUSIC,
  BAR,
  width: 1920,
  height: 1080,
  entries,
  sceneIds,
  cardIds,
  totalDuration,
  TRANSITIONS,
};
