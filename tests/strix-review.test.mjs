import test from 'node:test';
import assert from 'node:assert/strict';
import { preflightStrixReview, interpretStrixResult } from '../src/security/strix-review.mjs';
import { proposalDigest } from '../src/evidence/hashing.mjs';

const valid = () => ({
  target: 'local-app',
  target_class: 'owned',
  environment: 'test',
  authorization: { written: true, target: 'local-app', ref: 'AUTH-17' },
  clean_disposable_checkout: true,
  max_budget_usd: 5,
  max_turns: 20,
  max_seconds: 900,
  strix_ref: '2cc816781438f2993bcbb5c8cf3f693c25380142',
  config_digest: 'a'.repeat(64),
  scope_digest: 'b'.repeat(64),
  evidence_destination: '.state/evidence/strix/run-1',
  occurrence: 1,
  work_order_id: 'WO-5',
  proposed_by: 'supervisor:hermes',
  created_at: '2026-08-21T10:00:00.000Z',
  expires_at: '2026-08-21T10:15:00.000Z',
});

const validatedFinding = (overrides = {}) => ({ id: 'STRIX-1', title: 'Command injection', severity: 'HIGH', status: 'VALIDATED', validated: true, evidence: [{ type: 'reproduction', ref: 'evidence:poc-1', provenance: { source: 'independent-reviewer', recorded_at: '2026-08-21T10:10:00.000Z' } }], ...overrides });

for (const [name, mutate] of [
  ['missing authorization', (r) => { r.authorization.written = false; }],
  ['authorization target mismatch', (r) => { r.authorization.target = 'other'; }],
  ['third-party target', (r) => { r.target_class = 'third-party'; }],
  ['dirty checkout', (r) => { r.clean_disposable_checkout = false; }],
  ['unbounded budget', (r) => { r.max_budget_usd = 0; }],
  ['unbounded turns', (r) => { r.max_turns = Number.POSITIVE_INFINITY; }],
  ['unbounded time', (r) => { r.max_seconds = 0; }],
  ['mutable ref', (r) => { r.strix_ref = 'main'; }],
  ['invalid config digest', (r) => { r.config_digest = 'A'.repeat(64); }],
  ['invalid scope digest', (r) => { r.scope_digest = ''; }],
  ['missing evidence', (r) => { delete r.evidence_destination; }],
  ['absolute evidence destination', (r) => { r.evidence_destination = 'C:\\evidence'; }],
  ['traversing evidence destination', (r) => { r.evidence_destination = '.state/evidence/strix/../../secrets'; }],
]) test(`preflight rejects ${name}`, () => {
  const request = valid();
  mutate(request);
  assert.equal(preflightStrixReview(request).ready_for_authority_gate, false);
  assert.equal(preflightStrixReview(request).execution_authorized, false);
});

for (const request of [null, [], 'request', { ...valid(), authorization: [] }, { ...valid(), max_turns: '20' }]) {
  test(`preflight fails closed for adversarial input ${JSON.stringify(request)?.slice(0, 30)}`, () => {
    assert.equal(preflightStrixReview(request).ready_for_authority_gate, false);
  });
}

test('structurally valid claims produce only a digest-bound proposal for the authority gate', () => {
  const result = preflightStrixReview(valid());
  assert.equal(result.ready_for_authority_gate, true);
  assert.equal(result.execution_authorized, false);
  assert.equal(result.claims_only, true);
  assert.equal(result.proposal.action, 'run_strix_review');
  assert.equal(result.proposal_digest, proposalDigest(result.proposal));
  assert.equal(result.authority_scope, 'security-review:local-app');
});

test('self-asserted approval claims never authorize execution', () => { const request=valid(); request.allowed=true; request.approved=true; request.authorization.approved=true; const result=preflightStrixReview(request); assert.equal(result.execution_authorized,false); assert.equal('gate_nonce' in result,false); });

