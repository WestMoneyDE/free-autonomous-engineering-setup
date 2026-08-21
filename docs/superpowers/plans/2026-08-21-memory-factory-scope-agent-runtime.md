# Memory Factory, Scope Engine and Agent Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an installable, model-free-tested autonomous engineering runtime with an explicit Memory Factory, restrictive Scope Engine, canonical agent surfaces and an authorization-gated Strix Security Reviewer procedure.

**Architecture:** Extend the existing event-sourced supervisor rather than replacing it. New scope and memory modules remain deterministic and dependency-free; `.agents`, `.skills` and `.commands` are canonical host-neutral contracts, while `.claude` only adapts them. Strix execution is represented by a pure preflight/result contract and example integration, never invoked by ordinary tests.

**Tech Stack:** Node.js 20+ ESM, Node test runner, JSON/Markdown/YAML-like configuration, Bash/PowerShell bootstrap, existing event/evidence stores.

## Global Constraints

- `Capability != Authority`
- `AgentMemory != AssuranceState`
- `ScopeProposal != EffectiveScope`
- `OUTCOME_UNKNOWN != NOT_EXECUTED`
- Public name is exactly `Ömer Coskun`.
- LinkedIn is exactly `https://www.linkedin.com/in/oemer-coskun53`.
- AI Engineering Stack is named `Autonomous Engineering Reference Architecture V1`.
- Strix upstream is pinned to `usestrix/strix@2cc816781438f2993bcbb5c8cf3f693c25380142` under Apache-2.0.
- No real Strix scan, cloud registration, secret creation or third-party target interaction occurs during implementation or CI tests.
- Installer and bootstrap remain dry-run by default and never overwrite existing files.
- No SIP code, patent text or SIP-specific workflow is introduced.

---

## File map

- `src/policy/scope-engine.mjs` — canonical scope normalization, intersection, digest and request evaluation.
- `src/memory/consolidation.mjs`, `src/memory/projection.mjs`, `src/memory/factory.mjs` — guarded record production.
- `src/security/strix-review.mjs` — Strix authorization/preflight and result interpretation only.
- `src/supervisor/dispatcher.mjs`, `src/memory/retrieval.mjs`, `src/policy/permissions.mjs`, `src/workers/contracts.mjs` — integration points.
- `.agents/`, `.skills/`, `.commands/`, `.claude/` — canonical role/procedure/command surfaces and adapter.
- `scripts/init-project.mjs`, `scripts/verify-repo.mjs` — safe install and repository contract.
- `tests/scope-engine.test.mjs`, `tests/memory-factory.test.mjs`, `tests/agent-surfaces.test.mjs`, `tests/strix-review.test.mjs` — new behavior contracts.
- existing docs/READMEs/CAPABILITIES/threat model/session state — propagated meaning.

### Task 1: Implement the typed restrictive Scope Engine

**Files:**
- Create: `src/policy/scope-engine.mjs`
- Create: `tests/scope-engine.test.mjs`
- Modify: `src/schemas/schemas.mjs`
- Modify: `scripts/export-schemas.mjs`

**Interfaces:**
- Produces: `normalizeScopeContract(raw)`, `intersectScopes(contracts)`, `evaluateScopeRequest(decision, request)`, `scopeDigest(scope)`.
- Consumes: `canonicalJson()` and `sha256Hex()` from `src/evidence/hashing.mjs`.

- [ ] **Step 1: Write the failing scope tests**

Create `tests/scope-engine.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { intersectScopes, evaluateScopeRequest } from '../src/policy/scope-engine.mjs';

const contract = (overrides = {}) => ({
  project: 'demo', include_paths: ['src/**', 'tests/**'], exclude_paths: ['.state/assurance/**'],
  roles: ['builder', 'reviewer'], tools: ['read', 'edit', 'test'], memory_kinds: ['episodic', 'semantic', 'procedural'],
  audiences: ['project'], capabilities: ['local-edit', 'local-test'], targets: ['repository'],
  parameter_bounds: { changed_files: { min: 0, max: 20 } },
  budgets: { cost_usd: 0, tokens: 100000, seconds: 3600, attempts: 3 },
  valid_from: '2026-08-21T00:00:00.000Z', valid_until: '2026-08-22T00:00:00.000Z', max_occurrences: 1,
  externality: 'internal', reversibility: 'reversible', approval_required: false,
  data_classes: ['public', 'project'], retention_classes: ['session', 'project'], source_versions: ['project@1'],
  ...overrides,
});

test('scope intersection is deterministic and can only narrow', () => {
  const result = intersectScopes([contract(), contract({ roles: ['builder'], tools: ['read', 'test', 'network'], budgets: { cost_usd: 0, tokens: 50000, seconds: 1200, attempts: 2 }, source_versions: ['wo@1'] })]);
  assert.equal(result.verdict, 'NARROW');
  assert.deepEqual(result.effective.roles, ['builder']);
  assert.deepEqual(result.effective.tools, ['read', 'test']);
  assert.equal(result.effective.budgets.attempts, 2);
  assert.match(result.digest, /^[0-9a-f]{64}$/);
});

test('empty high-impact intersection denies', () => {
  const result = intersectScopes([contract(), contract({ capabilities: ['network-write'] })]);
  assert.equal(result.verdict, 'DENY');
  assert.deepEqual(result.unresolved_dimensions, ['capabilities']);
});

test('worker request cannot widen effective scope', () => {
  const decision = intersectScopes([contract()]);
  const checked = evaluateScopeRequest(decision, { role: 'builder', tool: 'network', memory_kind: 'semantic', capability: 'network-write', target: 'internet', path: 'src/x.mjs' });
  assert.equal(checked.verdict, 'DENY');
  assert.ok(checked.violations.includes('tools'));
  assert.ok(checked.violations.includes('capabilities'));
});
```

