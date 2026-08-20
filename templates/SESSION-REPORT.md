# Session Report: <work-order / date>

## Objective

<What this session attempted.>

## Starting state

- Work order: `<id/path>`
- Base commit/ref: `<sha/ref>`
- Routing intent: `<route>`
- Risk/authority class: `<class>`

## Changes

- `<file/component>` — <what changed and why>

## Verification evidence

| Check | Command / evidence | Result |
|---|---|---|
| Tests | `<...>` | `PASS / FAIL / NOT_RUN` |
| Type/lint/build | `<...>` | `<...>` |
| Security | `<...>` | `<...>` |
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

## Current state

`COMPLETE | BLOCKED | WAITING_FOR_PROVIDER | REVIEW_REQUIRED | HUMAN_GATE | STOPPED`

## Next valid action

<Single next action another agent/human can execute without the prior chat.>

## Git reference

- Commit/PR: `<sha/url if applicable>`
