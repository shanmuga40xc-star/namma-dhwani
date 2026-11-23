import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  auth,
  BOOTSTRAP_ADMIN_EMAIL,
  db,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import {
  AdminRecord,
  AdminRequest,
  AppointmentStatus,
  AppointmentTargetAuthority,
  AppointmentUrgencyReason,
  AuditEntry,
  AuthorityAppointment,
  AuthorityTier,
  CitizenProfile,
  CitizenStats,
  CivicActivity,
  CivicActivityParticipant,
  CivicIncident,
  CmEscalationAlert,
  CmEscalationStatus,
  CmMisuseType,
  ComplaintContribution,
  ContributionType,
  DuplicateReviewRecord,
  IncidentCategory,
  IncidentPriority,
  IncidentStatus,
  PointActionType,
  PointTransaction,
  ResearchExperimentRecord,
  ResolutionVerification,
  SeverityLevel,
  severityToIncidentPriority,
  UserPrivateContact,
  WardSummary,
  WelfareApplication,
  WelfareOfficerRecord,
  WelfareProgramme,
} from '../types/civic';
import {
  computeAchievementLevel,
  computeEarnedBadges,
  getPeriodKeys,
  NAGRIK_POINTS_SCHEDULE,
  NEW_USER_WARDS,
} from '../data/mockCivicData';

function timestampToIso(ts: unknown): string {
  if (ts instanceof Timestamp) {
    return ts.toDate().toISOString();
  }
  if (ts && typeof ts === 'object' && 'toDate' in ts && typeof (ts as { toDate: () => Date }).toDate === 'function') {
    return (ts as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof ts === 'string') return ts;
  return new Date().toISOString();
}

function timestampToMs(ts: unknown): number {
  if (ts instanceof Timestamp) return ts.toMillis();
  if (ts && typeof ts === 'object' && 'toMillis' in ts && typeof (ts as { toMillis: () => number }).toMillis === 'function') {
    return (ts as { toMillis: () => number }).toMillis();
  }
  return Date.now();
}

function formatShortStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes()
  ).padStart(2, '0')}`;
}

// -----------------------------------------------------------------------------
// Auth Role & Profile Resolution
// -----------------------------------------------------------------------------
export function inferAuthorityTier(
  politicalRole?: string,
  department?: string,
  explicitTier?: unknown
): AuthorityTier {
  if (explicitTier === 'CM' || explicitTier === 'MLA' || explicitTier === 'BBMP') {
    return explicitTier;
  }
  const roleStr = `${politicalRole || ''} ${department || ''}`.toLowerCase();
  if (roleStr.includes('chief minister') || roleStr.includes('cm ')) {
    return 'CM';
  }
  if (
    roleStr.includes('mla') ||
    roleStr.includes('assembly') ||
    roleStr.includes('parliamentary') ||
    roleStr.includes('corporator')
  ) {
    return 'MLA';
  }
  return 'BBMP';
}

export async function checkIsAdminUser(uid: string, email: string | null): Promise<boolean> {
  if (email && email.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase()) {
    return true;
  }
  try {
    const snap = await getDoc(doc(db, 'admins', uid));
    return snap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `admins/${uid}`);
    return false;
  }
}

export async function getAdminAuthorityInfo(
  uid: string,
  email: string | null,
  fallbackDisplayName?: string | null
): Promise<{
  isAdmin: boolean;
  authorityTier: AuthorityTier | null;
  adminRecord: AdminRecord | null;
}> {
  const isBootstrapCm =
    Boolean(email) && email!.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase();
  try {
    const snap = await getDoc(doc(db, 'admins', uid));
    if (snap.exists()) {
      const d = snap.data();
      const record: AdminRecord = {
        uid: String(d.uid || uid),
        displayName: String(d.displayName || fallbackDisplayName || 'Authority Official'),
        department: String(d.department || 'Municipal Command'),
        badgeId: String(d.badgeId || 'NAGRIK-OFF'),
        authorityTier: isBootstrapCm
          ? 'CM'
          : inferAuthorityTier(
              typeof d.politicalRole === 'string' ? d.politicalRole : undefined,
              typeof d.department === 'string' ? d.department : undefined,
              d.authorityTier
            ),
        wardJurisdiction:
          typeof d.wardJurisdiction === 'number' ? Number(d.wardJurisdiction) : undefined,
        politicalRole: typeof d.politicalRole === 'string' ? d.politicalRole : undefined,
        politicalIdNumber:
          typeof d.politicalIdNumber === 'string' ? d.politicalIdNumber : undefined,
        constituency: typeof d.constituency === 'string' ? d.constituency : undefined,
        partyOrBody: typeof d.partyOrBody === 'string' ? d.partyOrBody : undefined,
        approvedByUid: String(d.approvedByUid || uid),
        createdAt: timestampToIso(d.createdAt),
      };
      return {
        isAdmin: true,
        authorityTier: record.authorityTier || (isBootstrapCm ? 'CM' : 'BBMP'),
        adminRecord: record,
      };
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `admins/${uid}`);
  }

  if (isBootstrapCm) {
    return {
      isAdmin: true,
      authorityTier: 'CM',
      adminRecord: {
        uid,
        displayName: fallbackDisplayName || 'Chief Minister Oversight',
        department: 'Chief Minister State & BBMP Oversight Desk',
        badgeId: 'CMO-KA-SUPERVISOR',
        authorityTier: 'CM',
        politicalRole: 'Chief Minister (CM) Office / State Oversight',
        constituency: 'Karnataka State / Bengaluru Civic Command',
        partyOrBody: 'Government of Karnataka Oversight',
        approvedByUid: uid,
      },
    };
  }

  return { isAdmin: false, authorityTier: null, adminRecord: null };
}

export async function purgeAdminFromCitizenCollections(uid: string): Promise<void> {
  // Ensures politicians, BBMP officials, and CM Oversight accounts NEVER appear
  // as citizens on the Citizen Leaderboard or Active Citizen counts.
  try {
    const statsSnap = await getDoc(doc(db, 'citizenStats', uid));
    if (statsSnap.exists()) {
      await deleteDoc(doc(db, 'citizenStats', uid));
    }
  } catch {
    // Non-blocking cleanup
  }
  try {
    const userSnap = await getDoc(doc(db, 'users', uid));
    if (userSnap.exists()) {
      await deleteDoc(doc(db, 'users', uid));
    }
  } catch {
    // Non-blocking cleanup
  }
}

export async function getCitizenProfile(uid: string): Promise<CitizenProfile | null> {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      uid: String(d.uid),
      displayName: String(d.displayName),
      role: 'citizen',
      wardNumber: Number(d.wardNumber || 1),
      locality: String(d.locality || 'Harbor & Civic Center'),
      kycVerified: Boolean(d.kycVerified),
      aadhaarVerified: Boolean(d.aadhaarVerified),
      aadhaarLast4: typeof d.aadhaarLast4 === 'string' ? d.aadhaarLast4 : undefined,
      otpVerified: Boolean(d.otpVerified),
      preferredLanguage: typeof d.preferredLanguage === 'string' ? d.preferredLanguage : undefined,
      createdAt: timestampToIso(d.createdAt),
      updatedAt: timestampToIso(d.updatedAt),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${uid}`);
    return null;
  }
}

export async function getPrivateContact(uid: string): Promise<UserPrivateContact | null> {
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'private', 'contact'));
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      uid: String(d.uid),
      email: String(d.email),
      phone: typeof d.phone === 'string' ? d.phone : undefined,
      maskedAadhaar: typeof d.maskedAadhaar === 'string' ? d.maskedAadhaar : undefined,
      kycVerifiedAt: typeof d.kycVerifiedAt === 'string' ? d.kycVerifiedAt : undefined,
    };
  } catch {
    return null;
  }
}

