// Deterministic, non-learning effect gate.
// Topology (architecturally enforced together with executor.mjs):
//   adaptive worker -> canonical EffectProposal -> EffectGate -> single Executor -> world
// Direct worker -> world is prevented because only the executor realizes
// effects and the executor only accepts a gate ALLOW verdict object that the
// gate signs with an internal nonce.
//
// Stages (engineering extraction of the LOGOS Γ pipeline; no scientific
// claims imported):
//   G0 structural/effect classification — unknown effect kinds fail closed;
//   G1 authority boundary — learned state cannot satisfy authority itself;
//   G2 forbidden classes — denied even WITH human approval;
//   G3 risk/uncertainty — strictest-wins: agent claims may only tighten;
//   G4 exact grant — digest + canonical scope + half-open expiry + one-shot.
// Verdicts: ALLOW | REPAIR | DEFER | DENY | FALLBACK.
// REPAIR is NOT execution permission: the repaired proposal must re-enter the
// gate as a new proposal. FALLBACK names only a pre-registered baseline.
// Evaluation is bounded; exhausting the budget after classification yields
// FALLBACK when a validated baseline exists, otherwise DENY (capability
// offline by design).
import { validateEffectProposal, ValidationError } from '../schemas/schemas.mjs';
import { lookupEffect, canonicalScope, FORBIDDEN_EFFECT_CLASSES } from './effect-registry.mjs';
import { proposalDigest } from '../evidence/hashing.mjs';
import { classifyWritePath } from './permissions.mjs';
import { randomBytes } from 'node:crypto';

const RISK_ORDER = { LOW: 0, MEDIUM: 1, HIGH: 2, CONSEQUENTIAL: 3 };
const REVERSIBILITY_ORDER = { reversible: 0, 'partially-reversible': 1, irreversible: 2 };

export class EffectGate {
  /**
   * @param {object} deps { assurance: AssuranceStore, now?: () => number, evaluationBudget?: number }
   */
  constructor({ assurance, now, evaluationBudget = 100, repoRoot = process.cwd() }) {
    this.assurance = assurance;
    this.now = now ?? (() => Date.now());
    this.evaluationBudget = evaluationBudget;
    // Root against which path-targeted effects are policy-checked. The gate
    // and the permission engine are CLOSED-COUPLED (review finding R2-04):
    // a path the permission engine denies can never receive a gate ALLOW.
    this.repoRoot = repoRoot;
    /** @type {Set<string>} nonces of ALLOW verdicts, consumed by the executor */
    this.issuedAllowNonces = new Set();
  }

