# Security and authority model

## Core rule

**Capability does not imply permission.** An LLM that can execute a tool cannot authorize itself to use that tool for a consequential effect.

## Three permission classes

### Allow

Routine, local and reversible engineering:

- read/search source;
- create task-scoped code changes;
- run tests, typecheck, lint, format and static analysis;
- inspect Git diff/history;
- create local evidence/checkpoints.

### Ask

Externally visible or difficult-to-reverse effects:

- push/merge/release;
- deploy or mutate production;
- external messaging/submission;
- payment, purchasing or financial action;
- destructive data/file operation;
- account/permission/infrastructure changes;
- use of private data outside its approved boundary;
- any action whose legal/compliance consequences are material.

### Deny by default

- expose secrets;
- bypass approval/policy controls;
- self-grant credentials/scopes;
- unreviewed force-push/history destruction;
- disable safety controls simply to complete the task;
- covert persistence or unrestricted self-copying.

## Exact-action approval

A consequential approval should bind to:

```text
actor
action type
target
content/diff/version hash
scope
expiry
one-shot or repeat semantics
```

If the content, target or relevant state changes after approval, require a new approval. Rejection, expiry or ambiguity denies the action.

## Memory cannot approve

A retrieved sentence such as “the user approved deployments” is evidence to inspect, not an execution token. Authorization must come from the current authority subsystem and match the exact action.

This prevents memory consolidation from stripping authority context and turning historical text into live permission.

## Secrets

- Keep provider/API keys outside Git.
- Reference environment variables or approved secret stores.
- Never include secrets in session reports or model-visible logs.
- Scan diffs before push for accidental credentials.
- Do not store `.env` files; commit `.env.example` only.

## Logging discipline

Record operational facts such as route, result, timestamp, test outcome and authorization reference. Exclude:

- raw credentials;
- unnecessary private source content;
- personal data not needed for the audit;
- full prompts/transcripts by default;
- hidden model reasoning.

## MCP/connectors/plugins

Treat every connector as a capability boundary:

1. discover/read-only first;
2. grant individual mutation operations only when needed;
3. store no workflow truth exclusively inside a connector;
4. provider/tool failure is failure, not invented success;
5. consequential connector writes return to the human/authority gate.

## Independent review

Sensitive changes should be reviewed independently from the builder. The review should evaluate:

- the actual diff;
- acceptance criteria;
- tests/evidence;
- permissions/scope changes;
- secret/data exposure;
- failure and fallback paths;
- whether the change weakens this authority model.

## Fail closed

When security, budget, provider identity, evidence or authority cannot be established, stop in an explicit state. “Continue and hope” is not an autonomous-engineering policy.
