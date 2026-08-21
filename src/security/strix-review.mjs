// Pure contract boundary for a separately authorized Strix review.
// This module deliberately does not install, import, spawn, execute, or contact Strix.
import { proposalDigest } from '../evidence/hashing.mjs';
const STRIX_PIN = '2cc816781438f2993bcbb5c8cf3f693c25380142';
const SHA256 = /^[0-9a-f]{64}$/;
const EVIDENCE_ROOT = '.state/evidence/strix/';

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const positiveFinite = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;
const positiveInteger = (value) => Number.isInteger(value) && value > 0;
const isNonEmpty = (value) => typeof value === 'string' && value.length > 0;
const isIso = (value) => isNonEmpty(value) && !Number.isNaN(Date.parse(value));

function isEvidencePath(value) {
  if (typeof value !== 'string' || !value.startsWith(EVIDENCE_ROOT) || value.includes('\\') || value.includes('\0')) return false;
  const suffix = value.slice(EVIDENCE_ROOT.length);
  return suffix.length > 0 && suffix.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

export function preflightStrixReview(request) {
  const failures = [];
  if (!isRecord(request)) return { ready_for_authority_gate: false, execution_authorized: false, claims_only: true, failures: ['review request must be an object'], strix_ref: STRIX_PIN, proposal: null, proposal_digest: null, authority_scope: null };

  const authorization = isRecord(request.authorization) ? request.authorization : null;
  if (authorization?.written !== true) failures.push('written target authorization required');
  if (typeof authorization?.ref !== 'string' || authorization.ref.length === 0) failures.push('written authorization record reference required');
  if (typeof request.target !== 'string' || request.target.length === 0 || authorization?.target !== request.target) failures.push('authorization target mismatch');
  if (request.target_class !== 'owned') failures.push('only owned targets are permitted');
  if (!['test', 'production'].includes(request.environment)) failures.push('environment must be test or production');
  if (request.environment === 'production' && authorization?.production !== true) failures.push('production requires exact authorization');
  if (request.clean_disposable_checkout !== true) failures.push('clean disposable checkout required');
  if (!positiveFinite(request.max_budget_usd) || !positiveInteger(request.max_turns) || !positiveInteger(request.max_seconds)) failures.push('finite positive budget, turn and wall-clock bounds required');
  if (request.strix_ref !== STRIX_PIN) failures.push('Strix commit pin mismatch');
  if (!SHA256.test(request.config_digest ?? '')) failures.push('configuration digest required');
  if (!SHA256.test(request.scope_digest ?? '')) failures.push('scope digest required');
  if (!isEvidencePath(request.evidence_destination)) failures.push('evidence destination must be a traversal-safe path beneath .state/evidence/strix');
  if (!positiveInteger(request.occurrence)) failures.push('positive occurrence required');
  if (!isNonEmpty(request.work_order_id) || !isNonEmpty(request.proposed_by)) failures.push('work order and proposer required');
  if (!isIso(request.created_at) || !isIso(request.expires_at) || Date.parse(request.expires_at) <= Date.parse(request.created_at)) failures.push('bounded proposal timestamps required');

  // Ownership, checkout, and written-authorization fields are caller claims.
  // They are bound into a proposal for independent AssuranceStore/EffectGate
  // evaluation; neither these claims nor this result authorize execution.
  const proposal = {
    id: `strix-review:${request.work_order_id ?? 'unknown'}:${request.occurrence ?? 'unknown'}`,
    work_order_id: request.work_order_id,
    proposed_by: request.proposed_by,
    action: 'run_strix_review',
    target: request.target,
    parameters: {
      target_class_claim: request.target_class,
      environment: request.environment,
      authorization_claim: authorization,
      clean_disposable_checkout_claim: request.clean_disposable_checkout,
      scope_digest: request.scope_digest,
      config_digest: request.config_digest,
      strix_ref: request.strix_ref,
      max_budget_usd: request.max_budget_usd,
      max_turns: request.max_turns,
      max_seconds: request.max_seconds,
      evidence_destination: request.evidence_destination,
      occurrence: request.occurrence,
    },
    claimed_externality: 'external',
    claimed_reversibility: 'partially-reversible',
    claimed_risk: 'CONSEQUENTIAL',
    uncertainty: 'caller ownership and authorization values are untrusted claims pending independent assurance',
    evidence_refs: isNonEmpty(authorization?.ref) ? [authorization.ref] : [],
    created_at: request.created_at,
    expires_at: request.expires_at,
  };
  return {
    ready_for_authority_gate: failures.length === 0,
    execution_authorized: false,
    claims_only: true,
    failures,
    strix_ref: STRIX_PIN,
    proposal,
    proposal_digest: proposalDigest(proposal),
    authority_scope: isNonEmpty(request.target) ? `security-review:${request.target}` : null,
  };
}

const failed = (reason) => ({ outcome: 'FAIL', complete: false, findings: [], reason });
const RUN_STATUSES = ['completed', 'stopped', 'cancelled'];
const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
const FINDING_STATUSES = ['VALIDATED', 'NEEDS_VERIFICATION'];

function validFinding(finding) {
  if (!isRecord(finding) || !isNonEmpty(finding.id) || !isNonEmpty(finding.title) || !SEVERITIES.includes(finding.severity) || !FINDING_STATUSES.includes(finding.status) || typeof finding.validated !== 'boolean' || !Array.isArray(finding.evidence) || finding.evidence.length === 0) return false;
  if ((finding.status === 'VALIDATED') !== finding.validated) return false;
  return finding.evidence.every((item) => isRecord(item) && ['reproduction', 'trace', 'artifact'].includes(item.type) && isNonEmpty(item.ref) && isRecord(item.provenance) && isNonEmpty(item.provenance.source) && isIso(item.provenance.recorded_at));
}

export function interpretStrixResult(result) {
  if (!isRecord(result) || !Number.isInteger(result.exitCode)) return failed('malformed Strix result');
  const { exitCode, run, report } = result;
  const vulnerabilities = result.vulnerabilities ?? [];
  if (!Array.isArray(vulnerabilities)) return failed('malformed vulnerabilities result');
  if (exitCode === 1) return failed('Strix fatal/setup failure');
  if (exitCode === 2) {
    if (!isRecord(run) || !RUN_STATUSES.includes(run.status) || vulnerabilities.length === 0 || !vulnerabilities.every(validFinding)) return failed('malformed findings result');
    if (!vulnerabilities.every((finding) => finding.validated === true)) return { outcome: 'UNVALIDATED_OBSERVATIONS', complete: false, findings: vulnerabilities, reason: 'observations require independent validation' };
    return { outcome: 'FINDINGS', complete: run.status === 'completed', findings: vulnerabilities, reason: 'validated findings reported' };
  }
  if (exitCode !== 0) return failed(`unknown exit code ${exitCode}`);
  if (vulnerabilities.length !== 0) return failed('exit code contradicts reported vulnerabilities');
  if (!isRecord(run) || !RUN_STATUSES.includes(run.status)) return failed('malformed run result');
  if (run.status !== 'completed') {
    if (report !== undefined && (!isRecord(report) || typeof report.coverage_complete !== 'boolean')) return failed('malformed report result');
    return { outcome: 'INCOMPLETE', complete: false, findings: [], reason: 'run or analyzed coverage incomplete' };
  }
  if (!isRecord(report) || typeof report.coverage_complete !== 'boolean') return failed('malformed report result');
  if (report.coverage_complete !== true) return { outcome: 'INCOMPLETE', complete: false, findings: [], reason: 'run or analyzed coverage incomplete' };
  return { outcome: 'NO_VALIDATED_FINDINGS_IN_ANALYZED_SCOPE', complete: true, findings: [], reason: 'completed analyzed scope reported no validated findings' };
}

export const STRIX_REVIEW_PIN = STRIX_PIN;
