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
export function reviewerPacket({ workOrder, diffRef, evidence, builderActor, securityContext }) {
  if (!diffRef) throw new RoleSeparationError('reviewer packet requires the actual diff reference');
  if (!evidence || evidence.length === 0) throw new RoleSeparationError('reviewer packet requires evidence records');
  if (securityContext !== undefined) validateSecurityContext(securityContext);
  const packet = {
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
  if (securityContext !== undefined) packet.security_context = structuredClone(securityContext);
  return packet;
}

function validateSecurityContext(context) {
  const digest = /^[0-9a-f]{64}$/;
  const exactKeys = (value, keys) => Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
  const validPath = (value) => typeof value === 'string' && value.startsWith('.state/evidence/strix/') && !value.includes('\\') && value.slice('.state/evidence/strix/'.length).split('/').every((part) => part && part !== '.' && part !== '..');
  const bounds = context?.bounds;
  if (!context || typeof context !== 'object' || Array.isArray(context)
    || !exactKeys(context, ['authorization_ref', 'scope_digest', 'clean_checkout_evidence', 'bounds', 'expected_output_paths'])
    || typeof context.authorization_ref !== 'string' || context.authorization_ref.length === 0
    || !digest.test(context.scope_digest ?? '')
    || typeof context.clean_checkout_evidence !== 'string' || context.clean_checkout_evidence.length === 0
    || !bounds || typeof bounds !== 'object' || Array.isArray(bounds)
    || !exactKeys(bounds, ['max_budget_usd', 'max_turns', 'max_seconds'])
    || !(typeof bounds.max_budget_usd === 'number' && Number.isFinite(bounds.max_budget_usd) && bounds.max_budget_usd > 0)
    || !(Number.isInteger(bounds.max_turns) && bounds.max_turns > 0)
    || !(Number.isInteger(bounds.max_seconds) && bounds.max_seconds > 0)
    || !Array.isArray(context.expected_output_paths) || context.expected_output_paths.length === 0
    || !context.expected_output_paths.every(validPath)) {
    throw new RoleSeparationError('reviewer security context must contain evidence-backed authorization, scope, checkout, bounds and output paths');
  }
}
