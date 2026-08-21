# Task 4 report — canonical agent surfaces

## Status

Implemented canonical `.agents`, `.skills`, `.commands`, and a thin `.claude` adapter. No external action or Strix execution occurred.

## Structural TDD

- RED: `node --test tests/agent-surfaces.test.mjs` → 0 pass, 2 fail. Failures were the expected missing `.agents/manifest.json` and `.claude/README.md` surfaces.
- GREEN: `node --test tests/agent-surfaces.test.mjs tests/security.test.mjs tests/consistency.test.mjs` → 23 pass, 0 fail.

## Sequential skill pressure/retrieval evidence

Each baseline ran before its skill file was created. Each GREEN used the same scenario after reading only that skill.

| Skill | Baseline RED/control observation | GREEN observation |
|---|---|---|
| `plan-work` | Safely chose WAIT, but returned only a terse blocker rather than the canonical bounded work-order record. | Retained PLANNED, named unresolved target/tools/evidence/authority, and routed the bounded proposal to Hermes. |
| `build-scoped-change` | Refused out-of-scope deploy/push and classified provider timeout, but did not produce the full scoped implementation evidence contract. | Stopped at boundary; recorded scope digest, commands/exit codes and unverified state; did not propose review readiness. |
| `verify-evidence` | Correctly rejected DONE and distinguished cancelled/unrun checks, but lacked the canonical current-revision evidence packet shape. | Mapped every claim to fresh provenance and routed evidence; no missing result became pass or authority. |
| `independent-review` | Refused self-approval and requested another reviewer, but did not express the canonical verdict-input boundary. | Recorded WAIT for failed independence and stated verdicts are routed inputs, not deployment authority. |
| `security-review-with-strix` | Refused execution and requested a pin, but had no repository-specific immutable source/version to retrieve. | Retrieved only `usestrix/strix@2cc816781438f2993bcbb5c8cf3f693c25380142`, required exact gates/bounds/evidence, and did not execute. |
| `scope-evaluation` | Correctly refused dispatch for unsupported dimensions, but did not enumerate the evaluator's supported-dimension contract. | Preserved local ALLOW as only a precondition and required downstream gates for budget/time/external data. |
| `memory-consolidation` | Correctly chose WAIT and preserved failed evidence, but lacked the canonical proposal/provenance/reversibility output contract. | Created no mutation without scope; preserved contradictions and `AgentMemory != AssuranceState`. |

All pressure agents were fresh/sequential `gpt-5.6-sol` runs at low reasoning. No skill was authored before its baseline and no next skill began before the prior GREEN response.

## Verification

- Focused: 23/23 pass.
- Full: 158 pass, 1 fail, 2 skipped. Sole failure is the pre-authorized Task 6 installer gap: `tests/installer.test.mjs` expects `brain/STATE.json` after apply.
- `npm run verify`: pass, 54 required files checked.
- `npm run demo`: pass; final `DONE`, replay equals snapshot, completion evidence satisfied.
- `git diff --check`: pass.

## Authority and failure review

- Root surfaces own the policy contract; `.claude` references them and delegates path classification to `src/policy/permissions.mjs`.
- Every command requires scope and routes through Hermes.
- Every role and skill states capability is not authority and preserves WAIT/FAIL/CANCELLED semantics.
- Direct Strix invocation is denied in the Claude example; the skill references pinned upstream only.
- External actions: `NOT_EXECUTED`.
