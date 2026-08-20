// Skills lock v2: source-pinned skill references (metadata only — this
// repository never vendors third-party skill content).
// Compared to lock v1 (repo+path only), v2 REQUIRES a commit ref so an
// upstream move/force-push cannot silently change a skill, and supports an
// optional content sha256 for full pinning.
// A missing upstream is an explicit MISSING_UPSTREAM status — never silently
// skipped and never invented.
import fs from 'node:fs';

export function validateSkillsLock(lock) {
  const issues = [];
  if (!lock || typeof lock !== 'object') return { ok: false, issues: ['lock must be an object'] };
  if (lock.version !== 2) issues.push('lock version must be 2 (v1 lacked commit pins)');
  if (!lock.skills || typeof lock.skills !== 'object') issues.push('lock.skills missing');
  for (const [name, s] of Object.entries(lock.skills ?? {})) {
    if (!s.source || !/^[\w.-]+\/[\w.-]+$/.test(s.source)) issues.push(`${name}: source must be owner/repo`);
    if (!s.skillPath || typeof s.skillPath !== 'string') issues.push(`${name}: skillPath required`);
    if (!s.ref || !/^[0-9a-f]{7,40}$/.test(s.ref)) issues.push(`${name}: ref must be a commit SHA (7-40 hex chars) — branch names are not pins`);
    if (s.sha256 !== undefined && !/^[0-9a-f]{64}$/.test(s.sha256)) issues.push(`${name}: sha256 must be 64 hex chars when present`);
    if (s.scope !== undefined && !Array.isArray(s.scope)) issues.push(`${name}: scope must be an array of path globs`);
  }
  return { ok: issues.length === 0, issues };
}

export function loadSkillsLock(path) {
  if (!fs.existsSync(path)) return { ok: false, issues: [`lock file not found: ${path}`] };
  let lock;
  try { lock = JSON.parse(fs.readFileSync(path, 'utf8')); } catch (e) {
    return { ok: false, issues: [`lock file invalid JSON: ${e.message}`] };
  }
  const v = validateSkillsLock(lock);
  return v.ok ? { ok: true, lock } : v;
}

/**
 * Resolve a skill entry against upstream availability.
 * `probe` is injected (tests use fakes; real use may wire `git ls-remote`).
 * Missing upstream => explicit MISSING_UPSTREAM, never a silent skip.
 */
export function resolveSkill(name, entry, probe) {
  const availability = probe(entry.source, entry.ref);
  if (availability === 'missing-repo') {
    return { name, status: 'MISSING_UPSTREAM', detail: `upstream repository ${entry.source} unavailable; skill must not be silently substituted` };
  }
  if (availability === 'missing-ref') {
    return { name, status: 'MISSING_PINNED_REF', detail: `pinned ref ${entry.ref} not found in ${entry.source}; upstream may have rewritten history — re-review required` };
  }
  return { name, status: 'RESOLVED', source: entry.source, ref: entry.ref, skillPath: entry.skillPath };
}
