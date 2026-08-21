# Capability inventory

Public identity: **Ömer Coskun**. Canonical lineage: **Autonomous Engineering Reference Architecture V1**.

Status vocabulary (closed; enforced by `tests/consistency.test.mjs`):
`OPERATIONAL` — runs end-to-end and is exercised in CI · `IMPLEMENTED` — code/config exists **and** is covered by tests · `SPECIFIED_ONLY` — documented/configured, no verified runtime behavior · `PLANNED` · `NOT_APPLICABLE` · `NOT_CLAIMED`.

**Rule: no capability may be rated above what its tests prove.** A row rated `IMPLEMENTED`/`OPERATIONAL` must cite executable evidence.

| Capability | Status | Implementation | Evidence | Source inspiration / limitations |
|---|---|---|---|---|
| Canonical work-order state machine (12 states, machine-readable, enforced, fail-closed, terminal states sealed) | IMPLEMENTED | spec/state-machine.json + src/supervisor/state-machine.mjs | tests/state-machine.test.mjs | ai-engineering-stack State Machines; drift between templates/docs fixed |
| Hermes Supervisor Runtime: dispatch guards (state × worker class × WO hash × budget) | IMPLEMENTED | src/supervisor/dispatcher.mjs | tests/supervisor.test.mjs | No external Hermes upstream exists; this is this repo's own vendor-neutral runtime (see NOTICE.md) |
| Duplicate-run protection: leases with TTL, fencing tokens, stale takeover | IMPLEMENTED | src/supervisor/lease-manager.mjs | tests/supervisor.test.mjs | Single-process CAS only; multi-process backends need a real CAS store (see docs/THREAT-MODEL.md) |
| Durable state: append-only event log, atomic snapshots, replay recovery, corrupt-tail quarantine | IMPLEMENTED | src/state/event-store.mjs + src/supervisor/project-registry.mjs | tests/supervisor.test.mjs | LOGOS-1 persistence discipline; ai-engineering-stack event sourcing |
| Idempotency: repeated command returns recorded result, survives restart | IMPLEMENTED | src/state/event-store.mjs | tests/idempotency.test.mjs | ai-engineering-stack Idempotency |
| Provider waits: normalized metadata, fail-closed classes, bounded resume | IMPLEMENTED | src/supervisor/provider-wait.mjs | tests/provider.test.mjs | ai-engineering-stack provider_wait record |
| Routing plane adapter: task class → route, session stickiness, recorded escalation, prompt-free telemetry | IMPLEMENTED | src/routing/omniroute.mjs | tests/provider.test.mjs | OmniRoute stays the only actual router |
| Hard-free / free-preferred separation (hard-free fails closed without a restricted pool; hard cap requires attested headers) | IMPLEMENTED | src/routing/omniroute.mjs | tests/provider.test.mjs | `:free` is fail-open upstream — a $0 guarantee is NOT_CLAIMED below |
| Memory fabric: append/fetch/query/supersede/conflict/consolidate/retention/recovery with provenance validation | IMPLEMENTED | src/memory/store.mjs | tests/memory.test.mjs | LOGOS-1 MEMORY-SYSTEM.md (there an engineering target; implemented here) |
| Deterministic BM25 retrieval preserving provenance/conflict/staleness qualifiers | IMPLEMENTED | src/memory/retrieval.mjs | tests/memory.test.mjs | Vector search deliberately excluded from core |
| Authority-bound memory: source vs authority provenance, admissible_uses, weakest-authority consolidation | IMPLEMENTED | src/memory/store.mjs | tests/memory.test.mjs | LOGOS-1 memory-authority research delta (AuthMem-Bench-inspired), engineering extraction only |
| Derived-skill lineage + revocation propagation (revoked source voids derived procedures; deletion ≠ revocation) | IMPLEMENTED | src/memory/store.mjs | tests/memory.test.mjs | SkillJack countermeasure per LOGOS-1 research delta |
| Authority firewall: memory API cannot mint grants/credentials/scopes/tokens/exceptions; assurance store separate | IMPLEMENTED | src/memory/store.mjs + src/policy/approval.mjs | tests/memory.test.mjs | LOGOS-1 Γ-12 / AGENTS.md memory rule |
| Exact one-shot approvals: digest binding, canonical scope, half-open expiry, atomic consumption, replay denial, human-only decisions | IMPLEMENTED | src/policy/approval.mjs | tests/approval.test.mjs | LOGOS-1 Γ-3/Γ-10 |
| Typed effect registry + deterministic effect gate (ALLOW/REPAIR/DEFER/DENY/FALLBACK, unknown fails closed, strictest-wins, bounded evaluation, forbidden classes survive approval) | IMPLEMENTED | src/policy/effect-registry.mjs + src/policy/effect-gate.mjs | tests/effect-gate.test.mjs | Engineering extraction of LOGOS-1 Γ gate; no scientific Γ theory imported |
| Single executor: gate-nonce required, one-shot occurrences, no auto-rerun, UNKNOWN blocks scope until human reconciliation | IMPLEMENTED | src/policy/executor.mjs | tests/effect-gate.test.mjs | LOGOS-1 Γ-11 (OUTCOME_UNKNOWN ≠ NOT_EXECUTED) |
| Harness-neutral permission engine: allow/ask/deny, sensitive paths, traversal defense, secret scanning | IMPLEMENTED | src/policy/permissions.mjs | tests/security.test.mjs | Generalization of ai-engineering-stack Claude hooks |
| Role separation: builder ≠ reviewer enforced, reviewer requires actual diff + evidence, no self-promotion to DONE/approval states | IMPLEMENTED | src/workers/contracts.mjs + state-machine.evaluateProposal | tests/workers.test.mjs, tests/state-machine.test.mjs | ai-engineering-stack role model |
| Evidence ledger: exact outcome semantics (FAIL≠PASS, NOT_RUN≠PASS, UNKNOWN preserved), content hashes, sha256 manifests, completion gate | IMPLEMENTED | src/evidence/ledger.mjs + src/evidence/hashing.mjs | tests/evidence.test.mjs | LOGOS-1 evidence discipline |
| Structured schemas + runtime validators for all 19 record types + generated JSON Schema export | IMPLEMENTED | src/schemas/schemas.mjs + spec/schemas/records.schema.json | tests/schemas.test.mjs, tests/consistency.test.mjs | Runtime validation chosen over compile-time types at the trust boundary |
| Skills lock v2: commit-SHA pins required, optional content hash, explicit MISSING_UPSTREAM handling | IMPLEMENTED | src/skills/lock.mjs + config/skills-lock.example.json | tests/skills.test.mjs | No third-party skill content vendored (license-clean) |
| Strix review proposal contract: non-authoritative claim validation, exact effect-proposal digest binding and strict result interpretation | IMPLEMENTED | src/security/strix-review.mjs + effect registry metadata; no launcher/executor integration | tests/strix-review.test.mjs, tests/effect-gate.test.mjs | Preflight always returns `execution_authorized: false`; independent AssuranceStore/EffectGate approval remains required |
| Safe canonical runtime installation: dry-run default, exclusive no-overwrite apply, source/version/SHA-256 manifest, traversal/symlink containment | IMPLEMENTED | scripts/init-project.mjs | tests/installer.test.mjs | Explicit allowlist excludes credentials, Strix executable/config secrets and authority writes |
| End-to-end supervised loop, local and model-free (PLANNED→…→DONE with leases, review, recovery check) | OPERATIONAL | examples/demo-project/run-demo.mjs | `npm run demo` (executed in CI) | — |
| Fresh-agent recovery from repository state alone | IMPLEMENTED | src/cli.mjs (`state`, `verify-recovery`) + examples/demo-project | tests/supervisor.test.mjs (replay==snapshot) | — |
| Documentation/state-vocabulary consistency enforcement | IMPLEMENTED | tests/consistency.test.mjs | tests/consistency.test.mjs (self-executing) | Generalization of LOGOS-1 push protocol |
| Live DSH ↔ OmniRoute integration (running gateway + worker) | SPECIFIED_ONLY | config/dsh-omniroute.settings.example.yaml, adapters/deepseek-harness/ | — | Requires the user to run both upstreams; validated against public docs of 2026-08-20, not by CI |
| Claude Code adapter (optional) | SPECIFIED_ONLY | adapters/claude/ | — | Example only; core is harness-neutral |
| Hermes dispatching real DSH worker processes automatically | SPECIFIED_ONLY | docs/HERMES-SUPERVISOR.md §runtime | — | The runtime validates/persists; process-spawning glue is intentionally left to the operator |
| Mobile/Telegram approvals | NOT_CLAIMED | — | — | Approval API is transport-agnostic; no mobile channel ships here |
| Multi-tenancy / PostgreSQL RLS / RBAC server profile | NOT_APPLICABLE | — | — | Local-first single-operator core; documented as an optional team/server profile in docs/OPERATING-MODEL.md |
| Vector/semantic retrieval index | NOT_CLAIMED | — | — | BM25 is the deterministic core; a vector index would be an accelerator, never source of truth |
| Unattended continuous operation | NOT_CLAIMED | — | — | Activation is a separate, testable safety decision (per ai-engineering-stack) |
| Hard $0 spend guarantee via `auto/coding:free` | NOT_CLAIMED | — | — | Upstream tier filter is fail-open; see docs/ROUTING.md hard-free patterns |
| Scientific LOGOS results (Γ theory, CPV, consciousness research, benchmarks) | NOT_CLAIMED | — | — | Deliberately excluded; engineering mechanisms only (NOTICE.md) |

## Update rule

Every substantive change that adds, removes, promotes, demotes or materially changes a capability must update this file — or the change description must state explicitly that no capability delta occurred. See `docs/CHANGE-PROPAGATION.md`.
