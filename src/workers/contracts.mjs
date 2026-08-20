// Worker contracts: bounded task packets in, structured returns out.
// Role separation enforced in code:
//  - a builder can never review its own work order (identity collision denied);
//  - reviewers must receive the ACTUAL diff reference and evidence refs;
//  - worker returns carry transition PROPOSALS only — validation and
//    persistence stay with the supervisor (see state-machine.evaluateProposal).
import { validateWorkerResult, validateReviewVerdict } from '../schemas/schemas.mjs';

export class RoleSeparationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RoleSeparationError';
  }
}

/** Validate a structured builder/planner return. */
export function acceptWorkerReturn(raw) {
  const result = validateWorkerResult(raw);
  if (result.role === 'reviewer' || result.role === 'security-reviewer') {
    throw new RoleSeparationError('review results must be submitted as ReviewVerdict, not WorkerResult');
  }
  return result;
}

/**
 * Validate a review verdict. Enforces reviewer independence:
 * reviewer identity must differ from the builder identity.
 */
export function acceptReviewVerdict(raw, { builderActor }) {
  const verdict = validateReviewVerdict(raw);
  if (verdict.reviewer === builderActor) {
    throw new RoleSeparationError(`builder '${builderActor}' cannot review own work: independent review required`);
  }
  if (verdict.reviewer === verdict.builder) {
    throw new RoleSeparationError('reviewer and builder identity collision: independent review required');
  }
  if (verdict.builder !== builderActor) {
    throw new RoleSeparationError(`verdict names builder '${verdict.builder}' but the work order builder is '${builderActor}'`);
  }
  return verdict;
}

/**
 * Build the reviewer's input packet. The reviewer sees the actual diff,
 * the acceptance criteria and the evidence — never only the builder's summary.
 */
export function reviewerPacket({ workOrder, diffRef, evidence, builderActor }) {
  if (!diffRef) throw new RoleSeparationError('reviewer packet requires the actual diff reference');
  if (!evidence || evidence.length === 0) throw new RoleSeparationError('reviewer packet requires evidence records');
  return {
    work_order_id: workOrder.id,
    objective: workOrder.objective,
    acceptance_criteria: workOrder.acceptance_criteria,
    risk_class: workOrder.risk_class,
    diff_ref: diffRef,
    evidence_refs: evidence.map((e) => e.id),
    builder: builderActor,
    review_dimensions: [
      'actual diff vs acceptance criteria',
      'tests/evidence freshness and outcomes',
      'security/authority-model impact',
      'scope and permission changes',
      'failure and fallback paths',
    ],
  };
}
