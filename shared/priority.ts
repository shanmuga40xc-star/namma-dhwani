import type { Complaint, ComplaintCategory, SeverityLevel } from './types.ts';

export interface PriorityInput {
  severity: SeverityLevel;
  category: ComplaintCategory;
  upvoteCount: number;
  ageHours: number;
  isNearSchoolOrHospital?: boolean;
}

export interface PriorityResult {
  score: number;
  factors: string[];
}

export interface CommunityDemandInfo {
  tier: 'serious' | 'elevated' | 'standard';
  label: string;
  adminTriageScore: number;
}

/**
 * Transparent rule-based priority scoring with strict ordering invariant:
 * Critical issues NEVER score below High issues, and High NEVER below Medium.
 *
 * Non-overlapping score bands guarantee ordering invariant across any upvote/age values:
 * - Low:      10..29
 * - Medium:   30..54
 * - High:     55..79
 * - Critical: 80..100
 */
export function computePriorityScore(input: PriorityInput): PriorityResult {
  const bands: Record<SeverityLevel, { base: number; maxExtra: number }> = {
    Low: { base: 10, maxExtra: 19 },
    Medium: { base: 30, maxExtra: 24 },
    High: { base: 55, maxExtra: 24 },
    Critical: { base: 80, maxExtra: 20 },
  };

  const catBonusMap: Record<ComplaintCategory, number> = {
    'Water leakage': 6,
    'Broken streetlights': 5,
    Potholes: 5,
    'Garbage accumulation': 4,
    'Other civic issue': 2,
  };

  const band = bands[input.severity] ?? bands.Medium;
  const catPts = catBonusMap[input.category] ?? 3;
  const upvotes = Math.max(0, Math.floor(input.upvoteCount));
  const upvotePts = Math.min(18, upvotes * 3);
  const agePts = Math.min(6, Math.max(0, Math.floor(input.ageHours / 24)));
  const safetyPts = input.isNearSchoolOrHospital ? 4 : 0;

  const extra = Math.min(band.maxExtra, catPts + upvotePts + agePts + safetyPts);
  const score = Math.min(100, Math.max(band.base, band.base + extra));

  const factors = [
    `Severity (${input.severity}): base ${band.base} pts`,
    `Category (${input.category}): +${catPts} pts`,
    `Citizen upvotes (${upvotes}): +${upvotePts} pts`,
    `Open duration (${Math.max(0, Math.round(input.ageHours))}h): +${agePts} pts`,
  ];
  if (safetyPts > 0) {
    factors.push(`Safety-sensitive location: +${safetyPts} pts`);
  }
  if (upvotes >= 5) {
    factors.push(
      `SERIOUS ISSUE — High citizen demand (${upvotes} citizens upvoting): auto-prioritized for urgent admin action`
    );
  } else if (upvotes >= 3) {
    factors.push(
      `High Citizen Demand (${upvotes} upvotes): elevated priority in Admin Portal`
    );
  }

  return { score, factors };
}

/**
 * Computes Admin Portal triage priority taking community upvote demand into account.
 * When multiple citizens upvote/like an issue, it automatically rises in the Admin inbox
 * and is flagged as a Serious / High-Demand issue for immediate action.
 */
export function getCommunityDemandInfo(
  c: Pick<Complaint, 'upvoteCount' | 'priorityScore' | 'severity' | 'status'>
): CommunityDemandInfo {
  const upvotes = Math.max(0, Math.floor(c.upvoteCount || 0));
  const isClosed = c.status === 'CONFIRMED RESOLVED' || c.status === 'Rejected';
  const basePriority = typeof c.priorityScore === 'number' ? c.priorityScore : 30;

  let tier: CommunityDemandInfo['tier'] = 'standard';
  let label = '';
  let boost = upvotes * 4;

  if (upvotes >= 5) {
    tier = 'serious';
    label = `SERIOUS ISSUE · ${upvotes} citizens upvoting — RESOLVE FIRST`;
    boost = 60 + Math.min(40, upvotes * 4);
  } else if (upvotes >= 3) {
    tier = 'elevated';
    label = `High Citizen Demand · ${upvotes} upvotes (Resolve First)`;
    boost = 30 + upvotes * 4;
  }

  const adminTriageScore = isClosed ? basePriority - 100 : basePriority + boost;
  return {
    tier,
    label,
    adminTriageScore,
  };
}
