// Assurance store: approvals, grant consumption, policy versions.
// STRICTLY SEPARATE from agent memory:
//  - separate directory ('.state/assurance' vs '.state/memory');
//  - separate class with no shared code path into MemoryStore;
//  - creation requires a HUMAN-class actor;
//  - approvals bind actor, action, target, exact proposal digest, canonical
//    scope and half-open expiry (invalid at t >= expires_at);
//  - one-shot: consumption is atomic and a consumed approval can never be
//    replayed; a changed proposal digest invalidates the approval.
import fs from 'node:fs';
import path from 'node:path';
import { validateApprovalRequest, validateApprovalDecision } from '../schemas/schemas.mjs';

export class ApprovalError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'ApprovalError';
    this.code = code;
  }
}

export class AssuranceStore {
  /**
   * @param {string} dir MUST be a dedicated assurance directory
   * @param {object} [opts] { now }
   */
  constructor(dir, opts = {}) {
    this.dir = dir;
    this.path = path.join(dir, 'assurance.jsonl');
    this.now = opts.now ?? (() => Date.now());
    fs.mkdirSync(dir, { recursive: true });
    /** @type {Map<string, object>} */
    this.decisions = new Map();
    this.requests = new Map();
    this.#load();
  }

  #load() {
    if (!fs.existsSync(this.path)) return;
    for (const line of fs.readFileSync(this.path, 'utf8').split('\n').filter(Boolean)) {
      const rec = JSON.parse(line);
      if (rec.record_type === 'ApprovalDecision') this.decisions.set(rec.id, rec);
      if (rec.record_type === 'ApprovalRequest') this.requests.set(rec.id, rec);
      if (rec.record_type === 'GrantConsumption') {
        const d = this.decisions.get(rec.approval_id);
        if (d) d.consumed = true; // consumption is durable: no replay after crash
      }
    }
  }

  #persist(rec) {
    fs.appendFileSync(this.path, JSON.stringify(rec) + '\n');
    return rec;
  }

  request(input) {
    const req = {
      ...input,
      id: input.id ?? `apr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      requested_at: input.requested_at ?? new Date(this.now()).toISOString(),
    };
    validateApprovalRequest(req);
    this.requests.set(req.id, req);
    return this.#persist({ ...req, record_type: 'ApprovalRequest' });
  }

  /**
   * Record a human decision. ONLY a human-class actor may decide.
   * Model/supervisor/memory actors are rejected — capability is not authority.
   */
  decide(requestId, { decision, decided_by, decided_by_role, ttlSeconds = 3600 }) {
    const req = this.requests.get(requestId);
    if (!req) throw new ApprovalError(`unknown approval request ${requestId}`, 'UNKNOWN_REQUEST');
    if (decided_by_role !== 'human') {
      throw new ApprovalError(
        `approval decisions require human authority; role '${decided_by_role}' cannot approve (capability is not authority)`,
        'NOT_HUMAN',
      );
    }
    const nowMs = this.now();
    const rec = {
      id: `apd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      request_id: requestId,
      proposal_digest: req.proposal_digest,
      scope: req.scope,
      decision,
      decided_by,
      decided_by_role,
      decided_at: new Date(nowMs).toISOString(),
      expires_at: new Date(nowMs + ttlSeconds * 1000).toISOString(),
      one_shot: true,
      consumed: false,
    };
    validateApprovalDecision(rec);
    this.decisions.set(rec.id, rec);
    return this.#persist({ ...rec, record_type: 'ApprovalDecision' });
  }

  /**
   * Validate an approval against the EXACT current proposal digest + scope.
   * Fails on: rejection, digest mismatch (content changed after approval),
   * expiry (half-open), prior consumption.
   */
  validateForExecution(approvalId, currentProposalDigest, scope) {
    const a = this.decisions.get(approvalId);
    if (!a) throw new ApprovalError('unknown approval', 'UNKNOWN_APPROVAL');
    if (a.decision !== 'APPROVED') throw new ApprovalError('approval was rejected', 'REJECTED');
    if (a.consumed) throw new ApprovalError('approval already consumed (one-shot); replay denied', 'CONSUMED');
    if (a.proposal_digest !== currentProposalDigest) {
      throw new ApprovalError('proposal content changed after approval (digest mismatch); stale approval denied', 'DIGEST_MISMATCH');
    }
    if (a.scope !== scope) throw new ApprovalError('approval scope does not match gate-derived scope', 'SCOPE_MISMATCH');
    if (this.now() >= Date.parse(a.expires_at)) {
      throw new ApprovalError('approval expired (half-open: invalid at t >= expires_at)', 'EXPIRED');
    }
    return a;
  }

  /** Atomically consume the one-shot occurrence. */
  consume(approvalId, currentProposalDigest, scope) {
    const a = this.validateForExecution(approvalId, currentProposalDigest, scope);
    a.consumed = true;
    this.#persist({ record_type: 'GrantConsumption', approval_id: a.id, consumed_at: new Date(this.now()).toISOString() });
    return a;
  }
}
