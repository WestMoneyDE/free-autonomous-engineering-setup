import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORK_ORDER_STATES, CAPABILITY_STATUSES, SCOPE_VERDICTS } from '../src/schemas/schemas.mjs';
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

test('exported JSON Schema includes scope runtime enums and records', () => {
  const schema = buildSchemaDocument();
  assert.deepEqual(schema.$defs.enums.scopeVerdicts, SCOPE_VERDICTS);
  assert.ok(schema.$defs.ScopeContract);
  assert.ok(schema.$defs.ScopeDecision);
});

test('scope schema expressible constraints reject the same adversarial values as runtime', () => {
  const schema = buildSchemaDocument().$defs.ScopeContract;
  const pathPattern = new RegExp(schema.properties.include_paths.items.pattern, 'u');
  const timestampPattern = new RegExp(schema.properties.valid_from.pattern, 'u');
  const trimmedPattern = new RegExp(schema.properties.project.pattern, 'u');
  assert.equal(pathPattern.test('src/**x'), false);
  assert.equal(pathPattern.test('../src/**'), false);
  assert.equal(timestampPattern.test('2026-08-21 00:00:00Z'), false);
  assert.equal(timestampPattern.test('2026-08-21T01:00:00+01:00'), true);
  assert.equal(trimmedPattern.test(' project'), false);
  assert.equal(trimmedPattern.test('project '), false);
  assert.ok(schema.properties.roles.items.enum.includes('builder'));
  assert.ok(!schema.properties.roles.items.enum.includes('invented-role'));
  assert.ok(schema.properties.memory_kinds.items.enum.includes('semantic'));
  assert.ok(schema.properties.retention_classes.items.enum.includes('project'));
});

test('scope schema names runtime-only cross-field invariants', () => {
  const annotations = buildSchemaDocument().$defs.ScopeContract['x-runtime-invariants'];
  assert.deepEqual(annotations, ['parameter_bounds.min<=max', 'valid_from<valid_until', 'timestamp-calendar-validity']);
  assert.deepEqual(buildSchemaDocument().$defs.ScopeDecision['x-runtime-invariants'], ['digest=sha256(canonicalJson(effective))', 'null-effective-digest=sha256(canonicalJson(null))']);
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

test('repository exposes the complete canonical runtime contract', () => {
  for (const file of ['.agents/manifest.json', '.skills/security-review-with-strix/SKILL.md', '.commands/scope-check.md', '.claude/README.md']) assert.ok(fs.existsSync(path.join(root, file)));
  const publicText = ['README.md', 'README.de.md', 'CAPABILITIES.md'].map(read).join('\n');
  assert.match(publicText, /Ömer Coskun/);
  assert.match(publicText, /Autonomous Engineering Reference (Architecture )?V1/);
});

test('public docs state identity lineage capabilities and security non-claims', () => {
  const files = ['README.md', 'README.de.md', 'CAPABILITIES.md', 'docs/ARCHITECTURE.md', 'docs/THREAT-MODEL.md'];
  const text = files.map(read).join('\n');
  for (const marker of ['Ömer Coskun', 'https://www.linkedin.com/in/oemer-coskun53', 'Autonomous Engineering Reference V1', 'Memory Factory', 'Scope Engine', '2cc816781438f2993bcbb5c8cf3f693c25380142', 'Apache-2.0']) assert.ok(text.includes(marker), `missing ${marker}`);
  assert.match(text, /written (target )?authorization/i);
  assert.match(text, /no real Strix (scan|execution)|Strix.*NOT_EXECUTED/i);
  assert.match(text, /unattended continuous operation.*NOT_CLAIMED|NOT_CLAIMED.*unattended continuous operation/i);
});

test('demo exercises the scoped memory loop without assurance or Strix', () => {
  const demo = read('examples/demo-project/run-demo.mjs');
  for (const symbol of ['intersectScopes', 'scopeDecision', 'scope_digest', 'MemoryFactory', '.retrieve(', '.project(', 'READY_FOR_REVIEW', 'DONE']) assert.ok(demo.includes(symbol), `demo missing ${symbol}`);
  assert.doesNotMatch(demo, /new AssuranceStore/);
  assert.doesNotMatch(demo, /spawn.*strix|exec.*strix/i);
});
