#!/usr/bin/env node
// End-to-end demo of one supervised work order:
//   PLANNED → READY → IN_PROGRESS → READY_FOR_REVIEW → DONE
// with dispatch guards, leases, structured worker returns, independent review
// and event-sourced crash-recoverable state. Runs against a throwaway
// directory; pass --keep to inspect the produced .state afterwards.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ProjectRegistry } from '../../src/supervisor/project-registry.mjs';
import { Dispatcher } from '../../src/supervisor/dispatcher.mjs';
import { LeaseManager } from '../../src/supervisor/lease-manager.mjs';
import { EventStore } from '../../src/state/event-store.mjs';
import { EvidenceLedger } from '../../src/evidence/ledger.mjs';
import { workOrderHash } from '../../src/evidence/hashing.mjs';
import { acceptWorkerReturn, acceptReviewVerdict } from '../../src/workers/contracts.mjs';
import { evaluateProposal } from '../../src/supervisor/state-machine.mjs';
import { validateWorkOrder } from '../../src/schemas/schemas.mjs';

const keep = process.argv.includes('--keep');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'faes-demo-'));
const project = 'demo';
const log = (step, detail) => console.log(`\n== ${step} ==\n${detail}`);

const registry = new ProjectRegistry(root);
registry.register(project);

const workOrder = validateWorkOrder({
  id: 'WO-0001',
  project,
  created_at: new Date().toISOString(),
  requested_by: 'human:founder',
  objective: 'Add a friendly greeting function with a deterministic test',
  scope: ['src/greet.mjs', 'tests/greet.test.mjs'],
  out_of_scope: ['any external action'],
  acceptance_criteria: ['greet("world") === "hello, world"', 'test passes'],
  verification_commands: ['node --test tests/greet.test.mjs'],
  risk_class: 'LOW',
  routing_class: 'coding-free-preferred',
  budget_policy: 'free-preferred',
  max_attempts: 3,
  independent_review_required: true,
  external_effects: [],
  version: 1,
});
const woHash = workOrderHash(workOrder);
registry.activateWorkOrder(project, workOrder.id);
log('WORK ORDER', `${workOrder.id}: ${workOrder.objective}\nhash ${woHash}`);

registry.transition(project, 'work_order_completed', { guards: { work_order_valid: true }, actor: 'supervisor' });
log('STATE', JSON.stringify(registry.state(project)));

const store = new EventStore(path.join(root, project, '.state'));
const leases = new LeaseManager({ store });
const dispatcher = new Dispatcher({ leases, store });
const packet = dispatcher.dispatch({ project, workOrder, expectedHash: woHash, state: 'READY', workerClass: 'builder', actor: 'builder:worker-a' });
registry.transition(project, 'dispatch_builder', { guards: { lease_acquired: true, work_order_hash_matches: true, budget_policy_valid: true }, actor: 'supervisor' });
log('DISPATCH', `builder lease ${packet.lease_key} token ${packet.fencing_token}`);

// --- builder works (simulated locally, no model call needed for the demo) ---
const ledger = new EvidenceLedger(path.join(root, project, '.state', 'evidence'));
const testEvidence = ledger.record({ kind: 'test', work_order_id: workOrder.id, command: workOrder.verification_commands[0], outcome: 'PASS', actor: 'builder:worker-a' }, 'ok 1 - greet returns hello, world');
const builderReturn = acceptWorkerReturn({
  session_id: 'S-0001',
  work_order_id: workOrder.id,
  actor: 'builder:worker-a',
  role: 'builder',
  outcome: 'PASS',
  changed_files: ['src/greet.mjs', 'tests/greet.test.mjs'],
  checks: [{ name: 'unit tests', command: workOrder.verification_commands[0], outcome: 'PASS' }],
  blockers: [],
  proposed_next_state: 'READY_FOR_REVIEW',
  evidence_refs: [testEvidence.id],
});
evaluateProposal('IN_PROGRESS', builderReturn.proposed_next_state, 'worker_returned', {
  guards: { worker_result_valid: true },
  evidence: { worker_result: builderReturn, verification_evidence: testEvidence },
  proposerRole: 'builder',
});
registry.transition(project, 'worker_returned', { guards: { worker_result_valid: true }, evidence: { worker_result: builderReturn, verification_evidence: testEvidence }, actor: 'supervisor' });
leases.release(packet.lease_key, 'builder:worker-a', packet.fencing_token);
log('BUILDER RETURN', `proposed ${builderReturn.proposed_next_state}; supervisor validated and persisted`);

// --- independent review ---
const reviewPacket = dispatcher.dispatch({ project, workOrder, expectedHash: woHash, state: 'READY_FOR_REVIEW', workerClass: 'reviewer', actor: 'reviewer:worker-b' });
const verdict = acceptReviewVerdict({
  id: 'RV-0001',
  work_order_id: workOrder.id,
  reviewer: 'reviewer:worker-b',
  reviewer_role: 'reviewer',
  builder: 'builder:worker-a',
  verdict: 'PASS',
  diff_ref: 'git:demo-diff-ref',
  evidence_refs: [testEvidence.id],
  findings: [],
  created_at: new Date().toISOString(),
}, { builderActor: 'builder:worker-a' });
ledger.record({ kind: 'review', work_order_id: workOrder.id, outcome: 'PASS', actor: verdict.reviewer, detail: 'independent review PASS against actual diff and evidence' });
registry.transition(project, 'review_passed', {
  guards: { reviewer_is_not_builder: true, no_external_action_required: true, evidence_fresh: true },
  evidence: { review_verdict: verdict, verification_evidence: testEvidence },
  actor: 'supervisor',
});
leases.release(reviewPacket.lease_key, 'reviewer:worker-b', reviewPacket.fencing_token);
log('REVIEW', `verdict ${verdict.verdict} by ${verdict.reviewer}`);

const finalState = registry.state(project);
const recoveryOk = registry.verifyRecovery(project);
const completion = ledger.supportsCompletion(workOrder.id, ['test', 'review']);
log('FINAL', `state=${finalState.status} recovery=${recoveryOk ? 'REPLAY==SNAPSHOT' : 'MISMATCH'} completionEvidence=${completion.ok ? 'SATISFIED' : completion.unmet}`);

if (finalState.status !== 'DONE' || !recoveryOk || !completion.ok) {
  console.error('DEMO FAILED');
  process.exit(1);
}
console.log(`\nDemo passed.${keep ? ` State kept at ${root}` : ''}`);
if (!keep) fs.rmSync(root, { recursive: true, force: true });
