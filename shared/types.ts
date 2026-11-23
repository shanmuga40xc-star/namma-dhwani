export type SupportedLanguage = 'en' | 'kn' | 'hi' | 'ta' | 'te';

export type ComplaintCategory =
  | 'Potholes'
  | 'Garbage accumulation'
  | 'Water leakage'
  | 'Broken streetlights'
  | 'Other civic issue';

export type SeverityLevel = 'Low' | 'Medium' | 'High' | 'Critical';

export type ComplaintStatus =
  | 'Reported'
  | 'Acknowledged'
  | 'In progress'
  | 'Fixed, awaiting confirmation'
  | 'CONFIRMED RESOLVED'
  | 'Reopened'
  | 'Rejected'
  | 'Unattended';

export type CitizenVerificationStatus =
  | 'Not verified'
  | 'Pending'
  | 'Verified'
  | 'Manual review';

export type AdminRole =
  | 'mla_owner'
  | 'mla_member'
  | 'cm_office'
  | 'welfare_reviewer'
  | 'super_admin';

export type PhotoAuthenticityStatus =
  | 'verified_live'
  | 'gallery_not_live'
  | 'needs_review'
  | 'reused_photo'
  | 'ai_blocked'
  | 'appealed_review';

export interface ConstituencyBoundary {
  id: string;
  name: string;
  code: string;
  bounds: {
    south: number;
    west: number;
    north: number;
    east: number;
  };
  /** Optional GeoJSON Polygon coordinates: [lng, lat][] outer ring */
  polygon?: Array<[number, number]>;
  mlaName: string;
  mlaOfficeEmail: string;
  officeContactNote: string;
  lastVerifiedDate: string;
  isDemo: boolean;
  updatedAt: string;
}

export interface AgencyContact {
  id: string;
  name: string;
  agencyType: 'civic_body' | 'water_board' | 'electricity' | 'traffic_police' | 'sanitation';
  constituencyIds: string[];
  officialEmail: string;
  jurisdictionNote: string;
  isDemo: boolean;
  updatedAt: string;
}

