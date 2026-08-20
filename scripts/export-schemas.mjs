#!/usr/bin/env node
// Export machine-readable JSON Schema documents derived from the SAME enum
// constants the runtime validators use, so spec/ and src/ cannot drift.
// Regenerate with: npm run export-schemas   (tests fail if the file is stale)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WORK_ORDER_STATES, RISK_CLASSES, ROLES, REVIEW_VERDICTS, CHECK_OUTCOMES,
  EXECUTION_OUTCOMES, PROVIDER_FAILURE_CLASSES, MEMORY_KINDS, AUTHORITY_CLASSES,
  EFFECT_EXTERNALITY, EFFECT_REVERSIBILITY, GATE_VERDICTS, CAPABILITY_STATUSES, BUDGET_POLICIES,
} from '../src/schemas/schemas.mjs';

const sha256hex = { type: 'string', pattern: '^[0-9a-f]{64}$' };
const iso = { type: 'string', format: 'date-time' };
const str = { type: 'string', minLength: 1 };
const arr = (items = {}) => ({ type: 'array', items });

export function buildSchemaDocument() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'free-autonomous-engineering-setup/records.schema.json',
    title: 'Structured record schemas',
    description: 'Generated from src/schemas/schemas.mjs enums. Do not edit by hand; run npm run export-schemas.',
    $defs: {
      enums: {
        workOrderStates: WORK_ORDER_STATES,
        riskClasses: RISK_CLASSES,
        roles: ROLES,
        reviewVerdicts: REVIEW_VERDICTS,
        checkOutcomes: CHECK_OUTCOMES,
        executionOutcomes: EXECUTION_OUTCOMES,
        providerFailureClasses: PROVIDER_FAILURE_CLASSES,
        memoryKinds: MEMORY_KINDS,
        authorityClasses: AUTHORITY_CLASSES,
        effectExternality: EFFECT_EXTERNALITY,
        effectReversibility: EFFECT_REVERSIBILITY,
        gateVerdicts: GATE_VERDICTS,
        capabilityStatuses: CAPABILITY_STATUSES,
        budgetPolicies: BUDGET_POLICIES,
      },
      ProvenanceRef: {
        type: 'object',
        required: ['source', 'kind', 'recorded_at'],
        properties: { source: str, kind: { enum: ['repository', 'session', 'human', 'tool', 'external-document', 'model'] }, recorded_at: iso, ref: str },
      },
      WorkOrder: {
        type: 'object',
        required: ['id', 'project', 'created_at', 'requested_by', 'objective', 'scope', 'out_of_scope', 'acceptance_criteria', 'verification_commands', 'risk_class', 'routing_class', 'budget_policy', 'max_attempts', 'independent_review_required', 'external_effects', 'version'],
        properties: {
          id: str, project: str, created_at: iso, requested_by: str, objective: str,
          scope: arr(str), out_of_scope: arr(str), acceptance_criteria: { ...arr(str), minItems: 1 },
          verification_commands: arr(str), risk_class: { enum: [...RISK_CLASSES] }, routing_class: str,
          budget_policy: { enum: [...BUDGET_POLICIES] }, max_attempts: { type: 'integer', minimum: 1 },
          independent_review_required: { type: 'boolean' }, external_effects: arr(), version: { type: 'integer', minimum: 1 },
        },
      },
      ProjectState: {
        type: 'object',
        required: ['project', 'status', 'updated_at', 'schema_version'],
        properties: { project: str, status: { enum: [...WORK_ORDER_STATES] }, active_work_order: str, branch: str, blocker: str, next_action: str, updated_at: iso, schema_version: { type: 'integer', minimum: 1 } },
      },
      SupervisorLease: {
        type: 'object',
        required: ['key', 'holder', 'fencing_token', 'acquired_at', 'expires_at', 'released'],
        properties: { key: str, holder: str, fencing_token: { type: 'integer', minimum: 1 }, acquired_at: iso, expires_at: iso, released: { type: 'boolean' } },
      },
      ProviderWait: {
        type: 'object',
        required: ['id', 'work_order_id', 'failure_class', 'recorded_at', 'attempt', 'max_attempts'],
        properties: { id: str, work_order_id: str, failure_class: { enum: [...PROVIDER_FAILURE_CLASSES] }, recorded_at: iso, retry_after_seconds: { type: 'number', minimum: 0 }, reset_at: iso, attempt: { type: 'integer', minimum: 1 }, max_attempts: { type: 'integer', minimum: 1 } },
        additionalProperties: false,
      },
      WorkerResult: {
        type: 'object',
        required: ['session_id', 'work_order_id', 'actor', 'role', 'outcome', 'changed_files', 'checks', 'blockers', 'proposed_next_state', 'evidence_refs'],
        properties: { session_id: str, work_order_id: str, actor: str, role: { enum: [...ROLES] }, outcome: { enum: [...CHECK_OUTCOMES] }, changed_files: arr(str), checks: arr({ type: 'object', required: ['name', 'outcome'], properties: { name: str, command: str, outcome: { enum: [...CHECK_OUTCOMES] } } }), blockers: arr(), proposed_next_state: { enum: [...WORK_ORDER_STATES] }, evidence_refs: arr(str), routing_observations: { type: 'object' } },
      },
      ReviewVerdict: {
        type: 'object',
        required: ['id', 'work_order_id', 'reviewer', 'reviewer_role', 'builder', 'verdict', 'diff_ref', 'evidence_refs', 'findings', 'created_at'],
        properties: { id: str, work_order_id: str, reviewer: str, reviewer_role: { enum: ['reviewer', 'security-reviewer'] }, builder: str, verdict: { enum: [...REVIEW_VERDICTS] }, diff_ref: str, evidence_refs: { ...arr(str), minItems: 1 }, findings: arr(), created_at: iso },
      },
      EvidenceRecord: {
        type: 'object',
        required: ['id', 'kind', 'outcome', 'recorded_at', 'actor'],
        properties: { id: str, kind: { enum: ['test', 'typecheck', 'lint', 'build', 'security', 'review', 'manifest', 'external-return', 'recovery', 'other'] }, work_order_id: str, command: str, outcome: { enum: [...CHECK_OUTCOMES] }, content_sha256: sha256hex, recorded_at: iso, actor: str, detail: str },
      },
      MemoryRecord: {
        type: 'object',
        required: ['id', 'kind', 'created_at', 'content', 'source_provenance', 'authority', 'confidence', 'schema_version', 'lineage', 'retention', 'revoked', 'authority_revoked'],
        properties: {
          id: str, kind: { enum: [...MEMORY_KINDS] }, created_at: iso, content: str,
          source_provenance: { $ref: '#/$defs/ProvenanceRef' },
          authority: { type: 'object', required: ['class', 'admissible_uses'], properties: { class: { enum: [...AUTHORITY_CLASSES] }, admissible_uses: arr(str) } },
          confidence: { enum: ['hypothesis', 'observed', 'verified', 'contradicted'] },
          schema_version: { type: 'integer', minimum: 1 },
          lineage: { type: 'object', required: ['derived_from', 'conflicts_with'], properties: { derived_from: arr(str), conflicts_with: arr(str), supersedes: str } },
          retention: { enum: ['session', 'project', 'permanent'] },
          revoked: { type: 'boolean' }, authority_revoked: { type: 'boolean' },
        },
      },
      ConflictRef: { type: 'object', required: ['record_id', 'reason', 'detected_at'], properties: { record_id: str, reason: str, detected_at: iso, resolved: { type: 'boolean' }, resolution_evidence: str } },
      ProcedureRecord: { allOf: [{ $ref: '#/$defs/MemoryRecord' }, { type: 'object', required: ['steps'], properties: { steps: { ...arr(str), minItems: 1 } } }] },
      AssuranceRecord: { type: 'object', required: ['id', 'kind', 'created_at', 'created_by', 'created_by_role', 'payload'], properties: { id: str, kind: { enum: ['approval', 'grant-consumption', 'policy-version', 'reconciliation'] }, created_at: iso, created_by: str, created_by_role: { const: 'human' }, payload: { type: 'object' } } },
      EffectProposal: {
        type: 'object',
        required: ['id', 'work_order_id', 'proposed_by', 'action', 'target', 'parameters', 'evidence_refs', 'created_at'],
        properties: { id: str, work_order_id: str, proposed_by: str, action: str, target: str, parameters: { type: 'object' }, claimed_externality: { enum: [...EFFECT_EXTERNALITY] }, claimed_reversibility: { enum: [...EFFECT_REVERSIBILITY] }, claimed_risk: { enum: [...RISK_CLASSES] }, uncertainty: str, evidence_refs: arr(str), created_at: iso, expires_at: iso },
      },
      ApprovalRequest: { type: 'object', required: ['id', 'proposal_digest', 'action', 'target', 'scope', 'requested_by', 'requested_at'], properties: { id: str, proposal_digest: sha256hex, action: str, target: str, scope: str, requested_by: str, requested_at: iso } },
      ApprovalDecision: { type: 'object', required: ['id', 'request_id', 'proposal_digest', 'scope', 'decision', 'decided_by', 'decided_by_role', 'decided_at', 'expires_at', 'one_shot', 'consumed'], properties: { id: str, request_id: str, proposal_digest: sha256hex, scope: str, decision: { enum: ['APPROVED', 'REJECTED'] }, decided_by: str, decided_by_role: { const: 'human' }, decided_at: iso, expires_at: iso, one_shot: { const: true }, consumed: { type: 'boolean' } } },
      ExecutionResult: { type: 'object', required: ['id', 'proposal_id', 'proposal_digest', 'outcome', 'executed_at', 'retried_automatically'], properties: { id: str, proposal_id: str, proposal_digest: sha256hex, approval_id: str, outcome: { enum: [...EXECUTION_OUTCOMES] }, executed_at: iso, detail: str, retried_automatically: { const: false } } },
      CapabilityRecord: { type: 'object', required: ['name', 'status'], properties: { name: str, status: { enum: [...CAPABILITY_STATUSES] }, implementation: str, evidence: str, source_inspiration: str, limitations: str } },
      RoutingDecision: { type: 'object', required: ['id', 'work_order_id', 'task_class', 'risk_class', 'budget_policy', 'route', 'sticky_session', 'decided_at'], properties: { id: str, work_order_id: str, task_class: str, risk_class: { enum: [...RISK_CLASSES] }, budget_policy: { enum: [...BUDGET_POLICIES] }, route: str, sticky_session: str, decided_at: iso, escalation_reason: str, selected_model: str, failure_class: { enum: [...PROVIDER_FAILURE_CLASSES] } } },
      Session: { type: 'object', required: ['id', 'work_order_id', 'started_at', 'actor', 'role'], properties: { id: str, work_order_id: str, started_at: iso, actor: str, role: { enum: [...ROLES] }, routing_class: str, base_ref: str } },
    },
  };
}

const outPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'spec', 'schemas', 'records.schema.json');
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(buildSchemaDocument(), null, 2) + '\n');
  console.log(`wrote ${outPath}`);
}
