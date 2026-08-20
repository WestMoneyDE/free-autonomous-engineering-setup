import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EvidenceLedger } from '../src/evidence/ledger.mjs';
import { sha256Hex, canonicalJson, proposalDigest } from '../src/evidence/hashing.mjs';
import { CHECK_OUTCOMES, EXECUTION_OUTCOMES } from '../src/schemas/schemas.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'faes-ev-'));

test('outcome enums keep FAIL, NOT_RUN, UNKNOWN and PASS distinct', () => {
  assert.ok(CHECK_OUTCOMES.includes('NOT_RUN'));
  assert.ok(CHECK_OUTCOMES.includes('UNKNOWN'));
  assert.ok(EXECUTION_OUTCOMES.includes('NOT_EXECUTED'));
  assert.ok(EXECUTION_OUTCOMES.includes('UNKNOWN'));
  assert.notEqual('UNKNOWN', 'NOT_EXECUTED');
});

test('completion gate: FAIL != PASS', () => {
  const l = new EvidenceLedger(tmp());
  l.record({ kind: 'test', work_order_id: 'WO-1', outcome: 'FAIL', actor: 'builder' });
  const r = l.supportsCompletion('WO-1', ['test']);
  assert.equal(r.ok, false);
  assert.deepEqual(r.unmet, ['test: FAIL']);
});

test('completion gate: NOT_RUN != PASS and missing evidence != PASS', () => {
  const l = new EvidenceLedger(tmp());
  l.record({ kind: 'test', work_order_id: 'WO-1', outcome: 'NOT_RUN', actor: 'builder', detail: 'runner unavailable in this environment' });
  assert.equal(l.supportsCompletion('WO-1', ['test']).ok, false);
  assert.equal(l.supportsCompletion('WO-1', ['security']).ok, false, 'absent evidence is never success');
});

test('completion gate: UNKNOWN is preserved and refuses completion', () => {
  const l = new EvidenceLedger(tmp());
  const rec = l.record({ kind: 'test', work_order_id: 'WO-1', outcome: 'UNKNOWN', actor: 'builder' });
  assert.equal(rec.outcome, 'UNKNOWN');
  assert.equal(l.all()[0].outcome, 'UNKNOWN', 'UNKNOWN survives the roundtrip unchanged');
  assert.equal(l.supportsCompletion('WO-1', ['test']).ok, false);
});

test('a later PASS supersedes chronologically; latest outcome governs', () => {
  const l = new EvidenceLedger(tmp());
  l.record({ kind: 'test', work_order_id: 'WO-1', outcome: 'FAIL', actor: 'builder' });
  l.record({ kind: 'test', work_order_id: 'WO-1', outcome: 'PASS', actor: 'builder' });
  assert.equal(l.supportsCompletion('WO-1', ['test']).ok, true);
});

test('invalid outcomes are rejected at the schema boundary', () => {
  const l = new EvidenceLedger(tmp());
  assert.throws(() => l.record({ kind: 'test', work_order_id: 'WO-1', outcome: 'SUCCESSISH', actor: 'builder' }));
});

test('hashes are deterministic and content-bound', () => {
  assert.equal(sha256Hex('abc'), sha256Hex('abc'));
  assert.notEqual(sha256Hex('abc'), sha256Hex('abd'));
  assert.equal(canonicalJson({ a: 1, b: { d: 2, c: 3 } }), canonicalJson({ b: { c: 3, d: 2 }, a: 1 }));
  const p1 = { action: 'x', target: 't', parameters: { a: 1, b: 2 }, work_order_id: 'w' };
  const p2 = { work_order_id: 'w', parameters: { b: 2, a: 1 }, target: 't', action: 'x' };
  assert.equal(proposalDigest(p1), proposalDigest(p2));
  assert.notEqual(proposalDigest(p1), proposalDigest({ ...p1, parameters: { a: 1, b: 3 } }));
});

test('ledger stores content hash, never raw content', () => {
  const l = new EvidenceLedger(tmp()); const secretish = 'output containing something private';
  const rec = l.record({ kind: 'test', work_order_id: 'WO-1', outcome: 'PASS', actor: 'builder' }, secretish);
  assert.equal(rec.content_sha256, sha256Hex(secretish));
  const raw = fs.readFileSync(path.join(l.dir, 'evidence.jsonl'), 'utf8');
  assert.ok(!raw.includes('something private'));
});

test('sha256 manifest covers files deterministically', () => {
  const dir = tmp(); const f = path.join(dir, 'artifact.txt'); fs.writeFileSync(f, 'hello'); const l = new EvidenceLedger(dir); const m = l.manifest([f]);
  assert.equal(m.files[0].sha256, sha256Hex('hello')); assert.equal(m.files[0].bytes, 5);
});

test('R2-02: work-order hash changes when budget_policy, routing_class or external_effects change', async () => {
  const { workOrderHash } = await import('../src/evidence/hashing.mjs');
  const wo = { id: 'WO-1', project: 'p', created_at: '2026-08-20T00:00:00Z', requested_by: 'human:x', objective: 'obj', scope: ['a'], out_of_scope: [], acceptance_criteria: ['c1'], verification_commands: ['npm test'], risk_class: 'LOW', routing_class: 'coding-free-preferred', budget_policy: 'hard-free', max_attempts: 3, independent_review_required: true, external_effects: [], version: 1 };
  const base = workOrderHash(wo);
  assert.notEqual(workOrderHash({ ...wo, budget_policy: 'premium-allowed' }), base);
  assert.notEqual(workOrderHash({ ...wo, routing_class: 'reasoning-hard' }), base);
  assert.notEqual(workOrderHash({ ...wo, external_effects: ['git_push'] }), base);
  assert.notEqual(workOrderHash({ ...wo, max_attempts: 99 }), base);
  assert.notEqual(workOrderHash({ ...wo, independent_review_required: false }), base);
  assert.equal(workOrderHash({ ...wo }), base);
});

test('R2-03: proposal digest binds the EXACT proposal — expires_at, evidence_refs and proposed_by included', () => {
  const p = { id: 'ep-1', work_order_id: 'WO-1', proposed_by: 'builder:a', action: 'git_push', target: 'origin/main', parameters: { branch: 'x' }, evidence_refs: ['ev-1'], created_at: '2026-08-20T00:00:00Z', expires_at: '2026-08-20T01:00:00Z' };
  const base = proposalDigest(p);
  assert.notEqual(proposalDigest({ ...p, expires_at: '2027-01-01T00:00:00Z' }), base);
  assert.notEqual(proposalDigest({ ...p, evidence_refs: ['ev-FAKE'] }), base);
  assert.notEqual(proposalDigest({ ...p, proposed_by: 'builder:evil' }), base);
  assert.notEqual(proposalDigest({ ...p, claimed_risk: 'LOW' }), base);
  assert.equal(proposalDigest({ ...p }), base);
});