export async function upsertCitizenProfile(params: {
  uid: string;
  displayName: string;
  wardNumber: number;
  locality: string;
  email: string;
  phone?: string;
  kycVerified?: boolean;
  aadhaarVerified?: boolean;
  aadhaarLast4?: string;
  otpVerified?: boolean;
  preferredLanguage?: string;
  maskedAadhaar?: string;
  kycVerifiedAt?: string;
}): Promise<void> {
  const userRef = doc(db, 'users', params.uid);
  const privateRef = doc(db, 'users', params.uid, 'private', 'contact');
  const existing = await getDoc(userRef);

  const userUpdates: Record<string, unknown> = {
    displayName: params.displayName.trim().slice(0, 120) || 'Citizen Reporter',
    wardNumber: Math.min(99, Math.max(1, params.wardNumber)),
    locality: params.locality.trim().slice(0, 120) || 'Ward 01',
    updatedAt: serverTimestamp(),
  };
  if (typeof params.kycVerified === 'boolean') userUpdates.kycVerified = params.kycVerified;
  if (typeof params.aadhaarVerified === 'boolean')
    userUpdates.aadhaarVerified = params.aadhaarVerified;
  if (params.aadhaarLast4) userUpdates.aadhaarLast4 = params.aadhaarLast4.slice(-4);
  if (typeof params.otpVerified === 'boolean') userUpdates.otpVerified = params.otpVerified;
  if (params.preferredLanguage) userUpdates.preferredLanguage = params.preferredLanguage.slice(0, 10);

  const batch = writeBatch(db);
  if (!existing.exists()) {
    batch.set(userRef, {
      uid: params.uid,
      role: 'citizen',
      createdAt: serverTimestamp(),
      ...userUpdates,
    });
  } else {
    batch.update(userRef, userUpdates);
  }

  const privatePayload: Record<string, unknown> = {
    uid: params.uid,
    email: params.email.trim().slice(0, 200),
    updatedAt: serverTimestamp(),
  };
  if (params.phone && params.phone.trim()) {
    privatePayload.phone = params.phone.trim().slice(0, 32);
  }
  if (params.maskedAadhaar && params.maskedAadhaar.trim()) {
    privatePayload.maskedAadhaar = params.maskedAadhaar.trim().slice(0, 24);
  }
  if (params.kycVerifiedAt && params.kycVerifiedAt.trim()) {
    privatePayload.kycVerifiedAt = params.kycVerifiedAt.trim().slice(0, 64);
  }
  batch.set(privateRef, privatePayload);

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${params.uid}`);
    throw error;
  }
}

export async function getAdminRequest(uid: string): Promise<AdminRequest | null> {
  try {
    const snap = await getDoc(doc(db, 'adminRequests', uid));
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      uid: String(d.uid),
      displayName: String(d.displayName),
      department: String(d.department),
      badgeId: String(d.badgeId),
      authorityTier: inferAuthorityTier(
        typeof d.politicalRole === 'string' ? d.politicalRole : undefined,
        typeof d.department === 'string' ? d.department : undefined,
        d.authorityTier
      ),
      politicalRole: typeof d.politicalRole === 'string' ? d.politicalRole : undefined,
      politicalIdNumber: typeof d.politicalIdNumber === 'string' ? d.politicalIdNumber : undefined,
      constituency: typeof d.constituency === 'string' ? d.constituency : undefined,
      partyOrBody: typeof d.partyOrBody === 'string' ? d.partyOrBody : undefined,
      aadhaarLast4: typeof d.aadhaarLast4 === 'string' ? d.aadhaarLast4 : undefined,
      wardJurisdiction: Number(d.wardJurisdiction || 1),
      status: d.status as AdminRequest['status'],
      createdAt: timestampToIso(d.createdAt),
      updatedAt: timestampToIso(d.updatedAt),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `adminRequests/${uid}`);
    return null;
  }
}

export async function submitAdminAccessRequest(params: {
  uid: string;
  displayName: string;
  department: string;
  badgeId: string;
  wardJurisdiction: number;
  authorityTier?: AuthorityTier;
  politicalRole?: string;
  politicalIdNumber?: string;
  constituency?: string;
  partyOrBody?: string;
  aadhaarLast4?: string;
}): Promise<void> {
  const ref = doc(db, 'adminRequests', params.uid);
  const payload: Record<string, unknown> = {
    uid: params.uid,
    displayName: params.displayName.trim().slice(0, 120),
    department: params.department.trim().slice(0, 120),
    badgeId: params.badgeId.trim().slice(0, 64),
    authorityTier:
      params.authorityTier || inferAuthorityTier(params.politicalRole, params.department),
    wardJurisdiction: Math.min(99, Math.max(1, params.wardJurisdiction)),
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (params.politicalRole) payload.politicalRole = params.politicalRole.trim().slice(0, 120);
  if (params.politicalIdNumber)
    payload.politicalIdNumber = params.politicalIdNumber.trim().slice(0, 64);
  if (params.constituency) payload.constituency = params.constituency.trim().slice(0, 120);
  if (params.partyOrBody) payload.partyOrBody = params.partyOrBody.trim().slice(0, 120);
  if (params.aadhaarLast4) payload.aadhaarLast4 = params.aadhaarLast4.trim().slice(-4);

  try {
    await setDoc(ref, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `adminRequests/${params.uid}`);
    throw error;
  }
}

export function subscribeAdminRequests(
  onData: (requests: AdminRequest[]) => void
): Unsubscribe {
  const q = query(collection(db, 'adminRequests'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            uid: String(d.uid),
            displayName: String(d.displayName),
            department: String(d.department),
            badgeId: String(d.badgeId),
            authorityTier: inferAuthorityTier(
              typeof d.politicalRole === 'string' ? d.politicalRole : undefined,
              typeof d.department === 'string' ? d.department : undefined,
              d.authorityTier
            ),
            politicalRole: typeof d.politicalRole === 'string' ? d.politicalRole : undefined,
            politicalIdNumber:
              typeof d.politicalIdNumber === 'string' ? d.politicalIdNumber : undefined,
            constituency: typeof d.constituency === 'string' ? d.constituency : undefined,
            partyOrBody: typeof d.partyOrBody === 'string' ? d.partyOrBody : undefined,
            aadhaarLast4: typeof d.aadhaarLast4 === 'string' ? d.aadhaarLast4 : undefined,
            wardJurisdiction: Number(d.wardJurisdiction || 1),
            status: d.status as AdminRequest['status'],
            createdAt: timestampToIso(d.createdAt),
            updatedAt: timestampToIso(d.updatedAt),
          };
        })
      );
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'adminRequests');
    }
  );
}

export function subscribeAdmins(onData: (admins: AdminRecord[]) => void): Unsubscribe {
  const q = query(collection(db, 'admins'), where('uid', '!=', ''));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((docSnap) => {
          const d = docSnap.data();
          return {
            ms: timestampToMs(d.createdAt),
            record: {
              uid: String(d.uid),
              displayName: String(d.displayName),
              department: String(d.department),
              badgeId: String(d.badgeId),
              authorityTier: inferAuthorityTier(
                typeof d.politicalRole === 'string' ? d.politicalRole : undefined,
                typeof d.department === 'string' ? d.department : undefined,
                d.authorityTier
              ),
              wardJurisdiction:
                typeof d.wardJurisdiction === 'number' ? Number(d.wardJurisdiction) : undefined,
              politicalRole: typeof d.politicalRole === 'string' ? d.politicalRole : undefined,
              politicalIdNumber:
                typeof d.politicalIdNumber === 'string' ? d.politicalIdNumber : undefined,
              constituency: typeof d.constituency === 'string' ? d.constituency : undefined,
              partyOrBody: typeof d.partyOrBody === 'string' ? d.partyOrBody : undefined,
              approvedByUid: String(d.approvedByUid),
              createdAt: timestampToIso(d.createdAt),
            } as AdminRecord,
          };
        })
        .sort((a, b) => b.ms - a.ms)
        .map((x) => x.record);
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'admins');
    }
  );
}

export async function decideAdminRequest(
  reqItem: AdminRequest,
  decision: 'approved' | 'rejected'
): Promise<void> {
  const approverUid = auth.currentUser?.uid;
  if (!approverUid) throw new Error('Authentication required');

  const batch = writeBatch(db);
  batch.update(doc(db, 'adminRequests', reqItem.uid), {
    status: decision,
    updatedAt: serverTimestamp(),
  });
  if (decision === 'approved') {
    const adminPayload: Record<string, unknown> = {
      uid: reqItem.uid,
      displayName: reqItem.displayName,
      department: reqItem.department,
      badgeId: reqItem.badgeId,
      authorityTier:
        reqItem.authorityTier || inferAuthorityTier(reqItem.politicalRole, reqItem.department),
      wardJurisdiction: Math.min(99, Math.max(1, reqItem.wardJurisdiction || 1)),
      approvedByUid: approverUid,
      createdAt: serverTimestamp(),
    };
    if (reqItem.politicalRole) adminPayload.politicalRole = reqItem.politicalRole;
    if (reqItem.politicalIdNumber) adminPayload.politicalIdNumber = reqItem.politicalIdNumber;
    if (reqItem.constituency) adminPayload.constituency = reqItem.constituency;
    if (reqItem.partyOrBody) adminPayload.partyOrBody = reqItem.partyOrBody;

    batch.set(doc(db, 'admins', reqItem.uid), adminPayload);
  }
  try {
    await batch.commit();
    if (decision === 'approved') {
      // If supervisor approves their own/another's old citizen doc, clean citizenStats if owner
      if (reqItem.uid === approverUid) {
        await purgeAdminFromCitizenCollections(reqItem.uid);
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `adminRequests/${reqItem.uid}`);
    throw error;
  }
}

// -----------------------------------------------------------------------------
// Complaints Subscription & CRUD
// -----------------------------------------------------------------------------
function mapComplaintDoc(docId: string, d: Record<string, unknown>): CivicIncident {
  const createdMs = timestampToMs(d.createdAt);
  const slaTargetHours = Number(d.slaTargetHours || 24);
  const elapsedHours = Math.max(0, (Date.now() - createdMs) / 3600000);
  const status = (d.status as IncidentStatus) || IncidentStatus.Submitted;
  const slaHoursRemaining =
    status === IncidentStatus.Resolved || status === IncidentStatus.Verified
      ? Math.max(0, slaTargetHours - elapsedHours)
      : slaTargetHours - elapsedHours;

  const priorityTier = (d.priorityTier as SeverityLevel) || 'Medium';
  const priority =
    d.adminPriorityOverride === 'CRITICAL' || priorityTier === 'Critical'
      ? IncidentPriority.Critical
      : d.adminPriorityOverride === 'HIGH' || priorityTier === 'High'
        ? IncidentPriority.High
        : severityToIncidentPriority(priorityTier);

  const lat = Number(d.latitude || 0);
  const lng = Number(d.longitude || 0);
  const createdIso = timestampToIso(d.createdAt);

  return {
    id: String(d.id || docId),
    title: String(d.title || ''),
    description: String(d.description || ''),
    locality: String(d.locality || ''),
    address: String(d.address || ''),
    wardNumber: Number(d.wardNumber || 1),
    wardName: String(d.wardName || 'Harbor & Civic Center'),
    latitude: lat,
    longitude: lng,
    coordinates: `${lat.toFixed(4)}°, ${lng.toFixed(4)}°`,
    reporterUid: String(d.reporterUid || ''),
    reporterName: String(d.reporterName || 'Citizen'),
    visibility: 'public',
    category: (d.confirmedCategory as IncidentCategory) || IncidentCategory.Potholes,
    aiPredictedCategory:
      (d.aiPredictedCategory as IncidentCategory) || IncidentCategory.Potholes,
    aiCategoryConfidence: Number(d.aiCategoryConfidence || 0),
    confirmedCategory:
      (d.confirmedCategory as IncidentCategory) || IncidentCategory.Potholes,
    categoryCorrectedByCitizen: Boolean(d.categoryCorrectedByCitizen),
    aiPredictedSeverity: (d.aiPredictedSeverity as SeverityLevel) || 'Medium',
    confirmedSeverity: (d.confirmedSeverity as SeverityLevel) || 'Medium',
    severityCorrectedByHuman: Boolean(d.severityCorrectedByHuman),
    aiSource:
      d.aiSource === 'fastapi_ml' ? 'fastapi_ml' : 'fallback_rule_based',
    priority,
    priorityScore: Number(d.priorityScore || 0),
    priorityTier,
    prioritySource:
      (d.prioritySource as CivicIncident['prioritySource']) || 'rule_based_baseline',
    priorityFactors: Array.isArray(d.priorityFactors)
      ? (d.priorityFactors as string[])
      : [],
    adminPriorityOverride:
      typeof d.adminPriorityOverride === 'string' ? d.adminPriorityOverride : undefined,
    overrideReason:
      typeof d.overrideReason === 'string' ? d.overrideReason : undefined,
    status,
    photoDataUrl: typeof d.photoDataUrl === 'string' ? d.photoDataUrl : undefined,
    supportCount: Number(d.supportCount || 0),
    duplicateReportCount: Number(d.duplicateReportCount || 0),
    masterComplaintId:
      typeof d.masterComplaintId === 'string' ? d.masterComplaintId : undefined,
    isMergedDuplicate: Boolean(d.isMergedDuplicate),
    assignedCrewId:
      typeof d.assignedCrewId === 'string' && d.assignedCrewId ? d.assignedCrewId : null,
    slaTargetHours,
    slaHoursRemaining,
    submittedAt: formatShortStamp(createdIso),
    createdAtMs: createdMs,
    updatedAt: formatShortStamp(timestampToIso(d.updatedAt)),
    auditTrail: [],
  };
}

export function subscribeComplaints(
  onData: (items: CivicIncident[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  // Filter only on visibility == 'public' and sort client-side by createdAtMs to avoid composite index requirements
  const q = query(collection(db, 'complaints'), where('visibility', '==', 'public'));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => mapComplaintDoc(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'complaints');
      onError?.(error);
    }
  );
}

export async function createComplaintInFirestore(input: {
  id: string;
  title: string;
  description: string;
  locality: string;
  address: string;
  wardNumber: number;
  wardName: string;
  latitude: number;
  longitude: number;
  reporterUid: string;
  reporterName: string;
  aiPredictedCategory: IncidentCategory;
  aiCategoryConfidence: number;
  confirmedCategory: IncidentCategory;
  categoryCorrectedByCitizen: boolean;
  aiPredictedSeverity: SeverityLevel;
  confirmedSeverity: SeverityLevel;
  severityCorrectedByHuman: boolean;
  aiSource: 'fastapi_ml' | 'fallback_rule_based';
  priorityScore: number;
  priorityTier: SeverityLevel;
  prioritySource: 'sklearn_ml' | 'rule_based_baseline';
  priorityFactors: string[];
  photoDataUrl?: string;
  slaTargetHours: number;
  potentialDuplicate?: {
    originalComplaintId: string;
    distanceMeters: number;
    imageSimilarity: number;
    textSimilarity: number;
    categoryMatch: boolean;
    duplicateConfidence: number;
    recommendedAction: string;
  };
}): Promise<void> {
  const complaintRef = doc(db, 'complaints', input.id);
  const auditId = `AUD-${Date.now()}`;
  const auditRef = doc(db, 'complaints', input.id, 'auditTrail', auditId);

  const payload: Record<string, unknown> = {
    id: input.id,
    title: input.title.trim().slice(0, 180),
    description: input.description.trim().slice(0, 2000),
    locality: input.locality.trim().slice(0, 120),
    address: input.address.trim().slice(0, 240),
    wardNumber: input.wardNumber,
    wardName: input.wardName.trim().slice(0, 120),
    latitude: input.latitude,
    longitude: input.longitude,
    reporterUid: input.reporterUid,
    reporterName: input.reporterName.trim().slice(0, 120) || 'Citizen Reporter',
    visibility: 'public',
    aiPredictedCategory: input.aiPredictedCategory,
    aiCategoryConfidence: Math.min(1, Math.max(0, input.aiCategoryConfidence)),
    confirmedCategory: input.confirmedCategory,
    categoryCorrectedByCitizen: input.categoryCorrectedByCitizen,
    aiPredictedSeverity: input.aiPredictedSeverity,
    confirmedSeverity: input.confirmedSeverity,
    severityCorrectedByHuman: input.severityCorrectedByHuman,
    aiSource: input.aiSource,
    priorityScore: Math.min(100, Math.max(0, input.priorityScore)),
    priorityTier: input.priorityTier,
    prioritySource: input.prioritySource,
    priorityFactors: input.priorityFactors.slice(0, 8),
    status: 'SUBMITTED',
    supportCount: 0,
    duplicateReportCount: 0,
    isMergedDuplicate: false,
    slaTargetHours: Math.min(500, Math.max(1, input.slaTargetHours)),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (input.photoDataUrl && input.photoDataUrl.length <= 350000) {
    payload.photoDataUrl = input.photoDataUrl;
  }

  const batch = writeBatch(db);
  batch.set(complaintRef, payload);
  batch.set(auditRef, {
    id: auditId,
    actorUid: input.reporterUid,
    actorName: input.reporterName.trim().slice(0, 120) || 'Citizen Reporter',
    role: 'Citizen Reporter',
    action: 'Complaint Submitted',
    note: `Category: ${input.confirmedCategory}${
      input.categoryCorrectedByCitizen ? ` (corrected from ${input.aiPredictedCategory})` : ''
    }; Severity: ${input.confirmedSeverity}; Priority Score: ${input.priorityScore}/100.`,
    createdAt: serverTimestamp(),
  });

  if (input.potentialDuplicate) {
    const dupId = `DUP-${Date.now()}`;
    batch.set(doc(db, 'duplicateReviews', dupId), {
      id: dupId,
      originalComplaintId: input.potentialDuplicate.originalComplaintId,
      candidateComplaintId: input.id,
      distanceMeters: Math.max(0, input.potentialDuplicate.distanceMeters),
      imageSimilarity: Math.min(1, Math.max(0, input.potentialDuplicate.imageSimilarity)),
      textSimilarity: Math.min(1, Math.max(0, input.potentialDuplicate.textSimilarity)),
      categoryMatch: input.potentialDuplicate.categoryMatch,
      duplicateConfidence: Math.min(1, Math.max(0, input.potentialDuplicate.duplicateConfidence)),
      recommendedAction: input.potentialDuplicate.recommendedAction.slice(0, 120),
      status: 'pending_review',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `complaints/${input.id}`);
    throw error;
  }
}

export async function hasCitizenSupportedComplaint(
  complaintId: string,
  uid: string
): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, 'complaints', complaintId, 'supports', uid));
    return snap.exists();
  } catch {
    return false;
  }
}

export async function supportComplaintUnique(complaintId: string, uid: string): Promise<void> {
  const supportRef = doc(db, 'complaints', complaintId, 'supports', uid);
  const existing = await getDoc(supportRef);
  if (existing.exists()) {
    throw new Error('You have already supported this civic complaint.');
  }

  const batch = writeBatch(db);
  batch.set(supportRef, {
    uid,
    complaintId,
    createdAt: serverTimestamp(),
  });
  batch.update(doc(db, 'complaints', complaintId), {
    supportCount: increment(1),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `complaints/${complaintId}/supports/${uid}`);
    throw error;
  }
}

export function subscribeComplaintAuditTrail(
  complaintId: string,
  onData: (entries: AuditEntry[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'complaints', complaintId, 'auditTrail'),
    orderBy('createdAt', 'asc')
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            id: String(d.id || docSnap.id),
            actorUid: String(d.actorUid || ''),
            actorName: String(d.actorName || 'Operator'),
            role: String(d.role || 'Staff'),
            action: String(d.action || ''),
            note: String(d.note || ''),
            timestamp: formatShortStamp(timestampToIso(d.createdAt)),
          };
        })
      );
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, `complaints/${complaintId}/auditTrail`);
    }
  );
}

export function subscribeComplaintVerifications(
  complaintId: string,
  onData: (items: ResolutionVerification[]) => void
): Unsubscribe {
  // Include rule-compliant filter on citizenDecision and sort client-side
  const q = query(
    collection(db, 'complaints', complaintId, 'verifications'),
    where('citizenDecision', 'in', ['pending', 'confirmed', 'disputed'])
  );
  return onSnapshot(
    q,
    (snap) => {
      const mapped = snap.docs
        .map((docSnap) => {
          const d = docSnap.data();
          return {
            ms: timestampToMs(d.createdAt),
            item: {
              id: String(d.id || docSnap.id),
              complaintId: String(d.complaintId),
              beforePhotoDataUrl:
                typeof d.beforePhotoDataUrl === 'string' ? d.beforePhotoDataUrl : undefined,
              afterPhotoDataUrl: String(d.afterPhotoDataUrl || ''),
              resolutionLocation: String(d.resolutionLocation || ''),
              resolutionLat: Number(d.resolutionLat || 0),
              resolutionLng: Number(d.resolutionLng || 0),
              gpsDistanceMeters: Number(d.gpsDistanceMeters || 0),
              imageSimilarityScore: Number(d.imageSimilarityScore || 0),
              ssimScore: Number(d.ssimScore || 0),
              aiRecommendation:
                (d.aiRecommendation as ResolutionVerification['aiRecommendation']) ||
                'Needs Manual Review',
              aiExplanation: String(d.aiExplanation || ''),
              aiSource: d.aiSource === 'fastapi_ml' ? 'fastapi_ml' : 'fallback_rule_based',
              resolutionNotes: String(d.resolutionNotes || ''),
              submittedByUid: String(d.submittedByUid || ''),
              citizenDecision:
                (d.citizenDecision as ResolutionVerification['citizenDecision']) || 'pending',
              citizenNote: typeof d.citizenNote === 'string' ? d.citizenNote : undefined,
              disputePhotoDataUrl:
                typeof d.disputePhotoDataUrl === 'string' ? d.disputePhotoDataUrl : undefined,
              createdAt: formatShortStamp(timestampToIso(d.createdAt)),
              updatedAt: formatShortStamp(timestampToIso(d.updatedAt)),
            } as ResolutionVerification,
          };
        })
        .sort((a, b) => b.ms - a.ms)
        .map((x) => x.item);
      onData(mapped);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, `complaints/${complaintId}/verifications`);
    }
  );
}

export async function adminUpdateComplaintWorkflow(params: {
  complaintId: string;
  actorUid: string;
  actorName: string;
  updates: Record<string, unknown>;
  auditAction: string;
  auditNote: string;
}): Promise<void> {
  const auditId = `AUD-${Date.now()}`;
  const batch = writeBatch(db);
  batch.update(doc(db, 'complaints', params.complaintId), {
    ...params.updates,
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'complaints', params.complaintId, 'auditTrail', auditId), {
    id: auditId,
    actorUid: params.actorUid,
    actorName: params.actorName.slice(0, 120),
    role: 'Admin Authority',
    action: params.auditAction.slice(0, 120),
    note: params.auditNote.slice(0, 1000),
    createdAt: serverTimestamp(),
  });

  if (params.updates.status === 'VERIFIED') {
    const complaintSnap = await getDoc(doc(db, 'complaints', params.complaintId));
    if (complaintSnap.exists()) {
      const cData = complaintSnap.data();
      const reporterUid = String(cData.reporterUid || '');
      const isMerged = Boolean(cData.isMergedDuplicate);
      const severity = (cData.confirmedSeverity as SeverityLevel) || 'Medium';
      const category = (cData.confirmedCategory as IncidentCategory) || IncidentCategory.Potholes;

      if (reporterUid && !isMerged) {
        const resTxId = `RES_${params.complaintId}_${reporterUid}`;
        const existingResTx = await getDoc(doc(db, 'pointTransactions', resTxId));
        if (!existingResTx.exists()) {
          await ensureCitizenStatsInitialized({
            uid: reporterUid,
            displayName: String(cData.reporterName || 'Citizen Reporter'),
            wardNumber: Number(cData.wardNumber || 1),
            locality: String(cData.locality || 'Bengaluru'),
          });
          const statsSnap = await getDoc(doc(db, 'citizenStats', reporterUid));
          if (statsSnap.exists()) {
            const cur = mapCitizenStatsDoc(statsSnap.data() as Record<string, unknown>);
            const period = getPeriodKeys();
            const basePts = NAGRIK_POINTS_SCHEDULE.RESOLVED_COMPLAINT;
            const bonusPts =
              severity === 'Critical'
                ? NAGRIK_POINTS_SCHEDULE.CRITICAL_SEVERITY_BONUS
                : severity === 'High'
                  ? NAGRIK_POINTS_SCHEDULE.HIGH_SEVERITY_BONUS
                  : 0;
            const totalAward = basePts + bonusPts;

            batch.set(doc(db, 'pointTransactions', resTxId), {
              id: resTxId,
              uid: reporterUid,
              complaintId: params.complaintId,
              referenceId: params.complaintId,
              actionType: 'resolved_complaint',
              points: basePts,
              ...period,
              awardedByUid: params.actorUid,
              description: `Verified resolved complaint ${params.complaintId} (${category})`,
              createdAt: serverTimestamp(),
            });

            if (bonusPts > 0) {
              const sevTxId = `SEV_${params.complaintId}_${reporterUid}`;
              batch.set(doc(db, 'pointTransactions', sevTxId), {
                id: sevTxId,
                uid: reporterUid,
                complaintId: params.complaintId,
                referenceId: params.complaintId,
                actionType:
                  severity === 'Critical' ? 'critical_severity_bonus' : 'high_severity_bonus',
                points: bonusPts,
                ...period,
                awardedByUid: params.actorUid,
                description: `${severity} severity verified resolution bonus for ${params.complaintId}`,
                createdAt: serverTimestamp(),
              });
            }

            const nextStats = computeUpdatedStatsFields(cur, {
              pointsDelta: totalAward,
              resolvedDelta: 1,
              highSeverityDelta: severity === 'High' ? 1 : 0,
              criticalSeverityDelta: severity === 'Critical' ? 1 : 0,
              categoryResolved: category,
            });
            batch.update(doc(db, 'citizenStats', reporterUid), {
              ...nextStats,
              updatedAt: serverTimestamp(),
            });
          }
        }
      }
    }
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `complaints/${params.complaintId}`);
    throw error;
  }
}

export async function adminSubmitResolutionVerification(params: {
  complaintId: string;
  actorUid: string;
  actorName: string;
  beforePhotoDataUrl?: string;
  afterPhotoDataUrl: string;
  resolutionLocation: string;
  resolutionLat: number;
  resolutionLng: number;
  gpsDistanceMeters: number;
  imageSimilarityScore: number;
  ssimScore: number;
  aiRecommendation: ResolutionVerification['aiRecommendation'];
  aiExplanation: string;
  aiSource: 'fastapi_ml' | 'fallback_rule_based';
  resolutionNotes: string;
}): Promise<void> {
  const verId = `VER-${Date.now()}`;
  const auditId = `AUD-${Date.now() + 1}`;
  const batch = writeBatch(db);

  const verPayload: Record<string, unknown> = {
    id: verId,
    complaintId: params.complaintId,
    afterPhotoDataUrl: params.afterPhotoDataUrl,
    resolutionLocation: params.resolutionLocation.trim().slice(0, 240),
    resolutionLat: params.resolutionLat,
    resolutionLng: params.resolutionLng,
    gpsDistanceMeters: Math.max(0, params.gpsDistanceMeters),
    imageSimilarityScore: Math.min(1, Math.max(0, params.imageSimilarityScore)),
    ssimScore: Math.min(1, Math.max(-1, params.ssimScore)),
    aiRecommendation: params.aiRecommendation,
    aiExplanation: params.aiExplanation.slice(0, 1000),
    aiSource: params.aiSource,
    resolutionNotes: params.resolutionNotes.trim().slice(0, 1500),
    submittedByUid: params.actorUid,
    citizenDecision: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (params.beforePhotoDataUrl && params.beforePhotoDataUrl.length <= 350000) {
    verPayload.beforePhotoDataUrl = params.beforePhotoDataUrl;
  }

  batch.set(doc(db, 'complaints', params.complaintId, 'verifications', verId), verPayload);
  batch.update(doc(db, 'complaints', params.complaintId), {
    status: 'RESOLVED',
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'complaints', params.complaintId, 'auditTrail', auditId), {
    id: auditId,
    actorUid: params.actorUid,
    actorName: params.actorName.slice(0, 120),
    role: 'Admin Authority',
    action: 'Resolution Evidence Submitted',
    note: `AI Check: ${params.aiRecommendation} (${params.gpsDistanceMeters.toFixed(
      1
    )}m GPS delta). Notes: ${params.resolutionNotes.trim().slice(0, 400)}`,
    createdAt: serverTimestamp(),
  });

  if (params.aiRecommendation === 'Suspicious Evidence') {
    const escId = `ESC-${Date.now() + 2}`;
    batch.set(doc(db, 'cmEscalations', escId), {
      id: escId,
      title: `Auto CM Alert: Suspicious Resolution Evidence on ${params.complaintId}`.slice(0, 180),
      misuseType: 'suspicious_resolution',
      targetRole: 'BBMP Official',
      targetOfficialName: params.actorName.slice(0, 120) || 'BBMP Field Officer',
      wardNumber: 1,
      locality: params.resolutionLocation.trim().slice(0, 120) || 'Bengaluru',
      relatedComplaintId: params.complaintId,
      description: `Automated AI verification flagged suspicious resolution proof submitted by ${params.actorName}. GPS delta: ${params.gpsDistanceMeters.toFixed(1)}m, SSIM: ${params.ssimScore.toFixed(2)}.`,
      evidenceSummary: params.aiExplanation.slice(0, 1000) || 'Suspicious image/GPS discrepancy.',
      severity: 'Critical',
      reportedByUid: params.actorUid,
      reportedByName: `${params.actorName} (AI Audit)`.slice(0, 120),
      sourceType: 'auto_system',
      cmStatus: 'unread_alert',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `complaints/${params.complaintId}/verifications`);
    throw error;
  }
}

export async function citizenRespondToVerification(params: {
  complaintId: string;
  verificationId: string;
  citizenUid: string;
  citizenName: string;
  decision: 'confirmed' | 'disputed';
  citizenNote?: string;
  disputePhotoDataUrl?: string;
}): Promise<void> {
  const nextStatus = params.decision === 'confirmed' ? 'VERIFIED' : 'DISPUTED';
  const auditId = `AUD-${Date.now()}`;

  let awardPayload: {
    basePts: number;
    bonusPts: number;
    severity: SeverityLevel;
    category: IncidentCategory;
    stats: CitizenStats;
  } | null = null;

  if (params.decision === 'confirmed') {
    const complaintSnap = await getDoc(doc(db, 'complaints', params.complaintId));
    if (complaintSnap.exists()) {
      const cData = complaintSnap.data();
      const reporterUid = String(cData.reporterUid || '');
      const isMerged = Boolean(cData.isMergedDuplicate);
      const status = String(cData.status || '');
      if (reporterUid === params.citizenUid && !isMerged && status === 'RESOLVED') {
        const resTxId = `RES_${params.complaintId}_${params.citizenUid}`;
        const existingTx = await getDoc(doc(db, 'pointTransactions', resTxId));
        if (!existingTx.exists()) {
          await ensureCitizenStatsInitialized({
            uid: params.citizenUid,
            displayName: params.citizenName,
            wardNumber: Number(cData.wardNumber || 1),
            locality: String(cData.locality || 'Bengaluru'),
          });
          const statsSnap = await getDoc(doc(db, 'citizenStats', params.citizenUid));
          if (statsSnap.exists()) {
            const severity = (cData.confirmedSeverity as SeverityLevel) || 'Medium';
            const category =
              (cData.confirmedCategory as IncidentCategory) || IncidentCategory.Potholes;
            const bonusPts =
              severity === 'Critical'
                ? NAGRIK_POINTS_SCHEDULE.CRITICAL_SEVERITY_BONUS
                : severity === 'High'
                  ? NAGRIK_POINTS_SCHEDULE.HIGH_SEVERITY_BONUS
                  : 0;
            awardPayload = {
              basePts: NAGRIK_POINTS_SCHEDULE.RESOLVED_COMPLAINT,
              bonusPts,
              severity,
              category,
              stats: mapCitizenStatsDoc(statsSnap.data() as Record<string, unknown>),
            };
          }
        }
      }
    }
  }

  const batch = writeBatch(db);

  const verUpdates: Record<string, unknown> = {
    citizenDecision: params.decision,
    updatedAt: serverTimestamp(),
  };
  if (params.citizenNote && params.citizenNote.trim()) {
    verUpdates.citizenNote = params.citizenNote.trim().slice(0, 1000);
  }
  if (
    params.decision === 'disputed' &&
    params.disputePhotoDataUrl &&
    params.disputePhotoDataUrl.length <= 350000
  ) {
    verUpdates.disputePhotoDataUrl = params.disputePhotoDataUrl;
  }

  batch.update(
    doc(db, 'complaints', params.complaintId, 'verifications', params.verificationId),
    verUpdates
  );
  batch.update(doc(db, 'complaints', params.complaintId), {
    status: nextStatus,
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'complaints', params.complaintId, 'auditTrail', auditId), {
    id: auditId,
    actorUid: params.citizenUid,
    actorName: params.citizenName.slice(0, 120),
    role: 'Citizen Reporter',
    action:
      params.decision === 'confirmed'
        ? 'Citizen Confirmed Resolution'
        : 'Citizen Disputed Resolution',
    note:
      params.citizenNote?.trim().slice(0, 900) ||
      (params.decision === 'confirmed'
        ? 'Citizen verified field work as complete.'
        : 'Citizen disputed resolution and requested reopening.'),
    createdAt: serverTimestamp(),
  });

  if (awardPayload) {
    const period = getPeriodKeys();
    const resTxId = `RES_${params.complaintId}_${params.citizenUid}`;
    batch.set(doc(db, 'pointTransactions', resTxId), {
      id: resTxId,
      uid: params.citizenUid,
      complaintId: params.complaintId,
      referenceId: params.complaintId,
      actionType: 'resolved_complaint',
      points: awardPayload.basePts,
      ...period,
      awardedByUid: params.citizenUid,
      description: `Verified resolved complaint ${params.complaintId} (${awardPayload.category})`,
      createdAt: serverTimestamp(),
    });

    if (awardPayload.bonusPts > 0) {
      const sevTxId = `SEV_${params.complaintId}_${params.citizenUid}`;
      batch.set(doc(db, 'pointTransactions', sevTxId), {
        id: sevTxId,
        uid: params.citizenUid,
        complaintId: params.complaintId,
        referenceId: params.complaintId,
        actionType:
          awardPayload.severity === 'Critical'
            ? 'critical_severity_bonus'
            : 'high_severity_bonus',
        points: awardPayload.bonusPts,
        ...period,
        awardedByUid: params.citizenUid,
        description: `${awardPayload.severity} severity verified resolution bonus for ${params.complaintId}`,
        createdAt: serverTimestamp(),
      });
    }

    const updatedStats = computeUpdatedStatsFields(awardPayload.stats, {
      pointsDelta: awardPayload.basePts + awardPayload.bonusPts,
      resolvedDelta: 1,
      highSeverityDelta: awardPayload.severity === 'High' ? 1 : 0,
      criticalSeverityDelta: awardPayload.severity === 'Critical' ? 1 : 0,
      categoryResolved: awardPayload.category,
    });
    batch.update(doc(db, 'citizenStats', params.citizenUid), {
      ...updatedStats,
      updatedAt: serverTimestamp(),
    });
  }

  if (params.decision === 'disputed') {
    const escId = `ESC-${Date.now() + 3}`;
    batch.set(doc(db, 'cmEscalations', escId), {
      id: escId,
      title: `Citizen Disputed Closure on ${params.complaintId} — CM Oversight Alert`.slice(0, 180),
      misuseType: 'suspicious_resolution',
      targetRole: 'BBMP Official',
      targetOfficialName: 'Ward BBMP Engineering / Contractor Team',
      wardNumber: 1,
      locality: 'Bengaluru Civic Ward',
      relatedComplaintId: params.complaintId,
      description: `Citizen ${params.citizenName} disputed a claimed resolution on complaint ${params.complaintId}. Note: ${params.citizenNote?.trim() || 'Issue remains unresolved on site.'}`,
      evidenceSummary: `Citizen verification rejected resolution on ${params.complaintId}. Immediate CM / MLA inspection requested.`,
      severity: 'High',
      reportedByUid: params.citizenUid,
      reportedByName: params.citizenName.slice(0, 120) || 'Verified Citizen',
      sourceType: 'auto_system',
      cmStatus: 'unread_alert',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `complaints/${params.complaintId}`);
    throw error;
  }
}

export async function adminBackfillVerifiedPointsForComplaint(params: {
  complaint: CivicIncident;
  adminUid: string;
}): Promise<boolean> {
  if (
    params.complaint.isMergedDuplicate ||
    params.complaint.status !== IncidentStatus.Verified ||
    !params.complaint.reporterUid
  ) {
    return false;
  }

  const resTxId = `RES_${params.complaint.id}_${params.complaint.reporterUid}`;
  const existingTx = await getDoc(doc(db, 'pointTransactions', resTxId));
  if (existingTx.exists()) return false;

  await ensureCitizenStatsInitialized({
    uid: params.complaint.reporterUid,
    displayName: params.complaint.reporterName || 'Citizen Reporter',
    wardNumber: params.complaint.wardNumber || 1,
    locality: params.complaint.locality || 'Bengaluru',
  });

  const statsSnap = await getDoc(doc(db, 'citizenStats', params.complaint.reporterUid));
  if (!statsSnap.exists()) return false;

  const cur = mapCitizenStatsDoc(statsSnap.data() as Record<string, unknown>);
  const period = getPeriodKeys();
  const severity = params.complaint.confirmedSeverity || 'Medium';
  const category = params.complaint.confirmedCategory || IncidentCategory.Potholes;
  const basePts = NAGRIK_POINTS_SCHEDULE.RESOLVED_COMPLAINT;
  const bonusPts =
    severity === 'Critical'
      ? NAGRIK_POINTS_SCHEDULE.CRITICAL_SEVERITY_BONUS
      : severity === 'High'
        ? NAGRIK_POINTS_SCHEDULE.HIGH_SEVERITY_BONUS
        : 0;

  const batch = writeBatch(db);
  batch.set(doc(db, 'pointTransactions', resTxId), {
    id: resTxId,
    uid: params.complaint.reporterUid,
    complaintId: params.complaint.id,
    referenceId: params.complaint.id,
    actionType: 'resolved_complaint',
    points: basePts,
    ...period,
    awardedByUid: params.adminUid,
    description: `Verified resolved complaint ${params.complaint.id} (${category})`,
    createdAt: serverTimestamp(),
  });

  if (bonusPts > 0) {
    const sevTxId = `SEV_${params.complaint.id}_${params.complaint.reporterUid}`;
    batch.set(doc(db, 'pointTransactions', sevTxId), {
      id: sevTxId,
      uid: params.complaint.reporterUid,
      complaintId: params.complaint.id,
      referenceId: params.complaint.id,
      actionType:
        severity === 'Critical' ? 'critical_severity_bonus' : 'high_severity_bonus',
      points: bonusPts,
      ...period,
      awardedByUid: params.adminUid,
      description: `${severity} severity verified resolution bonus for ${params.complaint.id}`,
      createdAt: serverTimestamp(),
    });
  }

  const nextStats = computeUpdatedStatsFields(cur, {
    pointsDelta: basePts + bonusPts,
    resolvedDelta: 1,
    highSeverityDelta: severity === 'High' ? 1 : 0,
    criticalSeverityDelta: severity === 'Critical' ? 1 : 0,
    categoryResolved: category,
  });

  batch.update(doc(db, 'citizenStats', params.complaint.reporterUid), {
    ...nextStats,
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
  return true;
}

// -----------------------------------------------------------------------------
// Objective 2: Duplicate Reviews & Reversible Merge
// -----------------------------------------------------------------------------
export function subscribeDuplicateReviews(
  onData: (items: DuplicateReviewRecord[]) => void
): Unsubscribe {
  const q = query(collection(db, 'duplicateReviews'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            id: String(d.id || docSnap.id),
            originalComplaintId: String(d.originalComplaintId),
            candidateComplaintId: String(d.candidateComplaintId),
            distanceMeters: Number(d.distanceMeters || 0),
            imageSimilarity: Number(d.imageSimilarity || 0),
            textSimilarity: Number(d.textSimilarity || 0),
            categoryMatch: Boolean(d.categoryMatch),
            duplicateConfidence: Number(d.duplicateConfidence || 0),
            recommendedAction: String(d.recommendedAction || ''),
            status: (d.status as DuplicateReviewRecord['status']) || 'pending_review',
            reviewedByUid:
              typeof d.reviewedByUid === 'string' ? d.reviewedByUid : undefined,
            mergeReason: typeof d.mergeReason === 'string' ? d.mergeReason : undefined,
            createdAt: formatShortStamp(timestampToIso(d.createdAt)),
            updatedAt: formatShortStamp(timestampToIso(d.updatedAt)),
          };
        })
      );
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'duplicateReviews');
    }
  );
}

export async function adminCreateDuplicateReview(input: {
  originalComplaintId: string;
  candidateComplaintId: string;
  distanceMeters: number;
  imageSimilarity: number;
  textSimilarity: number;
  categoryMatch: boolean;
  duplicateConfidence: number;
  recommendedAction: string;
}): Promise<string> {
  const dupId = `DUP-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
  await setDoc(doc(db, 'duplicateReviews', dupId), {
    id: dupId,
    originalComplaintId: input.originalComplaintId,
    candidateComplaintId: input.candidateComplaintId,
    distanceMeters: Math.max(0, input.distanceMeters),
    imageSimilarity: Math.min(1, Math.max(0, input.imageSimilarity)),
    textSimilarity: Math.min(1, Math.max(0, input.textSimilarity)),
    categoryMatch: input.categoryMatch,
    duplicateConfidence: Math.min(1, Math.max(0, input.duplicateConfidence)),
    recommendedAction: input.recommendedAction.slice(0, 120),
    status: 'pending_review',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return dupId;
}

export async function adminConfirmDuplicateMerge(params: {
  review: DuplicateReviewRecord;
  adminUid: string;
  adminName: string;
  reason: string;
}): Promise<void> {
  const batch = writeBatch(db);
  const nowId = Date.now();

  batch.update(doc(db, 'duplicateReviews', params.review.id), {
    status: 'merged',
    reviewedByUid: params.adminUid,
    mergeReason: params.reason.trim().slice(0, 500) || 'Admin confirmed duplicate link',
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'complaints', params.review.candidateComplaintId), {
    isMergedDuplicate: true,
    masterComplaintId: params.review.originalComplaintId,
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'complaints', params.review.originalComplaintId), {
    duplicateReportCount: increment(1),
    updatedAt: serverTimestamp(),
  });
  batch.set(
    doc(
      db,
      'complaints',
      params.review.originalComplaintId,
      'auditTrail',
      `AUD-${nowId}-M1`
    ),
    {
      id: `AUD-${nowId}-M1`,
      actorUid: params.adminUid,
      actorName: params.adminName.slice(0, 120),
      role: 'Admin Authority',
      action: 'Duplicate Complaint Merged',
      note: `Linked ${params.review.candidateComplaintId} (${params.review.distanceMeters.toFixed(
        1
      )}m, confidence ${(params.review.duplicateConfidence * 100).toFixed(
        0
      )}%). Reason: ${params.reason}`,
      createdAt: serverTimestamp(),
    }
  );
  batch.set(
    doc(
      db,
      'complaints',
      params.review.candidateComplaintId,
      'auditTrail',
      `AUD-${nowId}-M2`
    ),
    {
      id: `AUD-${nowId}-M2`,
      actorUid: params.adminUid,
      actorName: params.adminName.slice(0, 120),
      role: 'Admin Authority',
      action: 'Linked to Master Complaint',
      note: `Preserved original record; linked to master ${params.review.originalComplaintId}. Reason: ${params.reason}`,
      createdAt: serverTimestamp(),
    }
  );

  await batch.commit();
}

export async function adminReverseDuplicateMerge(params: {
  review: DuplicateReviewRecord;
  adminUid: string;
  adminName: string;
  reason: string;
}): Promise<void> {
  const batch = writeBatch(db);
  const nowId = Date.now();

  batch.update(doc(db, 'duplicateReviews', params.review.id), {
    status: 'reversed',
    reviewedByUid: params.adminUid,
    mergeReason: params.reason.trim().slice(0, 500) || 'Merge reversed by admin',
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'complaints', params.review.candidateComplaintId), {
    isMergedDuplicate: false,
    masterComplaintId: '',
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'complaints', params.review.originalComplaintId), {
    duplicateReportCount: increment(-1),
    updatedAt: serverTimestamp(),
  });
  batch.set(
    doc(
      db,
      'complaints',
      params.review.candidateComplaintId,
      'auditTrail',
      `AUD-${nowId}-REV`
    ),
    {
      id: `AUD-${nowId}-REV`,
      actorUid: params.adminUid,
      actorName: params.adminName.slice(0, 120),
      role: 'Admin Authority',
      action: 'Duplicate Merge Reversed',
      note: `Unlinked from ${params.review.originalComplaintId}. Reason: ${params.reason}`,
      createdAt: serverTimestamp(),
    }
  );

  await batch.commit();
}

export async function adminDismissDuplicateReview(params: {
  reviewId: string;
  adminUid: string;
  reason: string;
}): Promise<void> {
  await updateDoc(doc(db, 'duplicateReviews', params.reviewId), {
    status: 'dismissed',
    reviewedByUid: params.adminUid,
    mergeReason: params.reason.trim().slice(0, 500) || 'Confirmed distinct incidents',
    updatedAt: serverTimestamp(),
  });
}

// -----------------------------------------------------------------------------
// Municipal Wards (INR) & Research Experiments
// -----------------------------------------------------------------------------
export function subscribeWardBudgets(
  onData: (wards: WardSummary[]) => void
): Unsubscribe {
  const q = query(collection(db, 'wards'), where('wardNumber', '>=', 1));
  return onSnapshot(
    q,
    (snap) => {
      const byWard = new Map<number, Record<string, unknown>>();
      snap.docs.forEach((docSnap) => {
        const d = docSnap.data();
        byWard.set(Number(d.wardNumber), d);
      });
      onData(
        NEW_USER_WARDS.map((base) => {
          const remote = byWard.get(base.wardNumber);
          if (!remote) return base;
          return {
            ...base,
            allocatedBudgetInr: Number(remote.allocatedBudgetInr || 0),
            spentBudgetInr: Number(remote.spentBudgetInr || 0),
          };
        })
      );
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'wards');
    }
  );
}

export async function saveWardBudgetToFirestore(ward: WardSummary): Promise<void> {
  const wardId = `ward-${ward.wardNumber}`;
  await setDoc(doc(db, 'wards', wardId), {
    wardNumber: ward.wardNumber,
    name: ward.name,
    councilDistrict: ward.councilDistrict,
    population: ward.population,
    allocatedBudgetInr: Math.max(0, ward.allocatedBudgetInr),
    spentBudgetInr: Math.max(0, ward.spentBudgetInr),
    updatedAt: serverTimestamp(),
  });
}

export async function saveAllWardsToFirestore(wards: WardSummary[]): Promise<void> {
  const batch = writeBatch(db);
  for (const w of wards) {
    batch.set(doc(db, 'wards', `ward-${w.wardNumber}`), {
      wardNumber: w.wardNumber,
      name: w.name,
      councilDistrict: w.councilDistrict,
      population: w.population,
      allocatedBudgetInr: Math.max(0, w.allocatedBudgetInr),
      spentBudgetInr: Math.max(0, w.spentBudgetInr),
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

export function subscribeResearchExperiments(
  onData: (items: ResearchExperimentRecord[]) => void
): Unsubscribe {
  const q = query(collection(db, 'researchExperiments'), where('datasetSize', '>=', 0));
  return onSnapshot(
    q,
    (snap) => {
      const mapped = snap.docs
        .map((docSnap) => {
          const d = docSnap.data();
          return {
            ms: timestampToMs(d.createdAt),
            item: {
              id: String(d.id || docSnap.id),
              objectiveName: String(d.objectiveName),
              datasetSource: String(d.datasetSource),
              datasetSize: Number(d.datasetSize || 0),
              imagesPerCategory:
                typeof d.imagesPerCategory === 'string' ? d.imagesPerCategory : undefined,
              trainValSplit: String(d.trainValSplit),
              modelArchitecture: String(d.modelArchitecture),
              hyperparameters: String(d.hyperparameters),
              trainingDate: String(d.trainingDate),
              modelVersion: String(d.modelVersion),
              lifecycleState:
                (d.lifecycleState as ResearchExperimentRecord['lifecycleState']) ||
                'implemented_not_trained',
              evaluationMetrics:
                typeof d.evaluationMetrics === 'string' ? d.evaluationMetrics : undefined,
              confusionMatrix:
                typeof d.confusionMatrix === 'string' ? d.confusionMatrix : undefined,
              limitations: String(d.limitations),
              recordedByUid: String(d.recordedByUid),
              createdAt: formatShortStamp(timestampToIso(d.createdAt)),
            } as ResearchExperimentRecord,
          };
        })
        .sort((a, b) => b.ms - a.ms)
        .map((x) => x.item);
      onData(mapped);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'researchExperiments');
    }
  );
}

export async function createResearchExperiment(
  input: Omit<ResearchExperimentRecord, 'id' | 'createdAt'>
): Promise<void> {
  const expId = `EXP-${Date.now()}`;
  const payload: Record<string, unknown> = {
    id: expId,
    objectiveName: input.objectiveName.trim().slice(0, 120),
    datasetSource: input.datasetSource.trim().slice(0, 240),
    datasetSize: Math.max(0, input.datasetSize),
    trainValSplit: input.trainValSplit.trim().slice(0, 64),
    modelArchitecture: input.modelArchitecture.trim().slice(0, 160),
    hyperparameters: input.hyperparameters.trim().slice(0, 500),
    trainingDate: input.trainingDate.trim().slice(0, 64),
    modelVersion: input.modelVersion.trim().slice(0, 64),
    lifecycleState: input.lifecycleState,
    limitations: input.limitations.trim().slice(0, 1000),
    recordedByUid: input.recordedByUid,
    createdAt: serverTimestamp(),
  };

  if (input.imagesPerCategory && input.imagesPerCategory.trim()) {
    payload.imagesPerCategory = input.imagesPerCategory.trim().slice(0, 400);
  }
  if (input.evaluationMetrics && input.evaluationMetrics.trim()) {
    payload.evaluationMetrics = input.evaluationMetrics.trim().slice(0, 1000);
  }
  if (input.confusionMatrix && input.confusionMatrix.trim()) {
    payload.confusionMatrix = input.confusionMatrix.trim().slice(0, 1000);
  }

  await setDoc(doc(db, 'researchExperiments', expId), payload);
}

export async function fetchAllComplaintsSnapshot(): Promise<CivicIncident[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'complaints'), where('visibility', '==', 'public'))
    );
    return snap.docs.map((d) => mapComplaintDoc(d.id, d.data() as Record<string, unknown>));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'complaints');
    return [];
  }
}

