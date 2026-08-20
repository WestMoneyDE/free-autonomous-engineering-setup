# Operating model

## 1. Convert intent into a bounded work order

Before implementation, record:

- objective;
- in-scope and out-of-scope areas;
- acceptance criteria;
- verification commands;
- risk class;
- allowed routing/cost class;
- external actions and required authority.

Use `templates/WORK-ORDER.md`.

## 2. Classify before routing

A task is not routed only by model popularity. Consider:

- complexity;
- repository/context size;
- security/production sensitivity;
- latency tolerance;
- budget ceiling;
- need for independent review;
- whether a free-only policy is hard or merely preferred.

Then choose a route from `docs/ROUTING.md`.

## 3. Plan

The plan should be short enough to inspect and concrete enough to verify. It includes intended files/components, tests, migration/rollback concerns and authority-sensitive steps.

Do not treat a plan as permission to exceed the work-order scope.

## 4. Build

Implement the smallest coherent change that satisfies the acceptance criteria. Avoid opportunistic refactors unless explicitly approved or necessary for correctness.

Prefer tests/counterexamples that fail before the fix where practical.

## 5. Deterministic verification

Run the smallest complete evidence set appropriate to the project, for example:

```text
typecheck
lint
unit/integration tests
targeted security checks
schema/migration validation
build
focused evals / negative counterchecks
```

Record what actually ran. “Should pass” is not evidence.

## 6. Independent review

The reviewer reads the actual diff and evidence, not just the builder's summary. It may request changes, approve the engineering result, or escalate risk. Repeated review failure should lead to diagnosis/escalation, not infinite cycling.

## 7. Authority gate

Ask whether the next action is external, destructive, production-facing, financial, legal, permission-changing or otherwise difficult to reverse.

If yes, require the exact-action authority described in `SECURITY-AND-AUTHORITY.md`.

## 8. External execution discipline

Before a consequential external action:

1. freeze the exact artifact/action;
2. finish local verification;
3. obtain required approval;
4. execute once;
5. persist the exact outcome.

If it fails, do not automatically rerun it. Diagnose and create a new explicitly authorized attempt only after the prerequisite or protocol materially changes.

This prevents retry loops from turning a transport/provider failure into fabricated evidence or repeated unintended effects.

## 9. Checkpoint

After substantive work, create a durable session report containing:

- objective;
- changes;
- tests/evidence;
- decisions;
- blockers/unknowns;
- cost/routing anomalies if relevant;
- external actions;
- next action;
- commit/PR reference.

A new agent should not need the prior chat to resume.

## 10. Consistency check before completion

Ask:

- Does code match the work order?
- Do tests and docs describe the same behavior?
- Did a capability or authority boundary change?
- Did any unknown get narrated as success?
- Did any failed external action get retried without a new explicit attempt?
- Can a fresh agent understand the new state from the repository?
- Did routing remain within the allowed budget/provider policy?

Only then mark the task complete.
