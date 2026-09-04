// .env.example is the only account of how to configure this tool, and nothing
// fails when it drifts: an undocumented variable simply takes its default, so
// the first sign is a recording that behaves differently from the one someone
// else produced. Worse for UNIBOOKS_BE_DIR, whose absence silently skips the
// cleanup — the failure mode is a video with stale data in it.
//
// The scan walks every script in the repository rather than record.js alone.
// It used to read that one file, which was true while it was the whole tool;
// once configuration moved into lib/config.js the check would have gone on
// passing while describing nothing, which is the failure it exists to catch.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const SKIP = new Set(['node_modules', 'demo_videos', '.git', '.github']);

/** Every .js file in the repository, except this one. */
function sources(dir = root) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...sources(full));
    else if (entry.name.endsWith('.js') && full !== __filename) found.push(full);
  }
  return found;
}

const files = sources();
const example = fs.readFileSync(path.join(root, '.env.example'), 'utf8');

const read = new Set();
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(/process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g)) read.add(m[1]);
}
const names = [...read].sort();

const declared = [...example.matchAll(/^([A-Za-z_][A-Za-z0-9_]*)=/gm)].map((m) => m[1]);
const withValues = [...example.matchAll(/^([A-Za-z_][A-Za-z0-9_]*)=(.+)$/gm)].map((m) => m[1]);

const problems = [];

// Guards the scan itself: a regex that matched nothing, or a file walk that
// found nothing, would make every check below pass regardless of the contents.
if (files.length < 5) problems.push(`only found ${files.length} scripts — the file walk is probably broken`);
if (names.length < 5) problems.push(`only found ${names.length} process.env reads — the scan is probably broken`);

const missing = names.filter((name) => !declared.includes(name));
if (missing.length) problems.push(`not documented in .env.example: ${missing.join(', ')}`);

// The reverse matters too: a key documented long after the code stopped
// reading it is an instruction to set something that does nothing.
const unused = declared.filter((name) => !read.has(name));
if (unused.length) problems.push(`documented but no longer read by any script: ${unused.join(', ')}`);

const duplicates = [...new Set(declared.filter((n) => declared.filter((x) => x === n).length > 1))];
if (duplicates.length) problems.push(`declared more than once: ${duplicates.join(', ')}`);

// A value here is one a deployment inherits by copying the file unread.
if (withValues.length) problems.push(`should list key names only, but these carry values: ${withValues.join(', ')}`);

if (problems.length) {
  for (const p of problems) console.error(`✗ ${p}`);
  process.exit(1);
}
console.log(`✓ .env.example covers all ${names.length} variables read across ${files.length} scripts`);
