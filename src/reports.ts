import { toBangkokIso } from "./time.ts"

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

export type Severity = "wet" | "caution" | "danger"

export type ReportSummary = {
  landmark: string
  depthCm: number
  severity: Severity
  seenAt: string
  reportCount: number
}

/** Reports of one spot closer together than this are one report. */
export const MERGE_WINDOW_MS = 2 * 60 * 60 * 1000
/** A spot disappears from the list this long after its latest confirmation. */
export const LIST_TTL_MS = 6 * 60 * 60 * 1000

export function severityOf(depthCm: number): Severity {
  if (depthCm <= 20) return "wet"
  if (depthCm <= 50) return "caution"
  return "danger"
}

/** One row per spot (same landmark in the district): reports within 2 h of the previous one merge, latest depth wins. */
export function activeSummaries(store: ReportStore, districtId: string, now: Date): ReportSummary[] {
  const byLandmark = new Map<string, Report[]>()
  for (const r of store.listFor(districtId)) {
    byLandmark.set(r.landmark, [...(byLandmark.get(r.landmark) ?? []), r])
  }

  const groups: Report[][] = []
  for (const reports of byLandmark.values()) {
    const sorted = reports.toSorted((a, b) => a.seenAt.getTime() - b.seenAt.getTime())
    let group: Report[] = []
    for (const r of sorted) {
      const previous = group.at(-1)
      if (previous && r.seenAt.getTime() - previous.seenAt.getTime() > MERGE_WINDOW_MS) {
        groups.push(group)
        group = []
      }
      group.push(r)
    }
    groups.push(group)
  }

  return groups
    .map((group) => ({ latest: group.at(-1)!, count: group.length }))
    .filter(({ latest }) => now.getTime() - latest.seenAt.getTime() <= LIST_TTL_MS)
    .sort((a, b) => b.latest.seenAt.getTime() - a.latest.seenAt.getTime())
    .map(({ latest, count }) => ({
      landmark: latest.landmark,
      depthCm: latest.depthCm,
      severity: severityOf(latest.depthCm),
      seenAt: toBangkokIso(latest.seenAt),
      reportCount: count
    }))
}
