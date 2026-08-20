// Provider-wait handling. Provider/network failure is WAIT or FAIL, never
// success. Wait records carry ONLY normalized routing metadata — no raw
// provider messages — and resume attempts are bounded.
import { validateProviderWait, PROVIDER_FAILURE_CLASSES } from '../schemas/schemas.mjs';

export class ProviderWaitManager {
  /**
   * @param {object} [opts]
   * @param {number} [opts.maxAttempts]
   * @param {() => number} [opts.now]
   * @param {import('../state/event-store.mjs').EventStore} [opts.store]
   *        optional durable persistence: wait history survives restarts
   *        (review finding R2-06 — a WAIT_PROVIDER must not degrade to
   *        "no wait recorded" after a supervisor restart)
   */
  constructor(opts = {}) {
    this.maxAttempts = opts.maxAttempts ?? 3;
    this.now = opts.now ?? (() => Date.now());
    this.store = opts.store ?? null;
    /** @type {Map<string, object[]>} work_order_id -> waits */
    this.waits = new Map();
    if (this.store) {
      for (const ev of this.store.all()) {
        if (ev.type === 'provider_wait' && ev.record) {
          const list = this.waits.get(ev.record.work_order_id) ?? [];
          list.push(ev.record);
          this.waits.set(ev.record.work_order_id, list);
        }
      }
    }
  }

  /**
   * Record a provider failure. AUTH_FAILURE and BUDGET_BLOCKED are not
   * transient: they yield FAIL-class outcomes requiring a policy/human fix,
   * never silent retries or silent fallbacks.
   */
  recordFailure(workOrderId, failureClass, meta = {}) {
    if (!PROVIDER_FAILURE_CLASSES.includes(failureClass)) {
      throw new Error(`unknown provider failure class: ${failureClass} (unknown failure is not success)`);
    }
    const list = this.waits.get(workOrderId) ?? [];
    const record = {
      id: `pw-${workOrderId}-${list.length + 1}`,
      work_order_id: workOrderId,
      failure_class: failureClass,
      recorded_at: new Date(this.now()).toISOString(),
      attempt: list.length + 1,
      max_attempts: this.maxAttempts,
    };
    if (meta.retry_after_seconds !== undefined) record.retry_after_seconds = meta.retry_after_seconds;
    if (meta.reset_at !== undefined) record.reset_at = meta.reset_at;
    validateProviderWait(record);
    list.push(record);
    this.waits.set(workOrderId, list);
    if (this.store) {
      this.store.append({ type: 'provider_wait', actor: 'supervisor', record, idempotency_key: `pw:${record.id}` });
    }

    const transient = ['RATE_LIMITED', 'MODEL_UNAVAILABLE', 'NETWORK_FAILURE', 'RUNTIME_FAILURE', 'CONTEXT_LIMIT'].includes(failureClass);
    const withinBound = record.attempt < this.maxAttempts;
    return {
      record,
      recommendedEvent: transient ? 'provider_failure' : 'fail',
      recommendedState: transient ? 'WAIT_PROVIDER' : 'FAIL',
      resumeAllowed: transient && withinBound,
    };
  }

  /** Guard input for WAIT_PROVIDER -> READY. */
  canResume(workOrderId) {
    const list = this.waits.get(workOrderId) ?? [];
    const last = list[list.length - 1];
    if (!last) return { ok: false, reason: 'no wait recorded' };
    if (last.attempt >= this.maxAttempts) return { ok: false, reason: 'attempt bound exhausted; diagnose or escalate' };
    const readyAt = last.reset_at
      ? Date.parse(last.reset_at)
      : Date.parse(last.recorded_at) + (last.retry_after_seconds ?? 0) * 1000;
    if (this.now() < readyAt) return { ok: false, reason: `wait not elapsed until ${new Date(readyAt).toISOString()}` };
    return { ok: true };
  }
}
