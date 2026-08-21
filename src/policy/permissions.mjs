// Harness-neutral deterministic permission engine: allow / ask / deny for
// file paths and shell commands. This is the core policy layer; harness
// adapters (adapters/claude, DSH plugin config, future harnesses) translate
// it into their own hook formats. Policy is enforced in code, not prompts.
import path from 'node:path';
import { evaluateScopeRequest } from './scope-engine.mjs';

export const SENSITIVE_PATH_PATTERNS = Object.freeze([
  /(^|\/)\.env($|\.|\/)/i,
  /(^|\/)\.ssh(\/|$)/,
  /\.(pem|key|p12|pfx)$/i,
  /(^|\/)(id_rsa|id_ed25519)(\.|$)/,
  /(^|\/)credentials?(\/|$|\.)/i,
  /(^|\/)secrets?(\/|$|\.)/i,
  /(^|\/)\.aws(\/|$)/,
  /(^|\/)\.gnupg(\/|$)/,
]);

const DENY_COMMANDS = Object.freeze([
  /^git\s+push\s+(--force|-f|--force-with-lease)\b/,
  /^git\s+reset\s+--hard\b/,
  /^npm\s+publish\b/,
  /^terraform\s+(apply|destroy)\b/,
  /(^|\s)rm\s+-rf\s+\/(\s|$)/,
]);

const ASK_COMMANDS = Object.freeze([
  /^git\s+push\b/,
  /^git\s+merge\b.*\b(main|master|release)/,
  /^gh\s+(pr|issue|release)\b/,
  /^curl\b.*\b(-d|--data|-F|--form|-T|--upload-file)\b/,
  /^ssh\b/,
  /^scp\b/,
  /^docker\s+push\b/,
  /^kubectl\s+(apply|delete|scale)\b/,
]);

const ALLOW_COMMANDS = Object.freeze([
  /^git\s+(status|diff|log|show|branch)\b/,
  /^(ls|cat|head|tail|grep|find|wc)\b/,
  /^node\b/,
  /^npm\s+(test|run\s+verify|run\s+lint|ci)\b/,
]);

/**
 * Classify a filesystem write path relative to a repo root.
 * Returns { decision: 'allow'|'deny', reason }.
 * Denies: sensitive paths and traversal outside the root.
 */
export function classifyWritePath(root, targetPath) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, targetPath);
  if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) {
    return { decision: 'deny', reason: `path traversal outside repository root: ${targetPath}` };
  }
  const rel = (path.relative(resolvedRoot, resolved) || '.').replaceAll(path.sep, '/');
  // .env.example is the one intentional exception (committed template).
  if (/(^|\/)\.env\.example$/.test(rel)) return { decision: 'allow', reason: 'env example template' };
  for (const p of SENSITIVE_PATH_PATTERNS) {
    if (p.test(rel)) return { decision: 'deny', reason: `sensitive path blocked by pattern ${p}` };
  }
  if (/(^|\/)\.state\/assurance(\/|$)/.test(rel)) {
    return { decision: 'deny', reason: 'assurance state is not writable through general file operations' };
  }
  return { decision: 'allow', reason: 'inside repository, not sensitive' };
}

/** Classify a shell command: deny > ask > allow > ask (default-unknown = ask). */
export function classifyCommand(command) {
  const c = command.trim();
  for (const p of DENY_COMMANDS) if (p.test(c)) return { decision: 'deny', reason: `denied by policy pattern ${p}` };
  for (const p of ASK_COMMANDS) if (p.test(c)) return { decision: 'ask', reason: `externally visible / hard to reverse: ${p}` };
  for (const p of ALLOW_COMMANDS) if (p.test(c)) return { decision: 'allow', reason: 'routine local reversible operation' };
  return { decision: 'ask', reason: 'unclassified command defaults to ask (fail closed)' };
}

export function classifyScopedOperation({ root, path: requestedPath, command, scopeDecision, request }) {
  const checked = evaluateScopeRequest(scopeDecision, request);
  if (checked.verdict === 'DENY' || checked.verdict === 'DEFER') {
    return { decision: 'deny', reason: `scope denied: ${(checked.reasons ?? ['unresolved scope']).join('; ')}` };
  }
  const pathDecision = classifyWritePath(root, requestedPath);
  if (pathDecision.decision !== 'allow') return pathDecision;
  return classifyCommand(command);
}

/** Scan text for credential-looking content before it leaves the boundary. */
export function scanForSecrets(text) {
  const findings = [];
  const patterns = [
    { name: 'private-key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
    { name: 'aws-access-key', re: /\bAKIA[0-9A-Z]{16}\b/ },
    { name: 'github-token', re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
    { name: 'generic-api-key', re: /\b(api[_-]?key|secret[_-]?key|access[_-]?token)\b\s*[:=]\s*['"][^'"]{12,}['"]/i },
    { name: 'bearer-token', re: /\bBearer\s+[A-Za-z0-9\-_.]{20,}\b/ },
  ];
  for (const { name, re } of patterns) {
    if (re.test(text)) findings.push(name);
  }
  return { clean: findings.length === 0, findings };
}
