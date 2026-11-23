import type {
  AgencyContact,
  ComplaintCategory,
  ComplaintStatus,
  ConstituencyBoundary,
  SeverityLevel,
  SupportedLanguage,
  WelfareBenefit,
} from './types.ts';

export const APP_TAGLINE = 'Your Voice. Your City. Your Impact.';

/**
 * Entire Karnataka bounding box for state-wide service-area enforcement.
 * Coordinates outside this envelope are rejected as "outside service area".
 */
export const KARNATAKA_BOUNDS = {
  south: 11.500,
  west: 74.000,
  north: 18.550,
  east: 78.650,
  centerLat: 12.9716,
  centerLng: 77.5946,
} as const;

/**
 * Bengaluru metropolitan bounding box (used for Bengaluru constituency grid defaults).
 */
export const BENGALURU_BOUNDS = {
  south: 12.800,
  west: 77.440,
  north: 13.160,
  east: 77.800,
  centerLat: 12.9716,
  centerLng: 77.5946,
} as const;

export const SUPPORTED_LANGUAGES: Array<{
  code: SupportedLanguage;
  name: string;
  nativeName: string;
  speechLang: string;
}> = [
  { code: 'en', name: 'English', nativeName: 'English', speechLang: 'en-IN' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', speechLang: 'kn-IN' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', speechLang: 'hi-IN' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', speechLang: 'ta-IN' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', speechLang: 'te-IN' },
];

export const COMPLAINT_CATEGORIES: ComplaintCategory[] = [
  'Potholes',
  'Garbage accumulation',
  'Water leakage',
  'Broken streetlights',
  'Other civic issue',
];

export const SEVERITY_LEVELS: SeverityLevel[] = ['Low', 'Medium', 'High', 'Critical'];

export const STATUS_COLORS: Record<
  ComplaintStatus,
  { bg: string; text: string; border: string; label: string }
> = {
  Reported: {
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    border: 'border-slate-300',
    label: 'Reported',
  },
  Acknowledged: {
    bg: 'bg-blue-50',
    text: 'text-blue-800',
    border: 'border-blue-300',
    label: 'Acknowledged',
  },
  'In progress': {
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    border: 'border-amber-300',
    label: 'In progress',
  },
  'Fixed, awaiting confirmation': {
    bg: 'bg-amber-100',
    text: 'text-amber-900',
    border: 'border-amber-400',
    label: 'Fixed, awaiting confirmation',
  },
  'CONFIRMED RESOLVED': {
    bg: 'bg-emerald-50',
    text: 'text-emerald-800',
    border: 'border-emerald-400',
    label: 'CONFIRMED RESOLVED',
  },
  Reopened: {
    bg: 'bg-red-50',
    text: 'text-red-800',
    border: 'border-red-300',
    label: 'Reopened',
  },
  Rejected: {
    bg: 'bg-slate-100',
    text: 'text-slate-600',
    border: 'border-slate-300',
    label: 'Rejected',
  },
  Unattended: {
    bg: 'bg-red-900',
    text: 'text-white',
    border: 'border-red-950',
    label: 'Unattended',
  },
};

export const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const ALLOWED_AUDIO_MIME_TYPES = [
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
];

/**
 * DEMO MODE ONLY: 9 neutral 3x3 rectangular grid zones spanning Bengaluru.
 * Clearly labelled DEMO with fictional "Demo Member A..I" and @example.com emails.
 * Replaced via Super Admin CSV/GeoJSON import when switching to live official data.
 */
