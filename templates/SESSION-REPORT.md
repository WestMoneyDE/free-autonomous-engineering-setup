# Session Report: <work-order / date>

## Objective

<What this session attempted.>

## Starting state

- Work order: `<id/path>`
- Base commit/ref: `<sha/ref>`
- Routing intent: `<route>`
- Risk/authority class: `<class>`
- Effective scope digest: `<canonical scope_digest or none>`

## Changes

- `<file/component>` — <what changed and why>

## Verification evidence

| Check | Command / evidence | Result |
|---|---|---|
| Tests | `<...>` | `PASS / FAIL / NOT_RUN` |
| Type/lint/build | `<...>` | `<...>` |
| Security | `<...>` | `<...>` |
| Strix security review | `<preflight only / NOT_EXECUTED>` | `<claim status; never authority>` |
| Independent review | `<...>` | `<...>` |

## Routing / provider outcome

- Selected route/provider/model: `<if known>`
- Fallback/escalation: `<none or reason>`
- Budget status: `<within policy / blocked / unknown>`
- Provider failures: `<exact class, never narrate as success>`

## Decisions

- <accepted decision and evidence>

## Unknowns / negative evidence

- <what remains unproven, failed or contradictory>

## External actions

- Action: `<none or exact action>`
- Authority reference: `<none or approval>`
- Outcome: `<SUCCESS / FAIL / CANCELLED / BLOCKED / NOT_EXECUTED>`
- Retried automatically: `NO`
- Real Strix scan executed: `NO (NOT_EXECUTED) | YES + authorization reference`

## Current state

`READY | IN_PROGRESS | READY_FOR_REVIEW | CHANGES_REQUESTED | BLOCKED | WAIT_PROVIDER | FOUNDER_REQUIRED | APPROVED_FOR_EXTERNAL_ACTION | DONE | FAIL | CANCELLED` (canonical machine: `spec/state-machine.json`)

## Next valid action

<Single next action another agent/human can execute without the prior chat.>

## Git reference

- Commit/PR: `<sha/url if applicable>`
