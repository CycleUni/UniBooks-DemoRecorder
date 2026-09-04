/**
 * The whole thing, in order: cards, takes, edit.
 *
 * Each step is also runnable on its own, and usually should be — re-rendering
 * ten cards to fix a typo does not require re-shooting thirteen browser
 * recordings, and re-cutting does not require either. This exists for the run
 * where nothing is cached yet.
 */

const { execFileSync } = require('child_process');
const path = require('path');

const steps = [
  ['Rendering title cards', 'render-cards.js'],
  ['Recording scenes', 'record.js'],
  ['Cutting the film', 'build-video.js'],
];

for (const [label, script] of steps) {
  console.log(`\n${'─'.repeat(64)}\n${label}\n${'─'.repeat(64)}`);
  try {
    execFileSync(process.execPath, [path.join(__dirname, script)], { stdio: 'inherit' });
  } catch {
    // The child has already explained itself on stderr; adding a stack trace
    // from this wrapper would only bury it.
    console.error(`\n${label} failed. Fix that, then re-run this step on its own.`);
    process.exit(1);
  }
}
