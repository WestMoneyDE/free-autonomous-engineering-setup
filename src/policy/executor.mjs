// Single effect executor. The ONLY component that realizes external effects.
// Requirements enforced here (and tested):
//  - executes only with a gate ALLOW verdict whose single-use nonce is valid
//    (a worker cannot execute directly, cannot reuse a verdict, cannot forge one);
//  - consumes the bound one-shot approval atomically before executing;
//  - one-shot semantics: an occurrence executes at most once; FAIL/CANCELLED
//    is persisted exactly and never auto-rerun;
//  - OUTCOME_UNKNOWN != NOT_EXECUTED: an UNKNOWN outcome holds its scope
//    reservation and blocks further executions on that scope until a human
//    reconciles it.
import { validateExecutionResult } from '../schemas/schemas.mjs';
import { proposalDigest } from '../evidence/hashing.mjs';

export class ExecutionError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'ExecutionError';
    this.code = code;
  }
}

export class Executor {
  /**
   * @param {object} deps { gate: EffectGate, assurance: AssuranceStore, store: EventStore, now? }
   */
  constructor({ gate, assurance, store, now }) {
    this.gate = gate;
    this.assurance = assurance;
    this.store = store;
    this.now = now ?? (() => Date.now());
    /** @type {Map<string, object>} scope -> unresolved UNKNOWN result */
    this.unknownReservations = new Map();
    /** @type {Map<string, object>} proposal digest -> result (occurrence guard) */
    this.executedDigests = new Map();
    // Occurrence guards are DURABLE: rebuild both maps from the event log so a
    // crash/restart can never re-open an executed occurrence or drop an
    // unreconciled UNKNOWN reservation.
    //
    // Write-ahead discipline (review finding R2-01): a RESERVATION event is
    // persisted BEFORE the side effect runs. A reservation with no matching
    // final execution record means the process died inside the crash window —
    // the effect may or may not have happened. Such occurrences are replayed
    // as OUTCOME UNKNOWN: the digest stays consumed and the scope stays
    // blocked until a human reconciles it. OUTCOME_UNKNOWN != NOT_EXECUTED.
    /** @type {Map<string, object>} digest -> reservation without final record */
    const pendingReserves = new Map();
    for (const ev of this.store.all()) {
      if (ev.type === 'external_execution_reserved') {
        pendingReserves.set(ev.proposal_digest, ev);
      }
      if (ev.type === 'external_execution' && ev.result) {
        pendingReserves.delete(ev.result.proposal_digest);
        this.executedDigests.set(ev.result.proposal_digest, ev.result);
        if (ev.result.outcome === 'UNKNOWN' && ev.scope) this.unknownReservations.set(ev.scope, ev.result);
      }
      if (ev.type === 'unknown_outcome_reconciled') this.unknownReservations.delete(ev.scope);
    }
    for (const [digest, ev] of pendingReserves) {
      const synthesized = {
        id: `exec-crash-${digest.slice(0, 12)}`,
        proposal_id: ev.proposal_id,
        proposal_digest: digest,
        outcome: 'UNKNOWN',
        executed_at: ev.recorded_at,
        detail: 'process crashed between reservation and result record; effect may or may not have occurred',
        retried_automatically: false,
        recovered_from_crash: true,
      };
      this.executedDigests.set(digest, synthesized);
      if (ev.scope && !this.unknownReservations.has(ev.scope)) this.unknownReservations.set(ev.scope, synthesized);
    }
  }