// -----------------------------------------------------------------------------
// Welfare Officer RBAC
// -----------------------------------------------------------------------------
export async function checkIsWelfareOfficer(
  uid: string,
  email: string | null
): Promise<boolean> {
  const isAdmin = await checkIsAdminUser(uid, email);
  if (isAdmin) return true;
  try {
    const snap = await getDoc(doc(db, 'welfareOfficers', uid));
    return snap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `welfareOfficers/${uid}`);
    return false;
  }
}

export function subscribeWelfareOfficers(
  onData: (officers: WelfareOfficerRecord[]) => void
): Unsubscribe {
  const q = query(collection(db, 'welfareOfficers'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            uid: String(d.uid),
            displayName: String(d.displayName),
            department: String(d.department),
            badgeId: String(d.badgeId),
            approvedByUid: String(d.approvedByUid),
            createdAt: timestampToIso(d.createdAt),
          };
        })
      );
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'welfareOfficers');
    }
  );
}

export async function grantWelfareOfficerRole(params: {
  uid: string;
  displayName: string;
  department: string;
  badgeId: string;
}): Promise<void> {
  const approverUid = auth.currentUser?.uid;
  if (!approverUid) throw new Error('Admin authentication required.');
  try {
    await setDoc(doc(db, 'welfareOfficers', params.uid.trim()), {
      uid: params.uid.trim(),
      displayName: params.displayName.trim().slice(0, 120),
      department: params.department.trim().slice(0, 120),
      badgeId: params.badgeId.trim().slice(0, 64),
      approvedByUid: approverUid,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `welfareOfficers/${params.uid}`);
    throw error;
  }
}

// -----------------------------------------------------------------------------
// Citizen Stats, Leaderboard, Badges & Points Transaction Ledger
// -----------------------------------------------------------------------------
function mapCitizenStatsDoc(d: Record<string, unknown>): CitizenStats {
  return {
    uid: String(d.uid || ''),
    publicDisplayName: String(d.publicDisplayName || 'Bengaluru Citizen'),
    hideDisplayName: Boolean(d.hideDisplayName),
    wardNumber: Number(d.wardNumber || 1),
    locality: String(d.locality || 'Indiranagar'),
    totalPoints: Number(d.totalPoints || 0),
    monthlyPoints: Number(d.monthlyPoints || 0),
    quarterlyPoints: Number(d.quarterlyPoints || 0),
    annualPoints: Number(d.annualPoints || 0),
    resolvedCount: Number(d.resolvedCount || 0),
    highSeverityCount: Number(d.highSeverityCount || 0),
    criticalSeverityCount: Number(d.criticalSeverityCount || 0),
    independentVerificationsCount: Number(d.independentVerificationsCount || 0),
    validDuplicatesCount: Number(d.validDuplicatesCount || 0),
    acceptedInfoCount: Number(d.acceptedInfoCount || 0),
    activitiesParticipatedCount: Number(d.activitiesParticipatedCount || 0),
    potholesResolved: Number(d.potholesResolved || 0),
    garbageResolved: Number(d.garbageResolved || 0),
    waterResolved: Number(d.waterResolved || 0),
    streetlightsResolved: Number(d.streetlightsResolved || 0),
    achievementLevel:
      (d.achievementLevel as CitizenStats['achievementLevel']) || 'Bronze Citizen',
    badges: Array.isArray(d.badges) ? (d.badges as CitizenStats['badges']) : [],
    updatedAt: formatShortStamp(timestampToIso(d.updatedAt)),
  };
}

function computeUpdatedStatsFields(
  cur: CitizenStats,
  deltas: {
    pointsDelta?: number;
    resolvedDelta?: number;
    highSeverityDelta?: number;
    criticalSeverityDelta?: number;
    independentVerifDelta?: number;
    validDupDelta?: number;
    acceptedInfoDelta?: number;
    activitiesDelta?: number;
    categoryResolved?: IncidentCategory;
  }
): Record<string, unknown> {
  const pts = deltas.pointsDelta || 0;
  const totalPoints = Math.max(0, cur.totalPoints + pts);
  const monthlyPoints = Math.max(0, cur.monthlyPoints + pts);
  const quarterlyPoints = Math.max(0, cur.quarterlyPoints + pts);
  const annualPoints = Math.max(0, cur.annualPoints + pts);
  const resolvedCount = cur.resolvedCount + (deltas.resolvedDelta || 0);
  const highSeverityCount = cur.highSeverityCount + (deltas.highSeverityDelta || 0);
  const criticalSeverityCount = cur.criticalSeverityCount + (deltas.criticalSeverityDelta || 0);
  const independentVerificationsCount =
    cur.independentVerificationsCount + (deltas.independentVerifDelta || 0);
  const validDuplicatesCount = cur.validDuplicatesCount + (deltas.validDupDelta || 0);
  const acceptedInfoCount = cur.acceptedInfoCount + (deltas.acceptedInfoDelta || 0);
  const activitiesParticipatedCount =
    cur.activitiesParticipatedCount + (deltas.activitiesDelta || 0);

  const potholesResolved =
    cur.potholesResolved + (deltas.categoryResolved === IncidentCategory.Potholes ? 1 : 0);
  const garbageResolved =
    cur.garbageResolved +
    (deltas.categoryResolved === IncidentCategory.GarbageAccumulation ? 1 : 0);
  const waterResolved =
    cur.waterResolved + (deltas.categoryResolved === IncidentCategory.WaterLeakage ? 1 : 0);
  const streetlightsResolved =
    cur.streetlightsResolved +
    (deltas.categoryResolved === IncidentCategory.BrokenStreetlights ? 1 : 0);

  const nextSummary = {
    totalPoints,
    resolvedCount,
    independentVerificationsCount,
    validDuplicatesCount,
    acceptedInfoCount,
    activitiesParticipatedCount,
    potholesResolved,
    garbageResolved,
    waterResolved,
    streetlightsResolved,
  };

  const out: Record<string, unknown> = {
    totalPoints,
    monthlyPoints,
    quarterlyPoints,
    annualPoints,
    achievementLevel: computeAchievementLevel(totalPoints),
    badges: computeEarnedBadges(nextSummary),
  };

  if (deltas.resolvedDelta) out.resolvedCount = resolvedCount;
  if (deltas.highSeverityDelta) out.highSeverityCount = highSeverityCount;
  if (deltas.criticalSeverityDelta) out.criticalSeverityCount = criticalSeverityCount;
  if (deltas.independentVerifDelta)
    out.independentVerificationsCount = independentVerificationsCount;
  if (deltas.validDupDelta) out.validDuplicatesCount = validDuplicatesCount;
  if (deltas.acceptedInfoDelta) out.acceptedInfoCount = acceptedInfoCount;
  if (deltas.activitiesDelta) out.activitiesParticipatedCount = activitiesParticipatedCount;
  if (deltas.categoryResolved === IncidentCategory.Potholes)
    out.potholesResolved = potholesResolved;
  if (deltas.categoryResolved === IncidentCategory.GarbageAccumulation)
    out.garbageResolved = garbageResolved;
  if (deltas.categoryResolved === IncidentCategory.WaterLeakage)
    out.waterResolved = waterResolved;
  if (deltas.categoryResolved === IncidentCategory.BrokenStreetlights)
    out.streetlightsResolved = streetlightsResolved;

  return out;
}

export async function ensureCitizenStatsInitialized(params: {
  uid: string;
  displayName: string;
  wardNumber: number;
  locality: string;
}): Promise<void> {
  const statsRef = doc(db, 'citizenStats', params.uid);
  try {
    const snap = await getDoc(statsRef);
    if (snap.exists()) return;
    await setDoc(statsRef, {
      uid: params.uid,
      publicDisplayName: params.displayName.trim().slice(0, 120) || 'Bengaluru Citizen',
      hideDisplayName: false,
      wardNumber: Math.min(99, Math.max(1, params.wardNumber || 1)),
      locality: params.locality.trim().slice(0, 120) || 'Indiranagar',
      totalPoints: 0,
      monthlyPoints: 0,
      quarterlyPoints: 0,
      annualPoints: 0,
      resolvedCount: 0,
      highSeverityCount: 0,
      criticalSeverityCount: 0,
      independentVerificationsCount: 0,
      validDuplicatesCount: 0,
      acceptedInfoCount: 0,
      activitiesParticipatedCount: 0,
      potholesResolved: 0,
      garbageResolved: 0,
      waterResolved: 0,
      streetlightsResolved: 0,
      achievementLevel: 'Bronze Citizen',
      badges: [],
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `citizenStats/${params.uid}`);
  }
}

export async function updateCitizenPrivacyToggle(params: {
  uid: string;
  hideDisplayName: boolean;
  publicDisplayName: string;
  wardNumber: number;
  locality: string;
}): Promise<void> {
  try {
    await updateDoc(doc(db, 'citizenStats', params.uid), {
      hideDisplayName: params.hideDisplayName,
      publicDisplayName: params.publicDisplayName.trim().slice(0, 120) || 'Bengaluru Citizen',
      wardNumber: Math.min(99, Math.max(1, params.wardNumber)),
      locality: params.locality.trim().slice(0, 120) || 'Indiranagar',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `citizenStats/${params.uid}`);
    throw error;
  }
}

export function subscribeAllCitizenStats(
  onData: (stats: CitizenStats[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'citizenStats'),
    where('totalPoints', '>=', 0),
    orderBy('totalPoints', 'desc')
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => mapCitizenStatsDoc(d.data() as Record<string, unknown>)));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'citizenStats');
    }
  );
}

