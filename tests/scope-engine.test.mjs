import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateScopeRequest,
  intersectScopes,
  normalizeScopeContract,
  scopeDigest,
} from '../src/policy/scope-engine.mjs';

const contract = (overrides = {}) => ({
  project: 'demo', include_paths: ['src/**', 'tests/**'], exclude_paths: ['.state/assurance/**'],
  roles: ['builder', 'reviewer'], tools: ['read', 'edit', 'test'], memory_kinds: ['episodic', 'semantic', 'procedural'],
  audiences: ['project'], capabilities: ['local-edit', 'local-test'], targets: ['repository'],
  parameter_bounds: { changed_files: { min: 0, max: 20 } },
  budgets: { cost_usd: 0, tokens: 100000, seconds: 3600, attempts: 3 },
  valid_from: '2026-08-21T00:00:00.000Z', valid_until: '2026-08-22T00:00:00.000Z', max_occurrences: 1,
  externality: 'internal', reversibility: 'reversible', approval_required: false,
  data_classes: ['public', 'project'], retention_classes: ['session', 'project'], source_versions: ['project@1'],
  ...overrides,
});

test('scope intersection is deterministic and can only narrow', () => {
  const result = intersectScopes([contract(), contract({ roles: ['builder'], tools: ['read', 'test', 'network'], budgets: { cost_usd: 0, tokens: 50000, seconds: 1200, attempts: 2 }, source_versions: ['wo@1'] })]);
  assert.equal(result.verdict, 'NARROW');
  assert.deepEqual(result.effective.roles, ['builder']);
  assert.deepEqual(result.effective.tools, ['read', 'test']);
  assert.equal(result.effective.budgets.attempts, 2);
  assert.match(result.digest, /^[0-9a-f]{64}$/);
  assert.equal(result.digest, scopeDigest(result.effective));
  assert.deepEqual(result, intersectScopes([contract(), contract({ roles: ['builder'], tools: ['network', 'test', 'read'], budgets: { cost_usd: 0, tokens: 50000, seconds: 1200, attempts: 2 }, source_versions: ['wo@1'] })]));
});

test('empty high-impact intersection denies', () => {
  const result = intersectScopes([contract(), contract({ capabilities: ['network-write'] })]);
  assert.equal(result.verdict, 'DENY');
  assert.deepEqual(result.unresolved_dimensions, ['capabilities']);
});

test('worker request cannot widen effective scope', () => {
  const decision = intersectScopes([contract()]);
  const checked = evaluateScopeRequest(decision, { role: 'builder', tool: 'network', memory_kind: 'semantic', capability: 'network-write', target: 'internet', path: 'src/x.mjs' });
  assert.equal(checked.verdict, 'DENY');
  assert.ok(checked.violations.includes('tools'));
  assert.ok(checked.violations.includes('capabilities'));
});

test('normalization validates every field and rejects unknown fields', () => {
  assert.throws(() => normalizeScopeContract(contract({ surprise: true })), /unknown field/);
  assert.throws(() => normalizeScopeContract(contract({ include_paths: ['../outside/**'] })), /include_paths/);
  assert.throws(() => normalizeScopeContract(contract({ include_paths: ['src/**x'] })), /include_paths/);
  assert.throws(() => normalizeScopeContract(contract({ project: ' demo' })), /project/);
  assert.throws(() => normalizeScopeContract(contract({ roles: ['invented-role'] })), /roles/);
  assert.throws(() => normalizeScopeContract(contract({ memory_kinds: ['authority-grant'] })), /memory_kinds/);
  assert.throws(() => normalizeScopeContract(contract({ retention_classes: ['forever-ish'] })), /retention_classes/);
  assert.throws(() => normalizeScopeContract(contract({ parameter_bounds: { files: { min: 2, max: 1 } } })), /min <= max/);
  assert.throws(() => normalizeScopeContract(contract({ budgets: { cost_usd: -1, tokens: 1, seconds: 1, attempts: 1 } })), /cost_usd/);
  assert.throws(() => normalizeScopeContract(contract({ valid_from: 'today' })), /valid_from/);
  assert.throws(() => normalizeScopeContract(contract({ externality: 'maybe' })), /externality/);
  assert.throws(() => normalizeScopeContract(contract({ approval_required: 'false' })), /approval_required/);
});

