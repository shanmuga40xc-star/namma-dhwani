export enum IncidentCategory {
  Potholes = 'Potholes',
  GarbageAccumulation = 'Garbage accumulation',
  WaterLeakage = 'Water leakage',
  BrokenStreetlights = 'Broken streetlights',
}

export type SeverityLevel = 'Low' | 'Medium' | 'High' | 'Critical';

export enum IncidentStatus {
  Submitted = 'SUBMITTED',
  InProgress = 'IN_PROGRESS',
  Resolved = 'RESOLVED',
  Disputed = 'DISPUTED',
  Verified = 'VERIFIED',
}

export enum IncidentPriority {
  Critical = 'CRITICAL',
  High = 'HIGH',
  Standard = 'STANDARD',
}

export enum WorkspaceScreen {
  Overview = 'OVERVIEW',
  Incidents = 'INCIDENTS',
  Duplicates = 'DUPLICATES',
  Wards = 'WARDS',
  SlaPolicy = 'SLA_POLICY',
  AiResearch = 'AI_RESEARCH',
  Leaderboard = 'LEADERBOARD',
  PublicAccountability = 'PUBLIC_ACCOUNTABILITY',
  CmOversight = 'CM_OVERSIGHT',
  WelfareOfficer = 'WELFARE_OFFICER',
  AdminAccess = 'ADMIN_ACCESS',
  Guide = 'GUIDE',
}

export type AuthorityTier = 'CM' | 'MLA' | 'BBMP';

export type UserPortalRole = 'citizen' | 'politician_bbmp' | 'cm' | 'admin';

export type AchievementLevel =
  | 'Bronze Citizen'
  | 'Silver Citizen'
  | 'Gold Citizen'
  | 'Platinum Citizen';

export type NagrikBadge =
  | 'Civic Starter'
  | 'Community Helper'
  | 'Clean Bengaluru Champion'
  | 'Road Safety Champion'
  | 'Water Conservation Contributor'
  | 'Resolution Verification Champion'
  | 'Duplicate Detection Expert'
  | 'Bengaluru Civic Hero';

export type PointActionType =
  | 'resolved_complaint'
  | 'high_severity_bonus'
  | 'critical_severity_bonus'
  | 'independent_verification'
  | 'valid_duplicate'
  | 'accepted_additional_info'
  | 'civic_activity';

export type ContributionType =
  | 'additional_info'
  | 'duplicate_flag'
  | 'independent_verification';

export type LeaderboardScope =
  | 'overall'
  | 'monthly'
  | 'quarterly'
  | 'annual'
  | 'locality'
  | 'ward'
  | 'category';

export type WelfareProgrammeType =
  | 'Student Education Scholarship'
  | 'Student Welfare Assistance'
  | 'Civic Contribution Recognition Award'
  | 'Community Development Support'
  | 'Special Citizen Assistance';

export type WelfareAuthorizationStatus =
  | 'draft_unfunded'
  | 'authorized_active'
  | 'paused';

export type WelfareApplicationStatus =
  | 'Not Eligible'
  | 'Eligible'
  | 'Submitted'
  | 'Under Review'
  | 'Approved'
  | 'Rejected'
  | 'Awaiting Disbursement'
  | 'Disbursed';

