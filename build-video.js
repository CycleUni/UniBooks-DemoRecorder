/**
 * The edit: cards and takes in, one film out.
 *
 * Runs in two passes, deliberately.
 *
 * Pass one normalises every entry in timeline.js into its own clip of exactly
 * the length the edit calls for, all sharing a frame rate, a pixel format, a
 * size and a sample aspect ratio. Cards become clips by holding a still (with
 * a slow push where the timeline asks for one); takes become clips by having
 * their setup trimmed off the front and then being sped up to fit.
 *
 * Pass two joins those clips with a single xfade chain. Doing it in one graph
 * rather than pairwise means the film is encoded once instead of once per
 * transition, and every crossfade is computed from clips whose durations are
 * already known exactly — which is what makes the offsets arithmetic instead
 * of guesswork.
 *
 * The speed factor for a take is measured, never assumed. timeline.js carries
 * a `speedHint` so the recorder knows roughly how much footage to shoot, but
 * what actually gets applied is (real footage length ÷ length in the cut). If
 * those two disagree badly the take is reported rather than quietly stretched:
 * a shot that has to run at 4x was not a pacing problem, it was a scene that
 * sat waiting on something.
 */

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const cfg = require('./lib/config');
const timeline = require('./timeline');

const FPS = timeline.fps;
const W = timeline.width;
const H = timeline.height;

/** Beyond these the footage, not the timing, is the thing to fix. */
const SPEED_FLOOR = 0.7;
const SPEED_CEILING = 3.2;

function run(bin, args) {
  return execFileSync(bin, args, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 64 });
}

/**
 * ffmpeg, quietened.
 *
 * Its default progress line rewrites itself hundreds of times per encode; with
 * stderr inherited that buries the per-clip speed report this script exists to
 * show. `-loglevel error -nostats` keeps real problems and drops the rest.
 */
