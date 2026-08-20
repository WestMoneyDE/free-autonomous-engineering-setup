# Notices and provenance

This repository is an integration and operating-model project WITH an original, MIT-licensed runtime implementation (`src/`, `spec/`, `tests/`). It does not vendor the source code of the upstream projects listed below.

**Hermes non-affiliation:** the "Hermes Supervisor Runtime" in this repository is an original implementation written for this project. There is no publicly installable upstream "Hermes" package; the name is used here for architectural continuity with the design described in `WestMoneyDE/ai-engineering-stack`, whose author describes Hermes as a personal, non-installable control-plane design. No upstream Hermes code, product or endorsement is claimed.

## Design sources

The reusable engineering patterns in this repository were synthesized from:

- `WestMoneyDE/ai-engineering-stack` — governed autonomous engineering loops, deterministic verification, independent review, durable project state, skills, hooks, least-privilege connectors and human approvals.
- `WestMoneyDE/LOGOS-1` — capability/authority separation, provenance-bearing memory, distinct assurance state, exact failure semantics, session persistence and one-shot external-execution discipline.

The runtime integration is designed around:

- `deepseek-ai/deepseek-harness` — open-source plugin-oriented agent harness.
- `diegosouzapw/OmniRoute` — open-source OpenAI-compatible AI gateway and routing layer.

## Licensing

This repository is MIT licensed. The upstream repositories retain their own licenses, copyrights and trademarks. Always consult the upstream repository before redistributing its code or assets.

## Validation date

Configuration and installation guidance here was checked against public upstream documentation available on 2026-08-20. Both runtime projects evolve rapidly. DeepSeek Harness explicitly identifies itself as a developer preview with compatibility-breaking changes expected.
