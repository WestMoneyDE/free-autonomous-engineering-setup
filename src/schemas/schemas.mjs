// Structured record schemas and runtime validators.
// Zero-dependency by design: worker/model output is untrusted input, so the
// trust boundary is enforced at runtime, not at compile time.
// Closed enums enforce exact outcome semantics:
//   UNKNOWN != FALSE, UNKNOWN != NOT_EXECUTED, FAIL != SUCCESS,
//   TRANSPORT_FAILURE != NEGATIVE_RESULT, NOT_RUN != PASS.

import { normalizeScopeContract, validateScopeDecisionRuntime } from '../policy/scope-engine.mjs';

export const WORK_ORDER_STATES = Object.freeze([
  'PLANNED', 'READY', 'IN_PROGRESS', 'READY_FOR_REVIEW', 'CHANGES_REQUESTED',
  'BLOCKED', 'WAIT_PROVIDER', 'FOUNDER_REQUIRED', 'APPROVED_FOR_EXTERNAL_ACTION',
  'DONE', 'FAIL', 'CANCELLED',
]);
export const TERMINAL_STATES = Object.freeze(['DONE', 'FAIL', 'CANCELLED']);

export const RISK_CLASSES = Object.freeze(['LOW', 'MEDIUM', 'HIGH', 'CONSEQUENTIAL']);
export const ROLES = Object.freeze(['planner', 'builder', 'reviewer', 'security-reviewer', 'supervisor', 'human']);
export const REVIEW_VERDICTS = Object.freeze(['PASS', 'CHANGES_REQUESTED', 'RISK_ESCALATION', 'FOUNDER_REQUIRED']);

// Verification/check outcomes. NOT_RUN and UNKNOWN are first-class and never
// collapse into PASS or FAIL.
export const CHECK_OUTCOMES = Object.freeze(['PASS', 'FAIL', 'NOT_RUN', 'BLOCKED', 'UNKNOWN']);

// External execution outcomes. UNKNOWN means the effect may or may not have
// occurred; it is NOT equivalent to NOT_EXECUTED and blocks the scope.
export const EXECUTION_OUTCOMES = Object.freeze(['SUCCESS', 'FAIL', 'CANCELLED', 'BLOCKED', 'NOT_EXECUTED', 'UNKNOWN']);

// Provider failure classes (transport failures are never scientific/negative results).
export const PROVIDER_FAILURE_CLASSES = Object.freeze([
  'RATE_LIMITED', 'AUTH_FAILURE', 'MODEL_UNAVAILABLE', 'BUDGET_BLOCKED',
  'CONTEXT_LIMIT', 'RUNTIME_FAILURE', 'NETWORK_FAILURE',
]);

export const MEMORY_KINDS = Object.freeze(['working', 'episodic', 'semantic', 'procedural', 'evidence-ref']);
// Kinds that may NEVER be written through the memory API (assurance side).
export const ASSURANCE_KINDS = Object.freeze(['grant', 'credential', 'scope', 'approval', 'approval-token', 'execution-token', 'policy-exception', 'assurance']);

export const AUTHORITY_CLASSES = Object.freeze(['none', 'observation', 'assistant-suggestion', 'external-document', 'tool-output', 'user-statement', 'user-authorization']);
// Ordering for weakest-authority consolidation (index = strength).
export const AUTHORITY_ORDER = Object.freeze({
  'none': 0, 'tool-output': 1, 'external-document': 2, 'assistant-suggestion': 3,
  'observation': 4, 'user-statement': 5, 'user-authorization': 6,
});

export const EFFECT_EXTERNALITY = Object.freeze(['internal', 'external']);
export const EFFECT_REVERSIBILITY = Object.freeze(['reversible', 'partially-reversible', 'irreversible']);
export const GATE_VERDICTS = Object.freeze(['ALLOW', 'REPAIR', 'DEFER', 'DENY', 'FALLBACK']);
export const CAPABILITY_STATUSES = Object.freeze(['OPERATIONAL', 'IMPLEMENTED', 'SPECIFIED_ONLY', 'PLANNED', 'NOT_APPLICABLE', 'NOT_CLAIMED']);
export const BUDGET_POLICIES = Object.freeze(['free-preferred', 'hard-free', 'cheap-preferred', 'hard-request-cap', 'premium-allowed']);
export const SCOPE_VERDICTS = Object.freeze(['ALLOW', 'NARROW', 'DEFER', 'DENY']);

class ValidationError extends Error {
  constructor(type, issues) {
    super(`${type} invalid: ${issues.join('; ')}`);
    this.name = 'ValidationError';
    this.type = type;
    this.issues = issues;
  }
}
export { ValidationError };

const isStr = (v) => typeof v === 'string' && v.length > 0;
const isIso = (v) => isStr(v) && !Number.isNaN(Date.parse(v));
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isArr = Array.isArray;
const isObj = (v) => v !== null && typeof v === 'object' && !isArr(v);

