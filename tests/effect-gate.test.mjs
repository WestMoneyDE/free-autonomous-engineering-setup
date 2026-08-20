import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EffectGate } from '../src/policy/effect-gate.mjs';
import { registerDefaultEffects, clearRegistryForTests, registerEffect } from '../src/policy/effect-registry.mjs';
import { AssuranceStore } from '../src/policy/approval.mjs';
import { Executor, ExecutionError } from '../src/policy/executor.mjs';
import { EventStore } from '../src/state/event-store.mjs';
import { proposalDigest } from '../src/evidence/hashing.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'faes-gate-'));

function setup(clockRef = { t: 1_000_000 }) {
  clearRegistryForTests();
  registerDefaultEffects();
  const assurance = new AssuranceStore(tmp(), { now: () => clockRef.t });
  const gate = new EffectGate({ assurance, now: () => clockRef.t });
  const store = new EventStore(tmp());
  const executor = new Executor({ gate, assurance, store, now: () => clockRef.t });
  return { assurance, gate, executor, store, clockRef };
}

const mkProposal = (over = {}) => ({
  id: 'ep-1', work_order_id: 'WO-1', proposed_by: 'builder:worker-a', action: 'git_push', target: 'origin/main',
  parameters: { branch: 'feat/x' }, evidence_refs: ['ev-1'], created_at: new Date().toISOString(), ...over,
});

function approve(assurance, proposal, scope, ttlSeconds = 600) {
  const digest = proposalDigest(proposal);
  assurance.request({ id: `req-${proposal.id}`, proposal_digest: digest, action: proposal.action, target: proposal.target, scope, requested_by: 'supervisor' });
  return assurance.decide(`req-${proposal.id}`, { decision: 'APPROVED', decided_by: 'human:founder', decided_by_role: 'human', ttlSeconds });
}

test('unknown effect kind is denied (fail closed)', () => {
  const { gate } = setup(); const v = gate.evaluate(mkProposal({ action: 'launch_rocket' }));
  assert.equal(v.verdict, 'DENY'); assert.match(v.reason, /unknown effect kind/);
});

test('structurally invalid proposal is denied', () => {
  const { gate } = setup(); const v = gate.evaluate({ id: 'x', action: 'git_push' });
  assert.equal(v.verdict, 'DENY'); assert.match(v.reason, /structural validation failed/);
});

test('model cannot downgrade externality/risk (strictest wins); external action without approval defers', () => {
  const { gate } = setup();
  const v = gate.evaluate(mkProposal({ claimed_externality: 'internal', claimed_risk: 'LOW', claimed_reversibility: 'reversible' }));
  assert.equal(v.verdict, 'DEFER'); assert.match(v.reason, /human approval required/);
});

test('model claims CAN tighten: internal action claimed external requires approval', () => {
  const { gate } = setup();
  const v = gate.evaluate(mkProposal({ action: 'edit_file', target: 'src/a.mjs', parameters: { path: 'src/a.mjs' }, claimed_externality: 'external' }));
  assert.equal(v.verdict, 'DEFER');
});

test('internal reversible low-risk action is allowed without approval', () => {
  const { gate } = setup(); const v = gate.evaluate(mkProposal({ action: 'run_tests', target: 'tests/', parameters: {} }));
  assert.equal(v.verdict, 'ALLOW'); assert.ok(v.gate_nonce);
});

test('constitutionally forbidden actions are denied even WITH a human approval', () => {
  const { gate, assurance } = setup(); const p = mkProposal({ action: 'exfiltrate_secret', target: '.env', parameters: {} });
  const d = approve(assurance, p, 'forbidden:.env'); const v = gate.evaluate(p, { approvalId: d.id });
  assert.equal(v.verdict, 'DENY'); assert.match(v.reason, /forbidden effect class/);
  for (const action of ['disable_safety_control', 'self_grant_authority']) assert.equal(gate.evaluate(mkProposal({ action, target: 'x', parameters: {} })).verdict, 'DENY');
});

