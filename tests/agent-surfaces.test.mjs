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
