# Threat model

Scope: the local-first supervisor runtime, its durable state, the DSH/OmniRoute integration surface and the human approval boundary. Format per threat: **asset / attacker or control failure / path / impact / mitigation / remaining limitation**. Mitigations cite the enforcing module and its tests; anything not cited is prose, not protection.

## 1. Malicious prompt (prompt injection into a worker)

Asset: authority boundary, repository integrity. Attacker: any text a model reads (issue text, code comments, tool output). Path: injected instructions tell the worker to push, exfiltrate, or self-approve. Impact: unauthorized external effect. Mitigation: workers hold no execution path — external effects exist only behind the effect gate + single executor (`src/policy/effect-gate.mjs`, `src/policy/executor.mjs`; tests: no-direct-execution, forged-verdict refused); approvals require human-class actors (`src/policy/approval.mjs`); prompt text can at most create a *proposal*. Limitation: ALLOW-class local edits are reachable by an injected worker; deterministic review + diff inspection remain necessary.

## 2. Malicious repository content

Asset: worker behavior, evidence integrity. Path: hostile files instruct or trap the agent (e.g. fake "approval granted" text in a README). Impact: laundered authority. Mitigation: remembered/recorded text is proposal-side only — memory cannot mint authority (tests/memory.test.mjs); approvals live in the separate assurance store. Limitation: content can still bias what a worker proposes; independent review is the compensating control.

## 3. Malicious skill

Asset: worker behavior. Path: upstream skill content changes after review (moved path, force-push) or contains hostile guidance. Impact: poisoned procedure. Mitigation: skills-lock v2 requires commit-SHA pins; missing upstream/ref is an explicit `MISSING_UPSTREAM`/`MISSING_PINNED_REF` state (`src/skills/lock.mjs`, tests/skills.test.mjs); derived procedures carry lineage and are revocable with propagation (tests/memory.test.mjs). Limitation: a pinned-but-hostile skill passes pinning; human review of skill content at pin time is required.

## 4. Malicious MCP/connector result & 5. provider-hallucinated tool output

Asset: evidence, decisions. Path: connector/model returns fabricated success. Impact: false completion. Mitigation: completion requires ledger evidence with outcome `PASS` from deterministic checks; `NOT_RUN`/`UNKNOWN`/`FAIL` refuse completion (`src/evidence/ledger.mjs`, tests/evidence.test.mjs); provider failures map to closed failure classes, unknown classes fail closed (tests/provider.test.mjs). Limitation: a compromised local test runner can lie; run verification in a trusted environment.

## 6. Compromised provider

Asset: code quality, secrets in context. Path: provider returns subtly malicious code or harvests prompts. Impact: backdoored changes, data exposure. Mitigation: independent review of the actual diff is a state-machine requirement (reviewer ≠ builder enforced, tests/workers.test.mjs); minimum-context rule and prompt-free telemetry (`src/routing/omniroute.mjs`). Limitation: review quality is probabilistic; secrets sent to a provider are gone — keep them out of worker context (permissions engine denies secret paths).

## 7. Stale memory / 8. authority collapse at consolidation

Asset: decision integrity, authority boundary. Path: consolidation strips source constraints so remembered text acts as permission ("the user approved deployments"). Impact: privilege escalation through memory. Mitigation: authority provenance is first-class and survives consolidation with the weakest-authority + intersection rule; superseded/conflicted records stay qualified; revocation propagates to derived artifacts (tests/memory.test.mjs); the gate never reads memory as authority. Limitation: authority classes are labels assigned at write time; mislabeling at ingestion is not detectable downstream.

## 9. Approval replay / 10. TOCTOU on approvals

Asset: one-shot authority. Path: reuse a consumed approval; or approve X, mutate to X', execute X'. Impact: unauthorized repeat/altered effect. Mitigation: digest binding, half-open expiry, atomic one-shot consumption persisted across restarts (tests/approval.test.mjs); executor re-derives the digest at execution time, so gate-to-executor mutation is caught (tests/effect-gate.test.mjs). Limitation: within a multi-process deployment the consumption CAS must be provided by a real store; single-process semantics are what is tested.

## 11. Duplicate worker / race conditions