- [ ] **Step 2: Run and verify RED**

```powershell
node --test tests/scope-engine.test.mjs
```

Expected: module-not-found failure for `scope-engine.mjs`.

- [ ] **Step 3: Implement the Scope Engine**

Create `src/policy/scope-engine.mjs`:

```js
import path from 'node:path';
import { canonicalJson, sha256Hex } from '../evidence/hashing.mjs';

const SET_FIELDS = ['include_paths','roles','tools','memory_kinds','audiences','capabilities','targets','data_classes','retention_classes'];
const sortedUnique = (values) => [...new Set(values)].sort();
const intersection = (values) => sortedUnique(values[0].filter((item) => values.slice(1).every((set) => set.includes(item))));

export function normalizeScopeContract(raw) {
  if (!raw || typeof raw !== 'object' || !raw.project) throw new TypeError('scope contract requires project');
  const normalized = structuredClone(raw);
  for (const field of SET_FIELDS) {
    if (!Array.isArray(normalized[field])) throw new TypeError(`scope ${field} must be an array`);
    normalized[field] = sortedUnique(normalized[field]);
  }
  normalized.exclude_paths = sortedUnique(normalized.exclude_paths ?? []);
  normalized.source_versions = sortedUnique(normalized.source_versions ?? []);
  if (!normalized.budgets || !Number.isInteger(normalized.budgets.attempts) || normalized.budgets.attempts < 1) throw new TypeError('scope budgets.attempts must be a positive integer');
  return Object.freeze(normalized);
}

export const scopeDigest = (scope) => sha256Hex(canonicalJson(scope));

export function intersectScopes(inputs) {
  if (!Array.isArray(inputs) || inputs.length === 0) return { verdict: 'DEFER', effective: null, digest: scopeDigest(null), reasons: ['no scope contracts'], unresolved_dimensions: ['all'] };
  const contracts = inputs.map(normalizeScopeContract);
  if (new Set(contracts.map((c) => c.project)).size !== 1) return { verdict: 'DENY', effective: null, digest: scopeDigest(null), reasons: ['project mismatch'], unresolved_dimensions: ['project'] };
  const effective = { project: contracts[0].project };
  const empty = [];
  for (const field of SET_FIELDS) {
    effective[field] = intersection(contracts.map((c) => c[field]));
    if (effective[field].length === 0) empty.push(field);
  }
  if (empty.length) return { verdict: 'DENY', effective: null, digest: scopeDigest(null), reasons: ['empty restrictive intersection'], unresolved_dimensions: empty.sort() };
  effective.exclude_paths = sortedUnique(contracts.flatMap((c) => c.exclude_paths));
  effective.parameter_bounds = {};
  for (const name of sortedUnique(contracts.flatMap((c) => Object.keys(c.parameter_bounds ?? {})))) {
    const ranges = contracts.map((c) => c.parameter_bounds?.[name]).filter(Boolean);
    const min = Math.max(...ranges.map((r) => r.min));
    const max = Math.min(...ranges.map((r) => r.max));
    if (min > max) return { verdict: 'DENY', effective: null, digest: scopeDigest(null), reasons: [`empty parameter bound: ${name}`], unresolved_dimensions: ['parameter_bounds'] };
    effective.parameter_bounds[name] = { min, max };
  }
  effective.budgets = {
    cost_usd: Math.min(...contracts.map((c) => c.budgets.cost_usd)),
    tokens: Math.min(...contracts.map((c) => c.budgets.tokens)),
    seconds: Math.min(...contracts.map((c) => c.budgets.seconds)),
    attempts: Math.min(...contracts.map((c) => c.budgets.attempts)),
  };
  effective.valid_from = contracts.map((c) => c.valid_from).sort().at(-1);
  effective.valid_until = contracts.map((c) => c.valid_until).sort()[0];
  effective.max_occurrences = Math.min(...contracts.map((c) => c.max_occurrences));
  effective.externality = contracts.some((c) => c.externality === 'external') ? 'external' : 'internal';
  effective.reversibility = contracts.some((c) => c.reversibility === 'irreversible') ? 'irreversible' : contracts.some((c) => c.reversibility === 'partially-reversible') ? 'partially-reversible' : 'reversible';
  effective.approval_required = contracts.some((c) => c.approval_required);
  effective.source_versions = sortedUnique(contracts.flatMap((c) => c.source_versions));
  return { verdict: contracts.length > 1 ? 'NARROW' : 'ALLOW', effective: Object.freeze(effective), digest: scopeDigest(effective), reasons: [], unresolved_dimensions: [] };
}

export function evaluateScopeRequest(decision, request) {
  if (!decision.effective) return decision;
  const checks = { roles: request.role, tools: request.tool, memory_kinds: request.memory_kind, capabilities: request.capability, targets: request.target };
  const violations = Object.entries(checks).filter(([field, value]) => !decision.effective[field].includes(value)).map(([field]) => field);
  const resolved = path.resolve('/', request.path);
  if (decision.effective.exclude_paths.some((item) => resolved.includes(item.replaceAll('*', '')))) violations.push('exclude_paths');
  return violations.length ? { ...decision, verdict: 'DENY', reasons: ['request exceeds effective scope'], violations: sortedUnique(violations) } : { ...decision, verdict: 'ALLOW', violations: [] };
}
```