function mapPointTransactionDoc(docId: string, d: Record<string, unknown>): PointTransaction {
  return {
    id: String(d.id || docId),
    uid: String(d.uid || ''),
    complaintId: typeof d.complaintId === 'string' ? d.complaintId : undefined,
    referenceId: String(d.referenceId || ''),
    actionType: (d.actionType as PointActionType) || 'resolved_complaint',
    points: Number(d.points || 0),
    monthKey: String(d.monthKey || ''),
    quarterKey: String(d.quarterKey || ''),
    yearKey: String(d.yearKey || ''),
    awardedByUid: String(d.awardedByUid || ''),
    description: String(d.description || ''),
    createdAt: formatShortStamp(timestampToIso(d.createdAt)),
  };
}

export function subscribeCitizenPointTransactions(
  uid: string,
  onData: (items: PointTransaction[]) => void
): Unsubscribe {
  const q = query(collection(db, 'pointTransactions'), where('uid', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const mapped = snap.docs
        .map((d) => ({
          ms: timestampToMs(d.data().createdAt),
          item: mapPointTransactionDoc(d.id, d.data() as Record<string, unknown>),
        }))
        .sort((a, b) => b.ms - a.ms)
        .map((x) => x.item);
      onData(mapped);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'pointTransactions');
    }
  );
}

