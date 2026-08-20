#!/usr/bin/env node
// Minimal supervisor CLI for smoke tests and fresh-agent recovery.
//   node src/cli.mjs state <projectRoot>            — show derived project state
//   node src/cli.mjs verify-recovery <projectRoot>  — snapshot == replay?
//   node src/cli.mjs validate-transition <from> <event> — dry transition check
//   node src/cli.mjs machine                        — print canonical machine
import process from 'node:process';
import path from 'node:path';
import { ProjectRegistry } from './supervisor/project-registry.mjs';
import { validateTransition, SPEC, TransitionError } from './supervisor/state-machine.mjs';

const [cmd, ...rest] = process.argv.slice(2);

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

switch (cmd) {
  case 'machine': {
    console.log(JSON.stringify({ states: Object.keys(SPEC.states), transitions: SPEC.transitions.map((t) => `${t.from} --${t.event}--> ${t.to}`) }, null, 2));
    break;
  }
  case 'state': {
    const root = rest[0] ?? fail('usage: state <projectRoot>');
    const registry = new ProjectRegistry(path.dirname(path.resolve(root)));
    const state = registry.state(path.basename(path.resolve(root)));
    if (!state) fail('project not registered (no event log found)');
    console.log(JSON.stringify(state, null, 2));
    break;
  }
  case 'verify-recovery': {
    const root = rest[0] ?? fail('usage: verify-recovery <projectRoot>');
    const registry = new ProjectRegistry(path.dirname(path.resolve(root)));
    const ok = registry.verifyRecovery(path.basename(path.resolve(root)));
    console.log(ok ? 'RECOVERY_OK: replayed state equals snapshot' : 'RECOVERY_MISMATCH');
    process.exit(ok ? 0 : 1);
    break;
  }
  case 'validate-transition': {
    const [from, event] = rest;
    if (!from || !event) fail('usage: validate-transition <fromState> <event>');
    try {
      const { to } = validateTransition(from, event, { guards: {}, evidence: {}, authority: 'supervisor' });
      console.log(`STRUCTURALLY VALID: ${from} --${event}--> ${to} (guards/evidence/authority still apply at runtime)`);
    } catch (e) {
      if (e instanceof TransitionError) {
        if (['GUARD_FAILED', 'EVIDENCE_MISSING', 'AUTHORITY_REQUIRED'].includes(e.code)) {
          console.log(`STRUCTURALLY VALID, RUNTIME-GATED (${e.code}): ${e.message}`);
          break;
        }
        console.log(`INVALID (${e.code}): ${e.message}`);
        process.exit(1);
      }
      throw e;
    }
    break;
  }
  default:
    fail('commands: machine | state <root> | verify-recovery <root> | validate-transition <from> <event>');
}
