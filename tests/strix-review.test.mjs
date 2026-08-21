import test from 'node:test';
import assert from 'node:assert/strict';
import { preflightStrixReview, interpretStrixResult } from '../src/security/strix-review.mjs';

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
});

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
  assert.equal(preflightStrixReview(request).allowed, false);
});

for (const request of [null, [], 'request', { ...valid(), authorization: [] }, { ...valid(), max_turns: '20' }]) {
  test(`preflight fails closed for adversarial input ${JSON.stringify(request)?.slice(0, 30)}`, () => {
    assert.equal(preflightStrixReview(request).allowed, false);
  });
}

test('valid owned test target passes pure preflight', () => {
  assert.deepEqual(preflightStrixReview(valid()), {
    allowed: true,
    failures: [],
    strix_ref: '2cc816781438f2993bcbb5c8cf3f693c25380142',
  });
});

test('production requires production-specific written authorization', () => {
  const request = valid();
  request.environment = 'production';
  assert.equal(preflightStrixReview(request).allowed, false);
  request.authorization.production = true;
  assert.equal(preflightStrixReview(request).allowed, true);
});

test('authorization must carry a durable written record reference', () => {
  const request = valid();
  delete request.authorization.ref;
  assert.equal(preflightStrixReview(request).allowed, false);
});

test('result interpretation preserves explicit result semantics', () => {
  assert.equal(interpretStrixResult({ exitCode: 1 }).outcome, 'FAIL');
  assert.equal(interpretStrixResult({ exitCode: 2, run: { status: 'completed' }, vulnerabilities: [{}] }).outcome, 'FINDINGS');
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
  ['success code with findings', { exitCode: 0, run: { status: 'completed' }, report: { coverage_complete: true }, vulnerabilities: [{}] }],
]) test(`malformed ${name} fails closed`, () => {
  const interpreted = interpretStrixResult(result);
  assert.equal(interpreted.outcome, 'FAIL');
  assert.equal(interpreted.complete, false);
});

test('successful exit never implies full target safety', () => {
  const result = interpretStrixResult({ exitCode: 0, run: { status: 'completed' }, report: { coverage_complete: true } });
  assert.equal(result.outcome, 'NO_VALIDATED_FINDINGS_IN_ANALYZED_SCOPE');
  assert.doesNotMatch(result.reason, /safe|secure/i);
});
