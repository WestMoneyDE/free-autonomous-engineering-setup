// Project registry: compact durable supervisor interface per project.
// State is derived from the append-only event log (event sourcing) and
// mirrored into an atomic STATE.json snapshot for cheap reads. After a crash
// the registry rebuilds the identical state by replay — no chat memory needed.
import path from 'node:path';
import { EventStore } from '../state/event-store.mjs';
import { validateProjectState } from '../schemas/schemas.mjs';
import { validateTransition, isTerminal } from './state-machine.mjs';

export class ProjectRegistry {
  constructor(rootDir) {
    this.rootDir = rootDir;
    /** @type {Map<string, EventStore>} */
    this.stores = new Map();
  }

  #store(project) {
    if (!this.stores.has(project)) {
      this.stores.set(project, new EventStore(path.join(this.rootDir, project, '.state')));
    }
    return this.stores.get(project);
  }

  register(project, initial = {}) {
    const store = this.#store(project);
    const existing = this.state(project);
    if (existing) return existing; // idempotent
    store.append({
      type: 'project_registered',
      actor: initial.actor ?? 'supervisor',
      project,
      status: 'PLANNED',
      active_work_order: initial.active_work_order ?? null,
      branch: initial.branch ?? 'main',
    });
    return this.#persistSnapshot(project);
  }

  /** Derive project state by replaying the event log. */
  state(project) {
    const store = this.#store(project);
    const derived = store.replay((acc, ev) => {
      if (ev.type === 'project_registered') {
        return {
          project: ev.project, status: ev.status, active_work_order: ev.active_work_order ?? undefined,
          branch: ev.branch ?? undefined, updated_at: ev.recorded_at, schema_version: 1,
        };
      }
      if (!acc) return acc;
      if (ev.type === 'state_transition') {
        return { ...acc, status: ev.to, blocker: ev.blocker ?? undefined, next_action: ev.next_action ?? undefined, updated_at: ev.recorded_at };
      }
      if (ev.type === 'work_order_activated') {
        return { ...acc, active_work_order: ev.work_order_id, updated_at: ev.recorded_at };
      }
      return acc;
    }, null);
    if (!derived) return null;
    return validateProjectState({ ...derived });
  }

  /**
   * Apply a validated state transition and persist it (event + snapshot).
   * The state machine fails closed; terminal states cannot be exited.
   */
  transition(project, event, context = {}) {
    const current = this.state(project);
    if (!current) throw new Error(`project not registered: ${project}`);
    const { to } = validateTransition(current.status, event, context);
    const store = this.#store(project);
    store.append({
      type: 'state_transition',
      actor: context.actor ?? 'supervisor',
      from: current.status,
      to,
      event,
      blocker: context.evidence?.blocker_record ?? null,
      next_action: context.next_action ?? null,
      idempotency_key: context.idempotency_key,
    });
    return this.#persistSnapshot(project);
  }

  activateWorkOrder(project, workOrderId, actor = 'supervisor') {
    const current = this.state(project);
    if (!current) throw new Error(`project not registered: ${project}`);
    if (current.active_work_order && !isTerminal(current.status)) {
      if (current.active_work_order !== workOrderId) {
        throw new Error(`project has non-terminal active work order ${current.active_work_order}; close it first`);
      }
    }
    this.#store(project).append({ type: 'work_order_activated', actor, work_order_id: workOrderId });
    return this.#persistSnapshot(project);
  }

  #persistSnapshot(project) {
    const state = this.state(project);
    this.#store(project).writeSnapshot('STATE.json', state);
    return state;
  }

  /** Crash-recovery check: replayed state must equal the stored snapshot. */
  verifyRecovery(project) {
    const snapshot = this.#store(project).readSnapshot('STATE.json');
    const replayed = this.state(project);
    return JSON.stringify(snapshot) === JSON.stringify(replayed);
  }
}
