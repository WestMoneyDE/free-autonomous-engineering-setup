// Memory fabric: local, free, deterministic. Append-only JSONL + structured
// records. Implements: append, fetch, query (via retrieval.mjs), supersede,
// conflict, consolidation, retention, provenance validation, recovery,
// derived-procedure lineage, revocation with propagation.
//
// AUTHORITY FIREWALL (non-negotiable, tested):
//  - the memory API REJECTS assurance-side kinds (grants, credentials, scopes,
//    approval/execution tokens, policy exceptions) — memory cannot mint authority;
//  - authority provenance is distinct from source provenance and survives
//    retrieval and consolidation;
//  - derived artifacts (procedures/skills) carry lineage and are capped at the
//    WEAKEST source authority (DerivedCapabilityAuthority <= SourceAuthority);
//  - revoking a source's authority propagates to every derived artifact:
//    a derived skill cannot keep pretending revoked authority
//    (SourceDeletion != DerivedArtifactRevocation — both are modeled);
//  - memory outputs are proposal-side only; nothing here produces an
//    execution permission. The effect gate never reads memory as authority.
import fs from 'node:fs';
import path from 'node:path';
import {
  validateMemoryRecord, validateProcedureRecord,
  ASSURANCE_KINDS, MEMORY_KINDS, AUTHORITY_ORDER,
} from '../schemas/schemas.mjs';

export class MemoryAuthorityError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MemoryAuthorityError';
  }
}

export class MemoryStore {
  constructor(dir) {
    this.dir = dir;
    this.path = path.join(dir, 'memory.jsonl');
    fs.mkdirSync(dir, { recursive: true });
    /** @type {Map<string, object>} */
    this.records = new Map();
    this.#load();
  }

