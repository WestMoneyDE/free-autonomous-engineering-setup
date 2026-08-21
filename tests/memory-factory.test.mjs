import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MemoryStore } from '../src/memory/store.mjs';
import { MemoryFactory } from '../src/memory/factory.mjs';
import { validateConsolidation } from '../src/memory/consolidation.mjs';
import { intersectScopes } from '../src/policy/scope-engine.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'faes-factory-'));
const provenance = (sourceVersion = 'test@1') => ({ source: 'test', source_version: sourceVersion, kind: 'repository', recorded_at: '2026-08-21T00:00:00.000Z' });
const source = (id, overrides = {}) => ({ id, confidence: 'hypothesis', visibility: ['project'], authority: { class: 'observation', admissible_uses: ['inform-proposal'] }, ...overrides });
const base = (overrides = {}) => ({ project: 'p', kind: 'semantic', content: 'supplier rule', source_provenance: provenance(), authority: { class: 'observation', admissible_uses: ['inform-proposal'] }, confidence: 'observed', retention: 'project', visibility: ['project'], ...overrides });
const projectScope = (overrides = {}) => intersectScopes([{
  project: 'p', include_paths: ['**'], exclude_paths: [], roles: ['builder'], tools: ['read'],
  memory_kinds: ['semantic', 'procedural'], audiences: ['project'], capabilities: ['memory-read'], targets: ['memory'],
  parameter_bounds: {}, budgets: { cost_usd: 0, tokens: 1000, seconds: 30, attempts: 1 },
  valid_from: '2026-08-21T00:00:00.000Z', valid_until: '2099-08-22T00:00:00.000Z', max_occurrences: 1,
  externality: 'internal', reversibility: 'reversible', approval_required: false, data_classes: ['project'],
  retention_classes: ['project'], source_versions: ['test@1'], ...overrides,
}]);
const seededFactory = (directory) => { const factory = new MemoryFactory(new MemoryStore(directory), { project: 'p' }); factory.ingest(base({ id: 'supplier' })); return factory; };

test('three independent consolidation gates fail closed', () => {
  assert.deepEqual(validateConsolidation({ source_ids: ['missing'], requested_confidence: 'hypothesis', requested_visibility: ['project'], requested_uses: ['inform-proposal'] }, []).reasons, ['local transition']);
  assert.ok(validateConsolidation({ source_ids: ['a'], requested_confidence: 'verified', requested_visibility: ['project'], requested_uses: ['inform-proposal'] }, [source('a')]).reasons.includes('global evidence coherence'));
  assert.ok(validateConsolidation({ source_ids: ['a'], requested_confidence: 'hypothesis', requested_visibility: ['public'], requested_uses: ['execute'] }, [source('a')]).reasons.includes('authority preservation'));
});

test('epistemic transitions are closed and conservative', () => {
  for (const confidence of ['observed', 'verified']) {
    const result = validateConsolidation({ source_ids: ['a'], requested_confidence: confidence, requested_visibility: ['project'], requested_uses: ['inform-proposal'] }, [source('a')]);
    assert.ok(result.reasons.includes('global evidence coherence'), confidence);
  }
  assert.throws(() => validateConsolidation({ source_ids: ['a'], requested_confidence: 'certain', requested_visibility: ['project'], requested_uses: [] }, [source('a')]), /confidence/);
});

test('factory requires exact source-version provenance and scope-first retrieval', () => {
  const factory = new MemoryFactory(new MemoryStore(tmp()), { project: 'p' });
  assert.throws(() => factory.ingest(base({ source_provenance: { source: 'test', kind: 'repository', recorded_at: '2026-08-21T00:00:00.000Z' } })), /source_version/);
  factory.ingest(base({ id: 'supplier' }));
  assert.deepEqual(factory.retrieve('supplier', { ...projectScope(), digest: 'd'.repeat(64) }), { ok: false, results: [], note: 'scope denied' });
  assert.deepEqual(factory.retrieve('supplier', projectScope({ source_versions: ['other@1'] })), { ok: false, results: [], note: 'source version denied' });
});

