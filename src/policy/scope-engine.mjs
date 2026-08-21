import path from 'node:path';
import { canonicalJson, sha256Hex } from '../evidence/hashing.mjs';

const SET_FIELDS = Object.freeze([
  'include_paths', 'roles', 'tools', 'memory_kinds', 'audiences',
  'capabilities', 'targets', 'data_classes', 'retention_classes',
]);
const CONTRACT_FIELDS = new Set([
  'project', ...SET_FIELDS, 'exclude_paths', 'parameter_bounds', 'budgets',
  'valid_from', 'valid_until', 'max_occurrences', 'externality',
  'reversibility', 'approval_required', 'source_versions',
]);
const REQUEST_FIELDS = new Set(['role', 'tool', 'memory_kind', 'capability', 'target', 'path']);
const BUDGET_FIELDS = Object.freeze(['cost_usd', 'tokens', 'seconds', 'attempts']);
const EXTERNALITIES = Object.freeze(['internal', 'external']);
const REVERSIBILITIES = Object.freeze(['reversible', 'partially-reversible', 'irreversible']);
const VERDICTS = Object.freeze(['ALLOW', 'NARROW', 'DEFER', 'DENY']);
export const SCOPE_ROLES = Object.freeze(['planner', 'builder', 'reviewer', 'security-reviewer', 'supervisor', 'human']);
export const SCOPE_MEMORY_KINDS = Object.freeze(['working', 'episodic', 'semantic', 'procedural', 'evidence-ref']);
export const SCOPE_RETENTION_CLASSES = Object.freeze(['session', 'project', 'permanent']);
const DIGEST_RE = /^[0-9a-f]{64}$/;
export const SCOPE_STRING_PATTERN = '^(?!\\s)(?:[^\\r\\n]*\\S)$';
export const SCOPE_PATH_PATTERN = '^(?![A-Za-z]:)(?!(?:.*\\/)?\\.{1,2}(?:\\/|$))(?:\\*\\*|(?:(?!\\*\\*)[^/\\\\\\u0000])+)(?:/(?:\\*\\*|(?:(?!\\*\\*)[^/\\\\\\u0000])+))*$';
export const SCOPE_TIMESTAMP_PATTERN = '^\\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\\d|3[01])T(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d{3})?(?:Z|[+-](?:(?:0\\d|1[0-3]):[0-5]\\d|14:00))$';
const SCOPE_STRING_RE = new RegExp(SCOPE_STRING_PATTERN, 'u');
const SCOPE_PATH_RE = new RegExp(SCOPE_PATH_PATTERN, 'u');
const SCOPE_TIMESTAMP_RE = new RegExp(SCOPE_TIMESTAMP_PATTERN, 'u');

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const sortedUnique = (values) => [...new Set(values)].sort();
const intersection = (sets) => sortedUnique(sets[0].filter((item) => sets.slice(1).every((set) => set.includes(item))));

function requirePlainObject(value, label) {
  if (!isPlainObject(value)) throw new TypeError(`${label} must be an object`);
}

function requireExactFields(value, fields, label) {
  for (const field of Object.keys(value)) {
    if (!fields.has(field)) throw new TypeError(`${label} has unknown field: ${field}`);
  }
}

function requireString(value, label) {
  if (typeof value !== 'string' || !SCOPE_STRING_RE.test(value)) throw new TypeError(`${label} must be a non-empty trimmed single-line string`);
  return value;
}

function normalizeStringSet(value, label, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) throw new TypeError(`${label} must be ${allowEmpty ? 'an' : 'a non-empty'} array`);
  for (const item of value) requireString(item, `${label} item`);
  return sortedUnique(value);
}

function requireEnumSet(values, allowed, label) {
  const invalid = values.find((value) => !allowed.includes(value));
  if (invalid !== undefined) throw new TypeError(`${label} contains unsupported value: ${invalid}`);
}

function normalizeRepoPattern(value, label) {
  requireString(value, label);
  if (!SCOPE_PATH_RE.test(value)) throw new TypeError(`${label} must be a safe repository-relative POSIX path pattern with globstar only as a complete segment`);
  return value;
}

function normalizePatterns(value, label, options) {
  return normalizeStringSet(value, label, options).map((item) => normalizeRepoPattern(item, `${label} item`));
}