export const DEMO_CONSTITUENCIES: ConstituencyBoundary[] = [
  {
    id: 'demo-const-1',
    name: 'Bengaluru North-West [DEMO]',
    code: 'DEMO-BLR-01',
    bounds: { south: 13.040, west: 77.440, north: 13.160, east: 77.560 },
    mlaName: 'Demo Member A',
    mlaOfficeEmail: 'mla-demo-1@example.com',
    officeContactNote: 'Demo Office Zone 1 (no phone)',
    lastVerifiedDate: '2026-01-01',
    isDemo: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'demo-const-2',
    name: 'Bengaluru North-Central [DEMO]',
    code: 'DEMO-BLR-02',
    bounds: { south: 13.040, west: 77.560, north: 13.160, east: 77.680 },
    mlaName: 'Demo Member B',
    mlaOfficeEmail: 'mla-demo-2@example.com',
    officeContactNote: 'Demo Office Zone 2 (no phone)',
    lastVerifiedDate: '2026-01-01',
    isDemo: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'demo-const-3',
    name: 'Bengaluru North-East [DEMO]',
    code: 'DEMO-BLR-03',
    bounds: { south: 13.040, west: 77.680, north: 13.160, east: 77.800 },
    mlaName: 'Demo Member C',
    mlaOfficeEmail: 'mla-demo-3@example.com',
    officeContactNote: 'Demo Office Zone 3 (no phone)',
    lastVerifiedDate: '2026-01-01',
    isDemo: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'demo-const-4',
    name: 'Bengaluru West [DEMO]',
    code: 'DEMO-BLR-04',
    bounds: { south: 12.920, west: 77.440, north: 13.040, east: 77.560 },
    mlaName: 'Demo Member D',
    mlaOfficeEmail: 'mla-demo-4@example.com',
    officeContactNote: 'Demo Office Zone 4 (no phone)',
    lastVerifiedDate: '2026-01-01',
    isDemo: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'demo-const-5',
    name: 'Bengaluru Central [DEMO]',
    code: 'DEMO-BLR-05',
    bounds: { south: 12.920, west: 77.560, north: 13.040, east: 77.680 },
    mlaName: 'Demo Member E',
    mlaOfficeEmail: 'mla-demo-5@example.com',
    officeContactNote: 'Demo Office Zone 5 (no phone)',
    lastVerifiedDate: '2026-01-01',
    isDemo: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'demo-const-6',
    name: 'Bengaluru East [DEMO]',
    code: 'DEMO-BLR-06',
    bounds: { south: 12.920, west: 77.680, north: 13.040, east: 77.800 },
    mlaName: 'Demo Member F',
    mlaOfficeEmail: 'mla-demo-6@example.com',
    officeContactNote: 'Demo Office Zone 6 (no phone)',
    lastVerifiedDate: '2026-01-01',
    isDemo: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'demo-const-7',
    name: 'Bengaluru South-West [DEMO]',
    code: 'DEMO-BLR-07',
    bounds: { south: 12.800, west: 77.440, north: 12.920, east: 77.560 },
    mlaName: 'Demo Member G',
    mlaOfficeEmail: 'mla-demo-7@example.com',
    officeContactNote: 'Demo Office Zone 7 (no phone)',
    lastVerifiedDate: '2026-01-01',
    isDemo: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'demo-const-8',
    name: 'Bengaluru South-Central [DEMO]',
    code: 'DEMO-BLR-08',
    bounds: { south: 12.800, west: 77.560, north: 12.920, east: 77.680 },
    mlaName: 'Demo Member H',
    mlaOfficeEmail: 'mla-demo-8@example.com',
    officeContactNote: 'Demo Office Zone 8 (no phone)',
    lastVerifiedDate: '2026-01-01',
    isDemo: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'demo-const-9',
    name: 'Bengaluru South-East [DEMO]',
    code: 'DEMO-BLR-09',
    bounds: { south: 12.800, west: 77.680, north: 12.920, east: 77.800 },
    mlaName: 'Demo Member I',
    mlaOfficeEmail: 'mla-demo-9@example.com',
    officeContactNote: 'Demo Office Zone 9 (no phone)',
    lastVerifiedDate: '2026-01-01',
    isDemo: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

export const DEMO_AGENCIES: AgencyContact[] = [
  {
    id: 'demo-agency-civic',
    name: 'Demo Civic Zone Desk',
    agencyType: 'civic_body',
    constituencyIds: DEMO_CONSTITUENCIES.map((c) => c.id),
    officialEmail: 'agency-civic-demo@example.com',
    jurisdictionNote: 'Bengaluru Grid Roads & Footpaths [DEMO]',
    isDemo: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'demo-agency-water',
    name: 'Demo Water Supply Desk',
    agencyType: 'water_board',
    constituencyIds: DEMO_CONSTITUENCIES.map((c) => c.id),
    officialEmail: 'agency-water-demo@example.com',
    jurisdictionNote: 'Bengaluru Grid Water & Pipelines [DEMO]',
    isDemo: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'demo-agency-power',
    name: 'Demo Electricity & Streetlights Desk',
    agencyType: 'electricity',
    constituencyIds: DEMO_CONSTITUENCIES.map((c) => c.id),
    officialEmail: 'agency-power-demo@example.com',
    jurisdictionNote: 'Bengaluru Grid Streetlights & Poles [DEMO]',
    isDemo: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'demo-agency-traffic',
    name: 'Demo Traffic & Signals Desk',
    agencyType: 'traffic_police',
    constituencyIds: DEMO_CONSTITUENCIES.map((c) => c.id),
    officialEmail: 'agency-traffic-demo@example.com',
    jurisdictionNote: 'Bengaluru Grid Junction Safety [DEMO]',
    isDemo: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'demo-agency-sanitation',
    name: 'Demo Solid Waste Desk',
    agencyType: 'sanitation',
    constituencyIds: DEMO_CONSTITUENCIES.map((c) => c.id),
    officialEmail: 'agency-waste-demo@example.com',
    jurisdictionNote: 'Bengaluru Grid Waste Collection [DEMO]',
    isDemo: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

export const DEFAULT_POINTS_CONFIG = {
  verifiedReport: 10,
  confirmedResolved: 25,
  upvote: 0 as const,
};

export const CITIZEN_LEVELS = [
  { name: 'Civic Starter', minPoints: 0 },
  { name: 'Neighbourhood Helper', minPoints: 30 },
  { name: 'Ward Watchdog', minPoints: 75 },
  { name: 'Bengaluru Steward', minPoints: 150 },
  { name: 'Civic Champion', minPoints: 300 },
] as const;

export const WELFARE_MIN_CLAIM_POINTS = 50;

export const WELFARE_BENEFITS: WelfareBenefit[] = [
  {
    id: 'welfare-metro-bmtc-pass',
    title: 'Namma Metro & BMTC Civic Transit Pass',
    category: 'Mobility & Transit',
    department: 'BMRCL & BMTC Commuter Welfare Desk',
    pointsRequired: 50,
    rewardValueLabel: '₹250 Transit Pass Credit',
    description:
      'Redeem 50 civic points for a ₹250 Namma Metro smart card or BMTC daily/monthly bus pass top-up voucher.',
    eligibilityNote: 'Available once your available balance reaches 50+ points.',
    claimPromptLabel: 'Namma Metro Smart Card / BMTC Pass No. (optional)',
    claimPromptPlaceholder: 'e.g. BMRCL-492011 or Student/Daily Pass ID',
  },
  {
    id: 'welfare-utility-rebate',
    title: 'BESCOM / BWSSB Municipal Utility Rebate',
    category: 'Utility Relief',
    department: 'Karnataka Civic Utilities Relief Cell',
    pointsRequired: 50,
    rewardValueLabel: '₹200 Bill Rebate Voucher',
    description:
      'Claim a ₹200 municipal water or electricity bill discount coupon credited toward your household utility account.',
    eligibilityNote: 'Available at 50+ points for verified Namma Dhwani citizens.',
    claimPromptLabel: 'BESCOM Account ID or BWSSB RR Number (optional)',
    claimPromptPlaceholder: 'e.g. BESCOM 10-digit Account ID or Ward Ward No.',
  },
  {
    id: 'welfare-indira-nutrition',
    title: 'Indira Canteen & Citizen Ration Pack',
    category: 'Food & Nutrition',
    department: 'Food & Civil Supplies Civic Welfare Desk',
    pointsRequired: 50,
    rewardValueLabel: '15 Subsidized Meal / Ration Coupons',
    description:
      'Redeem 15 meal or dry-ration nutrition support coupons usable at Bengaluru Indira Canteens or civic ration points.',
    eligibilityNote: 'Unlocks at 50 points; can also be gifted to a neighbour household.',
    claimPromptLabel: 'Preferred Ward Canteen or Beneficiary Note (optional)',
    claimPromptPlaceholder: 'e.g. Yelahanka / Malleswaram ward or self-use',
  },
  {
    id: 'welfare-arogya-health-check',
    title: 'Arogya Namma Clinic Health Screening Pass',
    category: 'Healthcare & Wellness',
    department: 'BBMP Primary Health & Namma Clinics',
    pointsRequired: 75,
    rewardValueLabel: 'Free Full Preventive Health Checkup',
    description:
      'Priority comprehensive blood panel, diabetes, BP, and eye screening voucher at your nearest Karnataka Namma Clinic.',
    eligibilityNote: 'Requires 75 civic points · valid for self or senior family member.',
    claimPromptLabel: 'Preferred Namma Clinic / Family Member Name (optional)',
    claimPromptPlaceholder: 'e.g. Indiranagar Namma Clinic',
  },
  {
    id: 'welfare-sakala-priority',
    title: 'Sakala / Bengaluru One Fast-Track Desk Pass',
    category: 'Civic Services Priority',
    department: 'Karnataka e-Governance & Sakala Facilitation',
    pointsRequired: 100,
    rewardValueLabel: 'Zero-Queue Priority Service Slot',
    description:
      'Priority counter token at Bengaluru One / Karnataka One for e-Khata, birth/income certificates, or municipal filings.',
    eligibilityNote: 'Requires 100 civic points · saves up to 2 hours at civic counters.',
    claimPromptLabel: 'Service Type Needed (optional)',
    claimPromptPlaceholder: 'e.g. e-Khata extract / Ration card / Residence certificate',
  },
  {
    id: 'welfare-yuva-skill-grant',
    title: 'Kaushalya Karnataka Skill & Student Kit Grant',
    category: 'Education & Youth',
    department: 'Karnataka Skill Development Mission',
    pointsRequired: 125,
    rewardValueLabel: '₹1,000 Training & Study Voucher',
    description:
      'Course fee waiver and learning kit grant for youth or civic volunteers enrolling in municipal IT, solar, or trade programs.',
    eligibilityNote: 'Requires 125 civic points · transferable to household students.',
    claimPromptLabel: 'Course Interest or Student Name (optional)',
    claimPromptPlaceholder: 'e.g. Tally / Solar Technician / Spoken English',
  },
  {
    id: 'welfare-green-solar-rwh',
    title: 'Solar & Rainwater Harvesting Green Subsidy Boost',
    category: 'Green & Environment',
    department: 'Karnataka Environment & BESCOM Green Cell',
    pointsRequired: 150,
    rewardValueLabel: '₹1,500 Home Sustainability Rebate',
    description:
      'Priority technical inspection plus ₹1,500 municipal green bonus toward home rainwater harvesting, composting, or rooftop solar.',
    eligibilityNote: 'Requires 150 civic points · top tier environmental stewardship reward.',
    claimPromptLabel: 'Installation Type & Property Ward (optional)',
    claimPromptPlaceholder: 'e.g. Rainwater filter / Home composter / Rooftop solar',
  },
];