export interface CitizenProfile {
  uid: string;
  displayName: string;
  role: 'citizen';
  wardNumber: number;
  locality: string;
  kycVerified?: boolean;
  aadhaarVerified?: boolean;
  aadhaarLast4?: string;
  otpVerified?: boolean;
  preferredLanguage?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface UserPrivateContact {
  uid: string;
  email: string;
  phone?: string;
  maskedAadhaar?: string;
  kycVerifiedAt?: string;
}

export interface AdminRecord {
  uid: string;
  displayName: string;
  department: string;
  badgeId: string;
  authorityTier?: AuthorityTier;
  wardJurisdiction?: number;
  politicalRole?: string;
  politicalIdNumber?: string;
  constituency?: string;
  partyOrBody?: string;
  approvedByUid: string;
  createdAt?: string;
}

export interface WelfareOfficerRecord {
  uid: string;
  displayName: string;
  department: string;
  badgeId: string;
  approvedByUid: string;
  createdAt?: string;
}

export interface AdminRequest {
  uid: string;
  displayName: string;
  department: string;
  badgeId: string;
  authorityTier?: AuthorityTier;
  politicalRole?: string;
  politicalIdNumber?: string;
  constituency?: string;
  partyOrBody?: string;
  aadhaarLast4?: string;
  wardJurisdiction: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt?: string;
  updatedAt?: string;
}

export interface AuditEntry {
  id: string;
  actorUid: string;
  actorName: string;
  role: string;
  action: string;
  note: string;
  timestamp: string;
}

export interface ResolutionVerification {
  id: string;
  complaintId: string;
  beforePhotoDataUrl?: string;
  afterPhotoDataUrl: string;
  resolutionLocation: string;
  resolutionLat: number;
  resolutionLng: number;
  gpsDistanceMeters: number;
  imageSimilarityScore: number;
  ssimScore: number;
  aiRecommendation:
    | 'Likely Resolved'
    | 'Needs Manual Review'
    | 'Suspicious Evidence'
    | 'Resolution Disputed'
    | 'Verified';
  aiExplanation: string;
  aiSource: 'fastapi_ml' | 'fallback_rule_based';
  resolutionNotes: string;
  submittedByUid: string;
  citizenDecision: 'pending' | 'confirmed' | 'disputed';
  citizenNote?: string;
  disputePhotoDataUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CivicIncident {
  id: string;
  title: string;
  description: string;
  locality: string;
  address: string;
  wardNumber: number;
  wardName: string;
  latitude: number;
  longitude: number;
  coordinates: string;
  reporterUid: string;
  reporterName: string;
  visibility: 'public';
  category: IncidentCategory;
  aiPredictedCategory: IncidentCategory;
  aiCategoryConfidence: number;
  confirmedCategory: IncidentCategory;
  categoryCorrectedByCitizen: boolean;
  aiPredictedSeverity: SeverityLevel;
  confirmedSeverity: SeverityLevel;
  severityCorrectedByHuman: boolean;
  aiSource: 'fastapi_ml' | 'fallback_rule_based';
  priority: IncidentPriority;
  priorityScore: number;
  priorityTier: SeverityLevel;
  prioritySource: 'sklearn_ml' | 'rule_based_baseline' | 'admin_override';
  priorityFactors: string[];
  adminPriorityOverride?: string;
  overrideReason?: string;
  status: IncidentStatus;
  photoDataUrl?: string;
  supportCount: number;
  duplicateReportCount: number;
  masterComplaintId?: string;
  isMergedDuplicate: boolean;
  assignedCrewId: string | null;
  slaTargetHours: number;
  slaHoursRemaining: number;
  submittedAt: string;
  createdAtMs: number;
  updatedAt: string;
  auditTrail: AuditEntry[];
}

export interface DuplicateCandidate {
  original_complaint_id: string;
  potential_duplicate_id: string;
  distance_meters: number;
  image_similarity: number;
  text_similarity: number;
  category_match: boolean;
  duplicate_confidence: number;
  recommended_action: string;
}

export interface DuplicateReviewRecord {
  id: string;
  originalComplaintId: string;
  candidateComplaintId: string;
  distanceMeters: number;
  imageSimilarity: number;
  textSimilarity: number;
  categoryMatch: boolean;
  duplicateConfidence: number;
  recommendedAction: string;
  status: 'pending_review' | 'merged' | 'dismissed' | 'reversed';
  reviewedByUid?: string;
  mergeReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FieldCrew {
  id: string;
  name: string;
  division: string;
  leadOfficer: string;
  assignedWardNumber: number;
  activeTickets: number;
  maxCapacity: number;
  radioChannel: string;
  status: 'DISPATCHED' | 'STANDBY' | 'FIELD_ACTIVE';
}

export interface WardSummary {
  wardNumber: number;
  name: string;
  councilDistrict: string;
  population: number;
  allocatedBudgetInr: number;
  spentBudgetInr: number;
  slaCompliancePct: number | null;
  gridPath: string;
  labelX: number;
  labelY: number;
}

export interface SlaPolicyRule {
  category: IncidentCategory;
  responseTargetHours: number | null;
  resolutionTargetHours: number | null;
  autoEscalateAtPct: number | null;
  statutoryMandate: string;
  compliance30dPct: number | null;
  autoDispatchEnabled: boolean;
}

export interface ResearchExperimentRecord {
  id: string;
  objectiveName: string;
  datasetSource: string;
  datasetSize: number;
  imagesPerCategory?: string;
  trainValSplit: string;
  modelArchitecture: string;
  hyperparameters: string;
  trainingDate: string;
  modelVersion: string;
  lifecycleState: 'implemented_not_trained' | 'trained_evaluated' | 'deployed_active';
  evaluationMetrics?: string;
  confusionMatrix?: string;
  limitations: string;
  recordedByUid: string;
  createdAt: string;
}

export interface ComplaintContribution {
  id: string;
  complaintId: string;
  contributorUid: string;
  contributorName: string;
  type: ContributionType;
  note: string;
  relatedComplaintId?: string;
  verificationOutcome?: 'confirmed_fixed' | 'still_unresolved';
  photoDataUrl?: string;
  status: 'pending' | 'accepted' | 'rejected';
  pointsAwarded: number;
  reviewedByUid?: string;
  reviewNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CitizenStats {
  uid: string;
  publicDisplayName: string;
  hideDisplayName: boolean;
  wardNumber: number;
  locality: string;
  totalPoints: number;
  monthlyPoints: number;
  quarterlyPoints: number;
  annualPoints: number;
  resolvedCount: number;
  highSeverityCount: number;
  criticalSeverityCount: number;
  independentVerificationsCount: number;
  validDuplicatesCount: number;
  acceptedInfoCount: number;
  activitiesParticipatedCount: number;
  potholesResolved: number;
  garbageResolved: number;
  waterResolved: number;
  streetlightsResolved: number;
  achievementLevel: AchievementLevel;
  badges: NagrikBadge[];
  updatedAt: string;
}

export interface PointTransaction {
  id: string;
  uid: string;
  complaintId?: string;
  referenceId: string;
  actionType: PointActionType;
  points: number;
  monthKey: string;
  quarterKey: string;
  yearKey: string;
  awardedByUid: string;
  description: string;
  createdAt: string;
}

export interface CivicActivity {
  id: string;
  title: string;
  description: string;
  wardNumber: number;
  locality: string;
  scheduledDate: string;
  status: 'upcoming' | 'completed' | 'cancelled';
  participantCount: number;
  createdByUid: string;
  createdAt: string;
}

export interface CivicActivityParticipant {
  uid: string;
  activityId: string;
  displayName: string;
  attendanceVerified: boolean;
  createdAt: string;
}

export interface WelfareProgramme {
  id: string;
  title: string;
  programmeType: WelfareProgrammeType;
  description: string;
  eligibilityConditions: string;
  minVerifiedPoints: number;
  minResolvedComplaints: number;
  requiresStudentStatus: boolean;
  requiresFinancialNeedCheck: boolean;
  allocatedBudgetInr: number;
  disbursedBudgetInr: number;
  maxBenefitPerApplicantInr: number;
  authorizationStatus: WelfareAuthorizationStatus;
  fundingAuthorityNote: string;
  createdByUid: string;
  createdAt: string;
  updatedAt: string;
}

export interface WelfareApplication {
  id: string;
  programmeId: string;
  programmeTitle: string;
  applicantUid: string;
  applicantName: string;
  wardNumber: number;
  locality: string;
  verifiedPointsSnapshot: number;
  resolvedComplaintsSnapshot: number;
  educationalStatus: string;
  institutionName?: string;
  householdIncomeBracket: string;
  financialNeedStatement: string;
  supportingDocumentName: string;
  supportingDocumentDataUrl?: string;
  status: Exclude<WelfareApplicationStatus, 'Not Eligible' | 'Eligible'>;
  officerDecisionReason?: string;
  reviewedByUid?: string;
  approvedAmountInr?: number;
  disbursementReference?: string;
  disbursementNote?: string;
  appealSubmitted: boolean;
  appealReason?: string;
  appealStatus: 'none' | 'pending' | 'upheld' | 'denied';
  appealDecisionNote?: string;
  notificationMessage: string;
  createdAt: string;
  updatedAt: string;
}

export type CmMisuseType =
  | 'sla_negligence'
  | 'suspicious_resolution'
  | 'fund_misuse'
  | 'priority_manipulation'
  | 'unresponsive_official'
  | 'citizen_grievance';

export type CmEscalationStatus =
  | 'unread_alert'
  | 'under_cm_review'
  | 'directive_issued'
  | 'action_taken';

export interface CmEscalationAlert {
  id: string;
  title: string;
  misuseType: CmMisuseType;
  targetRole: 'Local MLA' | 'BBMP Official';
  targetOfficialName: string;
  wardNumber: number;
  locality: string;
  relatedComplaintId?: string;
  description: string;
  evidenceSummary: string;
  severity: 'High' | 'Critical';
  reportedByUid: string;
  reportedByName: string;
  sourceType: 'auto_system' | 'citizen_report';
  cmStatus: CmEscalationStatus;
  cmDirectiveNote?: string;
  reviewedByCmUid?: string;
  reviewedByCmName?: string;
  createdAt: string;
  updatedAt: string;
}

export type AppointmentTargetAuthority = 'Local MLA' | 'Chief Minister (CM)';

export type AppointmentUrgencyReason =
  | 'Critical Unresolved Hazard'
  | 'MLA/BBMP Misuse Grievance'
  | 'Ward Infrastructure Petition'
  | 'Welfare / Community Delegation';

export type AppointmentStatus =
  | 'pending_permission'
  | 'approved_scheduled'
  | 'escalated_to_cm'
  | 'rejected'
  | 'completed';

export interface AuthorityAppointment {
  id: string;
  applicantUid: string;
  applicantName: string;
  targetAuthority: AppointmentTargetAuthority;
  wardNumber: number;
  locality: string;
  constituency: string;
  relatedComplaintId?: string;
  cmEscalationId?: string;
  urgencyReason: AppointmentUrgencyReason;
  purpose: string;
  preferredDate: string;
  preferredSlot: string;
  meetingMode: 'In-Person Office' | 'Video Hearing';
  status: AppointmentStatus;
  permissionPassCode?: string;
  scheduledDateTime?: string;
  officeLocation?: string;
  authorityRemarks?: string;
  decidedByUid?: string;
  decidedByName?: string;
  createdAt: string;
  updatedAt: string;
}

export function severityToIncidentPriority(tier: SeverityLevel): IncidentPriority {
  if (tier === 'Critical') return IncidentPriority.Critical;
  if (tier === 'High') return IncidentPriority.High;
  return IncidentPriority.Standard;
}