  #load() {
    if (!fs.existsSync(this.path)) return;
    const lines = fs.readFileSync(this.path, 'utf8').split('\n').filter(Boolean);
    const goodLines = [];
    const corrupt = [];
    for (let i = 0; i < lines.length; i++) {
      let rec;
      try { rec = JSON.parse(lines[i]); } catch {
        // Only a corrupt TAIL line (partial write during a crash) is
        // recoverable; corruption in the middle of the log fails loudly.
        if (i === lines.length - 1) { corrupt.push(lines[i]); continue; }
        throw new Error(`memory log corrupt at line ${i + 1} (non-tail corruption): refusing to guess`);
      }
      goodLines.push(lines[i]);
      this.records.set(rec.id, rec);
    }
    if (corrupt.length) {
      // Quarantine the damaged line and REPAIR the log atomically, so later
      // appends never land behind a corrupt line (which would turn a
      // recoverable tail into unrecoverable mid-log corruption on the next
      // restart). Review finding R2-05.
      fs.appendFileSync(path.join(this.dir, 'memory.quarantine.jsonl'), corrupt.join('\n') + '\n');
      const tmp = this.path + '.tmp';
      fs.writeFileSync(tmp, goodLines.join('\n') + (goodLines.length ? '\n' : ''));
      fs.renameSync(tmp, this.path);
      this.append({
        source_provenance: { source: 'memory-store', source_version: 'memory-store@1', kind: 'repository', recorded_at: new Date().toISOString() },
        kind: 'episodic',
        content: `MEMORY LOG RECOVERY: quarantined ${corrupt.length} corrupt trailing line(s) after a partial write`,
        authority: { class: 'none', admissible_uses: [] },
        confidence: 'observed',
        retention: 'permanent',
        lineage: { derived_from: [], conflicts_with: [] },
      });
    }
  }

  #persist(rec) {
    fs.appendFileSync(this.path, JSON.stringify(rec) + '\n');
    this.records.set(rec.id, rec);
    return rec;
  }

  /**
   * Append a memory record. Provenance is REQUIRED; assurance kinds are
   * rejected; grant-like content in an admissible_uses escalation is rejected.
   */
  append(input) {
    if (ASSURANCE_KINDS.includes(input.kind)) {
      throw new MemoryAuthorityError(
        `memory API refuses assurance-side kind '${input.kind}': memory cannot mint grants, credentials, scopes, approval tokens, execution tokens or policy exceptions`,
      );
    }
    if (!MEMORY_KINDS.includes(input.kind)) {
      throw new MemoryAuthorityError(`unknown memory kind '${input.kind}' fails closed`);
    }
    const rec = {
      ...input,
      id: input.id ?? `mem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      created_at: input.created_at ?? new Date().toISOString(),
      schema_version: input.schema_version ?? 1,
      lineage: input.lineage ?? { derived_from: [], conflicts_with: [] },
      revoked: false,
      authority_revoked: false,
      authority: input.authority ?? { class: 'none', admissible_uses: [] },
    };
    validateMemoryRecord(rec);
    // A memory record can never carry an execution-permitting use tag.
    const forbiddenUses = ['execute-external-action', 'grant-permission', 'approve', 'mint-token'];
    for (const u of rec.authority.admissible_uses) {
      if (forbiddenUses.includes(u)) {
        throw new MemoryAuthorityError(`admissible_uses may describe proposal-side uses only; '${u}' is an execution/authority use and is refused`);
      }
    }
    return this.#persist(rec);
  }

  fetch(id) {
    const rec = this.records.get(id);
    if (!rec) return null;
    return this.#qualify(rec);
  }

  /** Attach epistemic qualifiers instead of hiding structure. */
  #qualify(rec) {
    const conflicts = rec.lineage.conflicts_with ?? [];
    const supersededBy = [...this.records.values()].find((r) => r.lineage?.supersedes === rec.id);
    return {
      ...rec,
      qualifiers: {
        superseded: Boolean(supersededBy),
        superseded_by: supersededBy?.id,
        has_unresolved_conflicts: conflicts.length > 0,
        conflicts_with: conflicts,
        revoked: rec.revoked,
        authority_revoked: rec.authority_revoked,
      },
    };
  }

  all() {
    return [...this.records.values()].map((r) => this.#qualify(r));
  }

  /** Intentional replacement. The old record stays discoverable, qualified. */
  supersede(oldId, input) {
    const old = this.records.get(oldId);
    if (!old) throw new Error(`cannot supersede unknown record ${oldId}`);
    return this.append({
      ...input,
      lineage: {
        derived_from: input.lineage?.derived_from ?? [oldId],
        conflicts_with: input.lineage?.conflicts_with ?? [],
        supersedes: oldId,
      },
    });
  }

  /** Record an unresolved contradiction. Never silently overwrites either side. */
  conflict(idA, idB, reason) {
    const a = this.records.get(idA);
    const b = this.records.get(idB);
    if (!a || !b) throw new Error('both records must exist to record a conflict');
    a.lineage.conflicts_with = [...new Set([...(a.lineage.conflicts_with ?? []), idB])];
    b.lineage.conflicts_with = [...new Set([...(b.lineage.conflicts_with ?? []), idA])];
    const marker = this.append({
      ...(a.project && a.project === b.project ? { project: a.project } : {}),
      kind: 'episodic',
      content: `CONFLICT recorded between ${idA} and ${idB}: ${reason}`,
      source_provenance: { source: 'memory-store', source_version: 'memory-store@1', kind: 'repository', recorded_at: new Date().toISOString() },
      authority: { class: 'none', admissible_uses: [] },
      confidence: 'observed',
      retention: 'project',
      lineage: { derived_from: [idA, idB], conflicts_with: [] },
    });
    // rewrite is append-only: persist updated linkage as new lines
    this.#persist(a);
    this.#persist(b);
    return marker;
  }

  /**
   * Consolidate several records into one summary record.
   * Preserves: lineage to every source, unresolved conflicts, negative
   * evidence markers, and applies the WEAKEST-authority rule.
   * Never converts hypothesis -> verified.
   */
  consolidate(ids, summaryContent, opts = {}) {
    const sources = ids.map((id) => {
      const r = this.records.get(id);
      if (!r) throw new Error(`consolidation source missing: ${id}`);
      return r;
    });
    const weakest = sources.reduce(
      (min, r) => (AUTHORITY_ORDER[r.authority.class] < AUTHORITY_ORDER[min] ? r.authority.class : min),
      sources[0].authority.class,
    );
    const intersectUses = sources
      .map((r) => new Set(r.authority.admissible_uses))
      .reduce((acc, s) => new Set([...acc].filter((x) => s.has(x))));
    const anyContradicted = sources.some((r) => r.confidence === 'contradicted');
    const allVerified = sources.every((r) => r.confidence === 'verified');
    const confidence = anyContradicted ? 'contradicted' : (allVerified ? 'verified' : 'hypothesis');
    const conflicts = [...new Set(sources.flatMap((r) => r.lineage.conflicts_with ?? []))];
    const anySourceRevoked = sources.some((r) => r.revoked || r.authority_revoked);
    const rec = this.append({
      kind: opts.kind ?? 'semantic',
      ...(opts.project ? { project: opts.project } : {}),
      content: summaryContent,
      source_provenance: {
        source: 'consolidation',
        source_version: 'memory-consolidation@1',
        source_versions: [...new Set(opts.sourceVersions ?? sources.map((r) => r.source_provenance.source_version).filter(Boolean))].sort(),
        kind: 'repository',
        recorded_at: new Date().toISOString(),
        ref: ids.join(','),
      },
      authority: { class: anySourceRevoked ? 'none' : weakest, admissible_uses: anySourceRevoked ? [] : [...intersectUses] },
      confidence,
      retention: opts.retention ?? 'project',
      visibility: opts.visibility ?? sources.map((r) => r.visibility ?? ['project']).reduce((acc, current) => acc.filter((item) => current.includes(item))),
      lineage: { derived_from: ids, conflicts_with: conflicts },
    });
    if (anySourceRevoked) {
      const stored = this.records.get(rec.id);
      stored.authority_revoked = true;
      this.#persist(stored);
      return this.#qualify(stored);
    }
    return rec;
  }

  /**
   * Derive a reusable procedure ("skill") from source records.
   * Lineage is mandatory; authority is capped at the weakest source.
   */
  deriveProcedure(sourceIds, { content, steps, retention = 'project', project, visibility, sourceVersions }) {
    const derived = this.consolidate(sourceIds, content, { kind: 'procedural', retention, project, visibility, sourceVersions });
    const stored = this.records.get(derived.id);
    stored.steps = steps;
    validateProcedureRecord(stored);
    this.#persist(stored);
    return this.#qualify(stored);
  }

  /**
   * Revoke a source's AUTHORITY and propagate through derived lineage.
   * Content stays discoverable (revocation != deletion), but authority and
   * admissible_uses of the source AND every transitively derived artifact are
   * voided. This is the SkillJack countermeasure:
   *   TransientAuthority -/-> PersistentAuthority.
   */
  descendantClosure(sourceId) {
    if (!this.records.has(sourceId)) throw new Error(`cannot inspect unknown record ${sourceId}`);
    const ids = [];
    const seen = new Set();
    const visit = (id) => {
      if (seen.has(id)) return;
      seen.add(id);
      ids.push(id);
      for (const record of this.records.values()) {
        if ((record.lineage?.derived_from ?? []).includes(id)) visit(record.id);
      }
    };
    visit(sourceId);
    return ids;
  }

  revokeSourceAuthority(sourceId, reason, { expectedIds, validateRecord } = {}) {
    const src = this.records.get(sourceId);
    if (!src) throw new Error(`cannot revoke unknown record ${sourceId}`);
    const closure = this.descendantClosure(sourceId);
    if (expectedIds !== undefined) {
      if (!Array.isArray(expectedIds) || expectedIds.length !== closure.length ||
          [...expectedIds].sort().some((id, index) => id !== [...closure].sort()[index])) {
        throw new Error('revocation closure changed; refusing partial mutation');
      }
    }
    if (validateRecord !== undefined) {
      if (typeof validateRecord !== 'function') throw new TypeError('revocation record validator must be a function');
      for (const id of closure) validateRecord(this.#qualify(this.records.get(id)));
    }
    const affected = [];
    src.revoked = true;
    for (const id of closure) {
      const rec = this.records.get(id);
      if (rec.authority_revoked) continue;
      rec.authority_revoked = true;
      rec.authority = { class: 'none', admissible_uses: [] };
      this.#persist(rec);
      affected.push(id);
    }
    this.append({
      ...(src.project ? { project: src.project } : {}),
      kind: 'episodic',
      content: `AUTHORITY REVOKED for ${sourceId} (${reason}); propagated to derived artifacts: ${affected.join(', ')}`,
      source_provenance: { source: 'memory-store', source_version: 'memory-store@1', kind: 'repository', recorded_at: new Date().toISOString() },
      authority: { class: 'none', admissible_uses: [] },
      confidence: 'observed',
      retention: 'permanent',
      lineage: { derived_from: [sourceId], conflicts_with: [] },
    });
    return affected;
  }

  /**
   * Delete a source record's CONTENT (retention). Deliberately does NOT
   * revoke derived artifacts: SourceDeletion != DerivedArtifactRevocation.
   * Callers who intend revocation must call revokeSourceAuthority().
   */
  deleteRecord(id) {
    const rec = this.records.get(id);
    if (!rec) return false;
    const tombstone = { ...rec, content: '[deleted]', deleted: true };
    this.#persist(tombstone);
    return true;
  }

  /** Deterministic retention sweep. */
  applyRetention(scope) {
    const removed = [];
    for (const rec of this.records.values()) {
      if (rec.retention === scope && !rec.deleted) {
        this.deleteRecord(rec.id);
        removed.push(rec.id);
      }
    }
    return removed.sort();
  }
}