test('valid approval yields ALLOW; wrong approval yields DENY', () => {
  const { gate, assurance } = setup(); const p = mkProposal(); const d = approve(assurance, p, 'repo-publish:origin/main');
  assert.equal(gate.evaluate(p, { approvalId: d.id }).verdict, 'ALLOW');
  const p2 = mkProposal({ id: 'ep-2', parameters: { branch: 'feat/y' } });
  assert.equal(gate.evaluate(p2, { approvalId: d.id }).verdict, 'DENY');
});

test('REPAIR is not execution permission: repaired proposal must re-enter the gate', () => {
  const { gate, executor } = setup();
  const p = mkProposal({ action: 'send_message', target: 'user@example.org', parameters: { body: 'x'.repeat(30000) } });
  const v = gate.evaluate(p); assert.equal(v.verdict, 'REPAIR'); assert.ok(v.repairHint);
  assert.throws(() => executor.execute(p, v, () => ({ outcome: 'SUCCESS' })), (e) => e.code === 'NOT_ALLOWED');
  const repaired = mkProposal({ id: 'ep-1r', action: 'send_message', target: 'user@example.org', parameters: { body: 'short' } });
  assert.equal(gate.evaluate(repaired).verdict, 'DEFER');
});

test('expired proposal is denied', () => {
  const clockRef = { t: Date.parse('2026-08-20T12:00:00Z') }; const { gate } = setup(clockRef);
  const v = gate.evaluate(mkProposal({ action: 'run_tests', target: 't', parameters: {}, expires_at: '2026-08-20T11:59:59Z' }));
  assert.equal(v.verdict, 'DENY'); assert.match(v.reason, /expired/);
});

test('bounded evaluation: budget exhaustion falls back only to a registered baseline, else denies', () => {
  clearRegistryForTests(); registerDefaultEffects(); const assurance = new AssuranceStore(tmp()); const tightGate = new EffectGate({ assurance, evaluationBudget: 2 });
  const withBaseline = tightGate.evaluate(mkProposal({ action: 'run_tests', target: 't', parameters: {} }));
  assert.equal(withBaseline.verdict, 'FALLBACK'); assert.equal(withBaseline.fallback_baseline, 'report_not_run');
  const noBaseline = tightGate.evaluate(mkProposal()); assert.equal(noBaseline.verdict, 'DENY'); assert.match(noBaseline.reason, /offline by design/);
});

test('executor: no direct worker->world path — only ALLOW verdicts with a live nonce execute, exactly once', () => {
  const { gate, assurance, executor } = setup(); const p = mkProposal(); const d = approve(assurance, p, 'repo-publish:origin/main'); const v = gate.evaluate(p, { approvalId: d.id });
  let effects = 0; const result = executor.execute(p, v, () => { effects++; return { outcome: 'SUCCESS' }; });
  assert.equal(result.outcome, 'SUCCESS'); assert.equal(effects, 1);
  assert.throws(() => executor.execute(p, v, () => ({ outcome: 'SUCCESS' })), (e) => e.code === 'NONCE_INVALID');
  assert.throws(() => executor.execute(p, { verdict: 'ALLOW', gate_nonce: 'deadbeef', proposal_digest: proposalDigest(p), scope: 'x' }, () => ({ outcome: 'SUCCESS' })), (e) => e.code === 'NONCE_INVALID');
  assert.equal(effects, 1);
});

test('executor: proposal mutation between gate and executor is caught', () => {
  const { gate, assurance, executor } = setup(); const p = mkProposal(); const d = approve(assurance, p, 'repo-publish:origin/main'); const v = gate.evaluate(p, { approvalId: d.id });
  assert.throws(() => executor.execute({ ...p, parameters: { branch: 'feat/x', force: true } }, v, () => ({ outcome: 'SUCCESS' })), (e) => e.code === 'DIGEST_MISMATCH');
});

