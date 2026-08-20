// Append-only evidence ledger. Records verification outcomes with exact
// semantics: FAIL != PASS, NOT_RUN != PASS, UNKNOWN stays UNKNOWN.
// Content hashes make evidence version-bound and tamper-evident.
import fs from 'node:fs';
import path from 'node:path';
import { validateEvidenceRecord, CHECK_OUTCOMES } from '../schemas/schemas.mjs';
import { sha256Hex } from './hashing.mjs';

export class EvidenceLedger {
  constructor(dir) {
    this.dir = dir;
    this.path = path.join(dir, 'evidence.jsonl');
    fs.mkdirSync(dir, { recursive: true });
  }

  /**
   * Record evidence. `content` (optional) is hashed, never stored raw, so the
   * ledger cannot leak secrets or private prompts by construction.
   */
  record(entry, content) {
    const record = {
      ...entry,
      id: entry.id ?? `ev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      recorded_at: entry.recorded_at ?? new Date().toISOString(),
    };
    if (content !== undefined) record.content_sha256 = sha256Hex(content);
    validateEvidenceRecord(record);
    if (!CHECK_OUTCOMES.includes(record.outcome)) throw new Error(`invalid outcome ${record.outcome}`);
    fs.appendFileSync(this.path, JSON.stringify(record) + '\n');
    return record;
  }

  all() {
    if (!fs.existsSync(this.path)) return [];
    return fs.readFileSync(this.path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  }

  byWorkOrder(workOrderId) {
    return this.all().filter((e) => e.work_order_id === workOrderId);
  }

  /**
   * Completion gate helper: evidence supports completion ONLY if every
   * required check has a fresh PASS. NOT_RUN, UNKNOWN, BLOCKED and FAIL all
   * refuse completion — missing evidence is never success.
   */
  supportsCompletion(workOrderId, requiredKinds) {
    const records = this.byWorkOrder(workOrderId);
    const unmet = [];
    for (const kind of requiredKinds) {
      const matching = records.filter((r) => r.kind === kind);
      const latest = matching[matching.length - 1];
      if (!latest) { unmet.push(`${kind}: NO_EVIDENCE`); continue; }
      if (latest.outcome !== 'PASS') unmet.push(`${kind}: ${latest.outcome}`);
    }
    return { ok: unmet.length === 0, unmet };
  }

  /** SHA256 manifest over a set of files (for external returns / packaging). */
  manifest(files) {
    const entries = files.map((f) => ({
      path: f,
      sha256: sha256Hex(fs.readFileSync(f)),
      bytes: fs.statSync(f).size,
    }));
    return { schema: 'evidence-manifest-v1', created_at: new Date().toISOString(), files: entries };
  }
}
