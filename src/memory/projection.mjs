import { canonicalJson, sha256Hex } from '../evidence/hashing.mjs';
import { validateScopeDecisionRuntime } from '../policy/scope-engine.mjs';

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export function createProjection({ records, purpose, audience, valid_until, scopeDecision }) {
  validateScopeDecisionRuntime(scopeDecision);
  if (!['ALLOW', 'NARROW'].includes(scopeDecision.verdict) || !scopeDecision.effective?.audiences.includes(audience)) {
    throw new Error('projection scope or audience denied');
  }
  if (typeof purpose !== 'string' || purpose.trim() !== purpose || purpose.length === 0) throw new TypeError('projection purpose is invalid');
  if (!ISO_INSTANT.test(valid_until) || !Number.isFinite(Date.parse(valid_until))) throw new TypeError('projection expiry is invalid');
  if (Date.parse(valid_until) <= Date.now()) throw new Error('projection expired');
  if (Date.parse(valid_until) > Date.parse(scopeDecision.effective.valid_until)) throw new Error('projection expiry exceeds scope');
  if (!Array.isArray(records)) throw new TypeError('projection records must be an array');

  const allowedKinds = new Set(scopeDecision.effective.memory_kinds);
  const allowedVersions = new Set(scopeDecision.effective.source_versions);
  const items = records.map((record) => {
    if (!allowedKinds.has(record?.kind) || !record?.visibility?.includes(audience)) throw new Error('projection record exceeds scope');
    const provenanceVersions = record?.source_provenance?.source_versions ?? [record?.source_provenance?.source_version];
    if (provenanceVersions.length === 0 || !provenanceVersions.every((version) => allowedVersions.has(version))) throw new Error('projection source version denied');
    return {
      id: record.id,
      kind: record.kind,
      content: record.content,
      provenance: record.source_provenance,
      epistemic: { confidence: record.confidence, qualifiers: record.qualifiers },
    };
  });
  const payload = { purpose, audience, valid_until, source_ids: items.map((item) => item.id), scope_digest: scopeDecision.digest, items };
  return deepFreeze({ ...payload, digest: sha256Hex(canonicalJson(payload)) });
}
