import { validateScopeDecisionRuntime } from '../policy/scope-engine.mjs';
import { bm25Query } from './retrieval.mjs';
import { validateConsolidation } from './consolidation.mjs';
import { createProjection } from './projection.mjs';

const SOURCE_VERSION = /^(?!\s)(?:[^\r\n]*\S)$/;

export class MemoryFactory {
  constructor(store) {
    if (!store || typeof store.append !== 'function' || typeof store.all !== 'function') throw new TypeError('MemoryFactory requires a MemoryStore-compatible store');
    this.store = store;
  }

  ingest(record) {
    if (!SOURCE_VERSION.test(record?.source_provenance?.source_version ?? '')) throw new TypeError('source_provenance.source_version is required');
    return this.store.append(record);
  }

  retrieve(query, scopeDecision, options = {}) {
    try {
      validateScopeDecisionRuntime(scopeDecision);
      if (!['ALLOW', 'NARROW'].includes(scopeDecision.verdict) || !scopeDecision.effective) throw new Error('denied');
    } catch {
      return { ok: false, results: [], note: 'scope denied' };
    }
    const versions = new Set(scopeDecision.effective.source_versions);
    const kinds = new Set(scopeDecision.effective.memory_kinds);
    const records = this.store.all().filter((record) => {
      const provenanceVersions = record.source_provenance?.source_versions ?? [record.source_provenance?.source_version];
      return kinds.has(record.kind) && provenanceVersions.length > 0 && provenanceVersions.every((version) => versions.has(version));
    });
    if (records.length === 0 && this.store.all().some((record) => kinds.has(record.kind))) {
      return { ok: false, results: [], note: 'source version denied' };
    }
    return bm25Query(records, query, { ...options, scopeDecision });
  }

  consolidate(proposal) {
    const sources = this.#sources(proposal?.source_ids);
    const decision = validateConsolidation(proposal, sources);
    if (!decision.accepted) throw new Error(`consolidation rejected: ${decision.reasons.join(', ')}`);
    return this.store.consolidate(proposal.source_ids, proposal.content, {
      kind: proposal.kind ?? 'semantic', retention: proposal.retention,
      visibility: decision.effective_visibility, sourceVersions: this.#sourceVersions(sources),
    });
  }

  deriveProcedure(proposal, steps) {
    const sources = this.#sources(proposal?.source_ids);
    const requested = {
      ...proposal,
      requested_confidence: proposal.requested_confidence ?? this.#conservativeConfidence(sources),
      requested_visibility: proposal.requested_visibility ?? this.#intersection(sources.map((source) => source.visibility ?? ['project'])),
      requested_uses: proposal.requested_uses ?? this.#intersection(sources.map((source) => source.authority.admissible_uses)),
    };
    const decision = validateConsolidation(requested, sources);
    if (!decision.accepted) throw new Error(`procedure derivation rejected: ${decision.reasons.join(', ')}`);
    return this.store.deriveProcedure(proposal.source_ids, {
      content: proposal.content, steps, retention: proposal.retention,
      visibility: decision.effective_visibility, sourceVersions: this.#sourceVersions(sources),
    });
  }

  revokeAuthority(sourceId, reason) { return this.store.revokeSourceAuthority(sourceId, reason); }
  project(args) { return createProjection(args); }

  #sources(ids) {
    if (!Array.isArray(ids)) throw new TypeError('source_ids must be an array');
    return ids.map((id) => this.store.fetch(id)).filter(Boolean);
  }

  #conservativeConfidence(sources) {
    return sources.some((source) => source.confidence === 'contradicted') ? 'contradicted'
      : sources.length > 0 && sources.every((source) => source.confidence === 'verified') ? 'verified' : 'hypothesis';
  }

  #sourceVersions(sources) {
    return [...new Set(sources.flatMap((source) => source.source_provenance.source_versions ?? [source.source_provenance.source_version]))].sort();
  }

  #intersection(values) {
    if (values.length === 0) return [];
    return [...new Set(values[0])].filter((item) => values.slice(1).every((value) => value.includes(item))).sort();
  }
}