function parseIso(value, label) {
  requireString(value, label);
  if (!SCOPE_TIMESTAMP_RE.test(value)) throw new TypeError(`${label} must be a canonical ISO-8601 UTC/offset timestamp`);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, millisText = '000', , offsetSign, offsetHourText = '00', offsetMinuteText = '00'] = match;
  const [year, month, day, hour, minute, second, milliseconds, offsetHour, offsetMinute] = [yearText, monthText, dayText, hourText, minuteText, secondText, millisText, offsetHourText, offsetMinuteText].map(Number);
  const wallClock = new Date(0);
  wallClock.setUTCFullYear(year, month - 1, day);
  wallClock.setUTCHours(hour, minute, second, milliseconds);
  if (wallClock.getUTCFullYear() !== year || wallClock.getUTCMonth() !== month - 1 || wallClock.getUTCDate() !== day || wallClock.getUTCHours() !== hour || wallClock.getUTCMinutes() !== minute || wallClock.getUTCSeconds() !== second || wallClock.getUTCMilliseconds() !== milliseconds) {
    throw new TypeError(`${label} contains an impossible calendar date or time`);
  }
  const offsetDirection = offsetSign === '+' ? 1 : offsetSign === '-' ? -1 : 0;
  const instant = wallClock.getTime() - offsetDirection * (offsetHour * 60 + offsetMinute) * 60_000;
  if (!Number.isFinite(instant)) throw new TypeError(`${label} is outside the supported timestamp range`);
  return instant;
}

