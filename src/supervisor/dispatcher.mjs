// Dispatcher: the ONLY path from a work order to a worker. Dispatch is allowed
// only when (1) the current state permits that worker class, (2) no active
// non-expired lease exists (duplicate dispatch blocked), (3) the work-order
// version/hash still matches, and (4) the budget/authority policy is valid.
import { SPEC } from './state-machine.mjs';
import { LeaseManager, LeaseError } from './lease-manager.mjs';
import { workOrderHash } from '../evidence/hashing.mjs';
import { validateWorkOrder } from '../schemas/schemas.mjs';

export class DispatchError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'DispatchError';
    this.code = code;
  }
}

export class Dispatcher {
  /**
   * @param {object} deps { leases: LeaseManager, store: EventStore }
   */
  constructor({ leases, store }) {
    this.leases = leases;
    this.store = store;
  }

  /**
   * @param {object} args { project, workOrder, expectedHash, state, workerClass, actor, budgetValid }
   * @returns dispatch packet with lease
   */
  dispatch({ project, workOrder, expectedHash, state, workerClass, actor, budgetValid = true }) {
    validateWorkOrder(workOrder);

    // 1. state permits this worker class
    const permitted = SPEC.workerClasses[state];
    if (!permitted) throw new DispatchError(`state ${state} does not permit worker dispatch`, 'STATE_FORBIDS_DISPATCH');
    if (permitted !== workerClass) {
      throw new DispatchError(`state ${state} permits worker class ${permitted}, not ${workerClass}`, 'WRONG_WORKER_CLASS');
    }

    // 2. work-order hash must still match (no dispatch against changed content)
    const actualHash = workOrderHash(workOrder);
    if (expectedHash && actualHash !== expectedHash) {
      throw new DispatchError('work order content changed since scheduling (hash mismatch); re-plan required', 'HASH_MISMATCH');
    }

    // 3. budget/authority policy valid
    if (budgetValid !== true) throw new DispatchError('budget/authority policy invalid; dispatch refused', 'BUDGET_INVALID');

    // 4. lease (duplicate dispatch blocked here)
    const phase = workerClass === 'reviewer' ? 'review' : 'build';
    let lease;
    try {
      lease = this.leases.acquire(project, workOrder.id, phase, actor);
    } catch (e) {
      if (e instanceof LeaseError) throw new DispatchError(`duplicate dispatch blocked: ${e.message}`, 'DUPLICATE_DISPATCH');
      throw e;
    }

    const packet = {
      project,
      work_order_id: workOrder.id,
      work_order_hash: actualHash,
      worker_class: workerClass,
      lease_key: lease.key,
      fencing_token: lease.fencing_token,
      objective: workOrder.objective,
      scope: workOrder.scope,
      out_of_scope: workOrder.out_of_scope,
      acceptance_criteria: workOrder.acceptance_criteria,
      verification_commands: workOrder.verification_commands,
      risk_class: workOrder.risk_class,
      routing_class: workOrder.routing_class,
      budget_policy: workOrder.budget_policy,
    };
    this.store.append({
      type: 'worker_dispatched',
      actor,
      idempotency_key: `dispatch:${lease.key}:${lease.fencing_token}`,
      packet: { ...packet },
    });
    return packet;
  }
}
