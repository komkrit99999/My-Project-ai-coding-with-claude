export type Hit = { allowed: true } | { allowed: false; retryAfterSeconds: number }

/**
 * Sliding-window limit per key (the client IP). In memory, like the report store.
 * Refused hits are not recorded, so someone who keeps retrying is not blocked for longer.
 * Keys are dropped once all their hits age out, so IPs are not held longer than the window.
 */
export class RateLimiter {
  readonly #hits = new Map<string, number[]>()

  constructor(
    readonly limit: number,
    readonly windowMs: number
  ) {}

  hit(key: string, now: Date): Hit {
    this.#forgetOld(now)
    const t = now.getTime()
    const hits = this.#hits.get(key) ?? []
    if (hits.length >= this.limit) {
      const oldest = hits[0] as number
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((oldest + this.windowMs - t) / 1000)) }
    }
    hits.push(t)
    this.#hits.set(key, hits)
    return { allowed: true }
  }

  /** How many keys are held, for tests. */
  get size(): number {
    return this.#hits.size
  }

  #forgetOld(now: Date): void {
    const cutoff = now.getTime() - this.windowMs
    for (const [key, hits] of this.#hits) {
      const fresh = hits.filter((h) => h > cutoff)
      if (fresh.length === 0) this.#hits.delete(key)
      else this.#hits.set(key, fresh)
    }
  }
}
