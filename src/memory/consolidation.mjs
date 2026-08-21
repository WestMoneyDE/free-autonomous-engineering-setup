const CONFIDENCE = new Set(['hypothesis', 'observed', 'verified', 'contradicted']);

const intersection = (sets) => {
  if (sets.length === 0) return [];
  return [...sets.slice(1).reduce(
    (acc, set) => new Set([...acc].filter((item) => set.has(item))),
    new Set(sets[0]),
  )].sort();
};

const stringSet = (value, label) => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.length === 0)) {
    throw new TypeError(`${label} must be an array of non-empty strings`);
  }
  return [...new Set(value)].sort();
};

export function validateConsolidation(proposal, sources) {
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) throw new TypeError('consolidation proposal must be an object');
  if (!Array.isArray(sources)) throw new TypeError('consolidation sources must be an array');
  const sourceIds = stringSet(proposal.source_ids, 'source_ids');
  const requestedVisibility = stringSet(proposal.requested_visibility, 'requested_visibility');
  const requestedUses = stringSet(proposal.requested_uses, 'requested_uses');
  if (!CONFIDENCE.has(proposal.requested_confidence)) throw new TypeError('requested_confidence is unsupported');

  const reasons = [];
  const actualIds = sources.map((item) => item?.id);
  if (sourceIds.length === 0 || sourceIds.length !== proposal.source_ids.length ||
      actualIds.length !== sourceIds.length || actualIds.some((id) => !sourceIds.includes(id)) ||
      sources.some((item) => !item || item.deleted)) reasons.push('local transition');

  const conservativeConfidence = sources.some((item) => item?.confidence === 'contradicted')
    ? 'contradicted'
    : sources.length > 0 && sources.every((item) => item?.confidence === 'verified') ? 'verified' : 'hypothesis';
  if (proposal.requested_confidence !== conservativeConfidence) reasons.push('global evidence coherence');

  const visibility = intersection(sources.map((item) => new Set(item?.visibility ?? ['project'])));
  const uses = intersection(sources.map((item) => new Set(item?.authority?.admissible_uses ?? [])));
  if (sources.length > 0 && (sources.some((item) => item?.authority_revoked || item?.revoked) ||
      !requestedVisibility.every((item) => visibility.includes(item)) ||
      !requestedUses.every((item) => uses.includes(item)))) reasons.push('authority preservation');

  return Object.freeze({
    accepted: reasons.length === 0,
    reasons: [...new Set(reasons)],
    effective_visibility: visibility,
    effective_uses: uses,
    effective_confidence: conservativeConfidence,
  });
}
