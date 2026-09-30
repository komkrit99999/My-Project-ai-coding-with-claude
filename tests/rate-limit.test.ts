import { describe, expect, it } from "vitest"
import { RateLimiter } from "../src/rate-limit.ts"

const t0 = new Date("2026-09-30T12:30:00Z")
const after = (ms: number) => new Date(t0.getTime() + ms)
const TEN_MIN = 10 * 60_000

describe("RateLimiter", () => {
  // RPT-REQ-011 AC1, AC2
  it("allows 5 hits in the window and refuses the 6th with a whole-second retry", () => {
    const limiter = new RateLimiter(5, TEN_MIN)
    for (let i = 0; i < 5; i++) expect(limiter.hit("1.2.3.4", after(i * 1000))).toEqual({ allowed: true })
    expect(limiter.hit("1.2.3.4", after(5000))).toEqual({ allowed: false, retryAfterSeconds: 595 })
  })

  it("rounds the retry up, never down to 0", () => {
    const limiter = new RateLimiter(1, TEN_MIN)
    limiter.hit("ip", t0)
    expect(limiter.hit("ip", after(TEN_MIN - 1))).toEqual({ allowed: false, retryAfterSeconds: 1 })
  })

  // RPT-REQ-011 AC3
  it("counts each key on its own", () => {
    const limiter = new RateLimiter(1, TEN_MIN)
    expect(limiter.hit("a", t0).allowed).toBe(true)
    expect(limiter.hit("b", t0).allowed).toBe(true)
    expect(limiter.hit("a", t0).allowed).toBe(false)
  })

  // RPT-REQ-011 AC4 (exactly 10 minutes after the first hit is allowed again)
  it("frees a slot once the oldest hit is a full window old", () => {
    const limiter = new RateLimiter(1, TEN_MIN)
    limiter.hit("ip", t0)
    expect(limiter.hit("ip", after(TEN_MIN)).allowed).toBe(true)
  })

  // Decision (review item 17): refused hits do not extend the block.
  it("does not count refused hits", () => {
    const limiter = new RateLimiter(1, TEN_MIN)
    limiter.hit("ip", t0)
    for (let i = 1; i <= 20; i++) limiter.hit("ip", after(i * 1000))
    expect(limiter.hit("ip", after(TEN_MIN)).allowed).toBe(true)
  })

  // RPT-REQ-012 AC2
  it("forgets keys whose hits have all aged out", () => {
    const limiter = new RateLimiter(5, TEN_MIN)
    limiter.hit("1.2.3.4", t0)
    limiter.hit("5.6.7.8", after(TEN_MIN))
    expect(limiter.size).toBe(1)
  })
})
