import { describe, expect, it } from "vitest"
import { activeSummaries, ReportStore, severityOf } from "../src/reports.ts"

const at = (hhmmss: string) => new Date(`2026-09-30T${hhmmss}Z`)

const report = (seenAt: Date, depthCm: number) => ({
  districtId: "lat-phrao",
  landmark: "ปากซอยลาดพร้าว 71",
  depthCm,
  seenAt
})

describe("depth levels", () => {
  it("puts 20 and 21 cm in different levels", () => {
    expect(severityOf(20)).not.toBe(severityOf(21))
  })

  it("puts 50 and 51 cm in different levels", () => {
    expect(severityOf(50)).not.toBe(severityOf(51))
  })
})

describe("same spot, same district", () => {
  it("merges reports within 2 hours into the original report, with the latest depth", () => {
    const store = new ReportStore()
    store.add(report(at("12:00:00"), 20), at("12:00:00"))
    store.add(report(at("14:00:00"), 35), at("14:00:00"))

    const summaries = activeSummaries(store, "lat-phrao", at("14:00:00"))

    expect(summaries).toHaveLength(1)
    expect(summaries[0]).toMatchObject({ depthCm: 35, reportCount: 2 })
  })

  it("starts a new report when the gap is 2 hours and 1 second", () => {
    const store = new ReportStore()
    store.add(report(at("12:00:00"), 20), at("12:00:00"))
    store.add(report(at("14:00:01"), 35), at("14:00:01"))

    expect(activeSummaries(store, "lat-phrao", at("14:00:01"))).toHaveLength(2)
  })
})

describe("report disappearing from the list", () => {
  it("is still listed 6 hours after the latest confirmation", () => {
    const store = new ReportStore()
    store.add(report(at("06:00:00"), 40), at("06:00:00"))

    expect(activeSummaries(store, "lat-phrao", at("12:00:00"))).toHaveLength(1)
  })

  it("is gone once the latest confirmation is more than 6 hours old", () => {
    const store = new ReportStore()
    store.add(report(at("06:00:00"), 40), at("06:00:00"))

    expect(activeSummaries(store, "lat-phrao", at("12:00:01"))).toHaveLength(0)
  })
})
