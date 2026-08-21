#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const REPOSITORY = 'WestMoneyDE/free-autonomous-engineering-setup';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Explicit by design: never discover credentials, binaries, secrets or new authority surfaces.
const canonicalSources = [
  '.agents/builder.md','.agents/independent-reviewer.md','.agents/manifest.json',
  '.agents/memory-curator.md','.agents/planner.md','.agents/security-reviewer.md',
  '.skills/build-scoped-change/SKILL.md','.skills/independent-review/SKILL.md',
  '.skills/memory-consolidation/SKILL.md','.skills/plan-work/SKILL.md',
  '.skills/scope-evaluation/SKILL.md','.skills/security-review-with-strix/SKILL.md',
  '.skills/verify-evidence/SKILL.md','.commands/build.md','.commands/checkpoint.md',
  '.commands/memory-consolidate.md','.commands/plan.md','.commands/review.md',
  '.commands/scope-check.md','.commands/security-review.md','.commands/verify.md',
  '.claude/README.md','.claude/hooks/protect-sensitive.mjs','.claude/settings.example.json',
];

const args=process.argv.slice(2), apply=args.includes('--apply'), ti=args.indexOf('--target');
for(let i=0;i<args.length;i++){if(!['--apply','--target'].includes(args[i])) fail(`Unknown argument: ${args[i]}`,2);if(args[i]==='--target')i++;}
const target=ti>=0?args[ti+1]:'.';
if(!target||target.startsWith('--')) fail('Usage: node scripts/init-project.mjs [--target PATH] [--apply]',2);
const root=path.resolve(target);

try {
  realDirectory(repoRoot,'source repository');
  if(fs.existsSync(root)) realDirectory(root,'target'); else if(apply) safeMkdir(root);
  const pkg=JSON.parse(readRegular(path.join(repoRoot,'package.json'),'package.json').toString('utf8'));
  if(typeof pkg.version!=='string'||!pkg.version) throw new Error('package.json version is missing');
  const generated=[
    builtin('brain/STATE.json',JSON.stringify({project:path.basename(root),status:'PLANNED',active_work_order:null,branch:'main',blocker:null,next_action:'author a work order from templates/WORK-ORDER.md',updated_at:null,schema_version:1},null,2)+'\n'),
    builtin('CURRENT-WORK-ORDER.md','# Current work order\n\nNone active. Author one from `templates/WORK-ORDER.md` and set `brain/STATE.json` to `READY` via the supervisor.\n'),
    builtin('.state/tasks/README.md','# tasks\nVersioned work-order records (canonical states: see spec/state-machine.json).\n'),
    builtin('.state/sessions/README.md','# sessions\nDurable session checkpoints (templates/SESSION-REPORT.md).\n'),
    builtin('.state/evidence/README.md','# evidence\nAppend-only evidence ledger records and manifests.\n'),
    builtin('.state/decisions/README.md','# decisions\nAccepted decisions with evidence pointers.\n'),
    builtin('.state/memory/README.md','# memory\nDurable memory fabric records (proposal-side only; can never mint authority).\n'),
    builtin('.state/assurance/README.md','# assurance\nApprovals, consumed one-shot grants, policy versions. SEPARATE ownership boundary: never writable through memory APIs or general agent file writes.\n'),
    builtin('.state/local/.gitignore','# scratch space; everything here is disposable and never project truth\n*\n!.gitignore\n'),
  ];
  const plan=[...canonicalSources.map(sourceEntry),...generated].sort((a,b)=>a.path.localeCompare(b.path));
  plan.forEach(e=>destination(e.path));
  if(!apply){
    plan.forEach(e=>console.log(`WOULD CREATE: ${e.path}`));
    console.log('WOULD CREATE: INSTALL-MANIFEST.json\n\nDRY RUN — nothing was written. Re-run with --apply to create the layout.');
    process.exit(0);
  }
  const missing=[]; let skipped=0;
  for(const entry of plan){
    const dest=destination(entry.path); safeAncestors(dest);
    if(!fs.existsSync(dest)){missing.push(entry);continue;}
    const bytes=readRegular(dest,entry.path);
    console.log(hash(bytes)===entry.sha256 ? `SKIP (unchanged): ${entry.path}` : `SKIP (exists): ${entry.path} [differs]`); skipped++;
  }
  const manifestPath=destination('INSTALL-MANIFEST.json'); safeAncestors(manifestPath);
  const hasManifest=fs.existsSync(manifestPath);
  if(hasManifest) {
    const previous=JSON.parse(readRegular(manifestPath,'INSTALL-MANIFEST.json').toString('utf8'));
    if(previous.schema_version!==1||previous.source?.repository!==REPOSITORY||previous.source?.version!==pkg.version||!Array.isArray(previous.files)) throw new Error('Existing install manifest source/version/schema mismatch');
    for(const item of previous.files){
      const dest=destination(item.path);
      if(fs.existsSync(dest)&&hash(readRegular(dest,item.path))!==item.sha256) throw new Error(`Existing install manifest is stale: hash mismatch for ${item.path}`);
    }
  }
  let wrote=0;
  for(const entry of missing){
    const dest=destination(entry.path); safeMkdir(path.dirname(dest));
    fs.writeFileSync(dest,entry.bytes,{flag:'wx'}); console.log(`CREATED: ${entry.path}`); wrote++;
  }
  if(!hasManifest){
    // Manifest is last and only reports bytes actually verified at the destination.
    const files=plan.filter(e=>{const d=destination(e.path);return fs.existsSync(d)&&hash(readRegular(d,e.path))===e.sha256;})
      .map(e=>({path:e.path,sha256:e.sha256,source:e.source}));
    const manifest={schema_version:1,source:{repository:REPOSITORY,version:pkg.version},files};
    fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
    console.log('CREATED: INSTALL-MANIFEST.json'); wrote++;
  } else {console.log('SKIP (exists): INSTALL-MANIFEST.json');skipped++;}
  console.log(`\nDone. Created ${wrote} file(s), skipped ${skipped} existing.`);
} catch(error){fail(error.message);}