test('inconsistent contracts and decisions fail closed', () => {
  assert.equal(intersectScopes([contract({ valid_until: '2026-08-20T00:00:00.000Z' })]).verdict, 'DENY');
  assert.equal(intersectScopes([contract({ max_occurrences: 0 })]).verdict, 'DENY');
  assert.equal(evaluateScopeRequest({ verdict: 'ALLOW', effective: contract(), digest: 'bad', reasons: [], unresolved_dimensions: [] }, { role: 'builder', tool: 'read', memory_kind: 'semantic', capability: 'local-edit', target: 'repository', path: 'src/x.mjs' }).verdict, 'DENY');
});

test('request validation enforces path inclusion/exclusion and request shape', () => {
  const decision = intersectScopes([contract()]);
  assert.equal(evaluateScopeRequest(decision, { role: 'builder', tool: 'read', memory_kind: 'semantic', capability: 'local-edit', target: 'repository', path: 'docs/x.md' }).verdict, 'DENY');
  assert.equal(evaluateScopeRequest(decision, { role: 'builder', tool: 'read', memory_kind: 'semantic', capability: 'local-edit', target: 'repository', path: '.state/assurance/x.json' }).verdict, 'DENY');
  assert.equal(evaluateScopeRequest(decision, { role: 'builder', tool: 'read', memory_kind: 'semantic', capability: 'local-edit', target: 'repository', path: 'src/x.mjs', extra: true }).verdict, 'DENY');
});

test('malformed decision metadata is replaced by a fail-closed diagnostic', () => {
  const request = { role: 'builder', tool: 'read', memory_kind: 'semantic', capability: 'local-edit', target: 'repository', path: 'src/x.mjs' };
  for (const decision of [
    { verdict: 'DENY', effective: null, digest: scopeDigest(null), reasons: [' '], unresolved_dimensions: ['all'] },
    { verdict: 'DEFER', effective: null, digest: scopeDigest(null), reasons: [], unresolved_dimensions: [1] },
    { ...intersectScopes([contract()]), reasons: ['ok'], unresolved_dimensions: [''] },
    { ...intersectScopes([contract()]), violations: [' '] },
  ]) {
    const result = evaluateScopeRequest(decision, request);
    assert.equal(result.verdict, 'DENY');
    assert.equal(result.effective, null);
    assert.deepEqual(result.unresolved_dimensions, ['all']);
    assert.deepEqual(result.violations, ['validation']);
    assert.match(result.reasons[0], /^invalid scope request or decision:/);
    assert.notEqual(result, decision);
  }
});

test('scope timestamps accept canonical UTC or offset forms and reject loose dates', () => {
  assert.doesNotThrow(() => normalizeScopeContract(contract({ valid_from: '2026-08-21T01:00:00+01:00' })));
  assert.throws(() => normalizeScopeContract(contract({ valid_from: '2026-08-21 00:00:00Z' })), /valid_from/);
});

test('validity intersection compares instants instead of timestamp text', () => {
  const lower = intersectScopes([
    contract({ valid_from: '2026-08-21T02:00:00+02:00' }),
    contract({ valid_from: '2026-08-21T01:00:00Z' }),
  ]);
  assert.equal(lower.effective.valid_from, '2026-08-21T01:00:00Z');

  const upper = intersectScopes([
    contract({ valid_until: '2026-08-22T00:30:00+02:00' }),
    contract({ valid_until: '2026-08-21T23:00:00Z' }),
  ]);
  assert.equal(upper.effective.valid_until, '2026-08-22T00:30:00+02:00');
});

test('timestamp validation enforces calendar, clock, and offset semantics', () => {
  assert.doesNotThrow(() => normalizeScopeContract(contract({ valid_from: '2028-02-29T00:00:00Z', valid_until: '2028-03-01T00:00:00Z' })));
  for (const invalid of [
    '2026-02-30T00:00:00Z',
    '2026-02-29T00:00:00Z',
    '2026-13-01T00:00:00Z',
    '2026-04-31T00:00:00Z',
    '2026-08-21T24:00:00Z',
    '2026-08-21T00:60:00Z',
    '2026-08-21T00:00:60Z',
    '2026-08-21T00:00:00+14:01',
    '2026-08-21T00:00:00+15:00',
  ]) assert.throws(() => normalizeScopeContract(contract({ valid_from: invalid })), /valid_from/, invalid);
});
