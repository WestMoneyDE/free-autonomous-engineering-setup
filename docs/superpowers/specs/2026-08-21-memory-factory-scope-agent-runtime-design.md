# Memory Factory, Scope Engine and Agent Runtime Design

**Date:** 2026-08-21

**Status:** approved design, implementation planning pending

**Product:** Free Autonomous Engineering Setup

## Goal

Turn the existing executable supervisor into a complete, installable autonomous-engineering repository that combines:

- the Autonomous Engineering Reference V1 operating model;
- LOGOS-1 Memory Factory and authority boundaries;
- a deterministic Scope Engine;
- repository-owned `.agents`, `.skills`, `.commands` and `.claude` surfaces;
- bounded Loop Engineering;
- a Strix-informed Security Reviewer procedure.

SIP application code, B2B/ERP workflows and patent text are explicitly out of scope. This repository implements platform-neutral engineering mechanisms only.

## Public identity and lineage

Public copy uses **Ömer Coskun** and links to `https://www.linkedin.com/in/oemer-coskun53`.

The repository describes its lineage as:

```text
AI Engineering Stack = Autonomous Engineering Reference V1
LOGOS-1 = governed memory, evidence and authority mechanisms
Free Autonomous Engineering Setup = executable integrated successor
```

## Architecture

```text
Intent / issue
  -> Work-order intake
  -> Scope Engine
  -> Planner
  -> Builder
  -> deterministic verification
  -> independent reviewer
  -> Security Reviewer when classified
  -> authority gate for consequential effects
  -> one-shot execution if authorized
  -> evidence + Memory Factory checkpoint
  -> terminal state or bounded rework
```

Hermes remains the supervisor, DSH remains the coding harness and OmniRoute remains the inference router. The new mechanisms do not merge those responsibilities.

## Memory Factory

The existing memory store and BM25 retrieval become an explicit production pipeline.

### Pipeline

```text
ingest
  -> normalize and schema-check
  -> classify working / episodic / semantic / procedural / evidence
  -> attach source and authority provenance
  -> append immutable source record
  -> index
  -> retrieve within effective scope
  -> propose consolidation
  -> local transition validation
  -> global evidence-coherence validation
  -> authority-preservation validation
  -> emit semantic/procedural/projection record or reject
```

### Required behavior

- preserve source provenance, authority provenance, conflicts, supersession and epistemic status;
- prevent consolidation from widening `admissible_uses` or visibility;
- distinguish retention deletion from lineage revocation;
- propagate revocation to derived procedures/skills;
- create deterministic Company Brain and Private Brain context projections with purpose, audience, validity and digest;
- keep assurance records in the separate approval/execution store;
- treat vector retrieval as an optional accelerator, never truth or authority.

### Modules

The implementation will keep files focused:

- `src/memory/factory.mjs` — orchestration of ingest, consolidation and projection;
- `src/memory/store.mjs` — immutable durable records and lineage;
- `src/memory/retrieval.mjs` — deterministic ranking after scope filtering;
- `src/memory/consolidation.mjs` — the three validation checks;
- `src/memory/projection.mjs` — minimum-context Company/Private projections;
- `src/policy/approval.mjs` — separate assurance ownership, unchanged in principle.

## Scope Engine

The Scope Engine replaces informal string/array scope checks with a typed, digest-bound contract.

### Scope contract

`ScopeContract` contains:

- project/repository identity and tenant profile;
- included and excluded filesystem paths;
- role and allowed state-transition proposals;
- allowed tools and operation classes;
- readable memory kinds, record visibility and projection audiences;
- effect/capability classes;
- targets and parameter/value/content-size bounds;
- risk, cost, token, time and attempt ceilings;
- validity interval and occurrence count;
- externality, reversibility and approval class;
- data classification and retention constraints;
- source policy/work-order/profile versions.

The effective scope is the restrictive intersection of project policy, work order, worker profile, data visibility, tool policy, budgets and current authority where required. Unknown high-impact fields fail closed. Worker/model/memory claims can only narrow the result.

### Decisions

`ScopeDecision` is `ALLOW`, `NARROW`, `DEFER` or `DENY` and includes the canonical effective scope, digest, reasons and unresolved dimensions. It authorizes only the evaluated internal operation; consequential effects still require the effect gate and assurance store.

### Integration

- dispatcher validates the worker packet and lease against the scope digest;
- memory queries filter visibility before ranking;
- consolidation checks output visibility and admissible uses;
- command execution checks tool/path/operation bounds;
- reviewer packets are read-focused and cannot self-promote state;
- effect proposals enter the existing deterministic effect gate;
- `UNKNOWN` external outcomes reserve the canonical effect scope until human reconciliation.

## Repository-owned agent surfaces

### `.agents/`

Host-neutral role profiles with machine-readable frontmatter and bounded responsibilities:

- `planner.md`
- `builder.md`
- `independent-reviewer.md`
- `security-reviewer.md`
- `memory-curator.md`
- `manifest.json`

Profiles declare accepted states, allowed tools, read/write scope, required evidence, prohibited transitions and escalation rules.

### `.skills/`

Repository-owned procedures:

- `memory-factory/SKILL.md`
- `scope-engine/SKILL.md`
- `loop-engineering/SKILL.md`
- `verification/SKILL.md`
- `independent-review/SKILL.md`
- `security-review-with-strix/SKILL.md`
- `checkpoint/SKILL.md`

Each skill states triggers, prerequisites, permitted actions, outputs, failure semantics and upstream provenance. Third-party Strix content is referenced by a commit-SHA pin and is not copied wholesale.

### `.commands/`

Host-neutral command contracts:

- `plan.md`
- `build.md`
- `verify.md`
- `review.md`
- `security-review.md`
- `scope-check.md`
- `memory-consolidate.md`
- `checkpoint.md`