test('OUTCOME_UNKNOWN blocks the scope until a human reconciles (UNKNOWN != NOT_EXECUTED)', () => {
  const { gate, assurance, executor } = setup(); const p = mkProposal(); const d = approve(assurance, p, 'repo-publish:origin/main'); const v = gate.evaluate(p, { approvalId: d.id });
  assert.equal(executor.execute(p, v, () => ({ outcome: 'UNKNOWN', detail: 'connection dropped mid-push' })).outcome, 'UNKNOWN');
  const p2 = mkProposal({ id: 'ep-2', parameters: { branch: 'feat/x2' } }); const d2 = approve(assurance, p2, 'repo-publish:origin/main'); const v2 = gate.evaluate(p2, { approvalId: d2.id });
  assert.throws(() => executor.execute(p2, v2, () => ({ outcome: 'SUCCESS' })), (e) => e.code === 'SCOPE_RESERVED');
  assert.throws(() => executor.reconcileUnknown('repo-publish:origin/main', 'FAIL', { actor: 'sup', role: 'supervisor' }), (e) => e.code === 'NOT_HUMAN');
  executor.reconcileUnknown('repo-publish:origin/main', 'FAIL', { actor: 'human:founder', role: 'human' });
});

test('one-shot: a FAILED occurrence is never auto-rerun (same digest refused)', () => {
  const { gate, assurance, executor } = setup(); const p = mkProposal(); const d = approve(assurance, p, 'repo-publish:origin/main'); const v = gate.evaluate(p, { approvalId: d.id });
  const r = executor.execute(p, v, () => { throw new Error('remote rejected'); }); assert.equal(r.outcome, 'FAIL'); assert.equal(r.retried_automatically, false);
  const d2 = approve(assurance, p, 'repo-publish:origin/main'); const v2 = gate.evaluate(p, { approvalId: d2.id }); assert.equal(v2.verdict, 'ALLOW');
  assert.throws(() => executor.execute(p, v2, () => ({ outcome: 'SUCCESS' })), (e) => e.code === 'ALREADY_EXECUTED');
});

test('DEFER/DENY/FALLBACK verdicts cannot execute', () => {
  const { gate, executor } = setup(); const defer = gate.evaluate(mkProposal()); assert.equal(defer.verdict, 'DEFER');
  assert.throws(() => executor.execute(mkProposal(), defer, () => ({ outcome: 'SUCCESS' })), ExecutionError);
});

test('unknown forbidden class in a registry entry fails closed', () => {
  clearRegistryForTests(); registerDefaultEffects(); registerEffect({ action: 'weird_action', externality: 'internal', reversibility: 'reversible', capability_class: 'x', risk_class: 'LOW', requires_human_approval: false, forbidden_class: 'not-a-known-class' });
  const gate = new EffectGate({ assurance: new AssuranceStore(tmp()) }); assert.equal(gate.evaluate(mkProposal({ action: 'weird_action', target: 't', parameters: {} })).verdict, 'DENY');
});

test('occurrence guards are durable: after crash/restart the same digest is still refused and UNKNOWN reservations survive', () => {
  clearRegistryForTests(); registerDefaultEffects(); const assuranceDir = tmp(); const storeDir = tmp(); const clockRef = { t: 1_000_000 };
  const assurance = new AssuranceStore(assuranceDir, { now: () => clockRef.t }); const gate = new EffectGate({ assurance, now: () => clockRef.t }); const store = new EventStore(storeDir); const executor = new Executor({ gate, assurance, store, now: () => clockRef.t });
  const p = mkProposal(); const d = approve(assurance, p, 'repo-publish:origin/main'); const v = gate.evaluate(p, { approvalId: d.id }); executor.execute(p, v, () => ({ outcome: 'UNKNOWN', detail: 'network partition' }));
  const assurance2 = new AssuranceStore(assuranceDir, { now: () => clockRef.t }); const gate2 = new EffectGate({ assurance: assurance2, now: () => clockRef.t }); const executor2 = new Executor({ gate: gate2, assurance: assurance2, store: new EventStore(storeDir), now: () => clockRef.t });
  const d2 = approve(assurance2, p, 'repo-publish:origin/main'); const v2 = gate2.evaluate(p, { approvalId: d2.id }); assert.throws(() => executor2.execute(p, v2, () => ({ outcome: 'SUCCESS' })), (e) => e.code === 'ALREADY_EXECUTED');
  const p3 = mkProposal({ id: 'ep-3', parameters: { branch: 'feat/z' } }); const d3 = approve(assurance2, p3, 'repo-publish:origin/main'); const v3 = gate2.evaluate(p3, { approvalId: d3.id }); assert.throws(() => executor2.execute(p3, v3, () => ({ outcome: 'SUCCESS' })), (e) => e.code === 'SCOPE_RESERVED');
  executor2.reconcileUnknown('repo-publish:origin/main', 'FAIL', { actor: 'human:founder', role: 'human' });
  const executor3 = new Executor({ gate: gate2, assurance: assurance2, store: new EventStore(storeDir), now: () => clockRef.t }); assert.equal(executor3.unknownReservations.size, 0);
});

