#!/usr/bin/env node
import { classifyCommand, classifyWritePath } from '../../src/policy/permissions.mjs';
import process from 'node:process';

let payload = '';
process.stdin.on('data', (chunk) => { payload += chunk; });
process.stdin.on('end', () => {
  const deny = (reason) => { console.error(`Blocked operation: ${reason}`); process.exit(2); };
  let event;
  try { event = JSON.parse(payload); } catch { return deny('malformed hook JSON'); }
  const tool = event?.tool_name;
  const input = event?.tool_input;
  if (typeof tool !== 'string' || !input || typeof input !== 'object' || Array.isArray(input)) return deny('unrecognized hook payload');
  if (tool === 'Bash' || tool === 'Shell') {
    if (typeof input.command !== 'string' || !input.command.trim()) return deny('shell command must be a nonempty string');
    const result = classifyCommand(input.command);
    if (result.decision === 'deny') return deny(result.reason);
    return;
  }
  let paths;
  if (tool === 'Write' || tool === 'Edit') paths = [input.file_path];
  else if (tool === 'MultiEdit' && Array.isArray(input.edits)) paths = input.edits.map((edit) => edit?.file_path ?? edit?.path);
  else if (tool === 'MultiEdit' && Array.isArray(input.file_paths)) paths = input.file_paths;
  else return deny(`unsupported matched tool shape: ${String(tool)}`);
  if (!paths.length || paths.some((filePath) => typeof filePath !== 'string' || !filePath.trim())) return deny('every write path must be a nonempty string');
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  for (const filePath of paths) {
    const result = classifyWritePath(root, filePath);
    if (result.decision !== 'allow') return deny(result.reason);
  }
});
