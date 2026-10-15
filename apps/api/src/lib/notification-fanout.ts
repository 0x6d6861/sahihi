/** Open Inbox streams one user may hold in one workspace (one per tab); more get a 429. */
export const MAX_STREAMS_PER_USER = 10

type Listener = () => void

/**
 * Who is waiting for which user's notifications, keyed `<organizationId>:<userId>` like the
 * Postgres payload (ADR 0057). Pure fan-out, no I/O.
 */
export function createFanout() {
  const listeners = new Map<string, Set<Listener>>()
  return {
    /** Adds `fn` under `key`; null when the key already has `max` listeners. */
    subscribe(key: string, fn: Listener, max = MAX_STREAMS_PER_USER): (() => void) | null {
      const set = listeners.get(key) ?? new Set()
      if (set.size >= max) return null
      set.add(fn)
      listeners.set(key, set)
      return () => {
        set.delete(fn)
        if (set.size === 0 && listeners.get(key) === set) listeners.delete(key)
      }
    },
    /** Calls the listeners of one payload; unknown keys are ignored. */
    dispatch(payload: string) {
      for (const fn of [...(listeners.get(payload) ?? [])]) fn()
    },
    /** Calls everyone, after the listener reconnected and may have missed signals. */
    dispatchAll() {
      for (const set of [...listeners.values()]) for (const fn of [...set]) fn()
    },
    get size() {
      return listeners.size
    },
  }
}
