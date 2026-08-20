// Canonical work-order state machine, loaded from spec/state-machine.json.
// The spec file is the single source of truth; this module enforces it.
// Invalid transitions fail closed. Terminal states have no exits.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORK_ORDER_STATES, TERMINAL_STATES } from '../schemas/schemas.mjs';

const specPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'spec', 'state-machine.json');
export const SPEC = JSON.parse(fs.readFileSync(specPath, 'utf8'));

// Consistency between spec and schema enums is itself enforced at load time.
for (const s of Object.keys(SPEC.states)) {
  if (!WORK_ORDER_STATES.includes(s)) throw new Error(`spec state ${s} missing from schema enum`);
}
for (const s of WORK_ORDER_STATES) {
  if (!SPEC.states[s]) throw new Error(`schema state ${s} missing from spec`);
}
for (const t of SPEC.transitions) {
  if (TERMINAL_STATES.includes(t.from)) throw new Error(`spec defines an exit from terminal state ${t.from}`);
}

export class TransitionError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'TransitionError';
    this.code = code;
  }
}

export function isTerminal(state) {
  return TERMINAL_STATES.includes(state);
}

export function allowedEvents(state) {
  return SPEC.transitions.filter((t) => t.from === state).map((t) => t.event);
}

/**
 * Validate a transition. Fails closed on: unknown state, unknown event,
 * terminal source state, unsatisfied guard, missing required evidence,
 * missing required authority.
 *
 * @param {string} from current state
 * @param {string} event transition event name
 * @param {object} context { guards: {name: boolean}, evidence: {name: any}, authority: 'supervisor'|'human' }
 * @returns {{ to: string, transition: object }}
 */
export function validateTransition(from, event, context = {}) {
  if (!SPEC.states[from]) throw new TransitionError(`unknown state: ${from}`, 'UNKNOWN_STATE');
  if (isTerminal(from)) {
    throw new TransitionError(`state ${from} is terminal; a terminal work order can never be reopened — create a new work order`, 'TERMINAL');
  }
  const transition = SPEC.transitions.find((t) => t.from === from && t.event === event);
  if (!transition) {
    throw new TransitionError(`no transition for event ${event} from state ${from}`, 'INVALID_TRANSITION');
  }
  const guards = context.guards ?? {};
  for (const g of transition.guards) {
    if (guards[g] !== true) throw new TransitionError(`guard not satisfied: ${g}`, 'GUARD_FAILED');
  }
  const evidence = context.evidence ?? {};
  for (const e of transition.requiredEvidence) {
    if (evidence[e] === undefined || evidence[e] === null) {
      throw new TransitionError(`required evidence missing: ${e}`, 'EVIDENCE_MISSING');
    }
  }
  if (transition.authority === 'human' && context.authority !== 'human') {
    throw new TransitionError(`transition ${from} -> ${transition.to} requires human authority`, 'AUTHORITY_REQUIRED');
  }
  return { to: transition.to, transition };
}

/**
 * Evaluate a worker's PROPOSED transition. Workers cannot self-promote:
 * proposals into approval/authority states are rejected outright, everything
 * else still passes full validation.
 */
export function evaluateProposal(from, proposedState, event, context = {}) {
  const forbiddenProposals = ['APPROVED_FOR_EXTERNAL_ACTION', 'DONE'];
  if (forbiddenProposals.includes(proposedState) && (context.proposerRole !== 'supervisor')) {
    // A worker may propose READY_FOR_REVIEW etc.; DONE and approval states are
    // supervisor/human decisions derived from evidence, never worker claims.
    throw new TransitionError(`worker proposal to ${proposedState} rejected: workers do not self-promote to approval/completion states`, 'SELF_PROMOTION');
  }
  const result = validateTransition(from, event, context);
  if (result.to !== proposedState) {
    throw new TransitionError(`proposal mismatch: event ${event} leads to ${result.to}, not ${proposedState}`, 'PROPOSAL_MISMATCH');
  }
  return result;
}
