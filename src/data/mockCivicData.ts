import {
  AchievementLevel,
  CitizenStats,
  FieldCrew,
  IncidentCategory,
  IncidentStatus,
  NagrikBadge,
  SlaPolicyRule,
  WardSummary,
  WelfareProgrammeType,
} from '../types/civic';

export const INITIAL_WARDS: WardSummary[] = [
  {
    wardNumber: 1,
    name: 'Harbor & Civic Center',
    councilDistrict: 'District A',
    population: 42800,
    allocatedBudgetInr: 14800000,
    spentBudgetInr: 9820000,
    slaCompliancePct: null,
    gridPath: 'M 20,20 L 145,20 L 160,95 L 95,120 L 20,105 Z',
    labelX: 84,
    labelY: 66,
  },
  {
    wardNumber: 2,
    name: 'Northgate Commons',
    councilDistrict: 'District A',
    population: 38400,
    allocatedBudgetInr: 11200000,
    spentBudgetInr: 7450000,
    slaCompliancePct: null,
    gridPath: 'M 145,20 L 285,20 L 275,105 L 160,95 Z',
    labelX: 215,
    labelY: 62,
  },
  {
    wardNumber: 3,
    name: 'Eastside Rail Corridor',
    councilDistrict: 'District B',
    population: 51200,
    allocatedBudgetInr: 16900000,
    spentBudgetInr: 12900000,
    slaCompliancePct: null,
    gridPath: 'M 285,20 L 420,20 L 420,115 L 275,105 Z',
    labelX: 350,
    labelY: 66,
  },
  {
    wardNumber: 4,
    name: 'Westminster Terrace',
    councilDistrict: 'District C',
    population: 34900,
    allocatedBudgetInr: 9800000,
    spentBudgetInr: 6100000,
    slaCompliancePct: null,
    gridPath: 'M 20,105 L 95,120 L 110,205 L 20,210 Z',
    labelX: 60,
    labelY: 162,
  },
  {
    wardNumber: 5,
    name: 'Midtown Exchange',
    councilDistrict: 'District A',
    population: 61500,
    allocatedBudgetInr: 18500000,
    spentBudgetInr: 14120000,
    slaCompliancePct: null,
    gridPath: 'M 95,120 L 160,95 L 275,105 L 265,195 L 110,205 Z',
    labelX: 185,
    labelY: 150,
  },
  {
    wardNumber: 6,
    name: 'Foundry District',
    councilDistrict: 'District B',
    population: 44100,
    allocatedBudgetInr: 13400000,
    spentBudgetInr: 10950000,
    slaCompliancePct: null,
    gridPath: 'M 275,105 L 420,115 L 420,215 L 265,195 Z',
    labelX: 345,
    labelY: 158,
  },
  {
    wardNumber: 7,
    name: 'Southbay Industrial',
    councilDistrict: 'District D',
    population: 29800,
    allocatedBudgetInr: 12100000,
    spentBudgetInr: 8900000,
    slaCompliancePct: null,
    gridPath: 'M 20,210 L 110,205 L 135,300 L 20,300 Z',
    labelX: 72,
    labelY: 256,
  },
  {
    wardNumber: 8,
    name: 'Oakridge & Reservoir',
    councilDistrict: 'District C',
    population: 47300,
    allocatedBudgetInr: 11900000,
    spentBudgetInr: 7800000,
    slaCompliancePct: null,
    gridPath: 'M 110,205 L 265,195 L 285,300 L 135,300 Z',
    labelX: 198,
    labelY: 252,
  },
  {
    wardNumber: 9,
    name: 'Cedar Crossing',
    councilDistrict: 'District D',
    population: 39600,
    allocatedBudgetInr: 10500000,
    spentBudgetInr: 6950000,
    slaCompliancePct: null,
    gridPath: 'M 265,195 L 420,215 L 420,300 L 285,300 Z',
    labelX: 346,
    labelY: 256,
  },
];