- [ ] **Step 4: Add schema exports and verify GREEN**

Add `SCOPE_VERDICTS = ['ALLOW','NARROW','DEFER','DENY']`, `validateScopeContract` and `validateScopeDecision` to `src/schemas/schemas.mjs`; register them in `validators`. Export matching JSON Schemas in `scripts/export-schemas.mjs`, run `npm run export-schemas`, then:

```powershell
node --test tests/scope-engine.test.mjs tests/schemas.test.mjs tests/consistency.test.mjs
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add -- src/policy/scope-engine.mjs src/schemas/schemas.mjs scripts/export-schemas.mjs spec/schemas/records.schema.json tests/scope-engine.test.mjs
git commit -m "feat: add restrictive scope engine"
```

### Task 2: Bind scope to dispatch, retrieval and command policy

**Files:**
- Modify: `src/supervisor/dispatcher.mjs`
- Modify: `src/memory/retrieval.mjs`
- Modify: `src/policy/permissions.mjs`
- Modify: `tests/supervisor.test.mjs`
- Modify: `tests/memory.test.mjs`
- Modify: `tests/security.test.mjs`

**Interfaces:**
- Consumes: `ScopeDecision` from Task 1.
- Produces: dispatch packet `scope_digest`, scope-first retrieval and scope-aware command/path checks.

- [ ] **Step 1: Add failing integration tests**

Append these assertions to the named existing test files, using their current fixture helpers:

```js
// tests/supervisor.test.mjs
test('dispatch requires an effective scope and binds its digest', () => {
  const store = new EventStore(tmp());
  const dispatcher = new Dispatcher({ leases: new LeaseManager({ store }), store });
  const wo = workOrder();
  const request = { project: 'p', workOrder: wo, expectedHash: workOrderHash(wo), state: 'READY', workerClass: 'builder', actor: 'supervisor' };
  assert.throws(() => dispatcher.dispatch(request), (error) => error.code === 'SCOPE_INVALID');
  const scopeDecision = { verdict: 'ALLOW', effective: { project: 'p' }, digest: 'a'.repeat(64) };
  assert.equal(dispatcher.dispatch({ ...request, scopeDecision }).scope_digest, scopeDecision.digest);
});

// tests/memory.test.mjs
test('retrieval filters visibility before BM25 ranking', () => {
  const records = [base({ id: 'public', visibility: ['project'] }), base({ id: 'private', visibility: ['private'] })];
  const scopeDecision = { verdict: 'ALLOW', effective: { audiences: ['project'] }, digest: 'b'.repeat(64) };
  const result = bm25Query(records, 'postgres', { scopeDecision });
  assert.deepEqual(result.results.map((item) => item.id), ['public']);
});

// tests/security.test.mjs
test('general permissions cannot upgrade a scope denial', () => {
  const result = classifyScopedOperation({
    root: process.cwd(), path: 'README.md', command: 'git status',
    scopeDecision: { verdict: 'DENY', effective: null, reasons: ['tool not in effective scope'], digest: 'c'.repeat(64) }, request: { tool: 'shell' },
  });
  assert.equal(result.decision, 'deny');
  assert.match(result.reason, /^scope denied:/);
});
```

- [ ] **Step 2: Run and verify RED**

```powershell
node --test tests/supervisor.test.mjs tests/memory.test.mjs tests/security.test.mjs
```

Expected: new assertions fail because no scope decision is consumed.

- [ ] **Step 3: Implement integration with exact signatures**

Change dispatcher signature to:

```js
dispatch({ project, workOrder, expectedHash, state, workerClass, actor, budgetValid = true, scopeDecision })
```

Before lease acquisition:

```js
if (!scopeDecision || !['ALLOW', 'NARROW'].includes(scopeDecision.verdict) || !scopeDecision.effective) {
  throw new DispatchError('effective scope is missing or denied', 'SCOPE_INVALID');
}
```

Set packet fields:

```js
scope: scopeDecision.effective,
scope_digest: scopeDecision.digest,
```

Change retrieval signature to:

```js
bm25Query(records, query, { limit = 10, includeRevoked = true, scopeDecision } = {})
```

Return `{ ok:false, results:[], note:'scope denied' }` unless the decision is `ALLOW`/`NARROW`; filter records by `record.visibility` intersecting `scopeDecision.effective.audiences` before building document frequencies.

Add `classifyScopedOperation({ root, path, command, scopeDecision, request })` to permissions using this implementation:

```js
export function classifyScopedOperation({ root, path: requestedPath, command, scopeDecision, request }) {
  const checked = evaluateScopeRequest(scopeDecision, request);
  if (checked.verdict === 'DENY' || checked.verdict === 'DEFER') {
    return { decision: 'deny', reason: `scope denied: ${(checked.reasons ?? ['unresolved scope']).join('; ')}` };
  }
  const pathDecision = classifyWritePath(root, requestedPath);
  if (pathDecision.decision !== 'allow') return pathDecision;
  return classifyCommand(command);
}
```

- [ ] **Step 4: Run targeted tests and commit**

