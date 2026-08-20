import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const required = [
  'README.md',
  'README.de.md',
  'AGENTS.md',
  'NOTICE.md',
  'LICENSE',
  'package.json',
  'docs/ARCHITECTURE.md',
  'docs/INSTALLATION.md',
  'docs/ROUTING.md',
  'docs/MEMORY-AND-STATE.md',
  'docs/SECURITY-AND-AUTHORITY.md',
  'docs/OPERATING-MODEL.md',
  'docs/COSTS.md',
  'docs/UPSTREAMS.md',
  'config/.env.example',
  'config/dsh-omniroute.settings.example.yaml',
  'templates/WORK-ORDER.md',
  'templates/SESSION-REPORT.md',
  'scripts/bootstrap.sh',
  'scripts/bootstrap.ps1',
  '.github/workflows/validate.yml'
];

const failures = [];
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) failures.push(`missing required file: ${file}`);
}

try {
  const pkg = JSON.parse(read('package.json'));
  if (pkg.name !== 'free-autonomous-engineering-setup') failures.push('package.json name mismatch');
  if (!pkg.scripts?.test) failures.push('package.json has no test script');
} catch (error) {
  failures.push(`package.json invalid: ${error.message}`);
}

if (fs.existsSync(path.join(root, 'config/dsh-omniroute.settings.example.yaml'))) {
  const cfg = read('config/dsh-omniroute.settings.example.yaml');
  for (const expected of [
    'http://127.0.0.1:20128/v1',
    'api: openai-completions',
    'apiKeyEnv: OMNIROUTE_API_KEY',
    'auto/coding',
    'auto/coding:free',
    'auto/reasoning:pro'
  ]) {
    if (!cfg.includes(expected)) failures.push(`DSH/OmniRoute config missing: ${expected}`);
  }
}

if (fs.existsSync(path.join(root, 'README.md'))) {
  const readme = read('README.md');
  for (const phrase of ['free-preferred', 'developer preview', 'Capability is not authority']) {
    if (!readme.toLowerCase().includes(phrase.toLowerCase())) failures.push(`README missing safety/status phrase: ${phrase}`);
  }
}

if (fs.existsSync(path.join(root, 'docs/ROUTING.md'))) {
  const routing = read('docs/ROUTING.md').toLowerCase();
  if (!routing.includes('fail-open')) failures.push('routing docs must explain fail-open free routing');
  if (!routing.includes('strict')) failures.push('routing docs must document strict-budget option');
}

if (fs.existsSync(path.join(root, '.env'))) failures.push('root .env must not be committed');
if (fs.existsSync(path.join(root, 'config/.env'))) failures.push('config/.env must not be committed');

if (failures.length) {
  console.error('Repository verification FAILED:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(`Repository verification passed (${required.length} required files checked).`);
console.log('Validated: DSH -> OmniRoute endpoint/config, routing warnings, safety/status documentation, and templates.');