export const NEW_USER_WARDS: WardSummary[] = INITIAL_WARDS.map((ward) => ({
  ...ward,
  allocatedBudgetInr: 0,
  spentBudgetInr: 0,
  slaCompliancePct: null,
}));

export const INITIAL_CREWS: FieldCrew[] = [
  {
    id: 'CREW-W1',
    name: 'Hydraulics Unit Alpha',
    division: 'Water Leakage & Pipelines',
    leadOfficer: 'M. Deshmukh',
    assignedWardNumber: 1,
    activeTickets: 0,
    maxCapacity: 5,
    radioChannel: 'CH-04',
    status: 'STANDBY',
  },
  {
    id: 'CREW-R2',
    name: 'Roadway & Pothole Squad B',
    division: 'Public Works',
    leadOfficer: 'R. Nair',
    assignedWardNumber: 3,
    activeTickets: 0,
    maxCapacity: 5,
    radioChannel: 'CH-07',
    status: 'STANDBY',
  },
  {
    id: 'CREW-S4',
    name: 'Solid Waste Clearance 4',
    division: 'Sanitation Ops',
    leadOfficer: 'D. Kulkarni',
    assignedWardNumber: 6,
    activeTickets: 0,
    maxCapacity: 5,
    radioChannel: 'CH-09',
    status: 'STANDBY',
  },
  {
    id: 'CREW-L5',
    name: 'Streetlight & Grid Team 2',
    division: 'Electrical Services',
    leadOfficer: 'S. Iyer',
    assignedWardNumber: 2,
    activeTickets: 0,
    maxCapacity: 4,
    radioChannel: 'CH-05',
    status: 'STANDBY',
  },
];

export const NEW_USER_CREWS: FieldCrew[] = INITIAL_CREWS.map((crew) => ({
  ...crew,
  activeTickets: 0,
  status: 'STANDBY',
}));

export const INITIAL_SLA_POLICIES: SlaPolicyRule[] = [
  {
    category: IncidentCategory.WaterLeakage,
    responseTargetHours: 2,
    resolutionTargetHours: 12,
    autoEscalateAtPct: 75,
    statutoryMandate: 'Municipal Water Charter §14.2',
    compliance30dPct: null,
    autoDispatchEnabled: true,
  },
  {
    category: IncidentCategory.Potholes,
    responseTargetHours: 12,
    resolutionTargetHours: 48,
    autoEscalateAtPct: 80,
    statutoryMandate: 'Public Works Roadway §8.1',
    compliance30dPct: null,
    autoDispatchEnabled: false,
  },
  {
    category: IncidentCategory.GarbageAccumulation,
    responseTargetHours: 6,
    resolutionTargetHours: 24,
    autoEscalateAtPct: 75,
    statutoryMandate: 'Solid Waste Management Rule §3.4',
    compliance30dPct: null,
    autoDispatchEnabled: true,
  },
  {
    category: IncidentCategory.BrokenStreetlights,
    responseTargetHours: 12,
    resolutionTargetHours: 48,
    autoEscalateAtPct: 85,
    statutoryMandate: 'Civic Illumination Std §5.4',
    compliance30dPct: null,
    autoDispatchEnabled: false,
  },
];

export const NEW_USER_SLA_POLICIES: SlaPolicyRule[] = INITIAL_SLA_POLICIES.map((rule) => ({
  ...rule,
  responseTargetHours: null,
  resolutionTargetHours: null,
  autoEscalateAtPct: null,
  statutoryMandate: 'Pending policy setup',
  compliance30dPct: null,
  autoDispatchEnabled: false,
}));

export function formatSlaCountdown(hoursRemaining: number, status: IncidentStatus): string {
  if (status === IncidentStatus.Verified || status === IncidentStatus.Resolved) {
    return status === IncidentStatus.Verified ? 'Citizen Verified' : 'Awaiting Citizen Check';
  }
  if (hoursRemaining < 0) {
    const overdue = Math.abs(hoursRemaining);
    return `Overdue ${overdue.toFixed(1)}h`;
  }
  if (hoursRemaining < 1) {
    return `${Math.max(1, Math.round(hoursRemaining * 60))}m left`;
  }
  return `${hoursRemaining.toFixed(1)}h left`;
}