function check(type, obj, rules) {
  const issues = [];
  if (!isObj(obj)) throw new ValidationError(type, ['record must be an object']);
  for (const [field, rule] of Object.entries(rules)) {
    const v = obj[field];
    if (v === undefined || v === null) {
      if (!rule.optional) issues.push(`missing field: ${field}`);
      continue;
    }
    if (rule.enum && !rule.enum.includes(v)) issues.push(`${field} must be one of ${rule.enum.join('|')}, got ${JSON.stringify(v)}`);
    if (rule.test && !rule.test(v)) issues.push(`${field} failed ${rule.desc || 'type check'}`);
  }
  if (issues.length) throw new ValidationError(type, issues);
  return obj;
}

// ---------------------------------------------------------------- provenance
export function validateProvenanceRef(o) {
  return check('ProvenanceRef', o, {
    source: { test: isStr, desc: 'non-empty string' },
    kind: { enum: ['repository', 'session', 'human', 'tool', 'external-document', 'model'] },
    recorded_at: { test: isIso, desc: 'ISO-8601' },
    ref: { optional: true, test: isStr },
  });
}

export function validateConflictRef(o) {
  return check('ConflictRef', o, {
    record_id: { test: isStr },
    reason: { test: isStr },
    detected_at: { test: isIso, desc: 'ISO-8601' },
    resolved: { optional: true, test: (v) => typeof v === 'boolean' },
    resolution_evidence: { optional: true, test: isStr },
  });
}

// ---------------------------------------------------------------- work order
export function validateWorkOrder(o) {
  const r = check('WorkOrder', o, {
    id: { test: isStr },
    project: { test: isStr },
    created_at: { test: isIso, desc: 'ISO-8601' },
    requested_by: { test: isStr },
    objective: { test: isStr },
    scope: { test: isArr, desc: 'array' },
    out_of_scope: { test: isArr, desc: 'array' },
    acceptance_criteria: { test: (v) => isArr(v) && v.length > 0, desc: 'non-empty array' },
    verification_commands: { test: isArr, desc: 'array' },
    risk_class: { enum: RISK_CLASSES },
    routing_class: { test: isStr },
    budget_policy: { enum: BUDGET_POLICIES },
    max_attempts: { test: (v) => Number.isInteger(v) && v > 0, desc: 'positive integer' },
    independent_review_required: { test: (v) => typeof v === 'boolean', desc: 'boolean' },
    external_effects: { test: isArr, desc: 'array' },
    version: { test: (v) => Number.isInteger(v) && v >= 1, desc: 'integer >= 1' },
  });
  return r;
}

export function validateProjectState(o) {
  return check('ProjectState', o, {
    project: { test: isStr },
    status: { enum: WORK_ORDER_STATES },
    active_work_order: { optional: true, test: isStr },
    branch: { optional: true, test: isStr },
    blocker: { optional: true, test: isStr },
    next_action: { optional: true, test: isStr },
    updated_at: { test: isIso, desc: 'ISO-8601' },
    schema_version: { test: (v) => Number.isInteger(v) && v >= 1, desc: 'integer >= 1' },
  });
}

export function validateSession(o) {
  return check('Session', o, {
    id: { test: isStr },
    work_order_id: { test: isStr },
    started_at: { test: isIso, desc: 'ISO-8601' },
    actor: { test: isStr },
    role: { enum: ROLES },
    routing_class: { optional: true, test: isStr },
    base_ref: { optional: true, test: isStr },
  });
}

export function validateSupervisorLease(o) {
  return check('SupervisorLease', o, {
    key: { test: isStr, desc: 'project+work-order+phase key' },
    holder: { test: isStr },
    fencing_token: { test: (v) => Number.isInteger(v) && v >= 1, desc: 'monotonic integer' },
    acquired_at: { test: isIso, desc: 'ISO-8601' },
    expires_at: { test: isIso, desc: 'ISO-8601' },
    released: { test: (v) => typeof v === 'boolean', desc: 'boolean' },
  });
}

export function validateProviderWait(o) {
  return check('ProviderWait', o, {
    id: { test: isStr },
    work_order_id: { test: isStr },
    failure_class: { enum: PROVIDER_FAILURE_CLASSES },
    recorded_at: { test: isIso, desc: 'ISO-8601' },
    retry_after_seconds: { optional: true, test: (v) => isNum(v) && v >= 0 },
    reset_at: { optional: true, test: isIso },
    attempt: { test: (v) => Number.isInteger(v) && v >= 1, desc: 'integer >= 1' },
    max_attempts: { test: (v) => Number.isInteger(v) && v >= 1, desc: 'integer >= 1' },
    // Deliberately NO raw provider message field: normalized metadata only.
  });
}

