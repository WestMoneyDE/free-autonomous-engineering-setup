# Hermes Supervisor

Hermes is the **supervisor / orchestration plane** of this setup. It is not the primary coding worker and it is not the model router.

## Position in the stack

```text
User / GitHub Issue / Work Order
            ↓
      Hermes Supervisor
            ↓
   bounded task assignment
            ↓
     DeepSeek Harness
            ↓
        OmniRoute
            ↓
       model/provider
```

Hermes owns coordination, task-state transitions, worker dispatch, escalation and durable supervision. DeepSeek Harness owns coding execution. OmniRoute owns inference routing.

## Compact source-of-truth interface

Hermes should not repeatedly re-read an entire repository to reconstruct project state. A project should expose a small durable supervisor interface such as:

```text
brain/STATE.json
CURRENT-WORK-ORDER.md
.state/tasks/
.state/sessions/
.state/evidence/
```

A minimal state record can expose:

```json
{
  "project": "example",
  "status": "READY",
  "active_work_order": "WO-0042",
  "branch": "feat/example",
  "last_worker_run": null,
  "last_review": null,
  "blocker": null,
  "next_action": "dispatch_developer"
}
```

Git-backed state is authoritative; chat history and runtime-local memory are only accelerators.

## Canonical state routing

| State | Hermes action |
|---|---|
| `READY` | dispatch bounded implementation task to DeepSeek Harness |
| `IN_PROGRESS` | observe; do not duplicate-dispatch |
| `READY_FOR_REVIEW` | dispatch independent review worker/session |
| `CHANGES_REQUESTED` | return bounded findings to implementation worker |
| `BLOCKED` | persist blocker and stop automatic looping |
| `WAIT_PROVIDER` | wait or choose an explicitly permitted routing fallback |
| `FOUNDER_REQUIRED` | escalate to the human authority channel |
| `APPROVED_FOR_EXTERNAL_ACTION` | execute only the exact approved action, once |
| `DONE` | persist evidence and close the work order |
| `FAIL` / `CANCELLED` | persist exact outcome; do not auto-rerun |

## Duplicate-run protection

Hermes prevents concurrent duplicate execution of the same bounded work order with a lock/lease keyed by project + work-order + phase.

Dispatch is allowed only when the current state permits that worker class, no active non-expired lock exists, the work-order version/hash still matches, and authority/budget policy remains valid.

## Hermes → DSH task packet

Hermes sends a bounded packet:

```text
project
work_order_id
objective
scope
out_of_scope
acceptance_criteria
verification_commands
risk_class
routing_class
allowed_tools
authority_class
state/evidence references
```

DSH returns:

```text
outcome
changed_files
tests_and_results
review_needed
blockers
cost/routing observations
state transition proposal
evidence references
```

A worker may propose a transition; it does not self-authorize consequential actions.

## Relationship to OmniRoute

Hermes chooses the **task routing class and policy envelope**; OmniRoute chooses the concrete provider/model.

```text
Hermes: coding-standard + free-preferred budget class
        ↓
DSH requests route
        ↓
OmniRoute scores health + quota + cost + latency + task fit
        ↓
provider/model selected
```

Hermes must not implement a second competing provider router, and OmniRoute must not own project workflow state.

## Independent review

For `READY_FOR_REVIEW`, Hermes dispatches a separate reviewer profile/session. The implementation worker never approves itself.

Recommended verdicts: `PASS`, `CHANGES_REQUESTED`, `RISK_ESCALATION`, `FOUNDER_REQUIRED`.

## Human authority boundary

Hermes is a supervisor, not an authority generator. It can route to a human when required, but cannot infer approval from model confidence, prior approvals, memory, previous success, repository ownership or urgency.

Approval must be explicit and bound to the exact consequential action.

## One-shot external execution

For push/merge/deploy/production mutation/external messaging/payment or similar consequential actions:

1. freeze exact action/artifact;
2. verify locally;
3. obtain exact approval;
4. execute once;
5. persist the exact result;
6. on failure, classify and stop; do not auto-rerun.

## Multi-project supervision

Hermes can supervise several repositories by polling only their compact state interface:

```text
Hermes
 ├─ project A → STATE.json → DSH worker
 ├─ project B → STATE.json → DSH worker
 └─ project C → STATE.json → DSH worker
```

This keeps supervision cheap, inspectable and resilient while DSH and OmniRoute evolve independently.
