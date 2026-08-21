# Upstreams and version discipline

This repository intentionally depends on public upstream interfaces instead of vendoring their implementations.

## DeepSeek Harness

Repository: https://github.com/deepseek-ai/deepseek-harness

Validated behavior on 2026-08-20:

- npm launch (pin it): `npx @deepseek-ai/dsh@0.1.0-rc.7 web`; bare `npx @deepseek-ai/dsh` installs *latest*, which for a developer-preview package is an integration risk;
- local Web UI default: `http://127.0.0.1:3080`;
- plugin-oriented architecture;
- generic `dsh-llm-pi-ai` multi-provider adapter can declare an OpenAI-compatible gateway with `api`, `baseURL`, credential reference and model list;
- custom providers can be added through Settings → Models;
- maintainers label the project developer preview and warn about breaking compatibility changes.

Treat every DSH upgrade as an integration change until the OmniRoute provider and coding workflow have been revalidated.

## OmniRoute

Repository: https://github.com/diegosouzapw/OmniRoute

Validated against the public `release/v3.8.50` documentation available on 2026-08-20:

- npm/global install (pin it): `npm install -g omniroute@3.8.49`;
- no-install launch (pin it): `npx omniroute@3.8.49`;
- note: the published npm version at validation time was **3.8.49** while the documentation validated was the `release/v3.8.50` branch — bare `npx omniroute` installs *latest* and can drift ahead of what this repo validated; always pin;
- local OpenAI-compatible endpoint: `http://localhost:20128/v1`;
- auto routing aliases include `auto/coding`, `auto/coding:fast`, `auto/coding:cheap`, `auto/coding:reliable`, `auto/coding:free` and `auto/reasoning:pro`;
- category/tier filtering is fail-open if no matching candidate exists;
- strict request-budget fallback exists for auto routing when the client sends the supported headers.

Do not hardcode provider counts, free-token totals or provider pricing into operational policy. Those are dynamic catalog data.

## Strix (security review)

Repository: https://github.com/usestrix/strix

```text
usestrix/strix@%s
license = Apache-2.0
integration = authorization-gated Security Reviewer procedure; no vendored code
```

Reused as a **pinned procedure contract**, not as a dependency: no Strix source
is vendored, no executable is installed by this repository and `scripts/init-project.mjs`
explicitly refuses to install a `strix` entry. The preflight
(`src/security/strix-review.mjs`) always returns `execution_authorized: false`;
a real run additionally requires exact written target authorization, an
independent AssuranceStore approval and an effect-gate ALLOW. Status in this
release: no real Strix execution — `NOT_EXECUTED`.

## AI Engineering Stack

Repository: https://github.com/WestMoneyDE/ai-engineering-stack

Reused as design principles: bounded Loop Engineering, durable state, independent review, evidence gates, permission classes, least-privilege connectors, skills and fail-closed provider handling.

## LOGOS-1

Repository: https://github.com/WestMoneyDE/LOGOS-1

Reused as engineering principles: capability/authority separation, memory/assurance separation, provenance preservation, exact unknown/failure semantics, one-shot external execution and durable session checkpoints.

## Update procedure

When an upstream changes:

1. read its release notes/docs;
2. update this file if an assumption changed;
3. validate `config/dsh-omniroute.settings.example.yaml`;
4. run `npm test`;
5. execute a harmless read-only integration smoke test;
6. execute a bounded coding task with deterministic tests;
7. update docs/config in one coherent repository change.