export function formatCurrencyCompact(amount: number): string {
  if (amount <= 0) {
    return '₹0';
  }
  if (amount >= 10_000_000) {
    return `₹${(amount / 10_000_000).toFixed(2)} Cr`;
  }
  if (amount >= 100_000) {
    return `₹${(amount / 100_000).toFixed(2)} L`;
  }
  if (amount >= 1_000) {
    return `₹${Math.round(amount / 1000)}K`;
  }
  return `₹${amount.toLocaleString('en-IN')}`;
}

export const BENGALURU_LOCALITIES: string[] = [
  'Indiranagar',
  'Koramangala',
  'Jayanagar',
  'Malleswaram',
  'Whitefield',
  'HSR Layout',
  'Yelahanka',
  'Rajajinagar',
  'Basavanagudi',
  'Hebbal',
  'Marathahalli',
  'Electronic City',
];

export const BENGALURU_LOCALITY_COORDS: Record<string, { lat: number; lng: number }> = {
  Indiranagar: { lat: 12.9784, lng: 77.6408 },
  Koramangala: { lat: 12.9352, lng: 77.6245 },
  Jayanagar: { lat: 12.9299, lng: 77.5838 },
  Malleswaram: { lat: 13.0031, lng: 77.5643 },
  Whitefield: { lat: 12.9698, lng: 77.7499 },
  'HSR Layout': { lat: 12.9121, lng: 77.6446 },
  Yelahanka: { lat: 13.1007, lng: 77.5963 },
  Rajajinagar: { lat: 12.9982, lng: 77.553 },
  Basavanagudi: { lat: 12.9406, lng: 77.5738 },
  Hebbal: { lat: 13.0354, lng: 77.5971 },
  Marathahalli: { lat: 12.9591, lng: 77.6974 },
  'Electronic City': { lat: 12.8452, lng: 77.6602 },
};

export const BENGALURU_WARD_COORDS: Record<number, { lat: number; lng: number }> = {
  1: { lat: 12.9716, lng: 77.5946 },
  2: { lat: 13.0358, lng: 77.597 },
  3: { lat: 12.9784, lng: 77.6408 },
  4: { lat: 12.9982, lng: 77.553 },
  5: { lat: 12.9756, lng: 77.6066 },
  6: { lat: 12.9698, lng: 77.7499 },
  7: { lat: 12.8452, lng: 77.6602 },
  8: { lat: 12.9299, lng: 77.5838 },
  9: { lat: 12.9352, lng: 77.6245 },
};

export const NAGRIK_POINTS_SCHEDULE = {
  RESOLVED_COMPLAINT: 50,
  HIGH_SEVERITY_BONUS: 20,
  CRITICAL_SEVERITY_BONUS: 40,
  INDEPENDENT_VERIFICATION: 15,
  VALID_DUPLICATE: 5,
  ACCEPTED_ADDITIONAL_INFO: 5,
  CIVIC_ACTIVITY_VERIFIED: 10,
} as const;

export const ACHIEVEMENT_LEVEL_META: Array<{
  level: AchievementLevel;
  minPoints: number;
  maxPoints: number | null;
  summary: string;
}> = [
  {
    level: 'Bronze Citizen',
    minPoints: 0,
    maxPoints: 99,
    summary: 'Entry civic contributor participating in Bengaluru ward reporting.',
  },
  {
    level: 'Silver Citizen',
    minPoints: 100,
    maxPoints: 299,
    summary: 'Consistent verified reporter and community verification partner.',
  },
  {
    level: 'Gold Citizen',
    minPoints: 300,
    maxPoints: 699,
    summary: 'High-impact neighborhood steward driving verified issue closures.',
  },
  {
    level: 'Platinum Citizen',
    minPoints: 700,
    maxPoints: null,
    summary: 'Top-tier Bengaluru civic leader with sustained verified contributions.',
  },
];