export interface AdminUserRecord {
  uid: string;
  email: string;
  displayName: string;
  role: AdminRole;
  constituencyId?: string;
  constituencyName?: string;
  department?: string;
  invitedByUid: string;
  totpEnrolled: boolean;
  active: boolean;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CitizenProfile {
  uid: string;
  displayName: string;
  role: 'citizen';
  preferredLanguage: SupportedLanguage;
  simpleMode: boolean;
  guideBotEnabled: boolean;
  verificationStatus: CitizenVerificationStatus;
  consentDpdpAccepted: boolean;
  consentDpdpAcceptedAt?: string;
  shareContactWithMla: boolean;
  lastReportedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CitizenPrivateData {
  uid: string;
  email: string;
  phone?: string;
  updatedAt: string;
}

export interface MediaAuthenticityMetadata {
  captureSource: 'live_camera' | 'gallery_upload';
  authenticityStatus: PhotoAuthenticityStatus;
  exifTimestamp?: string;
  exifLatitude?: number;
  exifLongitude?: number;
  hasC2paManifest: boolean;
  sha256: string;
  dHash: string;
  reusedComplaintId?: string;
  aiDetectorScore?: number;
  aiDetectorBlocked: boolean;
  appealNote?: string;
  appealedAt?: string;
}

export interface ComplaintTimelineEntry {
  status: ComplaintStatus | string;
  actorLabel: string;
  note: string;
  timestamp: string;
}

export interface FixVerificationAiResult {
  available: boolean;
  aiSuggestion: true;
  verdict: 'looks_fixed' | 'unclear' | 'needs_check' | 'unavailable';
  summary: string;
  checkedAt: string;
}

export interface NotificationItem {
  id: string;
  recipientUid: string;
  complaintId?: string;
  concernId?: string;
  title: string;
  body: string;
  type:
    | 'fix_awaiting_confirmation'
    | 'status_update'
    | 'concern_update'
    | 'confirmed_resolved'
    | 'welfare_update';
  read: boolean;
  createdAt: string;
  readAt?: string;
}

export type BenefitClaimStatus = 'Claimed' | 'Approved & Issued' | 'Redeemed';

export interface WelfareBenefit {
  id: string;
  title: string;
  category:
    | 'Mobility & Transit'
    | 'Utility Relief'
    | 'Food & Nutrition'
    | 'Healthcare & Wellness'
    | 'Civic Services Priority'
    | 'Education & Youth'
    | 'Green & Environment';
  department: string;
  pointsRequired: number;
  rewardValueLabel: string;
  description: string;
  eligibilityNote: string;
  claimPromptLabel: string;
  claimPromptPlaceholder: string;
}

export interface BenefitClaim {
  id: string;
  benefitId: string;
  benefitTitle: string;
  benefitCategory: string;
  department: string;
  rewardValueLabel: string;
  citizenUid: string;
  citizenName: string;
  pointsSpent: number;
  voucherCode: string;
  constituencyId?: string;
  constituencyName?: string;
  householdNote?: string;
  status: BenefitClaimStatus;
  reviewedBy?: string;
  officialNote?: string;
  claimedAt: string;
  updatedAt: string;
}

export interface PointsConfig {
  verifiedReport: number;
  confirmedResolved: number;
  upvote: 0;
}

export interface PublicCitizenProfile {
  uid: string;
  displayName: string;
  reportsCount: number;
  confirmedCount: number;
  supportsCount: number;
  neighbourConfirmsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CitizenLeaderboardRow {
  uid: string;
  displayName: string;
  reportsCount: number;
  confirmedCount: number;
  supportsCount: number;
  neighbourConfirmsCount: number;
  commentsCount: number;
  points: number;
  levelName: string;
  badges: string[];
}

export interface CommunityComment {
  id: string;
  complaintId: string;
  authorUid: string;
  authorDisplayName: string;
  text: string;
  kind: 'comment' | 'ground_update' | 'fix_check';
  createdAt: string;
}

export interface Complaint {
  id: string;
  title: string;
  description: string;
  originalLanguage: SupportedLanguage;
  originalText: string;
  englishTranslation: string;
  category: ComplaintCategory;
  aiSuggestedCategory: ComplaintCategory;
  severity: SeverityLevel;
  aiSuggestedSeverity: SeverityLevel;
  aiSuggestedTitle: string;
  aiSuggestedDescription: string;
  aiSuggestionAccepted: boolean;
  aiBackgroundStatus?: 'pending' | 'completed' | 'unavailable';
  aiDraftReply?: string;
  aiCommunityBrief?: string;
  aiFixAssessment?: FixVerificationAiResult;
  latitude: number;
  longitude: number;
  localityName: string;
  addressLabel: string;
  constituencyId: string;
  constituencyName: string;
  assignedMlaName: string;
  nearBoundary: boolean;
  boundaryFlagged: boolean;
  status: ComplaintStatus;
  confirmedByLabel?: 'reporter' | 'confirmed by neighbours';
  rejectionReason?: string;
  isAnonymous: boolean;
  reporterUid: string;
  reporterDisplayName: string;
  shareContactConsent: boolean;
  priorityScore: number;
  priorityFactors: string[];
  upvoteCount: number;
  upvoterUids: string[];
  clusterId?: string;
  duplicateParentId?: string;
  photoUrl?: string;
  photoDataUrl?: string;
  afterPhotoDataUrl?: string;
  mediaAuth?: MediaAuthenticityMetadata;
  audioRetained: boolean;
  forwardedAgencyId?: string;
  forwardedAgencyName?: string;
  escalatedToCm: boolean;
  escalationReason?: string;
  ownerLabel: string;
  timeline: ComplaintTimelineEntry[];
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
  fixedAt?: string;
  fixedAtMs?: number;
}

export interface DuplicatePairRecord {
  id: string;
  primaryComplaintId: string;
  candidateTitle: string;
  candidateDescription: string;
  candidateCategory: ComplaintCategory;
  distanceMeters: number;
  textSimilarity: number;
  imageSimilarity: number;
  userDecision: 'auto_upvoted' | 'different_problem';
  reporterUid: string;
  constituencyId: string;
  createdAt: string;
}

export interface AreaCluster {
  id: string;
  constituencyId: string;
  category: ComplaintCategory;
  centroidLat: number;
  centroidLng: number;
  radiusMeters: number;
  complaintIds: string[];
  reportCount: number;
  status: 'active' | 'escalated' | 'resolved';
  createdAt: string;
  updatedAt: string;
}

export interface SeriousConcern {
  id: string;
  title: string;
  description: string;
  originalLanguage: SupportedLanguage;
  englishTranslation: string;
  concernType: 'corruption' | 'safety_threat' | 'official_misconduct' | 'urgent_hazard';
  latitude: number;
  longitude: number;
  localityName: string;
  constituencyId: string;
  constituencyName: string;
  targetMlaName: string;
  directToCm: boolean;
  isAnonymous: boolean;
  reporterUid: string;
  status: 'Submitted privately' | 'Under review' | 'Escalated to CM Office' | 'Closed';
  lastChangedBy: string;
  officialResponseNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BoundaryFlag {
  id: string;
  latitude: number;
  longitude: number;
  matchedConstituencyId: string;
  matchedConstituencyName: string;
  citizenNote: string;
  reportedByUid: string;
  status: 'open' | 'resolved';
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorUid: string;
  actorEmail: string;
  actorRole: AdminRole | 'citizen' | 'system';
  action: string;
  targetCollection: string;
  targetId: string;
  constituencyId?: string;
  summary: string;
  createdAt: string;
}

export interface DemoEmailLog {
  id: string;
  recipientEmail: string;
  subject: string;
  previewText: string;
  relatedId?: string;
  createdAt: string;
}

export interface DuplicateCheckCandidate {
  complaintId: string;
  title: string;
  category: ComplaintCategory;
  status: ComplaintStatus;
  distanceMeters: number;
  textSimilarity: number;
  imageSimilarity: number;
  upvoteCount: number;
  localityName?: string;
  photoDataUrl?: string;
  reporterUid?: string;
  upvoterUids?: string[];
  matchReason?: string;
  isSamePhoto?: boolean;
  tier: 'tier1_exact' | 'tier2_cluster';
}

export interface DuplicateCheckResult {
  tier1Matches: DuplicateCheckCandidate[];
  tier2ClusterMatches: DuplicateCheckCandidate[];
  suggestedClusterId?: string;
  aiDuplicateVerdict?: {
    available: boolean;
    isDuplicate: boolean;
    matchedComplaintId?: string;
    reason: string;
  };
}

export interface MediaInspectionResult {
  authenticityStatus: PhotoAuthenticityStatus;
  exifTimestamp?: string;
  exifLatitude?: number;
  exifLongitude?: number;
  hasC2paManifest: boolean;
  sha256: string;
  dHash: string;
  reusedComplaintId?: string;
  aiDetectorScore: number;
  aiBlockingEnabled: boolean;
  blocked: boolean;
  notice: string;
}
