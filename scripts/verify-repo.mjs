// Repository contract check: required files exist and key honesty/consistency
// markers hold. This is the CONTRACT layer only — behavioral guarantees are
// covered by the test suites under tests/ (run via `npm test`).
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const required = [
  'README.md','README.de.md','AGENTS.md','NOTICE.md','LICENSE','package.json','CAPABILITIES.md',
  'docs/ARCHITECTURE.md','docs/HERMES-SUPERVISOR.md','docs/INSTALLATION.md','docs/ROUTING.md',
  'docs/MEMORY-AND-STATE.md','docs/SECURITY-AND-AUTHORITY.md','docs/OPERATING-MODEL.md','docs/COSTS.md','docs/UPSTREAMS.md',
  'docs/THREAT-MODEL.md','docs/CHANGE-PROPAGATION.md',
  'spec/state-machine.json','spec/schemas/records.schema.json',
  'src/supervisor/state-machine.mjs','src/supervisor/lease-manager.mjs','src/supervisor/dispatcher.mjs',
  'src/supervisor/provider-wait.mjs','src/supervisor/project-registry.mjs',
  'src/state/event-store.mjs','src/schemas/schemas.mjs',
  'src/memory/store.mjs','src/memory/retrieval.mjs',
  'src/policy/approval.mjs','src/policy/effect-registry.mjs','src/policy/effect-gate.mjs','src/policy/executor.mjs','src/policy/permissions.mjs',
  'src/workers/contracts.mjs','src/evidence/ledger.mjs','src/evidence/hashing.mjs','src/routing/omniroute.mjs','src/skills/lock.mjs','src/cli.mjs',
  'config/.env.example','config/dsh-omniroute.settings.example.yaml','config/skills-lock.example.json',
  'templates/WORK-ORDER.md','templates/SESSION-REPORT.md',
  'scripts/bootstrap.sh','scripts/bootstrap.ps1','scripts/init-project.mjs','scripts/export-schemas.mjs',
  'adapters/README.md','adapters/deepseek-harness/README.md',
  'examples/demo-project/run-demo.mjs',
  '.github/workflows/validate.yml','assets/free-autonomous-engineering-setup-hero.svg',
  '.agents/manifest.json','.agents/builder.md','.agents/independent-reviewer.md','.agents/memory-curator.md','.agents/planner.md','.agents/security-reviewer.md',
  '.skills/build-scoped-change/SKILL.md','.skills/independent-review/SKILL.md','.skills/memory-consolidation/SKILL.md','.skills/plan-work/SKILL.md','.skills/scope-evaluation/SKILL.md','.skills/security-review-with-strix/SKILL.md','.skills/verify-evidence/SKILL.md',
  '.commands/build.md','.commands/checkpoint.md','.commands/memory-consolidate.md','.commands/plan.md','.commands/review.md','.commands/scope-check.md','.commands/security-review.md','.commands/verify.md',
  '.claude/README.md','.claude/hooks/protect-sensitive.mjs','.claude/settings.example.json',
];
const failures = [];
const read = p => fs.readFileSync(path.join(root,p),'utf8');
for (const f of required) if (!fs.existsSync(path.join(root,f))) failures.push(`missing required file: ${f}`);

try {
  const pkg=JSON.parse(read('package.json'));
  if(pkg.name!=='free-autonomous-engineering-setup') failures.push('package.json name mismatch');
  if(!pkg.scripts?.test?.includes('node --test')) failures.push('package.json test script must run the real test suites');
} catch(e){ failures.push(`package.json invalid: ${e.message}`); }

if (fs.existsSync(path.join(root,'config/dsh-omniroute.settings.example.yaml'))) {
  const cfg=read('config/dsh-omniroute.settings.example.yaml');
  for (const x of ['http://127.0.0.1:20128/v1','api: openai-completions','apiKeyEnv: OMNIROUTE_API_KEY','auto/coding','auto/coding:free','auto/reasoning:pro']) if(!cfg.includes(x)) failures.push(`DSH/OmniRoute config missing: ${x}`);
}
if (fs.existsSync(path.join(root,'README.md'))) {
  const r=read('README.md').toLowerCase();
  for (const x of ['free-preferred','developer preview','capability is not authority','hermes supervisor','deepseek harness','omniroute','capabilities.md']) if(!r.includes(x)) failures.push(`README missing architecture/status phrase: ${x}`);
}
if (fs.existsSync(path.join(root,'docs/HERMES-SUPERVISOR.md'))) {
  const h=read('docs/HERMES-SUPERVISOR.md');
  for (const x of ['PLANNED','READY_FOR_REVIEW','CHANGES_REQUESTED','FOUNDER_REQUIRED','Duplicate-run','DeepSeek Harness','OmniRoute','spec/state-machine.json']) if(!h.toLowerCase().includes(x.toLowerCase())) failures.push(`Hermes supervisor contract missing: ${x}`);
}
if (fs.existsSync(path.join(root,'docs/ROUTING.md'))) { const r=read('docs/ROUTING.md').toLowerCase(); if(!r.includes('fail-open')) failures.push('routing docs must explain fail-open free routing'); if(!r.includes('strict')) failures.push('routing docs must document strict-budget option'); }
if (fs.existsSync(path.join(root,'spec/state-machine.json'))) {
  try {
    const spec = JSON.parse(read('spec/state-machine.json'));
    for (const s of ['DONE','FAIL','CANCELLED']) {
      if (!spec.states[s]?.terminal) failures.push(`state ${s} must be terminal in the spec`);
      if (spec.transitions.some(t=>t.from===s)) failures.push(`terminal state ${s} must have no outgoing transitions`);
    }
  } catch(e){ failures.push(`spec/state-machine.json invalid: ${e.message}`); }
}
if (fs.existsSync(path.join(root,'.env'))) failures.push('root .env must not be committed');
if (fs.existsSync(path.join(root,'config/.env'))) failures.push('config/.env must not be committed');

for (const doc of ['README.md','README.de.md','CAPABILITIES.md']) {
  if (!fs.existsSync(path.join(root,doc))) continue;
  const text=read(doc);
  if(!text.includes('Ömer Coskun')) failures.push(`${doc} missing public identity: Ömer Coskun`);
  if(!/Autonomous Engineering Reference (Architecture )?V1/.test(text)) failures.push(`${doc} missing canonical AI Engineering Stack lineage name`);
}
if (fs.existsSync(path.join(root,'.agents/manifest.json'))) {
  try {
    const manifest=JSON.parse(read('.agents/manifest.json'));
    for (const [role,profile] of Object.entries(manifest.roles??{})) {
      if ((profile.write??[]).some(value=>/assurance|approval|credential|grant|authority/i.test(value))) failures.push(`agent role ${role} must not receive assurance/authority write capability`);
    }
  } catch(e){ failures.push(`.agents/manifest.json invalid: ${e.message}`); }
}
for (const forbidden of ['strix','credentials.json','.env','.state/assurance/grants.json']) {
  if (fs.existsSync(path.join(root,forbidden))) failures.push(`forbidden install/runtime artifact present: ${forbidden}`);
}

if (failures.length){ console.error('Repository verification FAILED:'); failures.forEach(f=>console.error(` - ${f}`)); process.exit(1); }
console.log(`Repository verification passed (${required.length} required files checked).`);
console.log('Contract layer OK. Behavioral guarantees are proven by the test suites (npm test).');
