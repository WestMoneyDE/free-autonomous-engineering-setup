import { validateScopeDecisionRuntime } from '../policy/scope-engine.mjs';
import { bm25Query } from './retrieval.mjs';
import { validateConsolidation } from './consolidation.mjs';
import { createProjection } from './projection.mjs';
import { canonicalJson } from '../evidence/hashing.mjs';

const SOURCE_VERSION = /^(?!\s)(?:[^\r\n]*\S)$/;

export class MemoryFactory {
  constructor(store, { project } = {}) {
    if (!store || typeof store.append !== 'function' || typeof store.all !== 'function') throw new TypeError('MemoryFactory requires a MemoryStore-compatible store');
    if (typeof project !== 'string' || project.trim() !== project || project.length === 0) throw new TypeError('MemoryFactory requires an exact project');
    this.store = store;
    this.projectId = project;
  }

  ingest(record) {
    if (record?.project !== this.projectId) throw new Error('memory record project denied');
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
    if (scopeDecision.effective.project !== this.projectId) return { ok: false, results: [], note: 'project denied' };
    const versions = new Set(scopeDecision.effective.source_versions);
    const kinds = new Set(scopeDecision.effective.memory_kinds);
    const projectRecords = this.store.all().filter((record) => record.project === this.projectId && kinds.has(record.kind));
    const records = projectRecords.filter((record) => {
      const provenanceVersions = record.source_provenance?.source_versions ?? [record.source_provenance?.source_version];
      return provenanceVersions.length > 0 && provenanceVersions.every((version) => typeof version === 'string' && version.length > 0 && versions.has(version));
    });
    if (records.length === 0 && projectRecords.length > 0) {
      return { ok: false, results: [], note: 'source version denied' };
    }
    return bm25Query(records, query, { ...options, scopeDecision });
  }

  consolidate(proposal) {
    const sources = this.#sources(proposal?.source_ids);
    const decision = validateConsolidation(proposal, sources);
    if (!decision.accepted) throw new Error(`consolidation rejected: ${decision.reasons.join(', ')}`);
    const result = this.store.consolidate(proposal.source_ids, proposal.content, {
      kind: proposal.kind ?? 'semantic', retention: proposal.retention,
      project: this.projectId, visibility: decision.effective_visibility, sourceVersions: this.#sourceVersions(sources),
    });
    return this.store.fetch(result.id);
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
      project: this.projectId, visibility: decision.effective_visibility, sourceVersions: this.#sourceVersions(sources),
    });
  }

  revokeAuthority(sourceId, reason) {
    const source = this.store.fetch(sourceId);
    if (!source) throw new Error(`revocation source missing: ${sourceId}`);
    this.#validateFactorySource(source);
    const expectedIds = this.store.descendantClosure(sourceId);
    for (const id of expectedIds) {
      const record = this.store.fetch(id);
      if (!record) throw new Error(`revocation descendant missing: ${id}`);
      this.#validateFactorySource(record);
    }
    return this.store.revokeSourceAuthority(sourceId, reason, {
      expectedIds,
      validateRecord: (record) => this.#validateFactorySource(record),
    });
  }
  project(args) {
    let scopeDecision;
    try {
      validateScopeDecisionRuntime(args?.scopeDecision);
      scopeDecision = args.scopeDecision;
    } catch {
      throw new Error('projection scope denied');
    }
    if (!['ALLOW', 'NARROW'].includes(scopeDecision.verdict) || scopeDecision.effective?.project !== this.projectId) throw new Error('projection project or scope denied');
    const requested = args.record_ids ?? args.records?.map((record) => record?.id);
    if (!Array.isArray(requested)) throw new TypeError('projection requires records or record_ids');
    const records = requested.map((id, index) => {
      const stored = this.store.fetch(id);
      if (!stored) throw new Error(`projection source missing: ${id}`);
      this.#validateFactorySource(stored);
      if (args.records) {
        const supplied = args.records[index];
        const fields = ['id', 'kind', 'content', 'source_provenance', 'confidence', 'visibility', 'qualifiers'];
        const suppliedProjection = Object.fromEntries(fields.map((field) => [field, supplied?.[field]]));
        const storedProjection = Object.fromEntries(fields.map((field) => [field, stored[field]]));
        if (canonicalJson(suppliedProjection) !== canonicalJson(storedProjection)) throw new Error(`projection record is not canonical: ${id}`);
      }
      return stored;
    });
    return createProjection({ ...args, records, scopeDecision });
  }

  #sources(ids) {
    if (!Array.isArray(ids)) throw new TypeError('source_ids must be an array');
    return ids.map((id) => {
      const source = this.store.fetch(id);
      if (!source) throw new Error(`consolidation source missing: ${id}`);
      this.#validateFactorySource(source);
      return source;
    });
  }

  #validateFactorySource(source) {
    if (source.project !== this.projectId) throw new Error(`memory source project denied: ${source.id}`);
    const versions = source.source_provenance?.source_versions ?? [source.source_provenance?.source_version];
    if (versions.length === 0 || versions.some((version) => !SOURCE_VERSION.test(version ?? ''))) throw new Error(`memory source version denied: ${source.id}`);
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
