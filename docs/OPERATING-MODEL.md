# Operating model

## 1. Hermes receives intent

A user request, GitHub issue or scheduled project event enters Hermes Supervisor. Hermes reads the compact durable project interface instead of reconstructing state from chat.

## 2. Bound the work order

Hermes records objective, in/out of scope, acceptance criteria, verification commands, risk class, routing/cost class, allowed tools and required authority.

## 3. Acquire worker lease

Before dispatch, Hermes obtains a lock/lease keyed by project + work-order + phase. An existing active lease blocks duplicate execution.

## 4. Dispatch DeepSeek Harness

`READY` dispatches an implementation worker. Hermes sends a bounded task packet with state/evidence references; DSH executes the coding loop and returns structured evidence plus a proposed next state.

## 5. Route inference through OmniRoute

Hermes chooses the task policy envelope; DSH requests the corresponding route; OmniRoute chooses the concrete model/provider using health/quota/cost/latency/task-fit signals.

## 6. Deterministic verification

Run the smallest complete evidence set appropriate to the project: typecheck, lint, unit/integration tests, security checks, schema validation, build and focused evals. “Should pass” is not evidence.

## 7. Independent review

After implementation, Hermes transitions to `READY_FOR_REVIEW` and dispatches a separate reviewer profile/session. The reviewer reads the actual diff and evidence. Verdicts include `PASS`, `CHANGES_REQUESTED`, `RISK_ESCALATION` or `FOUNDER_REQUIRED`.

## 7b. Security review

Security-sensitive changes route to the Security Reviewer role, which follows
the pinned `usestrix/strix` procedure as a **proposal**: findings and coverage
are validated strictly, the preflight always reports
`execution_authorized: false`, and a real scan additionally requires written
target authorization plus an independent approval. A review claim is never a
grant.

## 8. Rework loop is bounded

`CHANGES_REQUESTED` returns only the concrete findings to an implementation worker. Repeated failure triggers diagnosis/escalation; it does not create an infinite loop.

## 9. Authority gate

If the next action is external, destructive, production-facing, financial, permission-changing or otherwise consequential, Hermes sets `FOUNDER_REQUIRED` and stops until exact human approval exists.

## 10. External execution is one-shot

After approval: freeze exact artifact/action, revalidate approval binding, execute once, persist exact result. Failure does not auto-rerun.

## 11. Checkpoint and close

Hermes persists objective, changes, tests, reviewer verdict, blockers/unknowns, routing/cost anomalies, external actions, next action and commit/PR reference. Then state moves to `DONE` only if acceptance criteria and required gates are satisfied.

## Canonical loop

```text
ISSUE / INTENT
  ↓
HERMES: READ STATE
  ↓
BOUND WORK ORDER + LOCK
  ↓
DSH IMPLEMENTATION WORKER
  ↓
OMNIROUTE MODEL ROUTING
  ↓
VERIFY
  ↓
HERMES → INDEPENDENT REVIEWER
  ↓
PASS / CHANGES_REQUESTED / ESCALATE
  ↓
HUMAN GATE WHEN REQUIRED
  ↓
ONE-SHOT EXTERNAL ACTION
  ↓
CHECKPOINT + DONE
```

## Scope note: local core vs optional team/server profile

This repository's runtime is a LOCAL-FIRST, single-operator core. Capabilities
from the AI Engineering Stack that only matter for shared/server deployments —
multi-tenancy, PostgreSQL Row Level Security, full RBAC, mobile approval
transports, hosted evals — are deliberately **not** part of this core. They are
documented as an optional team/server profile: if you deploy the supervisor as
a shared service, add a real database with RLS-backed tenancy, a real identity
provider, a CAS-capable lease/approval store, and an authenticated approval
transport. The ownership boundaries implemented here (assurance separate from
memory, gate separate from executor) must survive that migration unchanged.