Asset: repository state, spend. Path: two supervisors or a zombie worker dispatch the same work order. Impact: duplicate effects, conflicting writes. Mitigation: leases keyed project+WO+phase with TTL, monotonic fencing tokens, stale takeover, holder-bound release (tests/supervisor.test.mjs); dispatch idempotency keys. Limitation: fencing is authoritative only where all writers check it — external systems that ignore fencing tokens can still interleave.

## 12. Poisoned evidence

Asset: completion gate. Path: worker writes a fake `PASS` record. Impact: false completion. Mitigation: evidence records carry actor + content hashes; independent review re-runs checks per the operating model; ledger is append-only so falsification leaves history. Limitation: the ledger trusts its writers within the local trust boundary; it is tamper-evident, not tamper-proof.

## 13. Secret leakage

Asset: credentials, private data. Path: secrets committed, logged, or sent to providers. Impact: credential compromise. Mitigation: write-path denial for secret patterns + traversal defense + secret scanning (`src/policy/permissions.mjs`, tests/security.test.mjs); ledger stores content hashes, never raw content (tests/evidence.test.mjs); telemetry schema has no prompt field; `.gitignore` excludes `.env*`/keys. Limitation: name/pattern-based detection misses novel secret formats inside allowed files (inherited from the LOGOS return packer's known limit).

## 14. Model routing budget bypass

Asset: spend policy. Path: fail-open `:free` filter escapes to a paid candidate; unverified budget headers assumed enforced. Impact: silent paid usage. Mitigation: `hard-free` refuses to run without an independently restricted candidate pool; `hard-request-cap` refuses without attested header forwarding; escalation requires a recorded reason (tests/provider.test.mjs). Limitation: OPEN — this repo cannot verify a specific DSH build forwards budget headers; treat caps as unenforced until you verify your transport (docs/ROUTING.md).

## 15. External effect bypass (direct worker → world)

Asset: the entire authority model. Path: a worker with shell access performs `git push` itself. Impact: ungated consequential action. Mitigation: architectural (gate nonce + single executor, forged/replayed verdicts refused — tests/effect-gate.test.mjs) plus deterministic command classification (`git push` = ask, force-push = deny — tests/security.test.mjs) and harness adapters. The gate and the permission engine are closed-coupled: path-targeted effects (`target_kind: 'path'`) are checked against `classifyWritePath`, so a path the permission engine denies (e.g. `.state/assurance/`, `.env`, traversal) can never receive a gate ALLOW (R2-04 regression test). Limitation: OPEN — a harness that grants raw unrestricted shell to a worker can bypass any in-process gate; mediation completeness requires OS/process-level isolation, which this release does not ship. This mirrors LOGOS-1's own `LOGICAL_ISOLATION_ONLY` caveat and is stated in OPEN-LIMITATIONS.

## 16. Corrupted durable state

Asset: recovery. Path: crash mid-append/mid-snapshot. Impact: lost or ambiguous state. Mitigation: atomic snapshot (tmp+rename), corrupt-tail quarantine + repair + recovery event in BOTH the event store and the memory store, replay==snapshot verification, loud failure on non-tail corruption (tests/supervisor.test.mjs, tests/memory.test.mjs R2-05). External executions use a write-ahead reservation persisted BEFORE the side effect: a crash between effect and result record replays as OUTCOME UNKNOWN — digest consumed, scope blocked until human reconciliation — instead of being forgotten (tests/effect-gate.test.mjs R2-01). Provider waits and routing stickiness are restart-durable when constructed with a store (R2-06/R2-07). Limitation: disk-level corruption of middle lines requires restore from Git history — state directories should be committed regularly.

## 17. Stale work orders / context drift

Asset: correctness of dispatched work. Path: WO edited after scheduling. Impact: worker executes outdated/widened scope. Mitigation: dispatch verifies the WO content hash (tests/supervisor.test.mjs). Limitation: hash covers the WO document, not external context it references.

## 18. Remote OmniRoute exposure

Asset: the gateway. Path: binding the local endpoint beyond loopback while using the quickstart "dummy-key" (any non-empty value accepted = no authentication). Impact: open proxy for your provider accounts. Mitigation: explicit warnings in config/.env.example and docs/INSTALLATION.md; quickstart is loopback-only. Limitation: OPEN — enforcement is upstream OmniRoute configuration, not this repo.
