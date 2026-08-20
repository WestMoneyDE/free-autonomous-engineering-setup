# Memory and durable state

## Objective

A coding agent should be able to stop, restart and continue from repository evidence without trusting an old chat transcript. At the same time, memory must not become a hidden authorization channel.

## Functional decomposition

### 1. Working state

Short-lived task state: current objective, open files, temporary plan and calculations. It may be discarded without corrupting durable project truth.

### 2. Episodic history

Durable events: sessions, attempts, edits, failures, provider waits, external returns and review events. Prefer append-oriented records with time, source and lineage.

### 3. Semantic project knowledge

Accepted/stabilized knowledge derived from decisions or evidence. Consolidated knowledge keeps pointers to the episodes/evidence it came from.

### 4. Procedural memory

Reusable workflows, test procedures, debugging playbooks and coding conventions. Procedures remain advisory and versioned; they are not evidence that a result succeeded.

### 5. Evidence ledger

Test results, source pins, hashes, review verdicts, known falsifiers/counterexamples and return manifests. Evidence is version-bound and auditable.

### 6. Assurance / governance state

Approvals, grants, consumed one-shot tokens, policy versions and reconciliation state. **This is not agent memory.** Keep it behind a separate ownership/API boundary and never make it writable through adaptive memory tools.

## Suggested repository layout

```text
.state/
  tasks/
  sessions/
  evidence/
  decisions/
  memory/
  assurance/
```

Treat the names as a logical model. A production system may use a database or object store, but the same ownership boundaries should survive.

## Durable memory record

A useful record carries at least:

```text
id
kind
created_at
source / provenance
content or content_ref
epistemic status / confidence
schema/version
lineage / supersedes / conflicts_with
scope / visibility
retention policy
```

## Retrieval contract

Retrieval may rank relevance, but every returned item should preserve:

- source identity;
- time/version;
- evidence/confidence class;
- contradiction/conflict markers;
- whether the item is descriptive, normative, procedural or evidentiary.

A vector index may accelerate retrieval but is not the source of truth.

## Consolidation contract

Summarization/consolidation must not silently:

- convert a hypothesis into a fact;
- convert a proposal into an approval;
- erase negative evidence;
- resolve contradictions without a recorded rule/evidence trail;
- turn chat coherence into validation;
- drop the provenance needed to understand who/what had authority.

## Authority firewall

Memory outputs are proposal-side inputs only. They cannot directly create:

- permissions;
- grants;
- credentials;
- scopes;
- approval/occurrence tokens;
- policy exceptions.

Any consequential external action influenced by memory re-enters the authority gate.

## Conflict and staleness

Never silently overwrite contradictory records. Use `supersedes` for intentional replacement and `conflicts_with` when evidence remains unresolved. Retrieval should qualify stale data instead of presenting it as current truth.

## Tests for a real memory implementation

Before claiming memory is reliable, verify:

- provenance survives write → retrieve → consolidate;
- contradictory records remain discoverable;
- stale/superseded state is qualified;
- retention/deletion is deterministic;
- retrieval failure remains failure/unknown;
- memory APIs cannot mint authority;
- assurance state cannot be mutated through memory APIs;
- a fresh coding-agent session can reconstruct the documented project state.

## Session checkpoint

Use `templates/SESSION-REPORT.md` after substantive work. Store enough information for another agent/human to know:

- objective;
- what changed;
- tests/evidence;
- decisions;
- failures/blockers;
- current state;
- next valid action.

This is the minimum viable durable memory for autonomous engineering.
