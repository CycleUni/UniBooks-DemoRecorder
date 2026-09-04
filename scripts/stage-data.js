/**
 * Hides the load-test fixture from the camera, reversibly.
 *
 * The development database this is shot against contains a performance
 * fixture — one book, "Sample Book 1", with a few thousand listings, almost
 * all owned by the demo account, illustrated with a stock photograph of a
 * field. UniBooks-BE's own seed_homepage_demo.py docstring calls out why that
 * one exists and why it is the wrong shape for anything user-facing: on the
 * home page it renders as "660 本上架中" for what is really one person, which
 * reads as fake data. On camera it is worse than fake — it is the first tile
 * a viewer sees.
 *
 * So before a shoot the fixture's listings are set to `removed`, which takes
 * them out of every feed without deleting a row, and afterwards they are put
 * back exactly as they were.
 *
 * "Exactly as they were" is the reason this writes a backup file rather than
 * restoring by filter. The fixture's rows are spread across active, reserved
 * and sold; a restore that flipped everything back to `active` would quietly
 * rewrite the state of ~2600 listings that were never active to begin with.
 *
 *   node scripts/stage-data.js hide      before recording
 *   node scripts/stage-data.js restore   after
 *
 * Requires UNIBOOKS_BE_DIR, for the same reason the recorder's cleanup does:
 * this repository does not sit beside the backend, and a guessed path is how
 * you get a report of success from a command that touched nothing.
 */

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const cfg = require('../lib/config');

/** Which listings to hide. Matches the fixture and nothing else. */
const FIXTURE_TITLE = process.env.DEMO_FIXTURE_TITLE || 'Sample Book';

const BACKUP = path.join(__dirname, '..', '.staged-listings.json');

function shell(script) {
  return execFileSync(cfg.BE_PYTHON, ['manage.py', 'shell', '-c', script], {
    cwd: cfg.BE_DIR,
    encoding: 'utf8',
  });
}

function requireBackend() {
  if (!cfg.BE_DIR) {
    console.error('UNIBOOKS_BE_DIR is not set, so there is no backend to stage.');
    console.error('Point it at a UniBooks-BE checkout and try again.');
    process.exit(1);
  }
}

function hide() {
  if (fs.existsSync(BACKUP)) {
    console.error(`${BACKUP} already exists — the fixture is already hidden.`);
    console.error('Run `node scripts/stage-data.js restore` first if you want to re-stage.');
    process.exit(1);
  }

  const out = shell(`
import json
from listings.models import Listing

qs = Listing.objects.filter(book__title__icontains=${JSON.stringify(FIXTURE_TITLE)})
before = {str(pk): status for pk, status in qs.values_list('id', 'status')}
qs.update(status='removed')
print('---JSON---')
print(json.dumps(before))
`);

  const json = out.split('---JSON---')[1];
  if (!json) throw new Error(`Could not read the backup back from manage.py:\n${out}`);
  const before = JSON.parse(json.trim());

  fs.writeFileSync(BACKUP, `${JSON.stringify(before, null, 0)}\n`);
  const counts = Object.values(before).reduce((acc, s) => ({ ...acc, [s]: (acc[s] || 0) + 1 }), {});
  console.log(`Hid ${Object.keys(before).length} "${FIXTURE_TITLE}" listings:`, counts);
  console.log(`Their previous statuses are in ${path.basename(BACKUP)}.`);
}

function restore() {
  if (!fs.existsSync(BACKUP)) {
    console.error(`No ${path.basename(BACKUP)} — nothing was staged, so there is nothing to restore.`);
    process.exit(1);
  }
  const before = JSON.parse(fs.readFileSync(BACKUP, 'utf8'));

  const out = shell(`
import json
from listings.models import Listing

before = json.loads(${JSON.stringify(JSON.stringify(before))})
restored = 0
for status in set(before.values()):
    ids = [pk for pk, s in before.items() if s == status]
    restored += Listing.objects.filter(id__in=ids).update(status=status)
print('restored', restored)
`);

  process.stdout.write(out);
  fs.unlinkSync(BACKUP);
  console.log(`Removed ${path.basename(BACKUP)}.`);
}

const mode = process.argv[2];
requireBackend();

if (mode === 'hide') hide();
else if (mode === 'restore') restore();
else {
  console.error('Usage: node scripts/stage-data.js hide|restore');
  process.exit(1);
}
