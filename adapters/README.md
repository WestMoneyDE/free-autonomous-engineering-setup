# Harness adapters

The core policy engine is harness-neutral (`src/policy/permissions.mjs`).
Adapters translate the same allow / ask / deny policy into a specific agent
harness. Adapters are OPTIONAL; the core never depends on any of them.

```text
Core policy engine (src/policy/permissions.mjs)
    ↓
Adapters
    ├── deepseek-harness/  — DSH worker runtime wiring (primary runtime)
    ├── claude/            — optional Claude Code settings/hook example
    └── <future harnesses>
```

An adapter may only make policy STRICTER, never weaker: an action the core
classifies as `deny` must never become `ask`/`allow` in an adapter config.