export function validateWorkerResult(o) {
  const r = check('WorkerResult', o, {
    session_id: { test: isStr },
    work_order_id: { test: isStr },
    actor: { test: isStr },
    role: { enum: ROLES },
    outcome: { enum: CHECK_OUTCOMES },
    changed_files: { test: isArr, desc: 'array' },
    checks: { test: isArr, desc: 'array of {name, command, outcome}' },
    blockers: { test: isArr, desc: 'array' },
    proposed_next_state: { enum: WORK_ORDER_STATES },
    evidence_refs: { test: isArr, desc: 'array' },
    routing_observations: { optional: true, test: isObj },
  });
  for (const c of r.checks) {
    check('WorkerResult.check', c, {
      name: { test: isStr },
      outcome: { enum: CHECK_OUTCOMES },
    });
  }
  return r;
}

export function validateReviewVerdict(o) {
  return check('ReviewVerdict', o, {
    id: { test: isStr },
    work_order_id: { test: isStr },
    reviewer: { test: isStr },
    reviewer_role: { enum: ['reviewer', 'security-reviewer'] },
    builder: { test: isStr, desc: 'actor whose work is reviewed' },
    verdict: { enum: REVIEW_VERDICTS },
    diff_ref: { test: isStr, desc: 'reference to the actual diff reviewed' },
    evidence_refs: { test: (v) => isArr(v) && v.length > 0, desc: 'non-empty array' },
    findings: { test: isArr, desc: 'array' },
    created_at: { test: isIso, desc: 'ISO-8601' },
  });
}

export function validateEvidenceRecord(o) {
  return check('EvidenceRecord', o, {
    id: { test: isStr },
    kind: { enum: ['test', 'typecheck', 'lint', 'build', 'security', 'review', 'manifest', 'external-return', 'recovery', 'other'] },
    work_order_id: { optional: true, test: isStr },
    command: { optional: true, test: isStr },
    outcome: { enum: CHECK_OUTCOMES },
    content_sha256: { optional: true, test: (v) => /^[0-9a-f]{64}$/.test(v), desc: 'sha256 hex' },
    recorded_at: { test: isIso, desc: 'ISO-8601' },
    actor: { test: isStr },
    detail: { optional: true, test: isStr },
  });
}

export function validateMemoryRecord(o) {
  const r = check('MemoryRecord', o, {
    id: { test: isStr },
    kind: { enum: MEMORY_KINDS },
    created_at: { test: isIso, desc: 'ISO-8601' },
    content: { test: isStr },
    source_provenance: { test: isObj, desc: 'ProvenanceRef' },
    authority: { test: isObj, desc: '{class, admissible_uses}' },
    confidence: { enum: ['hypothesis', 'observed', 'verified', 'contradicted'] },
    schema_version: { test: (v) => Number.isInteger(v) && v >= 1, desc: 'integer >= 1' },
    lineage: { test: isObj, desc: '{derived_from[], supersedes?, conflicts_with[]}' },
    retention: { enum: ['session', 'project', 'permanent'] },
    revoked: { test: (v) => typeof v === 'boolean', desc: 'boolean' },
    authority_revoked: { test: (v) => typeof v === 'boolean', desc: 'boolean' },
  });
  validateProvenanceRef(r.source_provenance);
  check('MemoryRecord.authority', r.authority, {
    class: { enum: AUTHORITY_CLASSES },
    admissible_uses: { test: isArr, desc: 'array of use tags' },
  });
  check('MemoryRecord.lineage', r.lineage, {
    derived_from: { test: isArr, desc: 'array' },
    conflicts_with: { test: isArr, desc: 'array' },
    supersedes: { optional: true, test: isStr },
  });
  return r;
}

export function validateProcedureRecord(o) {
  const r = validateMemoryRecord({ ...o, kind: 'procedural' });
  return check('ProcedureRecord', r, {
    steps: { test: (v) => isArr(v) && v.length > 0, desc: 'non-empty array' },
  });
}

export function validateAssuranceRecord(o) {
  return check('AssuranceRecord', o, {
    id: { test: isStr },
    kind: { enum: ['approval', 'grant-consumption', 'policy-version', 'reconciliation'] },
    created_at: { test: isIso, desc: 'ISO-8601' },
    created_by: { test: isStr },
    created_by_role: { enum: ['human'] },
    payload: { test: isObj, desc: 'object' },
  });
}

export function validateEffectProposal(o) {
  return check('EffectProposal', o, {
    id: { test: isStr },
    work_order_id: { test: isStr },
    proposed_by: { test: isStr },
    action: { test: isStr, desc: 'canonical action kind' },
    target: { test: isStr },
    parameters: { test: isObj, desc: 'object' },
    claimed_externality: { optional: true, enum: EFFECT_EXTERNALITY },
    claimed_reversibility: { optional: true, enum: EFFECT_REVERSIBILITY },
    claimed_risk: { optional: true, enum: RISK_CLASSES },
    uncertainty: { optional: true, test: isStr },
    evidence_refs: { test: isArr, desc: 'array' },
    created_at: { test: isIso, desc: 'ISO-8601' },
    expires_at: { optional: true, test: isIso },
  });
}

