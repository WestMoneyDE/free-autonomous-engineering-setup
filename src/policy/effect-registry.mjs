// Typed effect registry. The GATE owns effect semantics, not the model:
// externality, reversibility, capability class, risk class and authority
// requirements are registry facts. An unregistered action kind fails closed.
// Constitutionally forbidden effect classes remain forbidden even WITH a
// human approval.
export const FORBIDDEN_EFFECT_CLASSES = Object.freeze([
  'secret-exfiltration',
  'permission-bypass',
  'authority-self-grant',
  'safety-control-disable',
  'covert-persistence',
  'unrestricted-self-copying',
  'credential-commit',
]);

const REGISTRY = new Map();

export function registerEffect(def) {
  const required = ['action', 'externality', 'reversibility', 'capability_class', 'risk_class', 'requires_human_approval'];
  for (const f of required) {
    if (def[f] === undefined) throw new Error(`effect definition missing ${f}`);
  }
  if (!['internal', 'external'].includes(def.externality)) throw new Error('bad externality');
  if (!['reversible', 'partially-reversible', 'irreversible'].includes(def.reversibility)) throw new Error('bad reversibility');
  if (!['LOW', 'MEDIUM', 'HIGH', 'CONSEQUENTIAL'].includes(def.risk_class)) throw new Error('bad risk_class');
  REGISTRY.set(def.action, Object.freeze({
    parameter_bounds: {},
    forbidden_class: null,
    fallback_baseline: null,
    target_kind: null, // 'path' => the gate applies the repository path policy to the target
    ...def,
  }));
  return REGISTRY.get(def.action);
}

export function lookupEffect(action) {
  return REGISTRY.get(action) ?? null;
}

export function clearRegistryForTests() {
  REGISTRY.clear();
}

export function registerDefaultEffects() {
  // ALLOW class: local, reversible engineering
  registerEffect({ action: 'read_file', externality: 'internal', reversibility: 'reversible', capability_class: 'repo-read', risk_class: 'LOW', requires_human_approval: false, target_kind: 'path' });
  registerEffect({ action: 'edit_file', externality: 'internal', reversibility: 'reversible', capability_class: 'repo-write-local', risk_class: 'LOW', requires_human_approval: false, target_kind: 'path', parameter_bounds: { path: { maxLength: 4096 } } });
  registerEffect({ action: 'run_tests', externality: 'internal', reversibility: 'reversible', capability_class: 'verification', risk_class: 'LOW', requires_human_approval: false, fallback_baseline: 'report_not_run' });
  // ASK class: external / hard to reverse
  registerEffect({ action: 'git_push', externality: 'external', reversibility: 'partially-reversible', capability_class: 'repo-publish', risk_class: 'CONSEQUENTIAL', requires_human_approval: true });
  registerEffect({ action: 'deploy', externality: 'external', reversibility: 'partially-reversible', capability_class: 'production', risk_class: 'CONSEQUENTIAL', requires_human_approval: true });
  registerEffect({ action: 'send_message', externality: 'external', reversibility: 'irreversible', capability_class: 'external-comms', risk_class: 'CONSEQUENTIAL', requires_human_approval: true, parameter_bounds: { body: { maxLength: 20000 } } });
  registerEffect({ action: 'payment', externality: 'external', reversibility: 'irreversible', capability_class: 'financial', risk_class: 'CONSEQUENTIAL', requires_human_approval: true });
  // DENY class: forbidden even with approval
  registerEffect({ action: 'exfiltrate_secret', externality: 'external', reversibility: 'irreversible', capability_class: 'forbidden', risk_class: 'CONSEQUENTIAL', requires_human_approval: true, forbidden_class: 'secret-exfiltration' });
  registerEffect({ action: 'disable_safety_control', externality: 'internal', reversibility: 'partially-reversible', capability_class: 'forbidden', risk_class: 'CONSEQUENTIAL', requires_human_approval: true, forbidden_class: 'safety-control-disable' });
  registerEffect({ action: 'self_grant_authority', externality: 'internal', reversibility: 'irreversible', capability_class: 'forbidden', risk_class: 'CONSEQUENTIAL', requires_human_approval: true, forbidden_class: 'authority-self-grant' });
}

/** Canonical scope derivation is gate-owned: capability class + target. */
export function canonicalScope(effectDef, target) {
  return `${effectDef.capability_class}:${target}`;
}
