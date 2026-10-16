import type { FresaReport } from './chequeoFresa';
export type PassView = 'primary' | 'fine' | 'preferred';

export function reportForPass(report: FresaReport, view: PassView): FresaReport {
  const passes = report.passes;
  const check = view === 'primary' ? passes?.primary : view === 'preferred' ? passes?.preferredFine : report.check;
  const profile = view === 'primary' ? passes?.primaryProfile
    : view === 'preferred' && passes ? { ...report.profile, minDepthMm: passes.fineReference.preferredMm } : report.profile;
  if (!check || !profile) return report;
  const counts = { alta: 0, media: 0, baja: 0 };
  const groupCounts = { alta: 0, media: 0, baja: 0 };
  check.zones.forEach((z) => counts[z.severity]++);
  check.groups.forEach((g) => groupCounts[g.severity]++);
  return { ...report, check, profile, counts, groupCounts, status: counts.alta + counts.media ? 'revisar' : 'ok' };
}
