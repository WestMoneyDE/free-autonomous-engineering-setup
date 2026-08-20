#!/usr/bin/env node
// Bootstrap the durable state layout for a supervised project.
// Safety properties (tested):
//  - DRY-RUN BY DEFAULT: without --apply nothing is written;
//  - NEVER overwrites an existing file;
//  - idempotent: a second --apply run changes nothing and reports so.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const targetFlag = args.indexOf('--target');
const target = targetFlag >= 0 ? args[targetFlag + 1] : '.';
if (!target || target.startsWith('--')) {
  console.error('Usage: node scripts/init-project.mjs [--target PATH] [--apply]');
  process.exit(2);
}

const root = path.resolve(target);
const now = new Date().toISOString();

const plan = [
  { p: 'brain/STATE.json', content: JSON.stringify({ project: path.basename(root), status: 'PLANNED', active_work_order: null, branch: 'main', blocker: null, next_action: 'author a work order from templates/WORK-ORDER.md', updated_at: now, schema_version: 1 }, null, 2) + '\n' },
  { p: 'CURRENT-WORK-ORDER.md', content: '# Current work order\n\nNone active. Author one from `templates/WORK-ORDER.md` and set `brain/STATE.json` to `READY` via the supervisor.\n' },
  { p: '.state/tasks/README.md', content: '# tasks\nVersioned work-order records (canonical states: see spec/state-machine.json).\n' },
  { p: '.state/sessions/README.md', content: '# sessions\nDurable session checkpoints (templates/SESSION-REPORT.md).\n' },
  { p: '.state/evidence/README.md', content: '# evidence\nAppend-only evidence ledger records and manifests.\n' },
  { p: '.state/decisions/README.md', content: '# decisions\nAccepted decisions with evidence pointers.\n' },
  { p: '.state/memory/README.md', content: '# memory\nDurable memory fabric records (proposal-side only; can never mint authority).\n' },
  { p: '.state/assurance/README.md', content: '# assurance\nApprovals, consumed one-shot grants, policy versions. SEPARATE ownership boundary: never writable through memory APIs or general agent file writes.\n' },
  { p: '.state/local/.gitignore', content: '# scratch space; everything here is disposable and never project truth\n*\n!.gitignore\n' },
];

let wrote = 0;
let skipped = 0;
for (const item of plan) {
  const dest = path.join(root, item.p);
  if (fs.existsSync(dest)) {
    console.log(`SKIP (exists): ${item.p}`);
    skipped++;
    continue;
  }
  if (!apply) {
    console.log(`WOULD CREATE: ${item.p}`);
    continue;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, item.content, { flag: 'wx' }); // wx: fail rather than overwrite (race-safe)
  console.log(`CREATED: ${item.p}`);
  wrote++;
}

if (!apply) {
  console.log('\nDRY RUN — nothing was written. Re-run with --apply to create the layout.');
} else {
  console.log(`\nDone. Created ${wrote} file(s), skipped ${skipped} existing.`);
}