```powershell
node --test tests/supervisor.test.mjs tests/memory.test.mjs tests/security.test.mjs tests/scope-engine.test.mjs
git add -- src/supervisor/dispatcher.mjs src/memory/retrieval.mjs src/policy/permissions.mjs tests/supervisor.test.mjs tests/memory.test.mjs tests/security.test.mjs
git commit -m "feat: enforce scope across runtime boundaries"
```

### Task 3: Promote the memory fabric into an explicit Memory Factory

**Files:**
- Create: `src/memory/consolidation.mjs`
- Create: `src/memory/projection.mjs`
- Create: `src/memory/factory.mjs`
- Create: `tests/memory-factory.test.mjs`
- Modify: `src/memory/store.mjs`

**Interfaces:**
- Produces: `validateConsolidation()`, `createProjection()`, `MemoryFactory`.
- Consumes: existing `MemoryStore`, scoped `bm25Query`, scope decisions.

- [ ] **Step 1: Write failing tests**

Create `tests/memory-factory.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MemoryStore } from '../src/memory/store.mjs';
import { MemoryFactory } from '../src/memory/factory.mjs';
import { validateConsolidation } from '../src/memory/consolidation.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'faes-factory-'));
const source = (id, overrides = {}) => ({ id, confidence: 'hypothesis', visibility: ['project'], authority: { class: 'observation', admissible_uses: ['inform-proposal'] }, ...overrides });
const base = (overrides = {}) => ({ kind: 'semantic', content: 'supplier rule', source_provenance: { source: 'test', kind: 'repository', recorded_at: '2026-08-21T00:00:00.000Z' }, authority: { class: 'observation', admissible_uses: ['inform-proposal'] }, confidence: 'observed', retention: 'project', visibility: ['project'], ...overrides });
const projectScope = () => ({ verdict: 'ALLOW', effective: { audiences: ['project'], memory_kinds: ['semantic', 'procedural'] }, digest: 'd'.repeat(64) });
const seededFactory = (directory) => { const factory = new MemoryFactory(new MemoryStore(directory)); factory.ingest(base({ id: 'supplier' })); return factory; };

test('three consolidation gates fail closed', () => {
  assert.deepEqual(validateConsolidation({ source_ids: ['missing'], requested_confidence: 'hypothesis', requested_visibility: ['project'], requested_uses: ['inform-proposal'] }, [] ).reasons, ['local transition']);
  assert.ok(validateConsolidation({ source_ids: ['a'], requested_confidence: 'verified', requested_visibility: ['project'], requested_uses: ['inform-proposal'] }, [source('a')]).reasons.includes('global evidence coherence'));
  assert.ok(validateConsolidation({ source_ids: ['a'], requested_confidence: 'hypothesis', requested_visibility: ['public'], requested_uses: ['execute'] }, [source('a')]).reasons.includes('authority preservation'));
});

test('revocation propagates while deletion remains distinct', () => {
  const store = new MemoryStore(tmp());
  const factory = new MemoryFactory(store);
  const original = factory.ingest(base({ id: 'source' }));
  const procedure = factory.deriveProcedure({ source_ids: [original.id], content: 'safe procedure' }, ['run tests']);
  store.deleteRecord(original.id);
  assert.equal(store.fetch(procedure.id).authority_revoked, false);
  assert.ok(factory.revokeAuthority(original.id, 'withdrawn').includes(procedure.id));
  assert.equal(store.fetch(procedure.id).authority_revoked, true);
});

test('projection contains minimum context and a stable digest', () => {
  const factory = seededFactory(tmp());
  const projection = factory.project({ records: factory.retrieve('supplier', projectScope()).results, purpose: 'review', audience: 'project', valid_until: '2026-08-22T00:00:00Z', scopeDecision: projectScope() });
  assert.deepEqual(Object.keys(projection.items[0]).sort(), ['content', 'epistemic', 'id', 'kind', 'provenance']);
  assert.match(projection.digest, /^[0-9a-f]{64}$/);
});
```

- [ ] **Step 2: Run and verify RED**

```powershell
node --test tests/memory-factory.test.mjs
```

Expected: module-not-found failures.

- [ ] **Step 3: Implement the consolidation gates**

Create `src/memory/consolidation.mjs`:

```js
const intersection = (sets) => [...sets.slice(1).reduce((acc, set) => new Set([...acc].filter((x) => set.has(x))), new Set(sets[0]))].sort();

export function validateConsolidation(proposal, sources) {
  const reasons = [];
  if (!sources.length || sources.some((source) => !proposal.source_ids.includes(source.id))) reasons.push('local transition');
  if (proposal.requested_confidence === 'verified' && !sources.every((source) => source.confidence === 'verified')) reasons.push('global evidence coherence');
  const visibility = intersection(sources.map((source) => new Set(source.visibility ?? ['project'])));
  const uses = intersection(sources.map((source) => new Set(source.authority.admissible_uses)));
  if (!proposal.requested_visibility.every((item) => visibility.includes(item))) reasons.push('authority preservation');
  if (!proposal.requested_uses.every((item) => uses.includes(item))) reasons.push('authority preservation');
  return { accepted: reasons.length === 0, reasons: [...new Set(reasons)], effective_visibility: visibility, effective_uses: uses };
}
```

Create `src/memory/projection.mjs`:

```js
import { canonicalJson, sha256Hex } from '../evidence/hashing.mjs';

export function createProjection({ records, purpose, audience, valid_until, scopeDecision }) {
  if (!['ALLOW', 'NARROW'].includes(scopeDecision?.verdict) || !scopeDecision.effective?.audiences?.includes(audience)) {
    throw new Error('projection scope or audience denied');
  }
  const items = records.map((record) => ({
    id: record.id,
    kind: record.kind,
    content: record.content,
    provenance: record.source_provenance,
    epistemic: { confidence: record.confidence, qualifiers: record.qualifiers },
  }));
  const payload = { purpose, audience, valid_until, source_ids: items.map((item) => item.id), scope_digest: scopeDecision.digest, items };
  return Object.freeze({ ...payload, digest: sha256Hex(canonicalJson(payload)) });
}
```

Create `MemoryFactory` with methods `ingest(record)`, `retrieve(query, scopeDecision, options)`, `consolidate(proposal)`, `deriveProcedure(proposal, steps)`, `revokeAuthority(sourceId, reason)` and `project(args)`. Delegate persistence and lineage to `MemoryStore`; do not import `AssuranceStore`.

- [ ] **Step 4: Run tests and commit**

```powershell
node --test tests/memory-factory.test.mjs tests/memory.test.mjs tests/scope-engine.test.mjs
git add -- src/memory/consolidation.mjs src/memory/projection.mjs src/memory/factory.mjs src/memory/store.mjs tests/memory-factory.test.mjs
git commit -m "feat: add explicit memory factory"
```

### Task 4: Add canonical agent, skill, command and Claude surfaces

**Files:**
- Create: `.agents/manifest.json`
- Create: `.agents/planner.md`, `.agents/builder.md`, `.agents/independent-reviewer.md`, `.agents/security-reviewer.md`, `.agents/memory-curator.md`
- Create: `.skills/*/SKILL.md` for the seven approved skills
- Create: `.commands/plan.md`, `.commands/build.md`, `.commands/verify.md`, `.commands/review.md`, `.commands/security-review.md`, `.commands/scope-check.md`, `.commands/memory-consolidate.md`, `.commands/checkpoint.md`
- Create: `.claude/settings.example.json`, `.claude/hooks/protect-sensitive.mjs`, `.claude/README.md`
- Create: `tests/agent-surfaces.test.mjs`

**Interfaces:**
- Consumes: canonical roles, state machine and scope engine.
- Produces: host-neutral machine-readable surfaces and thin Claude adapter.

- [ ] **Step 1: Write failing manifest tests**

Create `tests/agent-surfaces.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const roles = ['planner', 'builder', 'independent-reviewer', 'security-reviewer', 'memory-curator'];
const commands = ['plan', 'build', 'verify', 'review', 'security-review', 'scope-check', 'memory-consolidate', 'checkpoint'];
const skills = ['plan-work', 'build-scoped-change', 'verify-evidence', 'independent-review', 'security-review-with-strix', 'scope-evaluation', 'memory-consolidation'];

test('canonical agent surfaces are complete and scope gated', () => {
  const manifest = JSON.parse(fs.readFileSync('.agents/manifest.json', 'utf8'));
  assert.deepEqual(Object.keys(manifest.roles).sort(), [...roles].sort());
  assert.equal(new Set(Object.keys(manifest.roles)).size, roles.length);
  for (const role of roles) assert.ok(fs.readFileSync(`.agents/${role}.md`, 'utf8').includes('Capability is not authority'));
  for (const command of commands) assert.match(fs.readFileSync(`.commands/${command}.md`, 'utf8'), /requires_scope:\s*true/);
  for (const skill of skills) {
    const text = fs.readFileSync(`.skills/${skill}/SKILL.md`, 'utf8');
    assert.match(text, /Authority boundary/);
    assert.match(text, /WAIT|FAIL|CANCELLED/);
  }
});

test('Claude remains a thin adapter to canonical surfaces', () => {
  const text = fs.readFileSync('.claude/README.md', 'utf8');
  for (const root of ['.agents/', '.skills/', '.commands/']) assert.ok(text.includes(root));
  assert.doesNotMatch(text, /independent policy source/i);
});
```

- [ ] **Step 2: Run and verify RED**

```powershell
node --test tests/agent-surfaces.test.mjs
```

Expected: required files are missing.

- [ ] **Step 3: Create the canonical manifest**

Use this exact `.agents/manifest.json` shape:

```json
{
  "schema_version": 1,
  "roles": {
    "planner": { "file": ".agents/planner.md", "states": ["PLANNED"], "write": ["work-order"] },
    "builder": { "file": ".agents/builder.md", "states": ["READY", "CHANGES_REQUESTED"], "write": ["scoped-repository", "evidence"] },
    "independent-reviewer": { "file": ".agents/independent-reviewer.md", "states": ["READY_FOR_REVIEW"], "write": ["review-verdict"] },
    "security-reviewer": { "file": ".agents/security-reviewer.md", "states": ["READY_FOR_REVIEW"], "write": ["security-verdict", "evidence"] },
    "memory-curator": { "file": ".agents/memory-curator.md", "states": ["IN_PROGRESS"], "write": ["memory-proposal"] }
  }
}
```

Each Markdown profile has frontmatter fields `id`, `accepted_states`, `requires_scope`, `allowed_tools`, `prohibited_transitions`, `required_evidence`; bodies state capability-is-not-authority, failure semantics and escalation.

