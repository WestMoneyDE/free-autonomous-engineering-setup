// Deterministic hashing utilities. Canonical JSON = stable key order, no
// whitespace variance, so identical logical content yields identical digests.
import { createHash } from 'node:crypto';

export function canonicalJson(value) {
  return JSON.stringify(sortValue(value));
}

function sortValue(v) {
  if (Array.isArray(v)) return v.map(sortValue);
  if (v !== null && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortValue(v[k]);
    return out;
  }
  return v;
}

export function sha256Hex(data) {
  return createHash('sha256').update(data).digest('hex');
}

// Digest of the EXACT proposal: the ENTIRE proposal object is hashed
// canonically. Approval binding uses this digest; mutating ANY field —
// including expires_at, evidence_refs, proposed_by, uncertainty or claimed_*
// fields — changes the digest and therefore invalidates a previously granted
// approval. (Review finding R2-03: a partial-field digest allowed expiry,
// evidence and proposer swaps without digest change; fixed by whole-object
// hashing.)
export function proposalDigest(proposal) {
  return sha256Hex(canonicalJson(proposal));
}

// Hash of the ENTIRE work order. A scheduled work order whose budget_policy,
// routing_class, external_effects — or any other field — changes afterwards
// must fail the dispatch HASH_MISMATCH guard. (Review finding R2-02: a
// partial-field hash let cost/security-relevant fields mutate silently;
// fixed by whole-object hashing.)
export function workOrderHash(workOrder) {
  return sha256Hex(canonicalJson(workOrder));
}
