import { COMPLAINT_CATEGORIES, SEVERITY_LEVELS } from './constants.ts';
import type {
  AdminRole,
  AdminUserRecord,
  BenefitClaim,
  BenefitClaimStatus,
  CommunityComment,
  Complaint,
  ComplaintCategory,
  ComplaintStatus,
  ConstituencyBoundary,
  FixVerificationAiResult,
  NotificationItem,
  PublicCitizenProfile,
  SeriousConcern,
  SeverityLevel,
  SupportedLanguage,
} from './types.ts';

const VALID_ADMIN_ROLES: AdminRole[] = [
  'mla_owner',
  'mla_member',
  'cm_office',
  'welfare_reviewer',
  'super_admin',
];

const VALID_STATUSES: ComplaintStatus[] = [
  'Reported',
  'Acknowledged',
  'In progress',
  'Fixed, awaiting confirmation',
  'CONFIRMED RESOLVED',
  'Reopened',
  'Rejected',
  'Unattended',
];

const LEGACY_STATUS_MAP: Record<string, ComplaintStatus> = {
  SUBMITTED: 'Reported',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Fixed, awaiting confirmation',
  VERIFIED: 'CONFIRMED RESOLVED',
  DISPUTED: 'Reopened',
};

/**
 * Recursively strips `undefined` object properties (and array holes) so Firestore
 * `setDoc`/`updateDoc` calls never fail with "Unsupported field value: undefined".
 */
export function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    }
    return out as T;
  }
  return value;
}

export function toIsoString(val: unknown): string {
  if (typeof val === 'string' && val.trim().length > 0) return val;
  if (val && typeof val === 'object') {
    const maybeTs = val as { toDate?: () => Date; seconds?: number };
    if (typeof maybeTs.toDate === 'function') {
      try {
        return maybeTs.toDate().toISOString();
      } catch {
        // fallback below
      }
    }
    if (typeof maybeTs.seconds === 'number') {
      return new Date(maybeTs.seconds * 1000).toISOString();
    }
  }
  if (typeof val === 'number' && Number.isFinite(val)) {
    return new Date(val).toISOString();
  }
  return new Date().toISOString();
}

