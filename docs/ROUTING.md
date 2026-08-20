# Routing policy

## Principle

**DeepSeek Harness decides how to execute the coding task. OmniRoute decides which model/provider serves inference.**

Do not create two competing automatic routers unless you have an explicit arbitration rule. The recommended DSH configuration exposes OmniRoute as one provider and uses OmniRoute model IDs as routing intents.

## Recommended routes

| Task class | Route | Purpose |
|---|---|---|
| `coding-standard` | `auto/coding` | balanced quality-first coding pool |
| `coding-fast` | `auto/coding:fast` | repository search, small edits, quick diagnostics |
| `coding-cheap` | `auto/coding:cheap` | minimize token price where possible |
| `coding-reliable` | `auto/coding:reliable` | prefer healthier/more stable candidates |
| `coding-free-preferred` | `auto/coding:free` | prefer free-tier candidates |
| `reasoning-hard` | `auto/reasoning:pro` | difficult architecture/reasoning where premium use is permitted |

OmniRoute also exposes general routes such as `auto`, `auto/fast`, `auto/cheap`, `auto/offline` and `auto/smart`.

## Free-preferred is not hard-free

OmniRoute's `auto/<category>:<tier>` candidate filtering is documented as **fail-open**: if the constraint matches no connected model, routing can fall back to the broader pool so the request does not break.

Therefore:

```text
auto/coding:free ≠ guaranteed $0
```

Use one of these patterns when the budget is a hard invariant:

### Pattern A — hard-free candidate pool

Connect/enable only provider/model candidates that you have independently classified as allowed and no-cost for this environment. Then a fail-open filter cannot escape into a paid candidate because none is present in the permitted pool.

### Pattern B — strict per-request budget

OmniRoute supports request-level budget controls for auto routing, including:

```text
X-OmniRoute-Budget
X-OmniRoute-Budget-Fallback: strict
```

When a client can send these headers, strict mode can fail the request instead of silently selecting a candidate beyond the cap. Verify that your DSH adapter/client path actually forwards the required headers before depending on this as a hard guarantee.

### Pattern C — separate endpoint/API key policy

Operate a dedicated OmniRoute endpoint/key whose candidate set and policy are restricted to the desired budget class. This creates a clearer infrastructure boundary than relying only on prompt instructions.

## Session/task stickiness

Avoid uncontrolled model hopping inside one logical coding task.

Reasons:

- provider prompt-cache affinity can be lost;
- model-specific tool/reasoning behavior changes mid-task;
- debugging becomes harder because the causal path changes;
- repeated context ingestion can erase apparent token savings.

DeepSeek Harness records the model selected for an active session. OmniRoute's auto routing also has session-stickiness behavior. Use a new session or an explicit escalation event when the model class must change.

## Escalation policy

A recommended bounded ladder:

```text
fast/free/cheap route
      ↓ only on recorded insufficiency
standard coding route
      ↓ only on repeated verified failure / complexity
hard reasoning route
      ↓
independent review
```

Valid escalation signals include:

- failing tests remain after a bounded number of well-diagnosed attempts;
- required context exceeds the current candidate's supported window;
- task is architecture/security-sensitive by classification;
- provider is unavailable and policy explicitly permits a different tier;
- deterministic eval quality is below the task threshold.

Invalid escalation signals include:

- “the model feels uncertain” without evidence;
- a desire to bypass a budget rule;
- silently retrying an external action until a preferred result appears.

## Reviewer diversity

For important changes, prefer an independent reviewer path that does not simply reuse the builder's unexamined conclusion. The reviewer should inspect the actual diff and rerun the relevant evidence. A different model/provider can reduce correlated errors, but deterministic checks remain more authoritative than model disagreement.

## Provider failure states

Model/provider routing failures must be explicit:

```text
WAITING_FOR_PROVIDER
RATE_LIMITED
AUTH_FAILURE
MODEL_UNAVAILABLE
BUDGET_BLOCKED
CONTEXT_LIMIT
RUNTIME_FAILURE
```

Do not convert any of these into `SUCCESS` merely because a fallback response was syntactically produced. Record which fallback occurred and whether it remained within the task's cost/authority policy.

## Routing telemetry to retain

Retain only what improves operations without leaking protected content:

- route intent (`auto/coding:cheap`, etc.);
- selected provider/model identifier;
- timestamp and duration;
- token/cost counters where available;
- retry/fallback class;
- quota/health outcome;
- task/session correlation ID.

Avoid logging secrets, raw private prompts, full source code, personal data or hidden chain-of-thought.