Commands are proposal/workflow adapters. They never bypass supervisor state, scope or authority.

### `.claude/`

Claude Code receives thin adapters:

- project settings and sensitive-write hooks;
- agent profiles that point to canonical `.agents` roles;
- command wrappers that point to canonical `.commands` contracts;
- no duplicated policy source of truth.

The core remains compatible with Codex, DSH and other hosts through the host-neutral directories.

## Strix Security Reviewer procedure

The upstream source is `usestrix/strix` pinned at commit `2cc816781438f2993bcbb5c8cf3f693c25380142` under Apache-2.0.

Strix is active offensive security tooling. It is therefore an **ASK-class external/effectful reviewer capability**, not a default Builder tool and not an unattended completion gate.

### Activation contract

A Strix run requires:

- explicit written authorization for every target;
- a typed target inventory and exclusions;
- confirmation that the target is owned or authorized for testing;
- staging/local preference; production remains denied unless separately and exactly authorized;
- clean disposable checkout because local targets are mounted writable;
- scan mode, diff base, budget, max turns and wall-clock bounds;
- credential handling outside Git and outside reports;
- a frozen Strix commit/version and configuration digest;
- an evidence destination outside adaptive memory truth;
- no automatic rerun after failure, cancellation, budget stop or ambiguous result.

All ownership, authorization and clean-checkout inputs to preflight are
untrusted claims. Preflight is non-authoritative and always returns
`execution_authorized: false`; it only constructs a canonical proposal and
digest binding target, environment, scope/config digests, immutable pin,
budgets, evidence destination and occurrence. The independent AssuranceStore
and EffectGate must approve that exact proposal. No Strix launcher ships here.

### Reviewer sequence

```text
authorize target + scope
  -> validate clean disposable environment
  -> deterministic SCA/secret/static checks
  -> Strix white-box diff scan
  -> optional staging scan under separate target authorization
  -> inspect run.json status, cost and coverage
  -> independently validate each PoC and affected data flow
  -> deduplicate and classify high-confidence findings
  -> persist SARIF/report hashes and exact outcome
  -> create separate remediation work order
  -> fix root cause with tests
  -> separately authorized focused re-scan
```

Exit code `0` means no validated vulnerability in analyzed coverage, not a clean bill of health. `run.json` must show a completed run, and reports must disclose untested paths, budget pressure and unavailable live validation. Exit `1`, an incomplete run or provider failure is `FAIL`/`WAIT_PROVIDER`; exit `2` is validated findings. None is silently converted into success.

Strix findings remain untrusted inputs until the independent Security Reviewer confirms the PoC, attacker-controlled data path, framework context and impact. Only high-confidence exploitable findings enter the blocking report; uncertain observations are marked `NEEDS_VERIFICATION`.

Exit-code-2 results require a report with a strictly boolean `coverage_complete`. Validated findings remain `FINDINGS` under partial coverage, but `complete` is true only for a completed run with `coverage_complete: true`; otherwise the reason explicitly records validated findings in incomplete analyzed coverage and makes no broader safety claim.

### CI position

The repository ships a disabled/example Strix CI profile rather than an automatically active workflow. Activation requires operator-provided secrets, Docker/runner validation, diff-base validation, budget policy and explicit repository authorization. Ordinary deterministic tests remain free of external model/provider dependence.

## Loop Engineering

Every loop iteration has a bounded attempt number, role, scope digest, input evidence, output evidence and next-state proposal. Valid exits are verified completion, human gate, documented blocker, provider wait, failure or cancellation. Repeated failure escalates and cannot widen scope or budget automatically.

The loop command validates state transitions with the canonical state machine and records:

- work-order digest;
- effective scope digest;
- worker/reviewer identities;
- changed-file digest;
- verification results;
- security-review requirement and verdict;
- approval/effect references where applicable;
- memory/evidence checkpoint references.

## Installer and bootstrap

`scripts/init-project.mjs`, Bash and PowerShell bootstrap paths install the canonical surfaces in dry-run mode by default. Apply mode:

- creates missing paths only;
- refuses overwrite or implicit merge;
- emits a deterministic installation manifest;
- validates JSON/frontmatter and referenced canonical files;
- installs no Strix binary and creates no secret.

## Testing

All behavior changes use red-green-refactor cycles. Required suites cover:

- scope intersection, narrowing, unknown dimensions and digest stability;
- dispatcher/tool/memory/effect integration;
- Memory Factory local/global/authority consolidation gates;
- projection minimization and cross-project/privacy isolation;
- revocation propagation and deletion non-equivalence;
- agent/skill/command manifest consistency;
- Claude wrappers resolving to canonical contracts;
- installer dry-run, no-overwrite and idempotency;
- Security Reviewer authorization, clean-checkout, target, budget, completion and evidence gates using local fakes only;
- Strix exit/status interpretation without invoking a real pentest in CI;
- identity, LinkedIn, English/German and capability-document consistency;
- full model-free demo through checkpoint and recovery.

## Documentation and capability propagation

Update README English/German, architecture, operating model, memory/state, security/authority, threat model, installation, upstream pins, capability inventory and a durable `.state/sessions/` checkpoint. Capabilities are rated no higher than their executable evidence.

## Completion criteria

- Memory Factory and Scope Engine are implemented, separately testable and integrated;
- `.agents`, `.skills`, `.commands` and `.claude` install safely;
- the Strix Security Reviewer procedure is scope- and authorization-gated;
- no real Strix scan, cloud registration or third-party target interaction occurs during implementation;
- public identity and lineage are consistent;
- the full local model-free suite and demo pass;
- a fresh agent can recover the next valid action from repository state alone;
- no memory, worker, skill, command or security tool can mint authority.