// -----------------------------------------------------------------------------
// Citizen Participation Contributions on Complaints
// -----------------------------------------------------------------------------
export function subscribeComplaintContributions(
  complaintId: string,
  onData: (items: ComplaintContribution[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'complaints', complaintId, 'contributions'),
    where('complaintId', '==', complaintId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const mapped = snap.docs
        .map((docSnap) => {
          const d = docSnap.data();
          return {
            ms: timestampToMs(d.createdAt),
            item: {
              id: String(d.id || docSnap.id),
              complaintId: String(d.complaintId),
              contributorUid: String(d.contributorUid),
              contributorName: String(d.contributorName || 'Citizen'),
              type: (d.type as ContributionType) || 'additional_info',
              note: String(d.note || ''),
              relatedComplaintId:
                typeof d.relatedComplaintId === 'string' ? d.relatedComplaintId : undefined,
              verificationOutcome:
                d.verificationOutcome === 'confirmed_fixed' ||
                d.verificationOutcome === 'still_unresolved'
                  ? d.verificationOutcome
                  : undefined,
              photoDataUrl:
                typeof d.photoDataUrl === 'string' ? d.photoDataUrl : undefined,
              status: (d.status as ComplaintContribution['status']) || 'pending',
              pointsAwarded: Number(d.pointsAwarded || 0),
              reviewedByUid:
                typeof d.reviewedByUid === 'string' ? d.reviewedByUid : undefined,
              reviewNote: typeof d.reviewNote === 'string' ? d.reviewNote : undefined,
              createdAt: formatShortStamp(timestampToIso(d.createdAt)),
              updatedAt: formatShortStamp(timestampToIso(d.updatedAt)),
            } as ComplaintContribution,
          };
        })
        .sort((a, b) => b.ms - a.ms)
        .map((x) => x.item);
      onData(mapped);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, `complaints/${complaintId}/contributions`);
    }
  );
}