function selectTimestamp(values, direction) {
  const candidates = values.map((value) => ({ value, instant: parseIso(value, 'scope timestamp') }));
  candidates.sort((left, right) => left.instant - right.instant || (left.value < right.value ? -1 : left.value > right.value ? 1 : 0));
  return direction === 'max' ? candidates.at(-1).value : candidates[0].value;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function deny(reason, unresolvedDimensions = ['all'], digest = scopeDigest(null)) {
  return deepFreeze({ verdict: 'DENY', effective: null, digest, reasons: [reason], unresolved_dimensions: sortedUnique(unresolvedDimensions) });
}

export function normalizeScopeContract(raw) {
  requirePlainObject(raw, 'scope contract');
  requireExactFields(raw, CONTRACT_FIELDS, 'scope contract');
  const normalized = { project: requireString(raw.project, 'scope project') };
  for (const field of SET_FIELDS) normalized[field] = normalizeStringSet(raw[field], `scope ${field}`);
  requireEnumSet(normalized.roles, SCOPE_ROLES, 'scope roles');
  requireEnumSet(normalized.memory_kinds, SCOPE_MEMORY_KINDS, 'scope memory_kinds');
  requireEnumSet(normalized.retention_classes, SCOPE_RETENTION_CLASSES, 'scope retention_classes');
  normalized.include_paths = normalizePatterns(raw.include_paths, 'scope include_paths');
  normalized.exclude_paths = normalizePatterns(raw.exclude_paths ?? [], 'scope exclude_paths', { allowEmpty: true });

  requirePlainObject(raw.parameter_bounds, 'scope parameter_bounds');
  normalized.parameter_bounds = {};
  for (const name of Object.keys(raw.parameter_bounds).sort()) {
    requireString(name, 'scope parameter bound name');
    const range = raw.parameter_bounds[name];
    requirePlainObject(range, `scope parameter_bounds.${name}`);
    requireExactFields(range, new Set(['min', 'max']), `scope parameter_bounds.${name}`);
    if (!Number.isFinite(range.min) || !Number.isFinite(range.max) || range.min > range.max) throw new TypeError(`scope parameter_bounds.${name} requires finite min <= max`);
    normalized.parameter_bounds[name] = { min: range.min, max: range.max };
  }

  requirePlainObject(raw.budgets, 'scope budgets');
  requireExactFields(raw.budgets, new Set(BUDGET_FIELDS), 'scope budgets');
  normalized.budgets = {};
  for (const field of BUDGET_FIELDS) {
    const value = raw.budgets[field];
    const valid = field === 'cost_usd' ? Number.isFinite(value) && value >= 0 : Number.isInteger(value) && value >= (field === 'attempts' ? 1 : 0);
    if (!valid) throw new TypeError(`scope budgets.${field} is invalid`);
    normalized.budgets[field] = value;
  }

  const from = parseIso(raw.valid_from, 'scope valid_from');
  const until = parseIso(raw.valid_until, 'scope valid_until');
  if (from >= until) throw new TypeError('scope validity window must have valid_from < valid_until');
  normalized.valid_from = raw.valid_from;
  normalized.valid_until = raw.valid_until;
  if (!Number.isInteger(raw.max_occurrences) || raw.max_occurrences < 1) throw new TypeError('scope max_occurrences must be a positive integer');
  normalized.max_occurrences = raw.max_occurrences;
  if (!EXTERNALITIES.includes(raw.externality)) throw new TypeError(`scope externality must be one of ${EXTERNALITIES.join('|')}`);
  normalized.externality = raw.externality;
  if (!REVERSIBILITIES.includes(raw.reversibility)) throw new TypeError(`scope reversibility must be one of ${REVERSIBILITIES.join('|')}`);
  normalized.reversibility = raw.reversibility;
  if (typeof raw.approval_required !== 'boolean') throw new TypeError('scope approval_required must be boolean');
  normalized.approval_required = raw.approval_required;
  normalized.source_versions = normalizeStringSet(raw.source_versions ?? [], 'scope source_versions', { allowEmpty: true });
  return deepFreeze(normalized);
}

export const scopeDigest = (scope) => sha256Hex(canonicalJson(scope));

export function validateScopeDecisionRuntime(decision) {
  requirePlainObject(decision, 'scope decision');
  requireExactFields(decision, new Set(['verdict', 'effective', 'digest', 'reasons', 'unresolved_dimensions', 'violations']), 'scope decision');
  if (!VERDICTS.includes(decision.verdict) || !DIGEST_RE.test(decision.digest)) throw new TypeError('scope decision verdict or digest is invalid');
  normalizeStringSet(decision.reasons, 'scope decision reasons', { allowEmpty: true });
  normalizeStringSet(decision.unresolved_dimensions, 'scope decision unresolved_dimensions', { allowEmpty: true });
  if (decision.violations !== undefined) normalizeStringSet(decision.violations, 'scope decision violations', { allowEmpty: true });
  if (decision.effective === null) {
    if (!['DENY', 'DEFER'].includes(decision.verdict) || decision.digest !== scopeDigest(null)) throw new TypeError('scope decision is inconsistent');
    return decision;
  }
  if (!['ALLOW', 'NARROW', 'DENY'].includes(decision.verdict)) throw new TypeError('scope decision is inconsistent');
  const effective = normalizeScopeContract(decision.effective);
  if (decision.digest !== scopeDigest(effective)) throw new TypeError('scope decision digest mismatch');
  return decision;
}

export function intersectScopes(inputs) {
  if (!Array.isArray(inputs) || inputs.length === 0) return deepFreeze({ verdict: 'DEFER', effective: null, digest: scopeDigest(null), reasons: ['no scope contracts'], unresolved_dimensions: ['all'] });
  let contracts;
  try {
    contracts = Array.from(inputs, normalizeScopeContract);
  } catch (error) {
    return deny(`invalid scope contract: ${error.message}`);
  }
  if (new Set(contracts.map((contract) => contract.project)).size !== 1) return deny('project mismatch', ['project']);

  const effective = { project: contracts[0].project };
  const empty = [];
  for (const field of SET_FIELDS) {
    effective[field] = intersection(contracts.map((contract) => contract[field]));
    if (effective[field].length === 0) empty.push(field);
  }
  if (empty.length > 0) return deny('empty restrictive intersection', empty);
  effective.include_paths = intersection(contracts.map((contract) => contract.include_paths));
  if (effective.include_paths.length === 0) return deny('empty restrictive intersection', ['include_paths']);
  effective.exclude_paths = sortedUnique(contracts.flatMap((contract) => contract.exclude_paths));

  effective.parameter_bounds = {};
  const parameterNames = sortedUnique(contracts.flatMap((contract) => Object.keys(contract.parameter_bounds)));
  for (const name of parameterNames) {
    if (!contracts.every((contract) => Object.hasOwn(contract.parameter_bounds, name))) return deny(`missing parameter bound: ${name}`, ['parameter_bounds']);
    const min = Math.max(...contracts.map((contract) => contract.parameter_bounds[name].min));
    const max = Math.min(...contracts.map((contract) => contract.parameter_bounds[name].max));
    if (min > max) return deny(`empty parameter bound: ${name}`, ['parameter_bounds']);
    effective.parameter_bounds[name] = { min, max };
  }
  effective.budgets = Object.fromEntries(BUDGET_FIELDS.map((field) => [field, Math.min(...contracts.map((contract) => contract.budgets[field]))]));
  effective.valid_from = selectTimestamp(contracts.map((contract) => contract.valid_from), 'max');
  effective.valid_until = selectTimestamp(contracts.map((contract) => contract.valid_until), 'min');
  if (parseIso(effective.valid_from, 'scope valid_from') >= parseIso(effective.valid_until, 'scope valid_until')) return deny('empty validity intersection', ['valid_from', 'valid_until']);
  effective.max_occurrences = Math.min(...contracts.map((contract) => contract.max_occurrences));
  effective.externality = contracts.some((contract) => contract.externality === 'external') ? 'external' : 'internal';
  effective.reversibility = contracts.some((contract) => contract.reversibility === 'irreversible') ? 'irreversible' : contracts.some((contract) => contract.reversibility === 'partially-reversible') ? 'partially-reversible' : 'reversible';
  effective.approval_required = contracts.some((contract) => contract.approval_required);
  effective.source_versions = sortedUnique(contracts.flatMap((contract) => contract.source_versions));
  deepFreeze(effective);
  return deepFreeze({ verdict: contracts.length > 1 ? 'NARROW' : 'ALLOW', effective, digest: scopeDigest(effective), reasons: [], unresolved_dimensions: [] });
}

function globMatches(pattern, candidate) {
  const patternParts = pattern.split('/');
  const candidateParts = candidate.split('/');
  const visit = (patternIndex, candidateIndex) => {
    if (patternIndex === patternParts.length) return candidateIndex === candidateParts.length;
    const part = patternParts[patternIndex];
    if (part === '**') return visit(patternIndex + 1, candidateIndex) || (candidateIndex < candidateParts.length && visit(patternIndex, candidateIndex + 1));
    if (candidateIndex >= candidateParts.length) return false;
    const expression = new RegExp(`^${part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replaceAll('*', '[^/]*').replaceAll('?', '[^/]')}$`);
    return expression.test(candidateParts[candidateIndex]) && visit(patternIndex + 1, candidateIndex + 1);
  };
  return visit(0, 0);
}

function normalizeRequestPath(value) {
  requireString(value, 'scope request path');
  if (value.includes('\\') || path.posix.isAbsolute(value) || /^[A-Za-z]:/.test(value) || value.includes('\0')) throw new TypeError('scope request path must be repository-relative POSIX path');
  const normalized = path.posix.normalize(value);
  if (normalized === '..' || normalized.startsWith('../') || normalized === '.') throw new TypeError('scope request path escapes repository');
  return normalized;
}

export function evaluateScopeRequest(decision, request) {
  try {
    validateScopeDecisionRuntime(decision);
    if (decision.effective === null) {
      return decision;
    }
    const effective = normalizeScopeContract(decision.effective);
    requirePlainObject(request, 'scope request');
    requireExactFields(request, REQUEST_FIELDS, 'scope request');
    for (const field of REQUEST_FIELDS) requireString(request[field], `scope request ${field}`);
    const requestPath = normalizeRequestPath(request.path);
    const checks = { roles: request.role, tools: request.tool, memory_kinds: request.memory_kind, capabilities: request.capability, targets: request.target };
    const violations = Object.entries(checks).filter(([field, value]) => !effective[field].includes(value)).map(([field]) => field);
    if (!effective.include_paths.some((pattern) => globMatches(pattern, requestPath))) violations.push('include_paths');
    if (effective.exclude_paths.some((pattern) => globMatches(pattern, requestPath))) violations.push('exclude_paths');
    return deepFreeze(violations.length > 0
      ? { ...decision, verdict: 'DENY', reasons: ['request exceeds effective scope'], violations: sortedUnique(violations) }
      : { ...decision, verdict: 'ALLOW', violations: [] });
  } catch (error) {
    return deepFreeze({ verdict: 'DENY', effective: null, digest: scopeDigest(null), reasons: [`invalid scope request or decision: ${error.message}`], unresolved_dimensions: ['all'], violations: ['validation'] });
  }
}