  /**
   * Execute an approved, admissible proposal exactly once.
   * @param {object} proposal EffectProposal (exact object the gate saw)
   * @param {object} allowVerdict the gate's ALLOW verdict
   * @param {(proposal: object) => {outcome: string, detail?: string}} performFn actual side effect
   */
  execute(proposal, allowVerdict, performFn) {
    if (!allowVerdict || allowVerdict.verdict !== 'ALLOW') {
      throw new ExecutionError(`executor requires an ALLOW verdict; got ${allowVerdict?.verdict ?? 'none'} — no verdict except ALLOW permits execution`, 'NOT_ALLOWED');
    }
    if (!this.gate.consumeAllowNonce(allowVerdict.gate_nonce)) {
      throw new ExecutionError('gate nonce invalid or already used: a verdict authorizes one execution attempt only', 'NONCE_INVALID');
    }
    const digest = proposalDigest(proposal);
    if (digest !== allowVerdict.proposal_digest) {
      throw new ExecutionError('proposal mutated between gate and executor (digest mismatch)', 'DIGEST_MISMATCH');
    }
    if (this.executedDigests.has(digest)) {
      const prior = this.executedDigests.get(digest);
      throw new ExecutionError(`occurrence already executed with outcome ${prior.outcome}; one-shot by default — a rerun requires a new work order, a new proposal and a new approval`, 'ALREADY_EXECUTED');
    }
    if (this.unknownReservations.has(allowVerdict.scope)) {
      throw new ExecutionError(`scope '${allowVerdict.scope}' holds an unreconciled UNKNOWN outcome; OUTCOME_UNKNOWN != NOT_EXECUTED — reconcile before any further action`, 'SCOPE_RESERVED');
    }
    // consume the one-shot approval atomically BEFORE the side effect
    if (allowVerdict.approval_id) {
      this.assurance.consume(allowVerdict.approval_id, digest, allowVerdict.scope);
    }

    // WRITE-AHEAD RESERVATION: persist the occurrence BEFORE the side effect.
    // If the process dies after performFn but before the final record, the
    // restart replay finds this reservation and treats the occurrence as
    // OUTCOME UNKNOWN (digest consumed, scope blocked) instead of forgetting
    // that an effect may have happened.
    this.store.append({
      type: 'external_execution_reserved',
      actor: 'executor',
      proposal_id: proposal.id,
      proposal_digest: digest,
      scope: allowVerdict.scope,
      idempotency_key: `exec-reserve:${digest}`,
    });

    let outcome = 'UNKNOWN';
    let detail;
    try {
      const r = performFn(proposal);
      outcome = r?.outcome ?? 'UNKNOWN';
      detail = r?.detail;
    } catch (e) {
      outcome = 'FAIL';
      detail = `execution threw: ${e.message}`;
    }
    const result = {
      id: `exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      proposal_id: proposal.id,
      proposal_digest: digest,
      approval_id: allowVerdict.approval_id ?? undefined,
      outcome,
      executed_at: new Date(this.now()).toISOString(),
      detail,
      retried_automatically: false,
    };
    validateExecutionResult(result);
    this.executedDigests.set(digest, result);
    if (outcome === 'UNKNOWN') this.unknownReservations.set(allowVerdict.scope, result);
    this.store.append({ type: 'external_execution', actor: 'executor', result, scope: allowVerdict.scope, idempotency_key: `exec:${digest}` });
    return result;
  }

  /**
   * Human-driven reconciliation of an UNKNOWN outcome. Requires human role.
   * resolvedOutcome must state what ACTUALLY happened (SUCCESS or FAIL or
   * NOT_EXECUTED after external verification).
   */
  reconcileUnknown(scope, resolvedOutcome, { actor, role }) {
    if (role !== 'human') throw new ExecutionError('reconciliation of an UNKNOWN external outcome requires human authority', 'NOT_HUMAN');
    const pending = this.unknownReservations.get(scope);
    if (!pending) throw new ExecutionError(`no unresolved UNKNOWN outcome for scope '${scope}'`, 'NOTHING_PENDING');
    if (!['SUCCESS', 'FAIL', 'NOT_EXECUTED'].includes(resolvedOutcome)) {
      throw new ExecutionError('resolution must be SUCCESS, FAIL or NOT_EXECUTED as externally verified', 'BAD_RESOLUTION');
    }
    this.unknownReservations.delete(scope);
    this.store.append({ type: 'unknown_outcome_reconciled', actor, scope, original: pending.id, resolved_outcome: resolvedOutcome });
    return { scope, resolved_outcome: resolvedOutcome };
  }
}
