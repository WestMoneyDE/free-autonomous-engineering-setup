// Pure contract boundary for a separately authorized Strix review.
// This module deliberately does not install, import, spawn, execute, or contact Strix.
const STRIX_PIN = '2cc816781438f2993bcbb5c8cf3f693c25380142';
const SHA256 = /^[0-9a-f]{64}$/;
const EVIDENCE_ROOT = '.state/evidence/strix/';

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const positiveFinite = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;
const positiveInteger = (value) => Number.isInteger(value) && value > 0;

function isEvidencePath(value) {
  if (typeof value !== 'string' || !value.startsWith(EVIDENCE_ROOT) || value.includes('\\') || value.includes('\0')) return false;
  const suffix = value.slice(EVIDENCE_ROOT.length);
  return suffix.length > 0 && suffix.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

export function preflightStrixReview(request) {
  const failures = [];
  if (!isRecord(request)) return { allowed: false, failures: ['review request must be an object'], strix_ref: STRIX_PIN };

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
  return { allowed: failures.length === 0, failures, strix_ref: STRIX_PIN };
}

const failed = (reason) => ({ outcome: 'FAIL', complete: false, findings: [], reason });

export function interpretStrixResult(result) {
  if (!isRecord(result) || !Number.isInteger(result.exitCode)) return failed('malformed Strix result');
  const { exitCode, run, report } = result;
  const vulnerabilities = result.vulnerabilities ?? [];
  if (!Array.isArray(vulnerabilities)) return failed('malformed vulnerabilities result');
  if (exitCode === 1) return failed('Strix fatal/setup failure');
  if (exitCode === 2) {
    if (!isRecord(run) || !['completed', 'stopped'].includes(run.status) || vulnerabilities.length === 0) return failed('malformed findings result');
    return { outcome: 'FINDINGS', complete: run.status === 'completed', findings: vulnerabilities, reason: 'validated findings reported' };
  }
  if (exitCode !== 0) return failed(`unknown exit code ${exitCode}`);
  if (vulnerabilities.length !== 0) return failed('exit code contradicts reported vulnerabilities');
  if (!isRecord(run) || typeof run.status !== 'string') return failed('malformed run result');
  if (report !== undefined && !isRecord(report)) return failed('malformed report result');
  if (run.status !== 'completed' || report?.coverage_complete !== true) return { outcome: 'INCOMPLETE', complete: false, findings: [], reason: 'run or analyzed coverage incomplete' };
  return { outcome: 'NO_VALIDATED_FINDINGS_IN_ANALYZED_SCOPE', complete: true, findings: [], reason: 'completed analyzed scope reported no validated findings' };
}

export const STRIX_REVIEW_PIN = STRIX_PIN;