export function normalizeComplaintDoc(
  docId: string,
  rawData: Record<string, unknown>
): Complaint {
  const rawStatus = String(rawData.status || 'Reported');
  const status: ComplaintStatus = (VALID_STATUSES as string[]).includes(rawStatus)
    ? (rawStatus as ComplaintStatus)
    : LEGACY_STATUS_MAP[rawStatus] || 'Reported';

  const rawCategory = String(rawData.category || rawData.confirmedCategory || 'Other civic issue');
  const category: ComplaintCategory = (COMPLAINT_CATEGORIES as string[]).includes(rawCategory)
    ? (rawCategory as ComplaintCategory)
    : 'Other civic issue';

  const rawSeverity = String(rawData.severity || rawData.confirmedSeverity || 'Medium');
  const severity: SeverityLevel = (SEVERITY_LEVELS as string[]).includes(rawSeverity)
    ? (rawSeverity as SeverityLevel)
    : 'Medium';

  const rawLang = String(rawData.originalLanguage || 'en');
  const originalLanguage: SupportedLanguage = (['en', 'kn', 'hi', 'ta', 'te'] as const).includes(
    rawLang as SupportedLanguage
  )
    ? (rawLang as SupportedLanguage)
    : 'en';

  const upvoterUids = Array.isArray(rawData.upvoterUids)
    ? rawData.upvoterUids.filter((u): u is string => typeof u === 'string')
    : [];

  const priorityFactors = Array.isArray(rawData.priorityFactors)
    ? rawData.priorityFactors.filter((f): f is string => typeof f === 'string')
    : [];

  const timeline = Array.isArray(rawData.timeline)
    ? rawData.timeline.map((ev) => {
        const entry = (ev || {}) as Record<string, unknown>;
        return {
          status: String(entry.status || status),
          actorLabel: String(entry.actorLabel || 'System'),
          note: String(entry.note || ''),
          timestamp: toIsoString(entry.timestamp),
        };
      })
    : [];

  const createdAt = toIsoString(rawData.createdAt);
  const updatedAt = toIsoString(rawData.updatedAt || createdAt);

  const constituencyId =
    typeof rawData.constituencyId === 'string' && rawData.constituencyId
      ? rawData.constituencyId
      : typeof rawData.wardNumber === 'number'
        ? `legacy-ward-${rawData.wardNumber}`
        : 'unassigned';

  const constituencyName =
    typeof rawData.constituencyName === 'string' && rawData.constituencyName
      ? rawData.constituencyName
      : typeof rawData.wardName === 'string' && rawData.wardName
        ? rawData.wardName
        : 'Bengaluru';

  const assignedMlaName =
    typeof rawData.assignedMlaName === 'string' && rawData.assignedMlaName
      ? rawData.assignedMlaName
      : 'Area Office';

  return {
    id: typeof rawData.id === 'string' && rawData.id ? rawData.id : docId,
    title: String(rawData.title || 'Civic Issue Report'),
    description: String(rawData.description || ''),
    originalLanguage,
    originalText: String(rawData.originalText || rawData.description || ''),
    englishTranslation: String(rawData.englishTranslation || rawData.description || ''),
    category,
    aiSuggestedCategory: (COMPLAINT_CATEGORIES as string[]).includes(
      String(rawData.aiSuggestedCategory)
    )
      ? (rawData.aiSuggestedCategory as ComplaintCategory)
      : category,
    severity,
    aiSuggestedSeverity: (SEVERITY_LEVELS as string[]).includes(String(rawData.aiSuggestedSeverity))
      ? (rawData.aiSuggestedSeverity as SeverityLevel)
      : severity,
    aiSuggestedTitle: String(rawData.aiSuggestedTitle || rawData.title || ''),
    aiSuggestedDescription: String(rawData.aiSuggestedDescription || rawData.description || ''),
    aiSuggestionAccepted: Boolean(rawData.aiSuggestionAccepted),
    aiBackgroundStatus:
      rawData.aiBackgroundStatus === 'pending' ||
      rawData.aiBackgroundStatus === 'completed' ||
      rawData.aiBackgroundStatus === 'unavailable'
        ? rawData.aiBackgroundStatus
        : undefined,
    aiDraftReply: typeof rawData.aiDraftReply === 'string' ? rawData.aiDraftReply : undefined,
    aiCommunityBrief:
      typeof rawData.aiCommunityBrief === 'string' ? rawData.aiCommunityBrief : undefined,
    aiFixAssessment:
      rawData.aiFixAssessment && typeof rawData.aiFixAssessment === 'object'
        ? (rawData.aiFixAssessment as FixVerificationAiResult)
        : undefined,
    latitude: typeof rawData.latitude === 'number' ? rawData.latitude : 12.9716,
    longitude: typeof rawData.longitude === 'number' ? rawData.longitude : 77.5946,
    localityName: String(rawData.localityName || rawData.locality || 'Bengaluru'),
    addressLabel: String(rawData.addressLabel || rawData.address || 'Bengaluru'),
    constituencyId,
    constituencyName,
    assignedMlaName,
    nearBoundary: Boolean(rawData.nearBoundary),
    boundaryFlagged: Boolean(rawData.boundaryFlagged),
    status,
    confirmedByLabel:
      rawData.confirmedByLabel === 'reporter' ||
      rawData.confirmedByLabel === 'confirmed by neighbours'
        ? rawData.confirmedByLabel
        : undefined,
    rejectionReason:
      typeof rawData.rejectionReason === 'string' ? rawData.rejectionReason : undefined,
    isAnonymous: Boolean(rawData.isAnonymous),
    reporterUid: String(rawData.reporterUid || ''),
    reporterDisplayName: String(
      rawData.reporterDisplayName || rawData.reporterName || 'Citizen'
    ),
    shareContactConsent: Boolean(rawData.shareContactConsent),
    priorityScore: typeof rawData.priorityScore === 'number' ? rawData.priorityScore : 30,
    priorityFactors,
    upvoteCount:
      typeof rawData.upvoteCount === 'number'
        ? rawData.upvoteCount
        : typeof rawData.supportCount === 'number'
          ? rawData.supportCount
          : 0,
    upvoterUids,
    clusterId: typeof rawData.clusterId === 'string' ? rawData.clusterId : undefined,
    duplicateParentId:
      typeof rawData.duplicateParentId === 'string' ? rawData.duplicateParentId : undefined,
    photoUrl: typeof rawData.photoUrl === 'string' ? rawData.photoUrl : undefined,
    photoDataUrl: typeof rawData.photoDataUrl === 'string' ? rawData.photoDataUrl : undefined,
    afterPhotoDataUrl:
      typeof rawData.afterPhotoDataUrl === 'string' ? rawData.afterPhotoDataUrl : undefined,
    mediaAuth:
      rawData.mediaAuth && typeof rawData.mediaAuth === 'object'
        ? (rawData.mediaAuth as Complaint['mediaAuth'])
        : undefined,
    audioRetained: Boolean(rawData.audioRetained),
    forwardedAgencyId:
      typeof rawData.forwardedAgencyId === 'string' ? rawData.forwardedAgencyId : undefined,
    forwardedAgencyName:
      typeof rawData.forwardedAgencyName === 'string' ? rawData.forwardedAgencyName : undefined,
    escalatedToCm: Boolean(rawData.escalatedToCm),
    escalationReason:
      typeof rawData.escalationReason === 'string' ? rawData.escalationReason : undefined,
    ownerLabel: String(
      rawData.ownerLabel || `${assignedMlaName} (${constituencyName})`
    ),
    timeline,
    isDemo: Boolean(rawData.isDemo),
    createdAt,
    updatedAt,
    fixedAt: rawData.fixedAt ? toIsoString(rawData.fixedAt) : undefined,
    fixedAtMs: typeof rawData.fixedAtMs === 'number' ? rawData.fixedAtMs : undefined,
  };
}