test('derived procedures retain lineage, weakest authority, and transitive revocation', () => {
  const store = new MemoryStore(tmp());
  const factory = new MemoryFactory(store, { project: 'p' });
  const strong = factory.ingest(base({ id: 'strong', authority: { class: 'user-statement', admissible_uses: ['inform-proposal', 'cite'] } }));
  const weak = factory.ingest(base({ id: 'weak', authority: { class: 'tool-output', admissible_uses: ['inform-proposal'] } }));
  const procedure = factory.deriveProcedure({ source_ids: [strong.id, weak.id], content: 'safe procedure' }, ['run tests']);
  const child = factory.deriveProcedure({ source_ids: [procedure.id], content: 'child procedure' }, ['review']);
  assert.deepEqual(procedure.lineage.derived_from.sort(), [strong.id, weak.id]);
  assert.equal(procedure.authority.class, 'tool-output');
  assert.deepEqual(child.source_provenance.source_versions, ['test@1']);
  store.deleteRecord(strong.id);
  assert.equal(store.fetch(procedure.id).authority_revoked, false);
  const affected = factory.revokeAuthority(strong.id, 'withdrawn');
  assert.ok(affected.includes(procedure.id));
  assert.ok(affected.includes(child.id));
  assert.equal(store.fetch(child.id).authority_revoked, true);
});

test('revocation rejects an outside-project source without mutation', () => {
  const store = new MemoryStore(tmp());
  const factory = new MemoryFactory(store, { project: 'p' });
  const outside = store.append(base({ id: 'outside', project: 'other' }));
  const before = store.fetch(outside.id);
  assert.throws(() => factory.revokeAuthority(outside.id, 'withdrawn'), /project/);
  assert.deepEqual(store.fetch(outside.id), before);
});

test('revocation rejects a mixed-project descendant closure atomically', () => {
  const store = new MemoryStore(tmp());
  const factory = new MemoryFactory(store, { project: 'p' });
  const sourceRecord = factory.ingest(base({ id: 'source' }));
  const child = factory.deriveProcedure({ source_ids: [sourceRecord.id], content: 'child' }, ['one']);
  const outside = store.append(base({ id: 'outside-child', project: 'other', kind: 'procedural', content: 'outside', steps: ['two'], lineage: { derived_from: [child.id], conflicts_with: [] } }));
  const before = new Map([sourceRecord.id, child.id, outside.id].map((id) => [id, store.fetch(id)]));
  assert.throws(() => factory.revokeAuthority(sourceRecord.id, 'withdrawn'), /project/);
  for (const [id, record] of before) assert.deepEqual(store.fetch(id), record, id);
});

test('consolidation preserves the exact ordered source-version set', () => {
  const factory = new MemoryFactory(new MemoryStore(tmp()), { project: 'p' });
  const a = factory.ingest(base({ id: 'a', source_provenance: provenance('policy@2') }));
  const b = factory.ingest(base({ id: 'b', source_provenance: provenance('work-order@7') }));
  const summary = factory.consolidate({
    source_ids: [a.id, b.id], content: 'bounded supplier rule', requested_confidence: 'hypothesis',
    requested_visibility: ['project'], requested_uses: ['inform-proposal'],
  });
  assert.deepEqual(summary.source_provenance.source_versions, ['policy@2', 'work-order@7']);
});

test('consolidation retains unresolved conflicts between its own sources', () => {
  const store = new MemoryStore(tmp());
  const factory = new MemoryFactory(store, { project: 'p' });
  const a = factory.ingest(base({ id: 'a', content: 'timeout is 30s' }));
  const b = factory.ingest(base({ id: 'b', content: 'timeout is 60s' }));
  store.conflict(a.id, b.id, 'unresolved');
  const summary = factory.consolidate({ source_ids: [a.id, b.id], content: 'timeout unresolved', requested_confidence: 'hypothesis', requested_visibility: ['project'], requested_uses: ['inform-proposal'] });
  assert.equal(summary.qualifiers.has_unresolved_conflicts, true);
  assert.deepEqual(summary.qualifiers.conflicts_with.sort(), [a.id, b.id]);
});