export async function submitComplaintContribution(params: {
  complaint: CivicIncident;
  contributorUid: string;
  contributorName: string;
  type: ContributionType;
  note: string;
  relatedComplaintId?: string;
  verificationOutcome?: 'confirmed_fixed' | 'still_unresolved';
  photoDataUrl?: string;
}): Promise<void> {
  if (
    params.type === 'independent_verification' &&
    params.complaint.reporterUid === params.contributorUid
  ) {
    throw new Error(
      'Independent resolution verification must be submitted by a citizen other than the original reporter.'
    );
  }
  if (
    params.type === 'duplicate_flag' &&
    params.relatedComplaintId?.trim() === params.complaint.id
  ) {
    throw new Error('Cannot flag a complaint as a duplicate of itself.');
  }

  const contribId = `CTR-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
  const payload: Record<string, unknown> = {
    id: contribId,
    complaintId: params.complaint.id,
    contributorUid: params.contributorUid,
    contributorName: params.contributorName.trim().slice(0, 120) || 'Citizen Contributor',
    type: params.type,
    note: params.note.trim().slice(0, 1200),
    status: 'pending',
    pointsAwarded: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (params.relatedComplaintId && params.relatedComplaintId.trim()) {
    payload.relatedComplaintId = params.relatedComplaintId.trim().slice(0, 64);
  }
  if (params.verificationOutcome) {
    payload.verificationOutcome = params.verificationOutcome;
  }
  if (params.photoDataUrl && params.photoDataUrl.length <= 350000) {
    payload.photoDataUrl = params.photoDataUrl;
  }

  try {
    await setDoc(
      doc(db, 'complaints', params.complaint.id, 'contributions', contribId),
      payload
    );
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.CREATE,
      `complaints/${params.complaint.id}/contributions/${contribId}`
    );
    throw error;
  }
}

export async function adminReviewContributionAndAwardPoints(params: {
  complaint: CivicIncident;
  contribution: ComplaintContribution;
  decision: 'accepted' | 'rejected';
  adminUid: string;
  adminName: string;
  reviewNote: string;
}): Promise<number> {
  const contribRef = doc(
    db,
    'complaints',
    params.complaint.id,
    'contributions',
    params.contribution.id
  );

  if (params.decision === 'rejected') {
    try {
      await updateDoc(contribRef, {
        status: 'rejected',
        pointsAwarded: 0,
        reviewedByUid: params.adminUid,
        reviewNote: params.reviewNote.trim().slice(0, 500) || 'Did not meet verification criteria',
        updatedAt: serverTimestamp(),
      });
      return 0;
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `complaints/${params.complaint.id}/contributions/${params.contribution.id}`
      );
      throw error;
    }
  }

  // Anti-self-reward check on independent verification
  if (
    params.contribution.type === 'independent_verification' &&
    params.contribution.contributorUid === params.complaint.reporterUid
  ) {
    throw new Error('Cannot award independent verification points to original reporter.');
  }

  const txId = `CONTRIB_${params.contribution.id}`;
  const existingTx = await getDoc(doc(db, 'pointTransactions', txId));
  if (existingTx.exists()) {
    throw new Error('Points have already been awarded for this contribution.');
  }

  let points = 0;
  let actionType: PointActionType = 'accepted_additional_info';
  let desc = '';

  if (params.contribution.type === 'independent_verification') {
    points = NAGRIK_POINTS_SCHEDULE.INDEPENDENT_VERIFICATION;
    actionType = 'independent_verification';
    desc = `Independent resolution verification (${params.contribution.verificationOutcome || 'checked'}) on ${params.complaint.id}`;
  } else if (params.contribution.type === 'duplicate_flag') {
    points = NAGRIK_POINTS_SCHEDULE.VALID_DUPLICATE;
    actionType = 'valid_duplicate';
    desc = `Valid duplicate identification on ${params.complaint.id}`;
  } else {
    points = NAGRIK_POINTS_SCHEDULE.ACCEPTED_ADDITIONAL_INFO;
    actionType = 'accepted_additional_info';
    desc = `Accepted additional field context on ${params.complaint.id}`;
  }

  await ensureCitizenStatsInitialized({
    uid: params.contribution.contributorUid,
    displayName: params.contribution.contributorName,
    wardNumber: params.complaint.wardNumber,
    locality: params.complaint.locality,
  });

  const statsSnap = await getDoc(doc(db, 'citizenStats', params.contribution.contributorUid));
  if (!statsSnap.exists()) {
    throw new Error('Unable to initialize contributor statistics record.');
  }
  const curStats = mapCitizenStatsDoc(statsSnap.data() as Record<string, unknown>);
  const nextStats = computeUpdatedStatsFields(curStats, {
    pointsDelta: points,
    independentVerifDelta:
      params.contribution.type === 'independent_verification' ? 1 : 0,
    validDupDelta: params.contribution.type === 'duplicate_flag' ? 1 : 0,
    acceptedInfoDelta: params.contribution.type === 'additional_info' ? 1 : 0,
  });

  const batch = writeBatch(db);
  const period = getPeriodKeys();
  const auditId = `AUD-${Date.now()}`;

  batch.update(contribRef, {
    status: 'accepted',
    pointsAwarded: points,
    reviewedByUid: params.adminUid,
    reviewNote:
      params.reviewNote.trim().slice(0, 500) ||
      `Verified and awarded +${points} civic points`,
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'pointTransactions', txId), {
    id: txId,
    uid: params.contribution.contributorUid,
    complaintId: params.complaint.id,
    referenceId: params.contribution.id,
    actionType,
    points,
    ...period,
    awardedByUid: params.adminUid,
    description: desc.slice(0, 300),
    createdAt: serverTimestamp(),
  });

  batch.update(doc(db, 'citizenStats', params.contribution.contributorUid), {
    ...nextStats,
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'complaints', params.complaint.id, 'auditTrail', auditId), {
    id: auditId,
    actorUid: params.adminUid,
    actorName: params.adminName.slice(0, 120),
    role: 'Admin Authority',
    action: `Accepted ${params.contribution.type}`,
    note: `Awarded +${points} verified pts to ${params.contribution.contributorName}. ${params.reviewNote}`,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return points;
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.WRITE,
      `complaints/${params.complaint.id}/contributions/${params.contribution.id}`
    );
    throw error;
  }
}

// -----------------------------------------------------------------------------
// Bengaluru Locality Civic Improvement Activities
// -----------------------------------------------------------------------------
export function subscribeCivicActivities(
  onData: (items: CivicActivity[]) => void
): Unsubscribe {
  const q = query(collection(db, 'civicActivities'), where('wardNumber', '>=', 1));
  return onSnapshot(
    q,
    (snap) => {
      const mapped = snap.docs
        .map((docSnap) => {
          const d = docSnap.data();
          return {
            ms: timestampToMs(d.createdAt),
            item: {
              id: String(d.id || docSnap.id),
              title: String(d.title || ''),
              description: String(d.description || ''),
              wardNumber: Number(d.wardNumber || 1),
              locality: String(d.locality || 'Indiranagar'),
              scheduledDate: String(d.scheduledDate || ''),
              status: (d.status as CivicActivity['status']) || 'upcoming',
              participantCount: Number(d.participantCount || 0),
              createdByUid: String(d.createdByUid || ''),
              createdAt: formatShortStamp(timestampToIso(d.createdAt)),
            } as CivicActivity,
          };
        })
        .sort((a, b) => b.ms - a.ms)
        .map((x) => x.item);
      onData(mapped);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'civicActivities');
    }
  );
}

export async function createCivicActivity(params: {
  title: string;
  description: string;
  wardNumber: number;
  locality: string;
  scheduledDate: string;
  createdByUid: string;
}): Promise<void> {
  const actId = `ACT-${Date.now()}`;
  try {
    await setDoc(doc(db, 'civicActivities', actId), {
      id: actId,
      title: params.title.trim().slice(0, 160),
      description: params.description.trim().slice(0, 1000),
      wardNumber: Math.min(99, Math.max(1, params.wardNumber)),
      locality: params.locality.trim().slice(0, 120),
      scheduledDate: params.scheduledDate.trim().slice(0, 64),
      status: 'upcoming',
      participantCount: 0,
      createdByUid: params.createdByUid,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `civicActivities/${actId}`);
    throw error;
  }
}

export async function getUserActivityParticipation(
  activityId: string,
  uid: string
): Promise<CivicActivityParticipant | null> {
  try {
    const snap = await getDoc(doc(db, 'civicActivities', activityId, 'participants', uid));
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      uid: String(d.uid),
      activityId: String(d.activityId),
      displayName: String(d.displayName),
      attendanceVerified: Boolean(d.attendanceVerified),
      createdAt: formatShortStamp(timestampToIso(d.createdAt)),
    };
  } catch {
    return null;
  }
}

export async function joinCivicActivity(params: {
  activityId: string;
  uid: string;
  displayName: string;
}): Promise<void> {
  const partRef = doc(db, 'civicActivities', params.activityId, 'participants', params.uid);
  const existing = await getDoc(partRef);
  if (existing.exists()) {
    throw new Error('You are already registered for this Bengaluru civic drive.');
  }

  const batch = writeBatch(db);
  batch.set(partRef, {
    uid: params.uid,
    activityId: params.activityId,
    displayName: params.displayName.trim().slice(0, 120) || 'Citizen Volunteer',
    attendanceVerified: false,
    createdAt: serverTimestamp(),
  });
  batch.update(doc(db, 'civicActivities', params.activityId), {
    participantCount: increment(1),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.WRITE,
      `civicActivities/${params.activityId}/participants/${params.uid}`
    );
    throw error;
  }
}

export function subscribeActivityParticipants(
  activityId: string,
  onData: (items: CivicActivityParticipant[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'civicActivities', activityId, 'participants'),
    orderBy('createdAt', 'asc')
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            uid: String(data.uid),
            activityId: String(data.activityId),
            displayName: String(data.displayName),
            attendanceVerified: Boolean(data.attendanceVerified),
            createdAt: formatShortStamp(timestampToIso(data.createdAt)),
          };
        })
      );
    },
    (error) => {
      handleFirestoreError(
        error,
        OperationType.LIST,
        `civicActivities/${activityId}/participants`
      );
    }
  );
}

export async function adminVerifyActivityAttendance(params: {
  activity: CivicActivity;
  participant: CivicActivityParticipant;
  adminUid: string;
}): Promise<void> {
  const txId = `ACT_${params.activity.id}_${params.participant.uid}`;
  const existingTx = await getDoc(doc(db, 'pointTransactions', txId));
  if (existingTx.exists() || params.participant.attendanceVerified) {
    throw new Error('Attendance already verified for this participant.');
  }

  await ensureCitizenStatsInitialized({
    uid: params.participant.uid,
    displayName: params.participant.displayName,
    wardNumber: params.activity.wardNumber,
    locality: params.activity.locality,
  });

  const statsSnap = await getDoc(doc(db, 'citizenStats', params.participant.uid));
  if (!statsSnap.exists()) throw new Error('Participant stats record missing.');
  const curStats = mapCitizenStatsDoc(statsSnap.data() as Record<string, unknown>);
  const points = NAGRIK_POINTS_SCHEDULE.CIVIC_ACTIVITY_VERIFIED;
  const nextStats = computeUpdatedStatsFields(curStats, {
    pointsDelta: points,
    activitiesDelta: 1,
  });
  const period = getPeriodKeys();

  const batch = writeBatch(db);
  batch.update(
    doc(db, 'civicActivities', params.activity.id, 'participants', params.participant.uid),
    { attendanceVerified: true }
  );
  batch.set(doc(db, 'pointTransactions', txId), {
    id: txId,
    uid: params.participant.uid,
    referenceId: params.activity.id,
    actionType: 'civic_activity',
    points,
    ...period,
    awardedByUid: params.adminUid,
    description: `Verified attendance at ${params.activity.title} (${params.activity.locality})`,
    createdAt: serverTimestamp(),
  });
  batch.update(doc(db, 'citizenStats', params.participant.uid), {
    ...nextStats,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.WRITE,
      `civicActivities/${params.activity.id}/participants/${params.participant.uid}`
    );
    throw error;
  }
}

// -----------------------------------------------------------------------------
// NAGRIK Citizen Impact & Welfare Portal + Welfare Officer Operations
// -----------------------------------------------------------------------------
function mapWelfareProgrammeDoc(docId: string, d: Record<string, unknown>): WelfareProgramme {
  return {
    id: String(d.id || docId),
    title: String(d.title || ''),
    programmeType:
      (d.programmeType as WelfareProgramme['programmeType']) ||
      'Civic Contribution Recognition Award',
    description: String(d.description || ''),
    eligibilityConditions: String(d.eligibilityConditions || ''),
    minVerifiedPoints: Number(d.minVerifiedPoints || 0),
    minResolvedComplaints: Number(d.minResolvedComplaints || 0),
    requiresStudentStatus: Boolean(d.requiresStudentStatus),
    requiresFinancialNeedCheck: Boolean(d.requiresFinancialNeedCheck),
    allocatedBudgetInr: Number(d.allocatedBudgetInr || 0),
    disbursedBudgetInr: Number(d.disbursedBudgetInr || 0),
    maxBenefitPerApplicantInr: Number(d.maxBenefitPerApplicantInr || 0),
    authorizationStatus:
      (d.authorizationStatus as WelfareProgramme['authorizationStatus']) || 'draft_unfunded',
    fundingAuthorityNote: String(d.fundingAuthorityNote || ''),
    createdByUid: String(d.createdByUid || ''),
    createdAt: formatShortStamp(timestampToIso(d.createdAt)),
    updatedAt: formatShortStamp(timestampToIso(d.updatedAt)),
  };
}

export function subscribeWelfareProgrammes(
  onData: (items: WelfareProgramme[]) => void
): Unsubscribe {
  const q = query(collection(db, 'welfareProgrammes'), where('allocatedBudgetInr', '>=', 0));
  return onSnapshot(
    q,
    (snap) => {
      const mapped = snap.docs
        .map((d) => ({
          ms: timestampToMs(d.data().createdAt),
          item: mapWelfareProgrammeDoc(d.id, d.data() as Record<string, unknown>),
        }))
        .sort((a, b) => b.ms - a.ms)
        .map((x) => x.item);
      onData(mapped);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'welfareProgrammes');
    }
  );
}

export async function saveWelfareProgramme(params: {
  existingId?: string;
  title: string;
  programmeType: WelfareProgramme['programmeType'];
  description: string;
  eligibilityConditions: string;
  minVerifiedPoints: number;
  minResolvedComplaints: number;
  requiresStudentStatus: boolean;
  requiresFinancialNeedCheck: boolean;
  allocatedBudgetInr: number;
  maxBenefitPerApplicantInr: number;
  authorizationStatus: WelfareProgramme['authorizationStatus'];
  fundingAuthorityNote: string;
  actorUid: string;
}): Promise<string> {
  const id = params.existingId || `WLP-${Date.now()}`;
  const ref = doc(db, 'welfareProgrammes', id);

  try {
    if (params.existingId) {
      await updateDoc(ref, {
        title: params.title.trim().slice(0, 160),
        programmeType: params.programmeType,
        description: params.description.trim().slice(0, 1500),
        eligibilityConditions: params.eligibilityConditions.trim().slice(0, 1500),
        minVerifiedPoints: Math.max(0, params.minVerifiedPoints),
        minResolvedComplaints: Math.max(0, params.minResolvedComplaints),
        requiresStudentStatus: params.requiresStudentStatus,
        requiresFinancialNeedCheck: params.requiresFinancialNeedCheck,
        allocatedBudgetInr: Math.max(0, params.allocatedBudgetInr),
        maxBenefitPerApplicantInr: Math.max(0, params.maxBenefitPerApplicantInr),
        authorizationStatus: params.authorizationStatus,
        fundingAuthorityNote: params.fundingAuthorityNote.trim().slice(0, 400),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        id,
        title: params.title.trim().slice(0, 160),
        programmeType: params.programmeType,
        description: params.description.trim().slice(0, 1500),
        eligibilityConditions: params.eligibilityConditions.trim().slice(0, 1500),
        minVerifiedPoints: Math.max(0, params.minVerifiedPoints),
        minResolvedComplaints: Math.max(0, params.minResolvedComplaints),
        requiresStudentStatus: params.requiresStudentStatus,
        requiresFinancialNeedCheck: params.requiresFinancialNeedCheck,
        allocatedBudgetInr: Math.max(0, params.allocatedBudgetInr),
        disbursedBudgetInr: 0,
        maxBenefitPerApplicantInr: Math.max(0, params.maxBenefitPerApplicantInr),
        authorizationStatus: params.authorizationStatus,
        fundingAuthorityNote:
          params.fundingAuthorityNote.trim().slice(0, 400) ||
          'Unfunded draft pending municipal/CSR authorization',
        createdByUid: params.actorUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `welfareProgrammes/${id}`);
    throw error;
  }
}

function mapWelfareApplicationDoc(docId: string, d: Record<string, unknown>): WelfareApplication {
  return {
    id: String(d.id || docId),
    programmeId: String(d.programmeId || ''),
    programmeTitle: String(d.programmeTitle || ''),
    applicantUid: String(d.applicantUid || ''),
    applicantName: String(d.applicantName || ''),
    wardNumber: Number(d.wardNumber || 1),
    locality: String(d.locality || ''),
    verifiedPointsSnapshot: Number(d.verifiedPointsSnapshot || 0),
    resolvedComplaintsSnapshot: Number(d.resolvedComplaintsSnapshot || 0),
    educationalStatus: String(d.educationalStatus || ''),
    institutionName: typeof d.institutionName === 'string' ? d.institutionName : undefined,
    householdIncomeBracket: String(d.householdIncomeBracket || ''),
    financialNeedStatement: String(d.financialNeedStatement || ''),
    supportingDocumentName: String(d.supportingDocumentName || ''),
    supportingDocumentDataUrl:
      typeof d.supportingDocumentDataUrl === 'string'
        ? d.supportingDocumentDataUrl
        : undefined,
    status: (d.status as WelfareApplication['status']) || 'Submitted',
    officerDecisionReason:
      typeof d.officerDecisionReason === 'string' ? d.officerDecisionReason : undefined,
    reviewedByUid: typeof d.reviewedByUid === 'string' ? d.reviewedByUid : undefined,
    approvedAmountInr:
      typeof d.approvedAmountInr === 'number' ? d.approvedAmountInr : undefined,
    disbursementReference:
      typeof d.disbursementReference === 'string' ? d.disbursementReference : undefined,
    disbursementNote:
      typeof d.disbursementNote === 'string' ? d.disbursementNote : undefined,
    appealSubmitted: Boolean(d.appealSubmitted),
    appealReason: typeof d.appealReason === 'string' ? d.appealReason : undefined,
    appealStatus: (d.appealStatus as WelfareApplication['appealStatus']) || 'none',
    appealDecisionNote:
      typeof d.appealDecisionNote === 'string' ? d.appealDecisionNote : undefined,
    notificationMessage: String(d.notificationMessage || ''),
    createdAt: formatShortStamp(timestampToIso(d.createdAt)),
    updatedAt: formatShortStamp(timestampToIso(d.updatedAt)),
  };
}

export function subscribeMyWelfareApplications(
  uid: string,
  onData: (items: WelfareApplication[]) => void
): Unsubscribe {
  const q = query(collection(db, 'welfareApplications'), where('applicantUid', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const mapped = snap.docs
        .map((d) => ({
          ms: timestampToMs(d.data().createdAt),
          item: mapWelfareApplicationDoc(d.id, d.data() as Record<string, unknown>),
        }))
        .sort((a, b) => b.ms - a.ms)
        .map((x) => x.item);
      onData(mapped);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'welfareApplications');
    }
  );
}

export function subscribeAllWelfareApplications(
  onData: (items: WelfareApplication[]) => void
): Unsubscribe {
  const q = query(collection(db, 'welfareApplications'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => mapWelfareApplicationDoc(d.id, d.data() as Record<string, unknown>))
      );
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'welfareApplications');
    }
  );
}

export async function submitWelfareApplication(params: {
  programme: WelfareProgramme;
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
}): Promise<string> {
  const appId = `WAPP-${Date.now()}`;
  const payload: Record<string, unknown> = {
    id: appId,
    programmeId: params.programme.id,
    programmeTitle: params.programme.title.slice(0, 160),
    applicantUid: params.applicantUid,
    applicantName: params.applicantName.trim().slice(0, 120) || 'Citizen Applicant',
    wardNumber: Math.min(99, Math.max(1, params.wardNumber)),
    locality: params.locality.trim().slice(0, 120) || 'Bengaluru',
    verifiedPointsSnapshot: Math.max(0, params.verifiedPointsSnapshot),
    resolvedComplaintsSnapshot: Math.max(0, params.resolvedComplaintsSnapshot),
    educationalStatus: params.educationalStatus.trim().slice(0, 120),
    householdIncomeBracket: params.householdIncomeBracket.trim().slice(0, 120),
    financialNeedStatement: params.financialNeedStatement.trim().slice(0, 1500),
    supportingDocumentName: params.supportingDocumentName.trim().slice(0, 200),
    status: 'Submitted',
    appealSubmitted: false,
    appealStatus: 'none',
    notificationMessage: `Application ${appId} submitted for ${params.programme.title}. Pending Welfare Officer verification.`,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (params.institutionName && params.institutionName.trim()) {
    payload.institutionName = params.institutionName.trim().slice(0, 180);
  }
  if (params.supportingDocumentDataUrl && params.supportingDocumentDataUrl.length <= 350000) {
    payload.supportingDocumentDataUrl = params.supportingDocumentDataUrl;
  }

  try {
    await setDoc(doc(db, 'welfareApplications', appId), payload);
    return appId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `welfareApplications/${appId}`);
    throw error;
  }
}

export async function officerUpdateWelfareApplication(params: {
  application: WelfareApplication;
  programme?: WelfareProgramme;
  nextStatus: WelfareApplication['status'];
  decisionReason: string;
  officerUid: string;
  approvedAmountInr?: number;
  disbursementReference?: string;
  disbursementNote?: string;
}): Promise<void> {
  if (params.nextStatus === 'Disbursed' || params.nextStatus === 'Awaiting Disbursement') {
    if (!params.programme) {
      throw new Error('Programme record is required before authorizing disbursement.');
    }
    if (params.programme.authorizationStatus !== 'authorized_active') {
      throw new Error(
        'Cannot disburse or queue payment for an unfunded/unauthorized draft programme.'
      );
    }
    const amt = params.approvedAmountInr ?? params.application.approvedAmountInr ?? 0;
    if (amt <= 0) {
      throw new Error('Enter a valid approved INR amount greater than ₹0.');
    }
    if (
      params.nextStatus === 'Disbursed' &&
      params.programme.disbursedBudgetInr + amt > params.programme.allocatedBudgetInr
    ) {
      throw new Error('Insufficient remaining programme INR budget for this disbursement.');
    }
  }

  const batch = writeBatch(db);
  const updates: Record<string, unknown> = {
    status: params.nextStatus,
    reviewedByUid: params.officerUid,
    officerDecisionReason:
      params.decisionReason.trim().slice(0, 1000) || `Status updated to ${params.nextStatus}`,
    notificationMessage: `Application ${params.application.id} updated to ${params.nextStatus}. ${params.decisionReason
      .trim()
      .slice(0, 200)}`,
    updatedAt: serverTimestamp(),
  };

  if (typeof params.approvedAmountInr === 'number' && params.approvedAmountInr >= 0) {
    updates.approvedAmountInr = params.approvedAmountInr;
  }
  if (params.disbursementReference && params.disbursementReference.trim()) {
    updates.disbursementReference = params.disbursementReference.trim().slice(0, 120);
  }
  if (params.disbursementNote && params.disbursementNote.trim()) {
    updates.disbursementNote = params.disbursementNote.trim().slice(0, 500);
  }

  batch.update(doc(db, 'welfareApplications', params.application.id), updates);

  if (
    params.nextStatus === 'Disbursed' &&
    params.application.status !== 'Disbursed' &&
    params.programme
  ) {
    const amt = params.approvedAmountInr ?? params.application.approvedAmountInr ?? 0;
    batch.update(doc(db, 'welfareProgrammes', params.programme.id), {
      disbursedBudgetInr: params.programme.disbursedBudgetInr + amt,
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.WRITE,
      `welfareApplications/${params.application.id}`
    );
    throw error;
  }
}

export async function citizenSubmitWelfareAppeal(params: {
  applicationId: string;
  appealReason: string;
}): Promise<void> {
  try {
    await updateDoc(doc(db, 'welfareApplications', params.applicationId), {
      appealSubmitted: true,
      appealReason: params.appealReason.trim().slice(0, 1000),
      appealStatus: 'pending',
      notificationMessage:
        'Reconsideration appeal submitted and queued for Welfare Officer review.',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `welfareApplications/${params.applicationId}`
    );
    throw error;
  }
}

export async function officerDecideWelfareAppeal(params: {
  applicationId: string;
  decision: 'upheld' | 'denied';
  decisionNote: string;
  officerUid: string;
}): Promise<void> {
  const updates: Record<string, unknown> = {
    appealStatus: params.decision,
    appealDecisionNote: params.decisionNote.trim().slice(0, 800),
    reviewedByUid: params.officerUid,
    notificationMessage:
      params.decision === 'upheld'
        ? 'Appeal upheld — application reopened for Under Review.'
        : `Appeal denied: ${params.decisionNote.trim().slice(0, 220)}`,
    updatedAt: serverTimestamp(),
  };
  if (params.decision === 'upheld') {
    updates.status = 'Under Review';
  }
  try {
    await updateDoc(doc(db, 'welfareApplications', params.applicationId), updates);
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `welfareApplications/${params.applicationId}`
    );
    throw error;
  }
}

// -----------------------------------------------------------------------------
// Chief Minister (CM) Misuse Escalations & Direct Oversight
// -----------------------------------------------------------------------------
function mapCmEscalationDoc(docId: string, d: Record<string, unknown>): CmEscalationAlert {
  return {
    id: String(d.id || docId),
    title: String(d.title || ''),
    misuseType: (d.misuseType as CmMisuseType) || 'citizen_grievance',
    targetRole: d.targetRole === 'Local MLA' ? 'Local MLA' : 'BBMP Official',
    targetOfficialName: String(d.targetOfficialName || ''),
    wardNumber: Number(d.wardNumber || 1),
    locality: String(d.locality || 'Bengaluru'),
    relatedComplaintId:
      typeof d.relatedComplaintId === 'string' && d.relatedComplaintId
        ? d.relatedComplaintId
        : undefined,
    description: String(d.description || ''),
    evidenceSummary: String(d.evidenceSummary || ''),
    severity: d.severity === 'Critical' ? 'Critical' : 'High',
    reportedByUid: String(d.reportedByUid || ''),
    reportedByName: String(d.reportedByName || 'Citizen'),
    sourceType: d.sourceType === 'auto_system' ? 'auto_system' : 'citizen_report',
    cmStatus: (d.cmStatus as CmEscalationStatus) || 'unread_alert',
    cmDirectiveNote: typeof d.cmDirectiveNote === 'string' ? d.cmDirectiveNote : undefined,
    reviewedByCmUid: typeof d.reviewedByCmUid === 'string' ? d.reviewedByCmUid : undefined,
    reviewedByCmName: typeof d.reviewedByCmName === 'string' ? d.reviewedByCmName : undefined,
    createdAt: formatShortStamp(timestampToIso(d.createdAt)),
    updatedAt: formatShortStamp(timestampToIso(d.updatedAt)),
  };
}

export function subscribeCmEscalations(
  onData: (items: CmEscalationAlert[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'cmEscalations'),
    where('cmStatus', 'in', ['unread_alert', 'under_cm_review', 'directive_issued', 'action_taken'])
  );
  return onSnapshot(
    q,
    (snap) => {
      const mapped = snap.docs
        .map((d) => ({
          ms: timestampToMs(d.data().createdAt),
          item: mapCmEscalationDoc(d.id, d.data() as Record<string, unknown>),
        }))
        .sort((a, b) => b.ms - a.ms)
        .map((x) => x.item);
      onData(mapped);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'cmEscalations');
    }
  );
}

export async function createCmEscalation(params: {
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
}): Promise<string> {
  const id = `ESC-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
  const payload: Record<string, unknown> = {
    id,
    title: params.title.trim().slice(0, 180),
    misuseType: params.misuseType,
    targetRole: params.targetRole,
    targetOfficialName: params.targetOfficialName.trim().slice(0, 120) || 'Ward Authority',
    wardNumber: Math.min(99, Math.max(1, params.wardNumber || 1)),
    locality: params.locality.trim().slice(0, 120) || 'Bengaluru',
    description: params.description.trim().slice(0, 2000),
    evidenceSummary: params.evidenceSummary.trim().slice(0, 1000),
    severity: params.severity,
    reportedByUid: params.reportedByUid,
    reportedByName: params.reportedByName.trim().slice(0, 120) || 'Verified User',
    sourceType: params.sourceType,
    cmStatus: 'unread_alert',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (params.relatedComplaintId && params.relatedComplaintId.trim()) {
    payload.relatedComplaintId = params.relatedComplaintId.trim().slice(0, 64);
  }
  try {
    await setDoc(doc(db, 'cmEscalations', id), payload);
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `cmEscalations/${id}`);
    throw error;
  }
}

