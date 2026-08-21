import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { WORK_ORDER_STATES } from '../src/schemas/schemas.mjs';

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

const parseFrontmatter = (text) => {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(match, 'frontmatter is required');
  return Object.fromEntries(match[1].split(/\r?\n/).filter(Boolean).map((line) => {
    const i = line.indexOf(':');
    assert.ok(i > 0, `malformed frontmatter line: ${line}`);
    return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
  }));
};
const parseList = (value) => value.slice(1, -1).split(',').map((item) => item.trim()).filter(Boolean);

test('frontmatter uses canonical role and state values', () => {
  const manifest = JSON.parse(fs.readFileSync('.agents/manifest.json', 'utf8'));
  for (const role of roles) {
    const fm = parseFrontmatter(fs.readFileSync(`.agents/${role}.md`, 'utf8'));
    assert.equal(fm.id, role);
    const states = parseList(fm.accepted_states);
    for (const state of states) assert.ok(WORK_ORDER_STATES.includes(state), `${role}: ${state}`);
    assert.equal(fm.requires_scope, 'true');
    assert.deepEqual(manifest.roles[role].states, states);
  }
  for (const skill of skills) {
    const fm = parseFrontmatter(fs.readFileSync(`.skills/${skill}/SKILL.md`, 'utf8'));
    assert.equal(fm.name, skill);
    assert.match(fm.description, /^Use when /);
  }
});

test('commands route through supervisor and forbid direct consequences', () => {
  for (const command of commands) {
    const text = fs.readFileSync(`.commands/${command}.md`, 'utf8');
    assert.equal(parseFrontmatter(text).requires_scope, 'true');
    assert.match(text, /Hermes supervisor/);
    assert.match(text, /do(?:es)? not|never|neither|no external action/i);
  }
});

const runHook = (payload) => spawnSync(process.execPath, ['.claude/hooks/protect-sensitive.mjs'], { cwd: process.cwd(), input: typeof payload === 'string' ? payload : JSON.stringify(payload), encoding: 'utf8' });

test('Claude hook validates write and multi-edit payloads fail closed', () => {
  assert.equal(runHook({ tool_name: 'Write', tool_input: { file_path: 'src/a.mjs' } }).status, 0);
  for (const payload of [{tool_name:'Write',tool_input:{file_path:'.env'}},{tool_name:'Edit',tool_input:{}},{tool_name:'Edit',tool_input:{file_path:42}},{tool_name:'MultiEdit',tool_input:{edits:[{file_path:'src/a.mjs'},{file_path:'.env'}]}},{tool_name:'UnknownWrite',tool_input:{path:'src/a.mjs'}}]) assert.notEqual(runHook(payload).status, 0, JSON.stringify(payload));
  assert.notEqual(runHook('{bad json').status, 0);
});

test('Claude hook delegates shell command classification', () => {
  const settings = fs.readFileSync('.claude/settings.example.json', 'utf8');
  assert.match(settings, /Bash\|Shell/);
  for (const pattern of ['Bash(git push:*)', 'Bash(gh pr:*)', 'Bash(npm run security-review:*)']) assert.ok(settings.includes(pattern), pattern);
  for (const command of ['git push origin main --force','git push --repo=x -f origin main','git push origin main --force-with-lease=x','strix scan target','npx strix scan target','uvx strix scan target','pipx run strix scan target','./bin/strix scan target','/opt/bin/strix scan target']) assert.notEqual(runHook({tool_name:'Bash',tool_input:{command}}).status, 0, command);
  assert.equal(runHook({tool_name:'Bash',tool_input:{command:'git status --short'}}).status, 0);
  for (const command of ['git push origin main','gh pr create --fill','npm run security-review -- --target local-app','some-unknown-binary --bounded']) assert.equal(runHook({tool_name:'Bash',tool_input:{command}}).status, 0, command);
});

test('skill TDD evidence manifest is ordered and content-addressed', () => {
  const root = 'docs/evidence/skill-tdd';
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.equal(manifest.validation_kind, 'post-implementation-reproducibility');
  assert.deepEqual(manifest.runs.map((run) => run.skill), skills);
  manifest.runs.forEach((run, index) => {
    assert.equal(run.order, index + 1); assert.equal(run.model, 'gpt-5.6-sol'); assert.equal(run.reasoning, 'low');
    assert.equal(run.red.scenario_sha256, run.green.scenario_sha256);
    for (const [relative, digest] of Object.entries(run.files)) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex'), digest, relative);
    const scenario = fs.readFileSync(path.join(root, run.scenario_file));
    const skill = fs.readFileSync(run.skill_file);
    assert.equal(crypto.createHash('sha256').update(skill).digest('hex'), run.skill_sha256);
    assert.equal(crypto.createHash('sha256').update(scenario).digest('hex'), run.red.input_sha256);
    assert.equal(crypto.createHash('sha256').update(Buffer.concat([skill, Buffer.from('\n---SCENARIO---\n'), scenario])).digest('hex'), run.green.input_sha256);
  });
});
