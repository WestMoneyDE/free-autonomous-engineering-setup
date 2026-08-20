import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AssuranceStore, ApprovalError } from '../src/policy/approval.mjs';
import { proposalDigest } from '../src/evidence/hashing.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'faes-appr-'));
const proposal = { action: 'git_push', target: 'origin/main', parameters: { branch: 'feat/x' }, work_order_id: 'WO-1' };
const scope = 'repo-publish:origin/main';

function approvedSetup(clockRef = { t: 1_000_000 }) {
  const store = new AssuranceStore(tmp(), { now: () => clockRef.t });
  const digest = proposalDigest(proposal);
  store.request({ id: 'req-1', proposal_digest: digest, action: proposal.action, target: proposal.target, scope, requested_by: 'supervisor' });
  const decision = store.decide('req-1', { decision: 'APPROVED', decided_by: 'human:founder', decided_by_role: 'human', ttlSeconds: 600 });
  return { store, digest, decision, clockRef };
}

test('approval binds the exact proposal digest', () => {
  const { store, digest, decision } = approvedSetup();
  assert.ok(store.validateForExecution(decision.id, digest, scope));
});

test('changed target/content after approval is denied (digest mismatch)', () => {
  const { store, decision } = approvedSetup();
  const mutated = proposalDigest({ ...proposal, parameters: { branch: 'feat/x', force: true } });
  assert.throws(() => store.validateForExecution(decision.id, mutated, scope), (e) => e.code === 'DIGEST_MISMATCH');
});

test('scope mismatch is denied', () => {
  const { store, digest, decision } = approvedSetup();
  assert.throws(() => store.validateForExecution(decision.id, digest, 'production:cluster-1'), (e) => e.code === 'SCOPE_MISMATCH');
});

test('expired approval is denied with half-open semantics (invalid AT expiry tick)', () => {
  const { store, digest, decision, clockRef } = approvedSetup();
  clockRef.t += 600_000 - 1;
  assert.ok(store.validateForExecution(decision.id, digest, scope), 'one ms before expiry still valid');
  clockRef.t += 1;
  assert.throws(() => store.validateForExecution(decision.id, digest, scope), (e) => e.code === 'EXPIRED');
});

test('consumed one-shot approval cannot be replayed', () => {
  const { store, digest, decision } = approvedSetup();
  store.consume(decision.id, digest, scope);
  assert.throws(() => store.validateForExecution(decision.id, digest, scope), (e) => e.code === 'CONSUMED');
  assert.throws(() => store.consume(decision.id, digest, scope), (e) => e.code === 'CONSUMED');
});

test('rejected approval never validates', () => {
  const store = new AssuranceStore(tmp());
  const digest = proposalDigest(proposal);
  store.request({ id: 'req-1', proposal_digest: digest, action: proposal.action, target: proposal.target, scope, requested_by: 'supervisor' });
  const d = store.decide('req-1', { decision: 'REJECTED', decided_by: 'human:founder', decided_by_role: 'human' });
  assert.throws(() => store.validateForExecution(d.id, digest, scope), (e) => e.code === 'REJECTED');
});

test('non-human actors cannot decide approvals (capability is not authority)', () => {
  const store = new AssuranceStore(tmp());
  const digest = proposalDigest(proposal);
  store.request({ id: 'req-1', proposal_digest: digest, action: proposal.action, target: proposal.target, scope, requested_by: 'supervisor' });
  for (const role of ['supervisor', 'builder', 'reviewer', 'security-reviewer']) {
    assert.throws(() => store.decide('req-1', { decision: 'APPROVED', decided_by: `x:${role}`, decided_by_role: role }), (e) => e instanceof ApprovalError && e.code === 'NOT_HUMAN');
  }
});

test('consumption state survives restart (no replay after crash)', () => {
  const dir = tmp();
  const clock = { t: 1_000_000 };
  const store = new AssuranceStore(dir, { now: () => clock.t });
  const digest = proposalDigest(proposal);
  store.request({ id: 'req-1', proposal_digest: digest, action: proposal.action, target: proposal.target, scope, requested_by: 'supervisor' });
  const d = store.decide('req-1', { decision: 'APPROVED', decided_by: 'human:founder', decided_by_role: 'human', ttlSeconds: 600 });
  store.consume(d.id, digest, scope);
  const store2 = new AssuranceStore(dir, { now: () => clock.t });
  assert.throws(() => store2.consume(d.id, digest, scope), (e) => e.code === 'CONSUMED', 'consumption must persist across restart');
});
