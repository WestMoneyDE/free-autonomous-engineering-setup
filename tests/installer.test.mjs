import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import crypto from 'node:crypto'; import { execFileSync, spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'); const initScript = path.join(repoRoot, 'scripts', 'init-project.mjs'); const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'faes-inst-'));
const listFiles = (dir) => { const out=[]; const walk=(d)=>{ for(const e of fs.readdirSync(d,{withFileTypes:true})){ const p=path.join(d,e.name); if(e.isDirectory()) walk(p); else out.push(path.relative(dir,p).replaceAll(path.sep,'/')); }}; walk(dir); return out.sort(); };
const runInit = (target, extra=[]) => spawnSync('node',[initScript,'--target',target,...extra],{encoding:'utf8'});
test('init-project dry run changes nothing',()=>{ const target=tmp(); const out=execFileSync('node',[initScript,'--target',target],{encoding:'utf8'}); assert.match(out,/DRY RUN/); assert.match(out,/WOULD CREATE: brain\/STATE\.json/); assert.deepEqual(listFiles(target),[]); });
test('init-project --apply creates the layout; STATE.json is valid',()=>{ const target=tmp(); execFileSync('node',[initScript,'--target',target,'--apply'],{encoding:'utf8'}); const files=listFiles(target); assert.ok(files.includes('brain/STATE.json')); assert.ok(files.includes('.state/assurance/README.md')); assert.ok(files.includes('.state/local/.gitignore')); assert.equal(JSON.parse(fs.readFileSync(path.join(target,'brain/STATE.json'),'utf8')).status,'PLANNED'); });
test('init-project never overwrites existing files and is idempotent',()=>{ const target=tmp(); fs.mkdirSync(path.join(target,'brain'),{recursive:true}); fs.writeFileSync(path.join(target,'brain/STATE.json'),'\u007b"custom":true\u007d'); const out1=execFileSync('node',[initScript,'--target',target,'--apply'],{encoding:'utf8'}); assert.match(out1,/SKIP \(exists\): brain\/STATE\.json/); assert.equal(fs.readFileSync(path.join(target,'brain/STATE.json'),'utf8'),'\u007b"custom":true\u007d'); const before=listFiles(target).join('\n'); const out2=execFileSync('node',[initScript,'--target',target,'--apply'],{encoding:'utf8'}); assert.match(out2,/Created 0 file\(s\)/); assert.equal(listFiles(target).join('\n'),before); });
test('bootstrap.sh dry run performs no install and no writes (POSIX)',(t)=>{ if(process.platform==='win32') return t.skip('POSIX shell test'); const target=tmp(); const out=execFileSync('bash',[path.join(repoRoot,'scripts','bootstrap.sh')],{encoding:'utf8',cwd:target}); assert.match(out,/Dry run only/); assert.deepEqual(listFiles(target),[]); });
test('bootstrap.sh rejects unknown arguments',(t)=>{ if(process.platform==='win32') return t.skip('POSIX shell test'); assert.throws(()=>execFileSync('bash',[path.join(repoRoot,'scripts','bootstrap.sh'),'--yolo'],{encoding:'utf8'})); });
test('bootstrap.ps1 exists and keeps dry-run-by-default semantics (static check)',()=>{ const ps1=fs.readFileSync(path.join(repoRoot,'scripts','bootstrap.ps1'),'utf8'); assert.match(ps1,/Dry run only/); assert.match(ps1,/\[switch\]\$Apply/); assert.match(ps1,/npm install -g omniroute@/); const sh=fs.readFileSync(path.join(repoRoot,'scripts','bootstrap.sh'),'utf8'); assert.match(sh,/npm install -g omniroute@/); assert.match(sh,/npm uninstall -g omniroute/); });

test('installer plans canonical surfaces without overwriting', () => {
  const target = tmp();
  const dry = runInit(target);
  assert.equal(dry.status, 0, dry.stderr);
  for (const root of ['.agents/', '.skills/', '.commands/', '.claude/']) assert.ok(dry.stdout.includes(root));
  assert.equal(fs.readdirSync(target).length, 0);
  const applied = runInit(target, ['--apply']);
  assert.equal(applied.status, 0, applied.stderr);
  assert.ok(fs.existsSync(path.join(target, 'INSTALL-MANIFEST.json')));
  const protectedFile = path.join(target, '.commands', 'plan.md');
  fs.writeFileSync(protectedFile, 'user-owned');
  const reapplied = runInit(target, ['--apply']);
  assert.notEqual(reapplied.status, 0);
  assert.match(reapplied.stderr, /manifest.*mismatch|stale/i);
  assert.equal(fs.readFileSync(protectedFile, 'utf8'), 'user-owned');
  assert.equal(fs.existsSync(path.join(target, 'strix')), false);
});

test('install manifest deterministically identifies exact installed source bytes', () => {
  const target = tmp();
  const applied = runInit(target, ['--apply']);
  assert.equal(applied.status, 0, applied.stderr);
  const manifest = JSON.parse(fs.readFileSync(path.join(target, 'INSTALL-MANIFEST.json'), 'utf8'));
  assert.equal(manifest.schema_version, 1);
  assert.equal(manifest.source.repository, 'WestMoneyDE/free-autonomous-engineering-setup');
  assert.equal(manifest.source.version, JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'))).version);
  assert.ok(Array.isArray(manifest.files));
  assert.deepEqual(manifest.files, [...manifest.files].sort((a,b)=>a.path.localeCompare(b.path)));
  for (const item of manifest.files) {
    assert.deepEqual(Object.keys(item).sort(), ['path', 'sha256', 'source'].sort());
    assert.ok(item.source === item.path || item.source === `builtin:${item.path}`);
    assert.match(item.sha256, /^[a-f0-9]{64}$/);
    assert.equal(item.sha256, crypto.createHash('sha256').update(fs.readFileSync(path.join(target,item.path))).digest('hex'));
  }
  for (const required of ['brain/STATE.json', '.agents/manifest.json', '.skills/security-review-with-strix/SKILL.md', '.commands/scope-check.md', '.claude/README.md']) {
    assert.ok(manifest.files.some((entry)=>entry.path===required), `manifest missing ${required}`);
  }
});

test('installer rejects symlink escape before writing a partial manifest', (t) => {
  const target = tmp(); const outside = tmp(); const agents = path.join(target,'.agents');
  try { fs.symlinkSync(outside, agents, process.platform === 'win32' ? 'junction' : 'dir'); } catch (error) { return t.skip(`symlink unavailable: ${error.code}`); }
  const applied = runInit(target, ['--apply']);
  assert.notEqual(applied.status, 0);
  assert.match(applied.stderr, /symbolic link|reparse point|escape/i);
  assert.equal(fs.existsSync(path.join(outside,'manifest.json')), false);
  assert.equal(fs.existsSync(path.join(target,'INSTALL-MANIFEST.json')), false);
});