export function normalizeConstituencyDoc(
  docId: string,
  rawData: Record<string, unknown>
): ConstituencyBoundary | null {
  if (!rawData || typeof rawData.name !== 'string') return null;

  // Support polygon array directly or GeoJSON geometry.coordinates
  let polygon: Array<[number, number]> | undefined = Array.isArray(rawData.polygon)
    ? (rawData.polygon as Array<[number, number]>)
    : undefined;
  if (!polygon && rawData.geometry && typeof rawData.geometry === 'object') {
    const geom = rawData.geometry as { type?: string; coordinates?: unknown };
    if (geom.type === 'Polygon' && Array.isArray(geom.coordinates) && Array.isArray(geom.coordinates[0])) {
      polygon = (geom.coordinates[0] as unknown[])
        .filter((pt): pt is [number, number] => Array.isArray(pt) && pt.length >= 2)
        .map(([lng, lat]) => [Number(lng), Number(lat)]);
    }
  }

  let bounds = rawData.bounds as Partial<ConstituencyBoundary['bounds']> | undefined;
  if (
    (!bounds ||
      typeof bounds.south !== 'number' ||
      typeof bounds.west !== 'number' ||
      typeof bounds.north !== 'number' ||
      typeof bounds.east !== 'number') &&
    polygon &&
    polygon.length >= 3
  ) {
    let south = Infinity;
    let north = -Infinity;
    let west = Infinity;
    let east = -Infinity;
    for (const [lng, lat] of polygon) {
      if (lat < south) south = lat;
      if (lat > north) north = lat;
      if (lng < west) west = lng;
      if (lng > east) east = lng;
    }
    bounds = { south, west, north, east };
  }

  if (
    !bounds ||
    typeof bounds.south !== 'number' ||
    typeof bounds.west !== 'number' ||
    typeof bounds.north !== 'number' ||
    typeof bounds.east !== 'number'
  ) {
    return null;
  }

  return {
    id: typeof rawData.id === 'string' ? rawData.id : docId,
    name: rawData.name,
    code: String(rawData.code || docId),
    bounds: {
      south: bounds.south,
      west: bounds.west,
      north: bounds.north,
      east: bounds.east,
    },
    polygon,
    mlaName: String(rawData.mlaName || 'Official MLA Office'),
    mlaOfficeEmail: String(rawData.mlaOfficeEmail || ''),
    officeContactNote: String(rawData.officeContactNote || ''),
    lastVerifiedDate: String(rawData.lastVerifiedDate || ''),
    isDemo: Boolean(rawData.isDemo),
    updatedAt: toIsoString(rawData.updatedAt),
  };
}

