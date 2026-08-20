// Lease manager: duplicate-run protection keyed by project + work-order + phase.
// Properties under test:
//  - a second acquire on an active lease is denied (duplicate dispatch blocked);
//  - a stale (expired) lease can be taken over, with a strictly increasing
//    fencing token so a zombie holder's writes are distinguishable;
//  - release is holder+token bound (no cross-release).
// TOCTOU note: within one supervisor process this is race-free (synchronous
// check-and-set on a single map + atomic snapshot). Multi-process deployments
// need a real CAS store; that limitation is documented in OPEN-LIMITATIONS.
export class LeaseError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'LeaseError';
    this.code = code;
  }
}

export class LeaseManager {
  /**
   * @param {object} [opts]
   * @param {() => number} [opts.now] clock (ms) — injectable for tests
   * @param {number} [opts.ttlMs] default lease TTL
   * @param {import('../state/event-store.mjs').EventStore} [opts.store] optional persistence
   */
  constructor(opts = {}) {
    this.now = opts.now ?? (() => Date.now());
    this.ttlMs = opts.ttlMs ?? 15 * 60 * 1000;
    this.store = opts.store ?? null;
    /** @type {Map<string, object>} */
    this.leases = new Map();
    this.fencingCounter = 0;
    if (this.store) this.#recover();
  }

  #recover() {
    for (const ev of this.store.all()) {
      if (ev.type === 'lease_acquired') {
        this.leases.set(ev.lease.key, ev.lease);
        this.fencingCounter = Math.max(this.fencingCounter, ev.lease.fencing_token);
      } else if (ev.type === 'lease_released' && this.leases.has(ev.key)) {
        const l = this.leases.get(ev.key);
        if (l.fencing_token === ev.fencing_token) this.leases.delete(ev.key);
      }
    }
  }

  static key(project, workOrderId, phase) {
    return `${project}::${workOrderId}::${phase}`;
  }

  /** Acquire a lease or throw. Stale leases are taken over with a new token. */
  acquire(project, workOrderId, phase, holder) {
    const key = LeaseManager.key(project, workOrderId, phase);
    const existing = this.leases.get(key);
    const nowMs = this.now();
    if (existing && !existing.released) {
      const expired = Date.parse(existing.expires_at) <= nowMs;
      if (!expired) {
        throw new LeaseError(`active lease held by ${existing.holder} until ${existing.expires_at}`, 'LEASE_HELD');
      }
      // stale: fall through to takeover with a HIGHER fencing token
    }
    const lease = {
      key,
      holder,
      fencing_token: ++this.fencingCounter,
      acquired_at: new Date(nowMs).toISOString(),
      expires_at: new Date(nowMs + this.ttlMs).toISOString(),
      released: false,
    };
    this.leases.set(key, lease);
    if (this.store) this.store.append({ type: 'lease_acquired', actor: holder, lease });
    return lease;
  }

  /** Release: only the current holder with the current fencing token may release. */
  release(key, holder, fencingToken) {
    const lease = this.leases.get(key);
    if (!lease || lease.released) throw new LeaseError('no active lease', 'NO_LEASE');
    if (lease.holder !== holder || lease.fencing_token !== fencingToken) {
      throw new LeaseError('release denied: holder/token mismatch (stale holder?)', 'FENCING_MISMATCH');
    }
    lease.released = true;
    this.leases.delete(key);
    if (this.store) this.store.append({ type: 'lease_released', actor: holder, key, fencing_token: fencingToken });
  }

  /** Validate that a write comes from the CURRENT lease holder (fencing check). */
  assertCurrent(key, fencingToken) {
    const lease = this.leases.get(key);
    if (!lease || lease.released) throw new LeaseError('no active lease', 'NO_LEASE');
    if (lease.fencing_token !== fencingToken) {
      throw new LeaseError(`stale fencing token ${fencingToken}; current is ${lease.fencing_token}`, 'STALE_TOKEN');
    }
    if (Date.parse(lease.expires_at) <= this.now()) throw new LeaseError('lease expired', 'LEASE_EXPIRED');
    return lease;
  }

  activeLease(key) {
    const lease = this.leases.get(key);
    if (!lease || lease.released) return null;
    if (Date.parse(lease.expires_at) <= this.now()) return null;
    return lease;
  }
}