test('project boundary rejects same-version same-visibility cross-project records', () => {
  const store = new MemoryStore(tmp());
  const factory = new MemoryFactory(store, { project: 'p' });
  factory.ingest(base({ id: 'inside', content: 'shared keyword' }));
  store.append(base({ id: 'outside', project: 'other', content: 'shared keyword' }));
  store.append(base({ id: 'legacy', project: undefined, content: 'shared keyword' }));
  assert.deepEqual(factory.retrieve('shared', projectScope()).results.map((item) => item.id), ['inside']);
  assert.deepEqual(factory.retrieve('shared', projectScope({ project: 'other' })), { ok: false, results: [], note: 'project denied' });
  assert.throws(() => factory.consolidate({ source_ids: ['inside', 'outside'], content: 'mixed', requested_confidence: 'hypothesis', requested_visibility: ['project'], requested_uses: ['inform-proposal'] }), /project/);
});

test('factory projection resolves canonical store records and rejects fabrication or tampering', () => {
  const factory = seededFactory(tmp());
  const scopeDecision = projectScope();
  const record = factory.retrieve('supplier', scopeDecision).results[0];
  const args = { records: [record], purpose: 'review', audience: 'project', valid_until: '2099-08-22T00:00:00.000Z', scopeDecision };
  assert.equal(factory.project(args).items[0].content, 'supplier rule');
  assert.throws(() => factory.project({ ...args, records: [{ ...record, content: 'fabricated approval' }] }), /canonical/);
  assert.throws(() => factory.project({ ...args, records: [{ ...record, source_provenance: provenance('other@9') }] }), /canonical/);
  assert.throws(() => factory.project({ ...args, records: [{ ...record, id: 'missing' }] }), /missing/);
});

test('generated markers have explicit provenance and unscoped or legacy sources are ineligible', () => {
  const dir = tmp();
  const store = new MemoryStore(dir);
  const factory = new MemoryFactory(store, { project: 'p' });
  const a = factory.ingest(base({ id: 'a' }));
  const b = factory.ingest(base({ id: 'b' }));
  const conflict = store.conflict(a.id, b.id, 'unresolved');
  assert.equal(conflict.project, 'p');
  assert.equal(conflict.source_provenance.source_version, 'memory-store@1');
  factory.revokeAuthority(a.id, 'withdrawn');
  const marker = store.all().find((record) => record.content.startsWith('AUTHORITY REVOKED'));
  assert.equal(marker.project, 'p');
  assert.equal(marker.source_provenance.source_version, 'memory-store@1');
  const legacy = store.append(base({ id: 'legacy', source_provenance: { source: 'legacy', kind: 'repository', recorded_at: '2026-08-21T00:00:00.000Z' } }));
  assert.throws(() => factory.consolidate({ source_ids: [legacy.id], content: 'legacy summary', requested_confidence: 'hypothesis', requested_visibility: ['project'], requested_uses: ['inform-proposal'] }), /source version/);

  const recoveryDir = tmp();
  const recoveryStore = new MemoryStore(recoveryDir);
  recoveryStore.append(base({ id: 'durable' }));
  fs.appendFileSync(path.join(recoveryDir, 'memory.jsonl'), '{"id":"truncated"');
  const recovered = new MemoryStore(recoveryDir);
  const recovery = recovered.all().find((record) => record.content.startsWith('MEMORY LOG RECOVERY'));
  assert.equal(recovery.source_provenance.source_version, 'memory-store@1');
  assert.equal(recovery.project, undefined);
  const recoveredFactory = new MemoryFactory(recovered, { project: 'p' });
  assert.throws(() => recoveredFactory.consolidate({ source_ids: [recovery.id], content: 'recovery summary', requested_confidence: 'hypothesis', requested_visibility: ['project'], requested_uses: [] }), /project/);
});

test('projection contains minimum context, expiry, and a stable validated digest', () => {
  const factory = seededFactory(tmp());
  const scopeDecision = projectScope();
  const records = factory.retrieve('supplier', scopeDecision).results;
  const args = { records, purpose: 'review', audience: 'project', valid_until: '2099-08-22T00:00:00.000Z', scopeDecision };
  const projection = factory.project(args);
  assert.deepEqual(Object.keys(projection.items[0]).sort(), ['content', 'epistemic', 'id', 'kind', 'provenance']);
  assert.match(projection.digest, /^[0-9a-f]{64}$/);
  assert.equal(factory.project(args).digest, projection.digest);
  assert.throws(() => factory.project({ ...args, valid_until: '2020-01-01T00:00:00.000Z' }), /expired/);
  assert.throws(() => factory.project({ ...args, scopeDecision: { ...scopeDecision, digest: 'd'.repeat(64) } }), /scope/);
});