Each skill frontmatter includes `name` and `description`; bodies define Trigger, Preconditions, Scope, Procedure, Evidence, Failure states and Authority boundary. `.skills/security-review-with-strix/SKILL.md` references the pinned upstream without copying it.

Each command frontmatter includes `name`, `requires_scope: true`, `allowed_states`, `output_record`; command bodies route to the supervisor and never execute consequential actions directly.

Claude settings deny force push, reset hard, publishing, sensitive paths and direct Strix execution; ask for push/PR and authorized security-review commands; the hook calls the existing deterministic permissions module.

- [ ] **Step 4: Verify and commit surfaces**

```powershell
node --test tests/agent-surfaces.test.mjs tests/security.test.mjs tests/consistency.test.mjs
git add -- .agents .skills .commands .claude tests/agent-surfaces.test.mjs
git commit -m "feat: add canonical agent surfaces"
```

### Task 5: Add the authorization-gated Strix Security Reviewer contract

**Files:**
- Create: `src/security/strix-review.mjs`
- Create: `config/strix-review.example.json`
- Create: `tests/strix-review.test.mjs`
- Modify: `src/workers/contracts.mjs`
- Modify: `config/skills-lock.example.json`

**Interfaces:**
- Produces: `preflightStrixReview(request)` and `interpretStrixResult({ exitCode, run, report, vulnerabilities })`.
- Consumes: written target authorization, clean checkout flag, frozen version/config digest and bounded resources.

- [ ] **Step 1: Write failing Strix contract tests**

Create `tests/strix-review.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { preflightStrixReview, interpretStrixResult } from '../src/security/strix-review.mjs';

const valid = () => ({ target: 'local-app', target_class: 'owned', environment: 'test', authorization: { written: true, target: 'local-app', ref: 'AUTH-17' }, clean_disposable_checkout: true, max_budget_usd: 5, max_turns: 20, max_seconds: 900, strix_ref: '2cc816781438f2993bcbb5c8cf3f693c25380142', config_digest: 'a'.repeat(64), scope_digest: 'b'.repeat(64), evidence_destination: '.state/evidence/strix/run-1', occurrence: 1, work_order_id: 'WO-5', proposed_by: 'supervisor:hermes', created_at: '2026-08-21T10:00:00.000Z', expires_at: '2026-08-21T10:15:00.000Z' });
const finding = { id: 'STRIX-1', title: 'Command injection', severity: 'HIGH', status: 'VALIDATED', validated: true, evidence: [{ type: 'reproduction', ref: 'evidence:poc-1', provenance: { source: 'independent-reviewer', recorded_at: '2026-08-21T10:10:00.000Z' } }] };

for (const [name, mutate] of [
  ['missing authorization', (r) => { r.authorization.written = false; }],
  ['third-party target', (r) => { r.target_class = 'third-party'; }],
  ['dirty checkout', (r) => { r.clean_disposable_checkout = false; }],
  ['unbounded run', (r) => { r.max_seconds = 0; }],
  ['mutable ref', (r) => { r.strix_ref = 'main'; }],
  ['missing evidence', (r) => { delete r.evidence_destination; }],
]) test(`preflight rejects ${name}`, () => { const request = valid(); mutate(request); assert.equal(preflightStrixReview(request).ready_for_authority_gate, false); assert.equal(preflightStrixReview(request).execution_authorized, false); });

test('preflight is never authority', () => { const result = preflightStrixReview(valid()); assert.equal(result.ready_for_authority_gate, true); assert.equal(result.execution_authorized, false); assert.equal(result.claims_only, true); });
test('result interpretation preserves failure semantics', () => {
  assert.equal(interpretStrixResult({ exitCode: 1 }).outcome, 'FAIL');
  assert.equal(interpretStrixResult({ exitCode: 2, run: { status: 'completed' }, vulnerabilities: [finding] }).outcome, 'FINDINGS');
  assert.equal(interpretStrixResult({ exitCode: 0, run: { status: 'stopped' } }).outcome, 'INCOMPLETE');
  assert.equal(interpretStrixResult({ exitCode: 0, run: { status: 'completed' }, report: { coverage_complete: true } }).outcome, 'NO_VALIDATED_FINDINGS_IN_ANALYZED_SCOPE');
});
```

- [ ] **Step 2: Run and verify RED**

```powershell
node --test tests/strix-review.test.mjs
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement pure preflight and result interpretation**

Create `src/security/strix-review.mjs`:

```js
const PIN = '2cc816781438f2993bcbb5c8cf3f693c25380142';

export function preflightStrixReview(request) {
  const failures = [];
  if (request.authorization?.written !== true) failures.push('written target authorization required');
  if (request.authorization?.target !== request.target) failures.push('authorization target mismatch');
  if (request.target_class === 'third-party') failures.push('third-party target denied');
  if (request.environment === 'production' && request.authorization?.production !== true) failures.push('production requires exact authorization');
  if (request.clean_disposable_checkout !== true) failures.push('clean disposable checkout required');
  if (!(request.max_budget_usd > 0) || !(request.max_turns > 0) || !(request.max_seconds > 0)) failures.push('budget, turns and wall-clock bounds required');
  if (request.strix_ref !== PIN) failures.push('Strix commit pin mismatch');
  if (!/^[0-9a-f]{64}$/.test(request.config_digest ?? '')) failures.push('configuration digest required');
  if (!request.evidence_destination) failures.push('evidence destination required');
  const proposal = canonicalStrixEffectProposal(request); // binds target, environment, scope/config digests, pin, budgets, evidence path and occurrence
  const proposal_digest = proposalDigest(proposal);
  // Caller ownership/authorization values remain claims. This result cannot authorize or launch Strix.
  return { ready_for_authority_gate: failures.length === 0, execution_authorized: false, claims_only: true, failures, strix_ref: PIN, proposal, proposal_digest };
}

