# Costs and budget controls

## What can be free

The integration software itself can be run locally without a per-request license fee:

- this starter is MIT licensed;
- DeepSeek Harness is open source;
- OmniRoute is open source;
- Git and local verification tools can run locally.

The variable cost is primarily **model/provider usage** plus optional infrastructure.

## $0 is a runtime condition, not a repository guarantee

A task can have $0 API spend when:

1. the selected provider/model is actually free for that account;
2. its quota is available;
3. routing does not fall back to a paid candidate;
4. no paid external service is invoked.

Provider free tiers, quotas and terms can change. Always inspect current OmniRoute telemetry/provider terms.

## Recommended budget modes

| Policy | Routing approach | Guarantee |
|---|---|---|
| Free preferred | `auto/coding:free` | No hard guarantee; filter is fail-open upstream |
| Cheap preferred | `auto/coding:cheap` | Optimizes cost but may spend |
| Hard free | Only no-cost candidates permitted in the endpoint/pool | Strongest practical boundary |
| Hard request cap | OmniRoute budget header + strict fallback where forwarded by client | Fails rather than intentionally overspend |
| Premium allowed | `auto/coding` / `auto/reasoning:pro` under explicit budget | Quality/complexity priority |

## OmniRoute strict request budget

For clients that can send the headers, OmniRoute's auto routing supports:

```text
X-OmniRoute-Budget: <max USD for request>
X-OmniRoute-Budget-Fallback: strict
```

In strict fallback mode, a request can fail rather than select a candidate above the cap. Verify header forwarding through the actual DSH adapter before treating this as an enforced control.

## Hard-free infrastructure pattern

For the clearest zero-spend boundary:

```text
DSH
 ↓
OmniRoute endpoint/key dedicated to FREE policy
 ↓
only explicitly allowed no-cost provider connections
```

Do not add a paid provider to that candidate pool “just as backup” if $0 is an invariant. Keep premium routing on a separate endpoint/key or separately authorized policy.

## Cost telemetry

For each task/session, retain where available:

- route intent;
- selected model/provider;
- input/output/cache token counters;
- estimated/actual cost;
- fallback/escalation events;
- provider quota/rate-limit outcome.

Avoid retaining raw prompts/source unnecessarily.

## Local infrastructure

Running DSH and OmniRoute on an existing workstation can add essentially no hosting bill beyond electricity/network. A remote always-on host, database, proxy, observability stack or paid provider adds its own cost.

## Cost optimization order

Before buying a stronger model for every token:

1. minimize irrelevant context;
2. keep sessions/tasks sticky enough for cache/context reuse;
3. route search/trivial tasks to fast/cheap/free candidates;
4. use deterministic tools for work that does not need an LLM;
5. escalate only on recorded evidence;
6. use independent review selectively on risk, not blindly on every trivial edit;
7. track whether a “cheap” model causes so many retries that total cost rises.

The useful metric is **cost per verified correct task**, not price per token alone.