function clean(p){if(typeof p!=='string'||!p||p.includes('\\')||path.posix.isAbsolute(p)||path.posix.normalize(p)!==p||p==='..'||p.startsWith('../'))throw new Error(`Unsafe install path: ${p}`);return p;}
function destination(p){p=clean(p);const d=path.resolve(root,...p.split('/'));contained(root,d,`destination ${p}`);return d;}
function sourceEntry(p){p=clean(p);const s=path.resolve(repoRoot,...p.split('/'));contained(repoRoot,s,`source ${p}`);const bytes=readRegular(s,p);return {path:p,source:p,bytes,sha256:hash(bytes)};}
function builtin(p,text){p=clean(p);const bytes=Buffer.from(text);return {path:p,source:`builtin:${p}`,bytes,sha256:hash(bytes)};}
function contained(parent,candidate,label){const r=path.relative(parent,candidate);if(r==='..'||r.startsWith(`..${path.sep}`)||path.isAbsolute(r))throw new Error(`${label} escapes its root`);}
function readRegular(p,label){safeAncestors(p);const s=fs.lstatSync(p);if(!s.isFile()||s.isSymbolicLink())throw new Error(`${label} is not a regular file or is a symbolic link/reparse point`);return fs.readFileSync(p);}
function realDirectory(p,label){const s=fs.lstatSync(p);if(!s.isDirectory()||s.isSymbolicLink())throw new Error(`${label} must be a real directory, not a symbolic link or reparse point`);}
function safeAncestors(p){const stop=path.parse(p).root;for(let c=path.dirname(p);c!==stop;c=path.dirname(c))if(fs.existsSync(c)){const s=fs.lstatSync(c);if(s.isSymbolicLink())throw new Error(`Refusing symbolic link or reparse point in path: ${c}`);if(!s.isDirectory())throw new Error(`Path ancestor is not a directory: ${c}`);}}
function safeMkdir(p){safeAncestors(path.join(p,'_'));fs.mkdirSync(p,{recursive:true});realDirectory(p,'destination directory');contained(root,p,'destination directory');}
function hash(bytes){return crypto.createHash('sha256').update(bytes).digest('hex');}
function fail(message,code=1){console.error(message);process.exit(code);}
