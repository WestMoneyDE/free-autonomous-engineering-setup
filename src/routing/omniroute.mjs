// Routing plane adapter. OmniRoute stays the ONLY provider/model router.
// This module contains NO competing router: the supervisor decides the task
// class, risk class and budget envelope; the concrete provider/model choice
// belongs to OmniRoute. What lives here:
//  - deterministic task-class -> route-id mapping (a lookup, not a router);
//  - hard-free vs free-preferred separation (hard-free fails closed);
//  - per-work-order session stickiness (no uncontrolled model hopping);
//  - normalized provider failure recording (never invented success);
//  - prompt-free telemetry records.
import { validateRoutingDecision, PROVIDER_FAILURE_CLASSES } from '../schemas/schemas.mjs';

const ROUTE_BY_TASK_CLASS = Object.freeze({
  'coding-standard': 'auto/coding',
  'coding-fast': 'auto/coding:fast',
  'coding-cheap': 'auto/coding:cheap',
  'coding-reliable': 'auto/coding:reliable',
  'coding-free-preferred': 'auto/coding:free',
  'reasoning-hard': 'auto/reasoning:pro',
});

export class RoutingError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'RoutingError';
    this.code = code;
  }
}

export class RoutingPlane {
  /**
   * @param {object} [opts]
   * @param {boolean} [opts.transportAttestsBudgetHeaders] whether the client
   *        path verifiably forwards X-OmniRoute-Budget headers. Without this
   *        attestation a 'hard-request-cap' policy REFUSES to run rather than
   *        pretending the cap is enforced.
   * @param {boolean} [opts.endpointIsRestrictedFreePool] whether the endpoint
   *        candidate pool is independently restricted to no-cost candidates.
   *        Without it 'hard-free' fails closed (fail-open :free filter cannot
   *        be a $0 guarantee).
   * @param {import('../state/event-store.mjs').EventStore} [opts.store]
   *        optional durable persistence: work-order -> route stickiness
   *        survives supervisor restarts (review finding R2-07), so a restart
   *        cannot silently hop models mid-work-order.
   */
  constructor(opts = {}) {
    this.transportAttestsBudgetHeaders = opts.transportAttestsBudgetHeaders ?? false;
    this.endpointIsRestrictedFreePool = opts.endpointIsRestrictedFreePool ?? false;
    this.store = opts.store ?? null;
    /** @type {Map<string, object>} work_order_id -> sticky decision */
    this.sticky = new Map();
    this.decisions = [];
    if (this.store) {
      for (const ev of this.store.all()) {
        if (ev.type === 'routing_decision' && ev.decision) {
          this.sticky.set(ev.decision.work_order_id, ev.decision);
          this.decisions.push(ev.decision);
        }
      }
    }
  }

  /**
   * Decide the route envelope for a work order. Sticky per work order:
   * repeated calls return the SAME decision unless an escalation event with a
   * recorded reason changes the class.
   */
  decide({ workOrderId, taskClass, riskClass, budgetPolicy, escalationReason }) {
    const existing = this.sticky.get(workOrderId);
    if (existing && !escalationReason) return existing; // stickiness: no silent hopping
    if (existing && escalationReason && existing.task_class === taskClass) {
      throw new RoutingError('escalation recorded but task class unchanged: nothing to escalate to', 'NO_OP_ESCALATION');
    }

    const route = ROUTE_BY_TASK_CLASS[taskClass];
    if (!route) throw new RoutingError(`unknown task class '${taskClass}' fails closed`, 'UNKNOWN_TASK_CLASS');

    if (budgetPolicy === 'hard-free') {
      if (!this.endpointIsRestrictedFreePool) {
        throw new RoutingError(
          "hard-free budget policy requires an endpoint whose candidate pool is independently restricted to no-cost candidates; the ':free' tier filter is fail-open upstream and is NOT a $0 guarantee",
          'HARD_FREE_UNENFORCEABLE',
        );
      }
      if (taskClass !== 'coding-free-preferred') {
        throw new RoutingError('hard-free policy permits only the free route class', 'HARD_FREE_ROUTE_MISMATCH');
      }
    }
    if (budgetPolicy === 'hard-request-cap' && !this.transportAttestsBudgetHeaders) {
      throw new RoutingError(
        'hard-request-cap requires verified forwarding of X-OmniRoute-Budget headers by the client transport; unverified forwarding cannot be treated as an enforced control',
        'BUDGET_HEADERS_UNVERIFIED',
      );
    }

    const decision = {
      id: `route-${workOrderId}-${this.decisions.length + 1}`,
      work_order_id: workOrderId,
      task_class: taskClass,
      risk_class: riskClass,
      budget_policy: budgetPolicy,
      route,
      sticky_session: `wo-${workOrderId}`,
      decided_at: new Date().toISOString(),
    };
    if (escalationReason) decision.escalation_reason = escalationReason;
    validateRoutingDecision(decision);
    this.sticky.set(workOrderId, decision);
    this.decisions.push(decision);
    if (this.store) {
      this.store.append({ type: 'routing_decision', actor: 'supervisor', decision, idempotency_key: `route:${decision.id}` });
    }
    return decision;
  }

  /**
   * Record a provider failure against a decision. A fallback that leaves the
   * budget policy is a violation, not a success.
   */
  recordProviderFailure(workOrderId, failureClass) {
    if (!PROVIDER_FAILURE_CLASSES.includes(failureClass)) {
      throw new RoutingError(`unknown failure class '${failureClass}': unknown failure is failure, not success`, 'UNKNOWN_FAILURE');
    }
    const decision = this.sticky.get(workOrderId);
    if (!decision) throw new RoutingError('no routing decision for this work order', 'NO_DECISION');
    const telemetry = {
      work_order_id: workOrderId,
      route: decision.route,
      failure_class: failureClass,
      recorded_at: new Date().toISOString(),
      // deliberately NO prompt, NO source content, NO provider raw message
    };
    return telemetry;
  }
}