test('proposal digest binds every consequential review field and occurrence', () => { const base=preflightStrixReview(valid()).proposal_digest; for (const mutate of [(r)=>r.target='other',(r)=>r.environment='production',(r)=>r.scope_digest='c'.repeat(64),(r)=>r.config_digest='d'.repeat(64),(r)=>r.strix_ref='e'.repeat(40),(r)=>r.max_budget_usd=6,(r)=>r.max_turns=21,(r)=>r.max_seconds=901,(r)=>r.evidence_destination='.state/evidence/strix/run-2',(r)=>r.occurrence=2]) { const request=valid(); mutate(request); assert.notEqual(preflightStrixReview(request).proposal_digest,base); } });

test('production requires production-specific written authorization', () => {
  const request = valid();
  request.environment = 'production';
  assert.equal(preflightStrixReview(request).ready_for_authority_gate, false);
  request.authorization.production = true;
  assert.equal(preflightStrixReview(request).ready_for_authority_gate, true);
});

test('authorization must carry a durable written record reference', () => {
  const request = valid();
  delete request.authorization.ref;
  assert.equal(preflightStrixReview(request).ready_for_authority_gate, false);
});

test('result interpretation preserves explicit result semantics', () => {
  assert.equal(interpretStrixResult({ exitCode: 1 }).outcome, 'FAIL');
  assert.equal(interpretStrixResult({ exitCode: 2, run: { status: 'completed' }, vulnerabilities: [validatedFinding()] }).outcome, 'FINDINGS');
  assert.equal(interpretStrixResult({ exitCode: 0, run: { status: 'stopped' } }).outcome, 'INCOMPLETE');
  assert.equal(interpretStrixResult({ exitCode: 0, run: { status: 'completed' }, report: { coverage_complete: true } }).outcome, 'NO_VALIDATED_FINDINGS_IN_ANALYZED_SCOPE');
});

for (const [name, result] of [
  ['missing result', undefined],
  ['non-object result', []],
  ['string exit code', { exitCode: '0', run: { status: 'completed' }, report: { coverage_complete: true } }],
  ['malformed run', { exitCode: 0, run: 'completed', report: { coverage_complete: true } }],
  ['malformed report', { exitCode: 0, run: { status: 'completed' }, report: 'complete' }],
  ['findings without array', { exitCode: 2, run: { status: 'completed' }, vulnerabilities: {} }],
  ['findings without findings', { exitCode: 2, run: { status: 'completed' }, vulnerabilities: [] }],
  ['null finding', { exitCode: 2, run: { status: 'completed' }, vulnerabilities: [null] }],
  ['primitive finding', { exitCode: 2, run: { status: 'completed' }, vulnerabilities: ['critical'] }],
  ['finding without identity', { exitCode: 2, run: { status: 'completed' }, vulnerabilities: [validatedFinding({ id: '' })] }],
  ['finding with unknown severity', { exitCode: 2, run: { status: 'completed' }, vulnerabilities: [validatedFinding({ severity: 'URGENT' })] }],
  ['finding without provenance', { exitCode: 2, run: { status: 'completed' }, vulnerabilities: [validatedFinding({ evidence: [{}] })] }],
  ['success code with findings', { exitCode: 0, run: { status: 'completed' }, report: { coverage_complete: true }, vulnerabilities: [{}] }],
  ['unknown run status', { exitCode: 0, run: { status: 'mostly-completed' }, report: { coverage_complete: false } }],
  ['non-boolean coverage', { exitCode: 0, run: { status: 'completed' }, report: { coverage_complete: 'true' } }],
]) test(`malformed ${name} fails closed`, () => {
  const interpreted = interpretStrixResult(result);
  assert.equal(interpreted.outcome, 'FAIL');
  assert.equal(interpreted.complete, false);
});

test('well-formed but independently unvalidated observations are neutral',()=>{const result=interpretStrixResult({exitCode:2,run:{status:'completed'},vulnerabilities:[validatedFinding({status:'NEEDS_VERIFICATION',validated:false})]});assert.equal(result.outcome,'UNVALIDATED_OBSERVATIONS');assert.equal(result.complete,false);assert.doesNotMatch(result.reason,/validated findings/i);});

test('successful exit never implies full target safety', () => {
  const result = interpretStrixResult({ exitCode: 0, run: { status: 'completed' }, report: { coverage_complete: true } });
  assert.equal(result.outcome, 'NO_VALIDATED_FINDINGS_IN_ANALYZED_SCOPE');
  assert.doesNotMatch(result.reason, /safe|secure/i);
});