export const NAGRIK_BADGE_CATALOG: Array<{
  badge: NagrikBadge;
  criteria: string;
}> = [
  {
    badge: 'Civic Starter',
    criteria: 'At least 1 verified resolved complaint or 5 verified civic points.',
  },
  {
    badge: 'Community Helper',
    criteria: 'Useful additional info accepted by Admin or locality drive participation.',
  },
  {
    badge: 'Clean Bengaluru Champion',
    criteria: '2+ verified resolved Garbage accumulation complaints.',
  },
  {
    badge: 'Road Safety Champion',
    criteria: '2+ verified resolved Potholes or Broken streetlights complaints.',
  },
  {
    badge: 'Water Conservation Contributor',
    criteria: '1+ verified resolved Water leakage complaint.',
  },
  {
    badge: 'Resolution Verification Champion',
    criteria: '2+ independent resolution verifications confirmed.',
  },
  {
    badge: 'Duplicate Detection Expert',
    criteria: '1+ valid duplicate identification confirmed by Admin.',
  },
  {
    badge: 'Bengaluru Civic Hero',
    criteria: '700+ verified points or 5+ verified resolutions with 2+ independent verifications.',
  },
];

export const WELFARE_PROGRAMME_TYPES: WelfareProgrammeType[] = [
  'Student Education Scholarship',
  'Student Welfare Assistance',
  'Civic Contribution Recognition Award',
  'Community Development Support',
  'Special Citizen Assistance',
];

export function computeAchievementLevel(totalPoints: number): AchievementLevel {
  if (totalPoints >= 700) return 'Platinum Citizen';
  if (totalPoints >= 300) return 'Gold Citizen';
  if (totalPoints >= 100) return 'Silver Citizen';
  return 'Bronze Citizen';
}

export function computeEarnedBadges(
  stats: Pick<
    CitizenStats,
    | 'totalPoints'
    | 'resolvedCount'
    | 'independentVerificationsCount'
    | 'validDuplicatesCount'
    | 'acceptedInfoCount'
    | 'activitiesParticipatedCount'
    | 'potholesResolved'
    | 'garbageResolved'
    | 'waterResolved'
    | 'streetlightsResolved'
  >
): NagrikBadge[] {
  const earned: NagrikBadge[] = [];
  if (stats.resolvedCount >= 1 || stats.totalPoints >= 5) {
    earned.push('Civic Starter');
  }
  if (stats.acceptedInfoCount >= 1 || stats.activitiesParticipatedCount >= 1) {
    earned.push('Community Helper');
  }
  if (stats.garbageResolved >= 2) {
    earned.push('Clean Bengaluru Champion');
  }
  if (stats.potholesResolved + stats.streetlightsResolved >= 2) {
    earned.push('Road Safety Champion');
  }
  if (stats.waterResolved >= 1) {
    earned.push('Water Conservation Contributor');
  }
  if (stats.independentVerificationsCount >= 2) {
    earned.push('Resolution Verification Champion');
  }
  if (stats.validDuplicatesCount >= 1) {
    earned.push('Duplicate Detection Expert');
  }
  if (
    stats.totalPoints >= 700 ||
    (stats.resolvedCount >= 5 && stats.independentVerificationsCount >= 2)
  ) {
    earned.push('Bengaluru Civic Hero');
  }
  return earned.slice(0, 8);
}

export function getPeriodKeys(date = new Date()): {
  monthKey: string;
  quarterKey: string;
  yearKey: string;
} {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const q = Math.floor(date.getMonth() / 3) + 1;
  return {
    monthKey: `${year}-${month}`,
    quarterKey: `${year}-Q${q}`,
    yearKey: String(year),
  };
}