export function normalizeAdminDoc(
  uid: string,
  rawData: Record<string, unknown>
): AdminUserRecord | null {
  const role = String(rawData.role || '');
  if (!(VALID_ADMIN_ROLES as string[]).includes(role)) {
    return null;
  }
  return {
    uid: typeof rawData.uid === 'string' ? rawData.uid : uid,
    email: String(rawData.email || ''),
    displayName: String(rawData.displayName || 'Staff Member'),
    role: role as AdminRole,
    constituencyId:
      typeof rawData.constituencyId === 'string' ? rawData.constituencyId : undefined,
    constituencyName:
      typeof rawData.constituencyName === 'string' ? rawData.constituencyName : undefined,
    department: typeof rawData.department === 'string' ? rawData.department : undefined,
    invitedByUid: String(rawData.invitedByUid || uid),
    totpEnrolled: Boolean(rawData.totpEnrolled),
    active: rawData.active !== false,
    isDemo: Boolean(rawData.isDemo),
    createdAt: toIsoString(rawData.createdAt),
    updatedAt: toIsoString(rawData.updatedAt),
  };
}

export function normalizeSeriousConcernDoc(
  docId: string,
  rawData: Record<string, unknown>
): SeriousConcern {
  return {
    id: typeof rawData.id === 'string' ? rawData.id : docId,
    title: String(rawData.title || 'Private Concern'),
    description: String(rawData.description || ''),
    originalLanguage: (['en', 'kn', 'hi', 'ta', 'te'] as const).includes(
      rawData.originalLanguage as SupportedLanguage
    )
      ? (rawData.originalLanguage as SupportedLanguage)
      : 'en',
    englishTranslation: String(rawData.englishTranslation || rawData.description || ''),
    concernType:
      (rawData.concernType as SeriousConcern['concernType']) || 'official_misconduct',
    latitude: typeof rawData.latitude === 'number' ? rawData.latitude : 12.9716,
    longitude: typeof rawData.longitude === 'number' ? rawData.longitude : 77.5946,
    localityName: String(rawData.localityName || 'Bengaluru'),
    constituencyId: String(rawData.constituencyId || 'unassigned'),
    constituencyName: String(rawData.constituencyName || 'Bengaluru'),
    targetMlaName: String(rawData.targetMlaName || 'Office'),
    directToCm: Boolean(rawData.directToCm),
    isAnonymous: Boolean(rawData.isAnonymous),
    reporterUid: String(rawData.reporterUid || ''),
    status: (rawData.status as SeriousConcern['status']) || 'Submitted privately',
    lastChangedBy: String(rawData.lastChangedBy || 'Citizen'),
    officialResponseNote:
      typeof rawData.officialResponseNote === 'string'
        ? rawData.officialResponseNote
        : undefined,
    createdAt: toIsoString(rawData.createdAt),
    updatedAt: toIsoString(rawData.updatedAt),
  };
}

