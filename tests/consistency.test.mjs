import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORK_ORDER_STATES, CAPABILITY_STATUSES } from '../src/schemas/schemas.mjs';
import { buildSchemaDocument } from '../scripts/export-schemas.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('templates use the canonical state vocabulary, not legacy names', () => {
  const wo = read('templates/WORK-ORDER.md');
  const sr = read('templates/SESSION-REPORT.md');
  for (const s of ['PLANNED', 'READY', 'IN_PROGRESS', 'READY_FOR_REVIEW', 'DONE', 'FAIL', 'CANCELLED']) {
    assert.ok(wo.includes(s), `WORK-ORDER template missing canonical state ${s}`);
  }
  for (const legacy of ['ACTIVE |', '| REVIEW |', 'WAITING_FOR_PROVIDER', 'REVIEW_REQUIRED', 'HUMAN_GATE', '| STOPPED', 'STOPPED`']) {
    assert.ok(!wo.includes(legacy), `WORK-ORDER template still contains legacy state token: ${legacy}`);
    assert.ok(!sr.includes(legacy), `SESSION-REPORT template still contains legacy state token: ${legacy}`);
  }
  assert.ok(sr.includes('WAIT_PROVIDER'), 'SESSION-REPORT must use canonical WAIT_PROVIDER');
});

test('docs use canonical states consistently', () => {
  for (const doc of ['docs/HERMES-SUPERVISOR.md', 'docs/ARCHITECTURE.md', 'README.md', 'AGENTS.md']) {
    const text = read(doc);
    for (const legacy of ['WAITING_FOR_PROVIDER', 'REVIEW_REQUIRED', 'HUMAN_GATE`']) {
      assert.ok(!text.includes(legacy), `${doc} contains non-canonical state ${legacy}`);
    }
  }
  const hermes = read('docs/HERMES-SUPERVISOR.md');
  for (const s of WORK_ORDER_STATES) {
    assert.ok(hermes.includes(s), `docs/HERMES-SUPERVISOR.md missing canonical state ${s}`);
  }
});

test('spec/state-machine.json states equal the schema enum exactly', () => {
  const spec = JSON.parse(read('spec/state-machine.json'));
  assert.deepEqual(Object.keys(spec.states).sort(), [...WORK_ORDER_STATES].sort());
});

test('exported JSON Schema document is not stale', () => {
  const onDisk = JSON.parse(read('spec/schemas/records.schema.json'));
  assert.deepEqual(onDisk, buildSchemaDocument(), 'run: npm run export-schemas');
});

test('CAPABILITIES.md exists, uses the closed status vocabulary, and never rates above evidence', () => {
  const text = read('CAPABILITIES.md');
  const rows = text.split('\n').filter((l) => l.startsWith('|') && !l.startsWith('|---') && !l.includes('Capability |'));
  assert.ok(rows.length >= 10, 'capability inventory should be substantive');
  for (const row of rows) {
    const cells = row.split('|').map((c) => c.trim());
    const status = cells[2];
    if (!status) continue;
    assert.ok(CAPABILITY_STATUSES.includes(status), `invalid capability status '${status}' in row: ${row}`);
    if (status === 'IMPLEMENTED' || status === 'OPERATIONAL') {
      const evidence = cells[4] ?? '';
      assert.ok(evidence && evidence !== '—' && evidence !== '-', `capability rated ${status} without evidence: ${row}`);
    }
  }
});

test('EN and DE READMEs describe the same architecture and the same honest routing caveat', () => {
  const en = read('README.md');
  const de = read('README.de.md');
  for (const term of ['Hermes Supervisor', 'DeepSeek Harness', 'OmniRoute']) {
    assert.ok(en.includes(term), `README.md missing ${term}`);
    assert.ok(de.includes(term), `README.de.md missing ${term}`);
  }
  assert.match(en, /free-preferred, not a hard \$0|not a hard \$0 guarantee/i);
  assert.match(de, /kein (mathematisch )?garantiertes 0-?\$|keine harte 0-?\$/i);
  assert.match(en, /CAPABILITIES\.md/);
  assert.match(de, /CAPABILITIES\.md/);
});

test('required threat-model and change-propagation docs exist and cover mandated content', () => {
  const tm = read('docs/THREAT-MODEL.md');
  for (const t of ['malicious prompt', 'approval replay', 'TOCTOU', 'authority collapse', 'secret leakage', 'stale memory', 'poisoned evidence', 'corrupted durable state']) {
    assert.ok(tm.toLowerCase().includes(t.toLowerCase()), `THREAT-MODEL.md missing threat: ${t}`);
  }
  const cp = read('docs/CHANGE-PROPAGATION.md');
  for (const t of ['CAPABILITIES.md', 'tests', 'session checkpoint', 'security']) {
    assert.ok(cp.toLowerCase().includes(t.toLowerCase()), `CHANGE-PROPAGATION.md missing: ${t}`);
  }
});

test('no committed secrets or env files', () => {
  assert.ok(!fs.existsSync(path.join(root, '.env')));
  assert.ok(!fs.existsSync(path.join(root, 'config/.env')));
  const envExample = read('config/.env.example');
  assert.match(envExample, /no authentication|not authentication|loopback/i, '.env.example must warn that the dummy key is not authentication');
});

test('R2-08: hero asset must not claim unimplemented features (capability contract applies to marketing art)', () => {
  const hero = read('assets/free-autonomous-engineering-setup-hero.svg');
  const forbiddenLabels = [
    /observab/i, /auto[- ]?merge/i, /sandbox/i, /web access/i,
    /logs\s*·\s*traces\s*·\s*metrics/i, /traces/i, /metrics/i,
    /gpt-\d/i, /claude/i, /gemini/i, /qwen/i, /llama/i, /deepseek-v\d/i,
  ];
  for (const re of forbiddenLabels) {
    assert.doesNotMatch(hero, re, `hero must not claim dynamic/unimplemented capability matching ${re}`);
  }
});