export function interpretStrixResult({ exitCode, run, report, vulnerabilities = [] }) {
  if (exitCode === 1) return { outcome: 'FAIL', complete: false, findings: [], reason: 'Strix fatal/setup failure' };
  if (exitCode === 2 && !vulnerabilities.every(isStrictIndependentFinding)) return { outcome: 'FAIL', complete: false, findings: [], reason: 'malformed findings result' };
  if (exitCode === 2 && vulnerabilities.some((v) => !v.validated)) return { outcome: 'UNVALIDATED_OBSERVATIONS', complete: false, findings: vulnerabilities, reason: 'observations require independent validation' };
  if (exitCode === 2) return { outcome: 'FINDINGS', complete: run?.status === 'completed', findings: vulnerabilities, reason: 'validated findings reported' };
  if (exitCode !== 0) return { outcome: 'FAIL', complete: false, findings: [], reason: `unknown exit code ${exitCode}` };
  if (run?.status !== 'completed' || report?.coverage_complete !== true) return { outcome: 'INCOMPLETE', complete: false, findings: [], reason: 'run or analyzed coverage incomplete' };
  return { outcome: 'NO_VALIDATED_FINDINGS_IN_ANALYZED_SCOPE', complete: true, findings: [], reason: 'completed analyzed scope reported no validated findings' };
}
```

Add the pinned Strix source, path and scope to `config/skills-lock.example.json`. Extend `reviewerPacket()` with optional `security_context` containing authorization ref, scope digest, clean-checkout evidence, configured bounds and expected output paths. No code spawns Strix.

- [ ] **Step 4: Verify and commit**

```powershell
node --test tests/strix-review.test.mjs tests/workers.test.mjs tests/skills.test.mjs
git add -- src/security/strix-review.mjs config/strix-review.example.json config/skills-lock.example.json src/workers/contracts.mjs tests/strix-review.test.mjs
git commit -m "feat: add gated Strix security review contract"
```

### Task 6: Extend safe installation and repository verification

**Files:**
- Modify: `scripts/init-project.mjs`
- Modify: `scripts/verify-repo.mjs`
- Modify: `tests/installer.test.mjs`
- Modify: `tests/consistency.test.mjs`

- [ ] **Step 1: Add failing installer/contract tests**

Append to `tests/installer.test.mjs` and `tests/consistency.test.mjs`:

```js
test('installer plans canonical surfaces without overwriting', () => {
  const target = tmp();
  const dry = runInit(target);
  for (const root of ['.agents/', '.skills/', '.commands/', '.claude/']) assert.ok(dry.stdout.includes(root));
  assert.equal(fs.readdirSync(target).length, 0);
  const applied = runInit(target, ['--apply']);
  assert.equal(applied.status, 0);
  assert.ok(fs.existsSync(path.join(target, 'INSTALL-MANIFEST.json')));
  const protectedFile = path.join(target, '.commands', 'plan.md');
  fs.writeFileSync(protectedFile, 'user-owned');
  runInit(target, ['--apply']);
  assert.equal(fs.readFileSync(protectedFile, 'utf8'), 'user-owned');
  assert.equal(fs.existsSync(path.join(target, 'strix')), false);
});