export async function cmUpdateEscalation(params: {
  escalationId: string;
  cmStatus: CmEscalationStatus;
  cmDirectiveNote: string;
  cmUid: string;
  cmName: string;
}): Promise<void> {
  try {
    await updateDoc(doc(db, 'cmEscalations', params.escalationId), {
      cmStatus: params.cmStatus,
      cmDirectiveNote: params.cmDirectiveNote.trim().slice(0, 1500),
      reviewedByCmUid: params.cmUid,
      reviewedByCmName: params.cmName.trim().slice(0, 120),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `cmEscalations/${params.escalationId}`);
    throw error;
  }
}

// -----------------------------------------------------------------------------
// Local MLA & Chief Minister (CM) Permission-Gated Appointments
// -----------------------------------------------------------------------------
function mapAppointmentDoc(docId: string, d: Record<string, unknown>): AuthorityAppointment {
  return {
    id: String(d.id || docId),
    applicantUid: String(d.applicantUid || ''),
    applicantName: String(d.applicantName || 'Citizen'),
    targetAuthority:
      d.targetAuthority === 'Chief Minister (CM)' ? 'Chief Minister (CM)' : 'Local MLA',
    wardNumber: Number(d.wardNumber || 1),
    locality: String(d.locality || 'Bengaluru'),
    constituency: String(d.constituency || 'Bengaluru Ward'),
    relatedComplaintId:
      typeof d.relatedComplaintId === 'string' && d.relatedComplaintId
        ? d.relatedComplaintId
        : undefined,
    cmEscalationId:
      typeof d.cmEscalationId === 'string' && d.cmEscalationId ? d.cmEscalationId : undefined,
    urgencyReason:
      (d.urgencyReason as AppointmentUrgencyReason) || 'Ward Infrastructure Petition',
    purpose: String(d.purpose || ''),
    preferredDate: String(d.preferredDate || ''),
    preferredSlot: String(d.preferredSlot || ''),
    meetingMode: d.meetingMode === 'Video Hearing' ? 'Video Hearing' : 'In-Person Office',
    status: (d.status as AppointmentStatus) || 'pending_permission',
    permissionPassCode:
      typeof d.permissionPassCode === 'string' ? d.permissionPassCode : undefined,
    scheduledDateTime:
      typeof d.scheduledDateTime === 'string' ? d.scheduledDateTime : undefined,
    officeLocation: typeof d.officeLocation === 'string' ? d.officeLocation : undefined,
    authorityRemarks:
      typeof d.authorityRemarks === 'string' ? d.authorityRemarks : undefined,
    decidedByUid: typeof d.decidedByUid === 'string' ? d.decidedByUid : undefined,
    decidedByName: typeof d.decidedByName === 'string' ? d.decidedByName : undefined,
    createdAt: formatShortStamp(timestampToIso(d.createdAt)),
    updatedAt: formatShortStamp(timestampToIso(d.updatedAt)),
  };
}

export function subscribeMyAppointments(
  uid: string,
  onData: (items: AuthorityAppointment[]) => void
): Unsubscribe {
  const q = query(collection(db, 'appointments'), where('applicantUid', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const mapped = snap.docs
        .map((d) => ({
          ms: timestampToMs(d.data().createdAt),
          item: mapAppointmentDoc(d.id, d.data() as Record<string, unknown>),
        }))
        .sort((a, b) => b.ms - a.ms)
        .map((x) => x.item);
      onData(mapped);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'appointments');
    }
  );
}

