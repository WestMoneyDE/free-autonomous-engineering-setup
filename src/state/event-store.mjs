// Append-only JSONL event store with idempotency keys, atomic snapshots,
// replay-based recovery and corrupt-tail quarantine.
//
// Guarantees under test:
//  - append is idempotent per idempotency_key: a repeated command returns the
//    originally recorded event instead of duplicating the effect;
//  - a corrupt trailing line (partial write after crash) is quarantined and a
//    recovery event is recorded; intact history remains readable;
//  - snapshots are written atomically (tmp + rename), never partially.
import fs from 'node:fs';
import path from 'node:path';
import { sha256Hex, canonicalJson } from '../evidence/hashing.mjs';

export class EventStore {
  /** @param {string} dir directory for the log + snapshots */
  constructor(dir) {
    this.dir = dir;
    this.logPath = path.join(dir, 'events.jsonl');
    this.quarantinePath = path.join(dir, 'events.quarantine.jsonl');
    fs.mkdirSync(dir, { recursive: true });
    /** @type {Map<string, object>} idempotency_key -> event */
    this.byKey = new Map();
    this.events = [];
    this.sequence = 0;
    this.#load();
  }

  #load() {
    if (!fs.existsSync(this.logPath)) return;
    const raw = fs.readFileSync(this.logPath, 'utf8');
    const lines = raw.split('\n').filter((l) => l.length > 0);
    const corrupt = [];
    for (let i = 0; i < lines.length; i++) {
      let ev;
      try {
        ev = JSON.parse(lines[i]);
      } catch {
        // Only a trailing partial line is recoverable; corruption in the
        // middle of the log is a hard integrity failure.
        if (i === lines.length - 1) { corrupt.push(lines[i]); continue; }
        throw new Error(`event log corrupt at line ${i + 1} (non-tail corruption): refusing to guess`);
      }
      this.events.push(ev);
      this.sequence = Math.max(this.sequence, ev.seq ?? 0);
      if (ev.idempotency_key) this.byKey.set(ev.idempotency_key, ev);
    }
    if (corrupt.length) {
      fs.appendFileSync(this.quarantinePath, corrupt.join('\n') + '\n');
      // Rewrite the log without the corrupt tail, atomically.
      const tmp = this.logPath + '.tmp';
      fs.writeFileSync(tmp, this.events.map((e) => JSON.stringify(e)).join('\n') + (this.events.length ? '\n' : ''));
      fs.renameSync(tmp, this.logPath);
      this.append({ type: 'log_recovery', actor: 'event-store', detail: `quarantined ${corrupt.length} corrupt trailing line(s)` });
    }
  }

  /**
   * Append an event. If idempotency_key was seen before, the ORIGINAL event is
   * returned and marked replayed; no new effect is recorded.
   */
  append(event) {
    if (!event || typeof event.type !== 'string' || !event.type) throw new Error('event.type required');
    if (typeof event.actor !== 'string' || !event.actor) throw new Error('event.actor required');
    if (event.idempotency_key && this.byKey.has(event.idempotency_key)) {
      return { ...this.byKey.get(event.idempotency_key), replayed: true };
    }
    const record = {
      ...event,
      seq: ++this.sequence,
      recorded_at: new Date().toISOString(),
    };
    record.event_sha256 = sha256Hex(canonicalJson({ ...record, event_sha256: undefined }));
    fs.appendFileSync(this.logPath, JSON.stringify(record) + '\n');
    this.events.push(record);
    if (record.idempotency_key) this.byKey.set(record.idempotency_key, record);
    return { ...record, replayed: false };
  }

  /** Replay events through a reducer to derive a view. */
  replay(reducer, initial) {
    return this.events.reduce(reducer, initial);
  }

  all() {
    return [...this.events];
  }

  /** Atomic snapshot write (tmp + rename): a crash never leaves a partial file. */
  writeSnapshot(name, value) {
    const p = path.join(this.dir, name);
    const tmp = p + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n');
    fs.renameSync(tmp, p);
    return p;
  }

  readSnapshot(name) {
    const p = path.join(this.dir, name);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  }
}
