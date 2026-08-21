# Change propagation protocol

Generalized from the LOGOS-1 push protocol: every substantive change must leave the repository more internally consistent than it found it. A change is INCOMPLETE while implementation, tests, architecture docs and the capability inventory disagree.

## Checklist for every substantive change

1. **Implementation** — code/config reflect the requested change; no unrelated authority expansion; failures stay visible.
2. **Tests** — run the smallest relevant suite before the repository write (`npm test`); add regression coverage for newly fixed failure modes; a fix without a test that would have caught it is unfinished.
3. **Architecture docs** — if subsystem meaning changed, update the matching `docs/*.md`. README, docs and code must never describe different systems.
4. **CAPABILITIES.md** — update when the change adds, removes, promotes, demotes or materially alters a capability; otherwise state explicitly that no capability delta occurred. Never rate a capability above its tests (enforced by `tests/consistency.test.mjs`).
5. **README / README.de.md** — keep the English and German descriptions architecturally identical.
6. **Agent contract** — check whether `AGENTS.md` invariants or role routing changed.
7. **Session checkpoint** — after substantive work, persist a `templates/SESSION-REPORT.md`-shaped checkpoint under `.state/sessions/` so a fresh agent (or human) can continue without this conversation.
8. **Evidence** — record outcomes in the evidence ledger with exact semantics; a blocked or unavailable check is `NOT_RUN`/`BLOCKED`, never omitted and never `PASS`.
9. **Upstreams** — if an assumption about DSH/OmniRoute/skill upstreams changed, update `docs/UPSTREAMS.md` and re-run the integration smoke test.
10. **Security implications** — if the change touches permissions, approvals, memory authority, the effect registry or the executor, it requires an independent security-reviewer pass and a `docs/THREAT-MODEL.md` check.

## One coherent push

Prefer a single coherent prepared change over a sequence of corrective commits: validate locally first, then write. External executions (pushes, workflow runs) are one-shot by default — a failed external attempt is classified and persisted, never auto-retried (see AGENTS.md invariant 8).

## Final consistency questions

- Does `brain/STATE.json` / `CURRENT-WORK-ORDER.md` still mean what it says?
- Does `CAPABILITIES.md` match reality?
- Do `AGENTS.md` and the docs still guide agents correctly?
- Did the change weaken `Capability != Authority`, `AgentMemory != AssuranceState` or `OUTCOME_UNKNOWN != NOT_EXECUTED`?
- Can a fresh agent understand what changed without this chat?
- Do the canonical surfaces (`.agents/`, `.skills/`, `.commands/`, `.claude/`) still match the installer plan and `tests/agent-surfaces.test.mjs`?
- Did the change widen a scope, or let a security-review claim act as authority?
