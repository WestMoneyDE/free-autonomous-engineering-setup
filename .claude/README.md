# Claude adapter

This directory is a thin host adapter. Canonical policy and behavior remain in `.agents/`, `.skills/` and `.commands/`, plus the deterministic modules under `src/`.

`settings.example.json` maps conservative Claude permissions. `hooks/protect-sensitive.mjs` delegates path and command classification to `src/policy/permissions.mjs`; it does not reproduce policy. For shell commands, the hook is deny-only defense in depth: canonical `DENY` blocks, while canonical `ASK` exits successfully so the host settings/default permission mechanism can prompt the human. A zero hook exit is not authorization. Unclassified shell commands remain canonical `ASK` and rely on that host prompt boundary. Malformed matched payloads fail closed.

Copy and adapt the example only when the host integration is explicitly enabled.