function encode(args) {
  execFileSync(cfg.FFMPEG, ['-loglevel', 'error', '-nostats', ...args], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
}

/** Length of a media file, in seconds. */
function probeDuration(file) {
  const out = run(cfg.FFPROBE, [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    file,
  ]);
  const seconds = parseFloat(out.trim());
  if (!Number.isFinite(seconds)) throw new Error(`Could not read a duration from ${file}`);
  return seconds;
}

/**
 * Shared tail of every clip filter: lock geometry and format so xfade can join
 * them. The pixel format is applied separately, at the very end of a chain,
 * because anything overlaid on top arrives as RGBA and converting twice costs
 * a generation of colour for nothing.
 */
const GEOMETRY = `fps=${FPS},scale=${W}:${H}:flags=lanczos,setsar=1`;
const NORMALISE = `${GEOMETRY},format=yuv420p`;

/** How long a caption is given on screen, however briefly the take held it. */
const MIN_CAPTION_SECONDS = 2.4;
/** Fade in and out of every highlight, so nothing pops. */
const OVERLAY_FADE = 0.35;

/**
 * Place a recorded highlight on the cut's timeline.
 *
 * The recorder measures in raw seconds since its context opened; the clip that
 * reaches the film has had its setup trimmed off and has been sped up. Both
 * have to be undone to know when the box should appear.
 *
 * The minimum is the reason this is not a straight conversion. A caption is
 * held for as long as the take rested on the element, and that hold gets
 * divided by the speed factor along with everything else — so a three-second
 * pause becomes two seconds on screen at 1.5x, which is not long enough to
 * read a sentence. Extending forward is safe: the take is still resting on the
 * same element for a moment afterwards.
 */
function placeHighlights(highlights, { markIn, speed, duration }) {
  const placed = [];

  for (const h of highlights) {
    let start = (h.startRaw - markIn) / speed;
    let end = (h.endRaw - markIn) / speed;
    if (start >= duration) continue;

    start = Math.max(0, start);
    end = Math.max(end, start + MIN_CAPTION_SECONDS);
    end = Math.min(end, duration);
    if (end - start < 0.5) continue;

    placed.push({ ...h, start, end });
  }

  // Two boxes on screen at once would each be dimming the other's target.
  for (let i = 0; i < placed.length - 1; i++) {
    placed[i].end = Math.min(placed[i].end, placed[i + 1].start - 0.15);
  }

  return placed.filter((h) => h.end - h.start >= 0.5);
}

/**
 * A card clip.
 *
 * Where the timeline asks for motion, the still is upscaled before zoompan and
 * brought back down after. Zooming a 1920-wide source directly makes the type
 * crawl between whole pixels — visible as a shimmer on exactly the thin
 * hairlines and serifs the cards are built out of.
 */
function buildCardClip(entry) {
  const src = path.join(cfg.CARD_DIR, `${entry.id}.png`);
  if (!fs.existsSync(src)) {
    throw new Error(`Missing card image ${src} — run \`npm run cards\` first.`);
  }
  const out = path.join(cfg.WORK_DIR, `${entry.id}.mp4`);
  const frames = Math.round(entry.duration * FPS);

  const filter =
    entry.motion === 'push-in'
      ? `scale=${W * 2}:${H * 2}:flags=lanczos,` +
        `zoompan=z='min(1+0.00055*on,1.055)':d=${frames}` +
        `:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=${FPS},` +
        `setsar=1,format=yuv420p`
      : NORMALISE;

  const args =
    entry.motion === 'push-in'
      ? ['-y', '-i', src, '-vf', filter, '-frames:v', String(frames)]
      : ['-y', '-loop', '1', '-t', String(entry.duration), '-i', src, '-vf', filter];

  encode([...args, '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-an', out]);
  return out;
}

/**
 * A take, trimmed past its setup and fitted to its slot in the cut.
 */
function buildSceneClip(entry, manifest) {
  const record = manifest[entry.id];
  if (!record) {
    throw new Error(`No recording for scene ${entry.id} — run \`npm run record -- ${entry.id}\`.`);
  }
  if (!fs.existsSync(record.file)) {
    throw new Error(`Recording for ${entry.id} is listed but missing: ${record.file}`);
  }

  const rawDuration = probeDuration(record.file);
  const markIn = Math.max(0, Math.min(record.markIn || 0, rawDuration - 0.5));
  const usable = rawDuration - markIn;

  if (usable <= 0.5) {
    throw new Error(
      `${entry.id} has ${usable.toFixed(1)}s of footage after its setup — nothing to cut with.`,
    );
  }

  const speed = usable / entry.duration;
  const note =
    speed > SPEED_CEILING
      ? '  ⚠️  faster than intended; the take is probably waiting on something'
      : speed < SPEED_FLOOR
        ? '  ⚠️  slower than real time; the take is shorter than its slot'
        : '';
  console.log(
    `  ${entry.id}: ${usable.toFixed(1)}s of footage → ${entry.duration}s ` +
      `(${speed.toFixed(2)}x, hint ${entry.speedHint || 1})${note}`,
  );

  const out = path.join(cfg.WORK_DIR, `${entry.id}.mp4`);

  const base =
    `[0:v]trim=start=${markIn.toFixed(3)},setpts=PTS-STARTPTS,` +
    `setpts=PTS/${speed.toFixed(6)},` +
    `${GEOMETRY},` +
    // Second trim is the one that guarantees the slot length: rounding in the
    // speed change can leave a few frames either side, and xfade offsets are
    // computed from the timeline, not from what the encoder happened to emit.
    `trim=duration=${entry.duration},setpts=PTS-STARTPTS`;

  const overlays = [];
  if (entry.badge) {
    const png = path.join(cfg.OVERLAY_DIR, `badge-${entry.id}.png`);
    if (!fs.existsSync(png)) {
      throw new Error(`${entry.id} declares a badge but ${png} is missing — run \`npm run overlays\`.`);
    }
    // No fade: the badge is meant to stand through a whole act, and fading it
    // at every cut would make it blink between shots of the same act.
    overlays.push({ png, filter: 'format=rgba' });
  }

  const placed = placeHighlights(record.highlights || [], {
    markIn,
    speed,
    duration: entry.duration,
  });
  placed.forEach((h, i) => {
    const png = path.join(cfg.OVERLAY_DIR, `highlight-${entry.id}-${i}.png`);
    if (!fs.existsSync(png)) {
      throw new Error(`${entry.id} recorded a highlight but ${png} is missing — run \`npm run overlays\`.`);
    }
    const fade = Math.min(OVERLAY_FADE, (h.end - h.start) / 3);
    overlays.push({
      png,
      // The alpha envelope is the whole schedule: zero before the box is due,
      // zero after, so no `enable` expression is needed to hide it.
      filter:
        `format=rgba,` +
        `fade=in:st=${h.start.toFixed(3)}:d=${fade.toFixed(3)}:alpha=1,` +
        `fade=out:st=${(h.end - fade).toFixed(3)}:d=${fade.toFixed(3)}:alpha=1`,
    });
    console.log(`    ↳ "${h.label.split('　　')[0]}" ${h.start.toFixed(1)}s–${h.end.toFixed(1)}s`);
  });

  const steps = [`${base}[base]`];
  let label = 'base';
  overlays.forEach((o, i) => {
    const src = `${i + 1}:v`;
    steps.push(`[${src}]${o.filter}[o${i}]`);
    steps.push(`[${label}][o${i}]overlay=0:0:format=auto[v${i}]`);
    label = `v${i}`;
  });
  steps.push(`[${label}]format=yuv420p[out]`);

  const inputs = ['-i', record.file];
  for (const o of overlays) inputs.push('-loop', '1', '-t', String(entry.duration), '-i', o.png);

  encode([
    '-y', ...inputs,
    '-filter_complex', steps.join(';'),
    '-map', '[out]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-an',
    out,
  ]);
  return out;
}

/**
 * Join the clips, crossfading each into the last.
 *
 * A transition overlaps the two clips it joins, so it is subtracted from the
 * running total rather than added: each xfade starts `transition.duration`
 * before the outgoing clip would otherwise have ended.
 */
function assemble(clips) {
  const inputs = [];
  for (const clip of clips) inputs.push('-i', clip.file);

  const steps = [];
  let label = '0:v';
  let elapsed = clips[0].entry.duration;

  for (let i = 1; i < clips.length; i++) {
    const { entry } = clips[i];
    const t = entry.transition || timeline.TRANSITIONS.chapter;
    const offset = elapsed - t.duration;
    const next = `v${i}`;
    steps.push(
      `[${label}][${i}:v]xfade=transition=${t.type}:duration=${t.duration}:offset=${offset.toFixed(3)}[${next}]`,
    );
    label = next;
    elapsed = offset + entry.duration;
  }

  const out = path.join(cfg.OUTPUT_DIR, 'unibooks_showcase.mp4');
  console.log(`\n🎬 Joining ${clips.length} clips (${elapsed.toFixed(1)}s)…`);

  encode([
    '-y',
    ...inputs,
    '-filter_complex', steps.join(';'),
    '-map', `[${label}]`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-r', String(FPS),
    '-movflags', '+faststart',
    out,
  ]);

  return { out, expected: elapsed };
}

function main() {
  cfg.ensureDirs();

  const manifestPath = path.join(cfg.SCENE_DIR, 'scenes.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};

  const stale = Object.values(manifest).filter((r) => r.failed);
  if (stale.length) {
    console.warn(`\n⚠️  ${stale.length} scene(s) failed when recorded and will look wrong in the cut:`);
    for (const s of stale) console.warn(`   ${s.id}: ${s.error}`);
  }

  console.log('\n✂️  Preparing clips…');
  const clips = timeline.entries.map((entry) => ({
    entry,
    file: entry.kind === 'card' ? buildCardClip(entry) : buildSceneClip(entry, manifest),
  }));

  const { out, expected } = assemble(clips);
  const actual = probeDuration(out);

  const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  console.log(`\n✓ ${out}`);
  console.log(`  ${mmss(actual)} (${actual.toFixed(1)}s), timeline called for ${mmss(expected)}`);
  console.log(`  ${(fs.statSync(out).size / 1024 / 1024).toFixed(1)} MB`);
}

try {
  main();
} catch (err) {
  console.error(`\nEdit failed: ${err.message}`);
  process.exit(1);
}