export function normalizeNotificationDoc(
  docId: string,
  rawData: Record<string, unknown>
): NotificationItem {
  return {
    id: typeof rawData.id === 'string' && rawData.id ? rawData.id : docId,
    recipientUid: String(rawData.recipientUid || ''),
    complaintId: typeof rawData.complaintId === 'string' ? rawData.complaintId : undefined,
    concernId: typeof rawData.concernId === 'string' ? rawData.concernId : undefined,
    title: String(rawData.title || 'Report update'),
    body: String(rawData.body || ''),
    type: (rawData.type as NotificationItem['type']) || 'status_update',
    read: Boolean(rawData.read),
    createdAt: toIsoString(rawData.createdAt),
    readAt: rawData.readAt ? toIsoString(rawData.readAt) : undefined,
  };
}

export function normalizePublicCitizenDoc(
  docId: string,
  rawData: Record<string, unknown>
): PublicCitizenProfile {
  return {
    uid: typeof rawData.uid === 'string' && rawData.uid ? rawData.uid : docId,
    displayName: String(rawData.displayName || 'Citizen'),
    reportsCount: typeof rawData.reportsCount === 'number' ? rawData.reportsCount : 0,
    confirmedCount: typeof rawData.confirmedCount === 'number' ? rawData.confirmedCount : 0,
    supportsCount: typeof rawData.supportsCount === 'number' ? rawData.supportsCount : 0,
    neighbourConfirmsCount:
      typeof rawData.neighbourConfirmsCount === 'number' ? rawData.neighbourConfirmsCount : 0,
    createdAt: toIsoString(rawData.createdAt),
    updatedAt: toIsoString(rawData.updatedAt || rawData.createdAt),
  };
}

export function normalizeCommunityCommentDoc(
  docId: string,
  rawData: Record<string, unknown>
): CommunityComment {
  const rawKind = String(rawData.kind || 'comment');
  const kind: CommunityComment['kind'] =
    rawKind === 'ground_update' || rawKind === 'fix_check' ? rawKind : 'comment';

  return {
    id: typeof rawData.id === 'string' && rawData.id ? rawData.id : docId,
    complaintId: String(rawData.complaintId || ''),
    authorUid: String(rawData.authorUid || ''),
    authorDisplayName: String(rawData.authorDisplayName || 'Citizen'),
    text: String(rawData.text || ''),
    kind,
    createdAt: toIsoString(rawData.createdAt),
  };
}

export function normalizeBenefitClaimDoc(
  docId: string,
  rawData: Record<string, unknown>
): BenefitClaim {
  const rawStatus = String(rawData.status || 'Claimed');
  const status: BenefitClaimStatus =
    rawStatus === 'Approved & Issued' || rawStatus === 'Redeemed' ? rawStatus : 'Claimed';

  return {
    id: typeof rawData.id === 'string' && rawData.id ? rawData.id : docId,
    benefitId: String(rawData.benefitId || ''),
    benefitTitle: String(rawData.benefitTitle || 'Citizen Welfare Benefit'),
    benefitCategory: String(rawData.benefitCategory || 'Welfare'),
    department: String(rawData.department || 'Karnataka Civic Welfare Desk'),
    rewardValueLabel: String(rawData.rewardValueLabel || 'Welfare Voucher'),
    citizenUid: String(rawData.citizenUid || ''),
    citizenName: String(rawData.citizenName || 'Citizen'),
    pointsSpent: typeof rawData.pointsSpent === 'number' ? rawData.pointsSpent : 50,
    voucherCode: String(rawData.voucherCode || ''),
    constituencyId:
      typeof rawData.constituencyId === 'string' ? rawData.constituencyId : undefined,
    constituencyName:
      typeof rawData.constituencyName === 'string' ? rawData.constituencyName : undefined,
    householdNote:
      typeof rawData.householdNote === 'string' ? rawData.householdNote : undefined,
    status,
    reviewedBy: typeof rawData.reviewedBy === 'string' ? rawData.reviewedBy : undefined,
    officialNote: typeof rawData.officialNote === 'string' ? rawData.officialNote : undefined,
    claimedAt: toIsoString(rawData.claimedAt),
    updatedAt: toIsoString(rawData.updatedAt || rawData.claimedAt),
  };
}