test('R2-01: write-ahead reservation precedes the side effect; a crash window replays as OUTCOME UNKNOWN', () => {
  clearRegistryForTests(); registerDefaultEffects(); const clockRef = { t: 1_000_000 }; const assuranceDir = tmp(); const storeDir = tmp();
  const assurance = new AssuranceStore(assuranceDir, { now: () => clockRef.t }); const gate = new EffectGate({ assurance, now: () => clockRef.t }); const store = new EventStore(storeDir); const executor = new Executor({ gate, assurance, store, now: () => clockRef.t });
  const p = mkProposal(); const d = approve(assurance, p, 'repo-publish:origin/main'); const v = gate.evaluate(p, { approvalId: d.id }); executor.execute(p, v, () => ({ outcome: 'SUCCESS' }));
  const events = store.all(); const reserveSeq = events.find((e) => e.type === 'external_execution_reserved')?.seq; const resultSeq = events.find((e) => e.type === 'external_execution')?.seq;
  assert.ok(reserveSeq); assert.ok(reserveSeq < resultSeq);
  const p2 = mkProposal({ id: 'ep-crash', parameters: { branch: 'feat/crash' } }); const digest2 = proposalDigest(p2);
  store.append({ type: 'external_execution_reserved', actor: 'executor', proposal_id: p2.id, proposal_digest: digest2, scope: 'repo-publish:origin/main', idempotency_key: `exec-reserve:${digest2}` });
  const assurance2 = new AssuranceStore(assuranceDir, { now: () => clockRef.t }); const gate2 = new EffectGate({ assurance: assurance2, now: () => clockRef.t }); const executor2 = new Executor({ gate: gate2, assurance: assurance2, store: new EventStore(storeDir), now: () => clockRef.t });
  const d2 = approve(assurance2, p2, 'repo-publish:origin/main'); const v2 = gate2.evaluate(p2, { approvalId: d2.id }); assert.throws(() => executor2.execute(p2, v2, () => ({ outcome: 'SUCCESS' })), (e) => e.code === 'ALREADY_EXECUTED');
  const p3 = mkProposal({ id: 'ep-3', parameters: { branch: 'feat/next' } }); const d3 = approve(assurance2, p3, 'repo-publish:origin/main'); const v3 = gate2.evaluate(p3, { approvalId: d3.id }); assert.throws(() => executor2.execute(p3, v3, () => ({ outcome: 'SUCCESS' })), (e) => e.code === 'SCOPE_RESERVED');
  executor2.reconcileUnknown('repo-publish:origin/main', 'NOT_EXECUTED', { actor: 'human:founder', role: 'human' });
});

test('R2-04: gate and permission engine are closed-coupled — a path the permission engine denies never gets a gate ALLOW', () => {
  clearRegistryForTests(); registerDefaultEffects(); const gate = new EffectGate({ assurance: new AssuranceStore(tmp()), repoRoot: '/repo' });
  const denies = ['.state/assurance/assurance.jsonl', '.env', '.ssh/id_rsa', '../outside/etc/passwd', 'secrets/prod.json'];
  for (const target of denies) for (const action of ['edit_file', 'read_file']) {
    const v = gate.evaluate(mkProposal({ id: `ep-${action}-${target}`, action, target, parameters: {} })); assert.equal(v.verdict, 'DENY'); assert.match(v.reason, /path policy denies/);
  }
  const ok = gate.evaluate(mkProposal({ id: 'ep-ok', action: 'edit_file', target: 'src/feature.mjs', parameters: { path: 'src/feature.mjs' } })); assert.equal(ok.verdict, 'ALLOW');
});
