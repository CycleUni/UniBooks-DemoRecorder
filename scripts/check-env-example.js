// .env.example is the only account of how to configure this tool, and nothing
// fails when it drifts: an undocumented variable simply takes its default, so
// the first sign is a recording that behaves differently from the one someone
// else produced. Worse for UNIBOOKS_BE_DIR, whose absence silently skips the
// cleanup — the failure mode is a video with stale data in it.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'record.js'), 'utf8');
const example = fs.readFileSync(path.join(root, '.env.example'), 'utf8');

const read = [...new Set([...script.matchAll(/process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g)].map(m => m[1]))].sort();
const declared = [...example.matchAll(/^([A-Za-z_][A-Za-z0-9_]*)=/gm)].map(m => m[1]);
const withValues = [...example.matchAll(/^([A-Za-z_][A-Za-z0-9_]*)=(.+)$/gm)].map(m => m[1]);

const problems = [];

// Guards the scan itself: a regex that matched nothing would make every
// check below pass regardless of what the file says.
if (read.length < 5) problems.push(`only found ${read.length} process.env reads — the scan is probably broken`);

const missing = read.filter(name => !declared.includes(name));
if (missing.length) problems.push(`not documented in .env.example: ${missing.join(', ')}`);

const duplicates = [...new Set(declared.filter(n => declared.filter(x => x === n).length > 1))];
if (duplicates.length) problems.push(`declared more than once: ${duplicates.join(', ')}`);

// A value here is one a deployment inherits by copying the file unread.
if (withValues.length) problems.push(`should list key names only, but these carry values: ${withValues.join(', ')}`);

if (problems.length) {
  for (const p of problems) console.error(`✗ ${p}`);
  process.exit(1);
}
console.log(`✓ .env.example covers all ${read.length} variables: ${read.join(', ')}`);
