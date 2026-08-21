# Claude adapter

This directory is a thin host adapter. Canonical policy and behavior remain in `.agents/`, `.skills/` and `.commands/`, plus the deterministic modules under `src/`.

`settings.example.json` maps conservative Claude permissions. `hooks/protect-sensitive.mjs` delegates write classification to `src/policy/permissions.mjs`; it does not reproduce policy. Copy and adapt the example only when the host integration is explicitly enabled.