  /**
   * Evaluate a canonical proposal.
   * @param {object} proposal EffectProposal
   * @param {object} [opts] { approvalId }
   */
  evaluate(proposal, opts = {}) {
    let steps = 0;
    const budget = () => {
      if (++steps > this.evaluationBudget) throw new BudgetExhausted();
    };
    try {
      // G0 — structural validation + effect classification
      budget();
      try {
        validateEffectProposal(proposal);
      } catch (e) {
        if (e instanceof ValidationError) return this.#verdict('DENY', proposal, `structural validation failed: ${e.message}`);
        throw e;
      }
      const effect = lookupEffect(proposal.action);
      if (!effect) {
        return this.#verdict('DENY', proposal, `unknown effect kind '${proposal.action}' fails closed until independently classified`);
      }
      // parameter bounds (content is part of the causal surface)
      budget();
      for (const [param, bound] of Object.entries(effect.parameter_bounds)) {
        const v = proposal.parameters[param];
        if (bound.maxLength !== undefined && typeof v === 'string' && v.length > bound.maxLength) {
          return this.#verdict('REPAIR', proposal, `parameter '${param}' exceeds bound ${bound.maxLength}; a repaired proposal must re-enter the gate`, { repairHint: { param, maxLength: bound.maxLength } });
        }
      }

      // Path policy coupling: for path-targeted effects the harness-neutral
      // permission engine is authoritative. DENY there is DENY here — a
      // gate-mediated write cannot bypass sensitive-path/traversal policy.
      budget();
      if (effect.target_kind === 'path') {
        const pathVerdict = classifyWritePath(this.repoRoot, proposal.target);
        if (pathVerdict.decision === 'deny') {
          return this.#verdict('DENY', proposal, `path policy denies target: ${pathVerdict.reason}`);
        }
      }

      // G2 (checked before authority: no approval can save a forbidden class)
      budget();
      if (effect.forbidden_class) {
        if (!FORBIDDEN_EFFECT_CLASSES.includes(effect.forbidden_class)) {
          return this.#verdict('DENY', proposal, `unknown forbidden class '${effect.forbidden_class}' fails closed`);
        }
        return this.#verdict('DENY', proposal, `constitutionally forbidden effect class '${effect.forbidden_class}': denied even with human approval`);
      }

      // G3 — strictest-wins effect semantics: model claims cannot downgrade.
      budget();
      const effectiveExternality = effect.externality === 'external' ? 'external' : (proposal.claimed_externality === 'external' ? 'external' : effect.externality);
      const effectiveReversibility = REVERSIBILITY_ORDER[proposal.claimed_reversibility ?? effect.reversibility] > REVERSIBILITY_ORDER[effect.reversibility]
        ? proposal.claimed_reversibility : effect.reversibility;
      const effectiveRisk = RISK_ORDER[proposal.claimed_risk ?? effect.risk_class] > RISK_ORDER[effect.risk_class]
        ? proposal.claimed_risk : effect.risk_class;

      // proposal expiry (stale proposals are not executable)
      budget();
      if (proposal.expires_at && this.now() >= Date.parse(proposal.expires_at)) {
        return this.#verdict('DENY', proposal, 'proposal expired');
      }

      // G1/G4 — authority boundary and exact grant
      budget();
      const scope = canonicalScope(effect, proposal.target);
      const digest = proposalDigest(proposal);
      const needsApproval = effect.requires_human_approval || effectiveRisk === 'CONSEQUENTIAL' || effectiveExternality === 'external';
      if (needsApproval) {
        if (!opts.approvalId) {
          return this.#verdict('DEFER', proposal, `human approval required for scope '${scope}'; no approval reference supplied`, { scope, proposal_digest: digest });
        }
        try {
          this.assurance.validateForExecution(opts.approvalId, digest, scope);
        } catch (e) {
          return this.#verdict('DENY', proposal, `approval invalid: ${e.message}`, { scope, proposal_digest: digest });
        }
      }

      // ALLOW — issue a single-use gate nonce the executor requires.
      const nonce = randomBytes(16).toString('hex');
      this.issuedAllowNonces.add(nonce);
      return this.#verdict('ALLOW', proposal, 'admissible', {
        scope,
        proposal_digest: digest,
        gate_nonce: nonce,
        approval_id: needsApproval ? opts.approvalId : null,
        effective: { externality: effectiveExternality, reversibility: effectiveReversibility, risk: effectiveRisk },
      });
    } catch (e) {
      if (e instanceof BudgetExhausted) {
        const effect = lookupEffect(proposal?.action);
        if (effect?.fallback_baseline) {
          return this.#verdict('FALLBACK', proposal, `evaluation budget exhausted; pre-registered baseline '${effect.fallback_baseline}' applies`, { fallback_baseline: effect.fallback_baseline });
        }
        return this.#verdict('DENY', proposal, 'evaluation budget exhausted and no pre-validated safe baseline exists: capability offline by design');
      }
      throw e;
    }
  }

  #verdict(verdict, proposal, reason, extra = {}) {
    return Object.freeze({
      verdict,
      reason,
      proposal_id: proposal?.id ?? null,
      evaluated_at: new Date(this.now()).toISOString(),
      ...extra,
    });
  }

  /** Executor-side check: consume the ALLOW nonce exactly once. */
  consumeAllowNonce(nonce) {
    if (!this.issuedAllowNonces.has(nonce)) return false;
    this.issuedAllowNonces.delete(nonce);
    return true;
  }
}

class BudgetExhausted extends Error {}
