#!/usr/bin/env node
import { classifyWritePath } from '../../src/policy/permissions.mjs';
import process from 'node:process';

let payload = '';
process.stdin.on('data', (chunk) => { payload += chunk; });
process.stdin.on('end', () => {
  let filePath = '';
  try { filePath = JSON.parse(payload)?.tool_input?.file_path ?? ''; } catch { process.exit(2); }
  if (!filePath) process.exit(0);
  const result = classifyWritePath(process.env.CLAUDE_PROJECT_DIR || process.cwd(), filePath);
  if (result.decision === 'deny') {
    console.error(`Blocked write: ${result.reason}`);
    process.exit(2);
  }
});