test('repository exposes the complete canonical runtime contract', () => {
  for (const path of ['.agents/manifest.json', '.skills/security-review-with-strix/SKILL.md', '.commands/scope-check.md', '.claude/README.md']) assert.ok(fs.existsSync(path));
  const publicText = ['README.md', 'README.de.md', 'CAPABILITIES.md'].map(read).join('\n');
  assert.match(publicText, /Ömer Coskun/);
  assert.match(publicText, /Autonomous Engineering Reference (Architecture )?V1/);
});
```

- [ ] **Step 2: Run and verify RED**

```powershell
node --test tests/installer.test.mjs tests/consistency.test.mjs
```

Expected: missing install/contract entries fail.

- [ ] **Step 3: Extend the deterministic install plan**

In `scripts/init-project.mjs`, derive installer entries from explicit arrays of canonical source paths. For each source, read bytes, compute SHA-256 and plan the identical relative destination. Apply uses `wx`, never overwrites, and writes `INSTALL-MANIFEST.json` containing schema version, source repo/version, installed path and SHA-256. Do not include `.state/assurance` write capability in any agent profile and do not install credentials or `strix`.

- [ ] **Step 4: Verify and commit**

```powershell
node --test tests/installer.test.mjs tests/agent-surfaces.test.mjs tests/consistency.test.mjs
node scripts/verify-repo.mjs
git add -- scripts/init-project.mjs scripts/verify-repo.mjs tests/installer.test.mjs tests/consistency.test.mjs
git commit -m "feat: install and verify agent runtime surfaces"
```

### Task 7: Propagate public identity, lineage, docs and capability evidence

**Files:**
- Modify: `README.md`, `README.de.md`, `AGENTS.md`, `CAPABILITIES.md`
- Modify: `docs/ARCHITECTURE.md`, `docs/OPERATING-MODEL.md`, `docs/MEMORY-AND-STATE.md`, `docs/SECURITY-AND-AUTHORITY.md`, `docs/THREAT-MODEL.md`, `docs/INSTALLATION.md`, `docs/UPSTREAMS.md`, `docs/CHANGE-PROPAGATION.md`
- Modify: `templates/WORK-ORDER.md`, `templates/SESSION-REPORT.md`
- Create: `.state/sessions/2026-08-21-memory-factory-scope-agent-runtime/SESSION-REPORT.md`

- [ ] **Step 1: Add/extend consistency tests before docs**

Append this exact contract to `tests/consistency.test.mjs`:

```js
test('public docs state identity lineage capabilities and security non-claims', () => {
  const files = ['README.md', 'README.de.md', 'CAPABILITIES.md', 'docs/ARCHITECTURE.md', 'docs/THREAT-MODEL.md'];
  const text = files.map(read).join('\n');
  for (const marker of ['Ömer Coskun', 'https://www.linkedin.com/in/oemer-coskun53', 'Autonomous Engineering Reference V1', 'Memory Factory', 'Scope Engine', '2cc816781438f2993bcbb5c8cf3f693c25380142', 'Apache-2.0']) assert.ok(text.includes(marker), `missing ${marker}`);
  assert.match(text, /written (target )?authorization/i);
  assert.match(text, /no real Strix (scan|execution)|Strix.*NOT_EXECUTED/i);
  assert.match(text, /unattended continuous operation.*NOT_CLAIMED|NOT_CLAIMED.*unattended continuous operation/i);
});
```

- [ ] **Step 2: Verify RED**

```powershell
node --test tests/consistency.test.mjs
```

Expected: docs do not yet meet the new contract.

- [ ] **Step 3: Update docs and capability inventory**

Document implemented modules and tests exactly. Rate Memory Factory, Scope Engine and canonical surfaces `IMPLEMENTED`; rate live Strix execution `SPECIFIED_ONLY`; retain unattended continuous operation and mobile approval transport as `NOT_CLAIMED`. Add contact:

```markdown
- LinkedIn: [Ömer Coskun](https://www.linkedin.com/in/oemer-coskun53)
```

Add upstream entry:

```text
usestrix/strix@2cc816781438f2993bcbb5c8cf3f693c25380142
license = Apache-2.0
integration = authorization-gated Security Reviewer procedure; no vendored code
```

- [ ] **Step 4: Write session checkpoint and verify GREEN**

Record objective, files, tests, capability changes, security review, blockers, external actions=`NOT_EXECUTED`, no real Strix run and next action. Then:

```powershell
node --test tests/consistency.test.mjs
git add -- README.md README.de.md AGENTS.md CAPABILITIES.md docs templates .state/sessions/2026-08-21-memory-factory-scope-agent-runtime/SESSION-REPORT.md
git commit -m "docs: publish complete autonomous engineering runtime"
```

### Task 8: Update the model-free demo and execute the full local gate

**Files:**
- Modify: `examples/demo-project/run-demo.mjs`
- Modify: `tests/consistency.test.mjs` only if execution reveals a genuine stale contract.

- [ ] **Step 1: Add failing demo assertions**

Append to `tests/consistency.test.mjs`:

```js
test('demo exercises the scoped memory loop without assurance or Strix', () => {
  const demo = read('examples/demo-project/run-demo.mjs');
  for (const symbol of ['intersectScopes', 'scopeDecision', 'scope_digest', 'MemoryFactory', '.retrieve(', '.project(', 'READY_FOR_REVIEW', 'DONE']) assert.ok(demo.includes(symbol), `demo missing ${symbol}`);
  assert.doesNotMatch(demo, /new AssuranceStore/);
  assert.doesNotMatch(demo, /spawn.*strix|exec.*strix/i);
});
```

- [ ] **Step 2: Verify RED then implement the minimum demo changes**

```powershell
npm run demo
```

Expected before changes: the demo fails the new required scope argument. Update it to use `intersectScopes`, `MemoryFactory` and the existing model-free reviewer path.

- [ ] **Step 3: Run the complete local verification gate**

```powershell
npm test
npm run verify
npm run demo
npm run export-schemas
git diff --check origin/main...HEAD
```

Expected: every command exits `0`; test output reports zero failures; schema generation leaves no diff.

- [ ] **Step 4: Commit demo integration**

```powershell
git add -- examples/demo-project/run-demo.mjs
git commit -m "test: exercise scoped memory loop end to end"
```

### Task 9: Final local delivery gate

- [ ] **Step 1: Inspect the complete branch and prohibited content**

```powershell
npm test
npm run verify
npm run demo
git diff --check origin/main...HEAD
rg -n -i --hidden --glob '!.git/**' --glob '!docs/superpowers/**' '[A-Z]:[\\/]|@icloud\.com|LLM_API_KEY\s*=\s*[^<]' .
git log --oneline --decorate origin/main..HEAD
git status --short --branch
```

Expected: verification commands pass; prohibited-content search returns no match; commits are scoped and working tree is clean.

- [ ] **Step 2: Prepare but do not execute external actions**

Record exact branch, commits, test counts, capability deltas, Strix non-execution evidence and session checkpoint for the coordinated one-shot multi-repository push gate.
