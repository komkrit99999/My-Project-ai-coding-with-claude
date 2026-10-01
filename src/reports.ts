/** A report stays visible for this long after `seenAt`. */
export const REPORT_TTL_MS = 3 * 60 * 60 * 1000

export type Report = {
  id: string
  districtId: string
  landmark: string
  depthCm: number
  seenAt: Date
  receivedAt: Date
}

export type ReportInput = { districtId: string; landmark: string; depthCm: number; seenAt: Date }

export class ReportStore {
  private reports: Report[] = []

  add(input: ReportInput, now: Date): Report {
    const report: Report = { id: crypto.randomUUID(), ...input, receivedAt: now }
    this.reports.push(report)
    return report
  }

  listFor(districtId: string): Report[] {
    return this.reports.filter((r) => r.districtId === districtId)
  }
}
