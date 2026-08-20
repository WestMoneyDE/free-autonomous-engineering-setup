# Work Order: <short title>

## Identity

- ID: `<unique-id>`
- Created: `<ISO-8601>`
- Requested by: `<actor/source>`
- Status: `PLANNED | ACTIVE | BLOCKED | REVIEW | COMPLETE | STOPPED`

## Objective

<One bounded outcome.>

## In scope

- <file/component/action>

## Out of scope

- <explicit non-goal>

## Acceptance criteria

- [ ] <observable criterion>
- [ ] <observable criterion>

## Verification contract

Run/produce:

```text
<test/typecheck/lint/build/security/eval commands>
```

Completion is invalid if required evidence did not run and the report does not explicitly remain incomplete/blocked.

## Risk and authority

- Risk class: `LOW | MEDIUM | HIGH | CONSEQUENTIAL`
- Allowed autonomous operations: `<...>`
- Operations requiring human approval: `<...>`
- Forbidden operations: `<...>`

## Routing and budget

- Preferred route: `<auto/coding ...>`
- Hard/soft budget policy: `<...>`
- Paid escalation allowed: `YES | NO | ONLY_WITH_APPROVAL`
- Maximum bounded attempts before diagnosis/escalation: `<n>`

## Plan

1. <step>
2. <step>
3. <verification>

## Independent review

- Required: `YES | NO`
- Reviewer constraint: `<security / different role / other>`

## External actions

- Expected external effect: `<none or exact action>`
- Approval reference required: `<none or exact gate>`
- Retry policy: `ONE_SHOT_BY_DEFAULT`

## Stop conditions

Stop rather than improvise when:

- scope/authority is ambiguous;
- budget policy cannot be satisfied;
- required evidence cannot be produced;
- provider/tool failure changes the task assumptions;
- an external attempt fails and no new explicit attempt is authorized.