export function subscribeAllAppointments(
  onData: (items: AuthorityAppointment[]) => void
): Unsubscribe {
  const q = query(collection(db, 'appointments'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => mapAppointmentDoc(d.id, d.data() as Record<string, unknown>))
      );
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'appointments');
    }
  );
}

export async function createAuthorityAppointment(params: {
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
}): Promise<string> {
  const id = `APT-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
  const payload: Record<string, unknown> = {
    id,
    applicantUid: params.applicantUid,
    applicantName: params.applicantName.trim().slice(0, 120) || 'Verified Citizen',
    targetAuthority: params.targetAuthority,
    wardNumber: Math.min(99, Math.max(1, params.wardNumber || 1)),
    locality: params.locality.trim().slice(0, 120) || 'Bengaluru',
    constituency: params.constituency.trim().slice(0, 120) || 'Bengaluru Constituency',
    urgencyReason: params.urgencyReason,
    purpose: params.purpose.trim().slice(0, 1500),
    preferredDate: params.preferredDate.trim().slice(0, 32),
    preferredSlot: params.preferredSlot.trim().slice(0, 64),
    meetingMode: params.meetingMode,
    status: 'pending_permission',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (params.relatedComplaintId && params.relatedComplaintId.trim()) {
    payload.relatedComplaintId = params.relatedComplaintId.trim().slice(0, 64);
  }
  if (params.cmEscalationId && params.cmEscalationId.trim()) {
    payload.cmEscalationId = params.cmEscalationId.trim().slice(0, 64);
  }

  try {
    await setDoc(doc(db, 'appointments', id), payload);
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `appointments/${id}`);
    throw error;
  }
}

export async function decideAuthorityAppointment(params: {
  appointmentId: string;
  status: AppointmentStatus;
  targetAuthority?: AppointmentTargetAuthority;
  permissionPassCode?: string;
  scheduledDateTime?: string;
  officeLocation?: string;
  authorityRemarks: string;
  decidedByUid: string;
  decidedByName: string;
}): Promise<void> {
  const updates: Record<string, unknown> = {
    status: params.status,
    authorityRemarks: params.authorityRemarks.trim().slice(0, 1000),
    decidedByUid: params.decidedByUid,
    decidedByName: params.decidedByName.trim().slice(0, 120),
    updatedAt: serverTimestamp(),
  };
  if (params.targetAuthority) updates.targetAuthority = params.targetAuthority;
  if (params.permissionPassCode && params.permissionPassCode.trim()) {
    updates.permissionPassCode = params.permissionPassCode.trim().slice(0, 64);
  }
  if (params.scheduledDateTime && params.scheduledDateTime.trim()) {
    updates.scheduledDateTime = params.scheduledDateTime.trim().slice(0, 120);
  }
  if (params.officeLocation && params.officeLocation.trim()) {
    updates.officeLocation = params.officeLocation.trim().slice(0, 200);
  }

  try {
    await updateDoc(doc(db, 'appointments', params.appointmentId), updates);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `appointments/${params.appointmentId}`);
    throw error;
  }
}

export async function citizenEscalateAppointmentToCm(appointmentId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'appointments', appointmentId), {
      targetAuthority: 'Chief Minister (CM)',
      status: 'escalated_to_cm',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `appointments/${appointmentId}`);
    throw error;
  }
}

