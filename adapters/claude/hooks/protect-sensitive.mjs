#!/usr/bin/env node
// Claude Code PreToolUse hook: delegates to the harness-neutral core policy.
import { classifyWritePath } from '../../../src/policy/permissions.mjs';
import process from 'node:process';

let payload = '';
process.stdin.on('data', (d) => { payload += d; });
process.stdin.on('end', () => {
  let filePath = '';
  try { filePath = JSON.parse(payload)?.tool_input?.file_path ?? ''; } catch { /* fall through */ }
  if (!filePath) process.exit(0);
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const { decision, reason } = classifyWritePath(root, filePath);
  if (decision === 'deny') {
    console.error(`Blocked write: ${reason}`);
    process.exit(2);
  }
  process.exit(0);
});