export function validateApprovalRequest(o) {
  return check('ApprovalRequest', o, {
    id: { test: isStr },
    proposal_digest: { test: (v) => /^[0-9a-f]{64}$/.test(v), desc: 'sha256 hex' },
    action: { test: isStr },
    target: { test: isStr },
    scope: { test: isStr, desc: 'canonical gate-derived scope' },
    requested_by: { test: isStr },
    requested_at: { test: isIso, desc: 'ISO-8601' },
  });
}

export function validateApprovalDecision(o) {
  return check('ApprovalDecision', o, {
    id: { test: isStr },
    request_id: { test: isStr },
    proposal_digest: { test: (v) => /^[0-9a-f]{64}$/.test(v), desc: 'sha256 hex' },
    scope: { test: isStr },
    decision: { enum: ['APPROVED', 'REJECTED'] },
    decided_by: { test: isStr },
    decided_by_role: { enum: ['human'] },
    decided_at: { test: isIso, desc: 'ISO-8601' },
    expires_at: { test: isIso, desc: 'ISO-8601 (half-open: invalid at t >= expires_at)' },
    one_shot: { test: (v) => v === true, desc: 'must be true (occurrence-scoped)' },
    consumed: { test: (v) => typeof v === 'boolean', desc: 'boolean' },
  });
}

export function validateExecutionResult(o) {
  return check('ExecutionResult', o, {
    id: { test: isStr },
    proposal_id: { test: isStr },
    proposal_digest: { test: (v) => /^[0-9a-f]{64}$/.test(v), desc: 'sha256 hex' },
    approval_id: { optional: true, test: isStr },
    outcome: { enum: EXECUTION_OUTCOMES },
    executed_at: { test: isIso, desc: 'ISO-8601' },
    detail: { optional: true, test: isStr },
    retried_automatically: { test: (v) => v === false, desc: 'must be false (one-shot discipline)' },
  });
}

export function validateCapabilityRecord(o) {
  return check('CapabilityRecord', o, {
    name: { test: isStr },
    status: { enum: CAPABILITY_STATUSES },
    implementation: { optional: true, test: isStr },
    evidence: { optional: true, test: isStr },
    source_inspiration: { optional: true, test: isStr },
    limitations: { optional: true, test: isStr },
  });
}

export function validateRoutingDecision(o) {
  return check('RoutingDecision', o, {
    id: { test: isStr },
    work_order_id: { test: isStr },
    task_class: { test: isStr },
    risk_class: { enum: RISK_CLASSES },
    budget_policy: { enum: BUDGET_POLICIES },
    route: { test: isStr, desc: 'OmniRoute route id' },
    sticky_session: { test: isStr },
    decided_at: { test: isIso, desc: 'ISO-8601' },
    escalation_reason: { optional: true, test: isStr },
    // telemetry (never prompts/secrets):
    selected_model: { optional: true, test: isStr },
    failure_class: { optional: true, enum: PROVIDER_FAILURE_CLASSES },
  });
}

export function validateScopeContract(o) {
  try {
    normalizeScopeContract(o);
    return o;
  } catch (error) {
    throw new ValidationError('ScopeContract', [error.message]);
  }
}

export function validateScopeDecision(o) {
  try {
    validateScopeDecisionRuntime(o);
    return o;
  } catch (error) {
    throw new ValidationError('ScopeDecision', [error.message]);
  }
}

export const validators = Object.freeze({
  WorkOrder: validateWorkOrder,
  ProjectState: validateProjectState,
  Session: validateSession,
  SupervisorLease: validateSupervisorLease,
  ProviderWait: validateProviderWait,
  WorkerResult: validateWorkerResult,
  ReviewVerdict: validateReviewVerdict,
  EvidenceRecord: validateEvidenceRecord,
  MemoryRecord: validateMemoryRecord,
  ProvenanceRef: validateProvenanceRef,
  ConflictRef: validateConflictRef,
  ProcedureRecord: validateProcedureRecord,
  AssuranceRecord: validateAssuranceRecord,
  EffectProposal: validateEffectProposal,
  ApprovalRequest: validateApprovalRequest,
  ApprovalDecision: validateApprovalDecision,
  ExecutionResult: validateExecutionResult,
  CapabilityRecord: validateCapabilityRecord,
  RoutingDecision: validateRoutingDecision,
  ScopeContract: validateScopeContract,
  ScopeDecision: validateScopeDecision,
});
