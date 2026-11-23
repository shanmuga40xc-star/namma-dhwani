import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import {
  BarChart3,
  ClipboardList,
  FlaskConical,
  GitMerge,
  HeartHandshake,
  HelpCircle,
  Landmark,
  LayoutDashboard,
  LogOut,
  Map as MapIcon,
  Menu,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Trophy,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { auth, testFirestoreConnection } from './firebase';
import { useLanguage } from './i18n/LanguageContext';
import {
  BENGALURU_LOCALITIES,
  INITIAL_SLA_POLICIES,
  INITIAL_WARDS,
  NEW_USER_CREWS,
  NEW_USER_SLA_POLICIES,
  NEW_USER_WARDS,
} from './data/mockCivicData';
import {
  adminBackfillVerifiedPointsForComplaint,
  adminUpdateComplaintWorkflow,
  checkIsWelfareOfficer,
  createCmEscalation,
  ensureCitizenStatsInitialized,
  getAdminAuthorityInfo,
  getAdminRequest,
  getCitizenProfile,
  purgeAdminFromCitizenCollections,
  saveAllWardsToFirestore,
  saveWardBudgetToFirestore,
  subscribeAdminRequests,
  subscribeAdmins,
  subscribeAllAppointments,
  subscribeAllCitizenStats,
  subscribeAllWelfareApplications,
  subscribeCitizenPointTransactions,
  subscribeCivicActivities,
  subscribeCmEscalations,
  subscribeComplaints,
  subscribeDuplicateReviews,
  subscribeMyAppointments,
  subscribeMyWelfareApplications,
  subscribeResearchExperiments,
  subscribeWardBudgets,
  subscribeWelfareOfficers,
  subscribeWelfareProgrammes,
  upsertCitizenProfile,
} from './services/firestoreService';
import {
  AdminRecord,
  AdminRequest,
  AuthorityAppointment,
  AuthorityTier,
  CitizenProfile,
  CitizenStats,
  CivicActivity,
  CivicIncident,
  CmEscalationAlert,
  DuplicateReviewRecord,
  FieldCrew,
  IncidentCategory,
  IncidentStatus,
  PointTransaction,
  ResearchExperimentRecord,
  SeverityLevel,
  SlaPolicyRule,
  UserPortalRole,
  WardSummary,
  WelfareApplication,
  WelfareOfficerRecord,
  WelfareProgramme,
  WorkspaceScreen,
} from './types/civic';
import { AdminAccessScreen } from './components/AdminAccessScreen';
import { AiEvaluationResearchScreen } from './components/AiEvaluationResearchScreen';
import { AuthPortal } from './components/AuthPortal';
import { CitizenPortal } from './components/CitizenPortal';
import { CmOversightAndAppointmentsScreen } from './components/CmOversightAndAppointmentsScreen';
import { DuplicateMergeConsole } from './components/DuplicateMergeConsole';
import { GuideView } from './components/GuideView';
import { IncidentDrawer } from './components/IncidentDrawer';
import { IncidentsScreen } from './components/IncidentsScreen';
import { LanguageSelector } from './components/LanguageSelector';
import { LeaderboardScreen } from './components/LeaderboardScreen';
import { LogIncidentModal } from './components/LogIncidentModal';
import { OverviewScreen } from './components/OverviewScreen';
import { PublicAccountabilityDashboard } from './components/PublicAccountabilityDashboard';
import { ResolutionVerificationModal } from './components/ResolutionVerificationModal';
import { SlaPolicyScreen } from './components/SlaPolicyScreen';
import { WardsScreen } from './components/WardsScreen';
import { WelfareOfficerDashboard } from './components/WelfareOfficerDashboard';

export default function App() {
  const { t } = useLanguage();
  const [firestoreError, setFirestoreError] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [selectedPortal, setSelectedPortal] = useState<UserPortalRole>('citizen');
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [authorityTier, setAuthorityTier] = useState<AuthorityTier | null>(null);
  const [currentAdminRecord, setCurrentAdminRecord] = useState<AdminRecord | null>(null);
  const [isWelfareOfficer, setIsWelfareOfficer] = useState(false);
  const [citizenProfile, setCitizenProfile] = useState<CitizenProfile | null>(null);
  const [pendingAdminRequest, setPendingAdminRequest] = useState<AdminRequest | null>(null);

  // Live Firestore collections
  const [incidents, setIncidents] = useState<CivicIncident[]>([]);
  const [wards, setWards] = useState<WardSummary[]>(NEW_USER_WARDS);
  const [crews, setCrews] = useState<FieldCrew[]>(NEW_USER_CREWS);
  const [policies, setPolicies] = useState<SlaPolicyRule[]>(NEW_USER_SLA_POLICIES);
  const [duplicateReviews, setDuplicateReviews] = useState<DuplicateReviewRecord[]>([]);
  const [experiments, setExperiments] = useState<ResearchExperimentRecord[]>([]);
  const [adminRequests, setAdminRequests] = useState<AdminRequest[]>([]);
  const [admins, setAdmins] = useState<AdminRecord[]>([]);
  const [welfareOfficers, setWelfareOfficers] = useState<WelfareOfficerRecord[]>([]);
  const [allCitizenStats, setAllCitizenStats] = useState<CitizenStats[]>([]);
  const [myPointTransactions, setMyPointTransactions] = useState<PointTransaction[]>([]);
  const [civicActivities, setCivicActivities] = useState<CivicActivity[]>([]);
  const [welfareProgrammes, setWelfareProgrammes] = useState<WelfareProgramme[]>([]);
  const [myWelfareApplications, setMyWelfareApplications] = useState<WelfareApplication[]>([]);
  const [allWelfareApplications, setAllWelfareApplications] = useState<WelfareApplication[]>([]);
  const [cmEscalations, setCmEscalations] = useState<CmEscalationAlert[]>([]);
  const [myAppointments, setMyAppointments] = useState<AuthorityAppointment[]>([]);
  const [allAppointments, setAllAppointments] = useState<AuthorityAppointment[]>([]);

  // UI Navigation State
  const [activeScreen, setActiveScreen] = useState<WorkspaceScreen>(WorkspaceScreen.Overview);
  const [selectedWard, setSelectedWard] = useState<number | null>(null);
  const [inspectedIncidentId, setInspectedIncidentId] = useState<string | null>(null);
  const [verifyingIncident, setVerifyingIncident] = useState<CivicIncident | null>(null);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const resolveUserRoles = useCallback(
    async (user: User | null, portalOverride?: UserPortalRole) => {
      if (!user) {
        setIsAdminUser(false);
        setAuthorityTier(null);
        setCurrentAdminRecord(null);
        setIsWelfareOfficer(false);
        setCitizenProfile(null);
        setPendingAdminRequest(null);
        return;
      }

      if (!user.emailVerified) {
        setIsAdminUser(false);
        setAuthorityTier(null);
        setCurrentAdminRecord(null);
        setIsWelfareOfficer(false);
        return;
      }

      // 1. Strictly classify Official / Politician / CM accounts FIRST
      const authority = await getAdminAuthorityInfo(user.uid, user.email, user.displayName);
      const woFlag = await checkIsWelfareOfficer(user.uid, user.email);

      if (authority.isAdmin) {
        const tier = authority.authorityTier || 'CM';
        setIsAdminUser(true);
        setAuthorityTier(tier);
        setCurrentAdminRecord(authority.adminRecord);
        setIsWelfareOfficer(true);
        setCitizenProfile(null);
        setPendingAdminRequest(null);

        // Route CM directly to CM Oversight portal, Local MLA/BBMP to politician_bbmp portal
        setSelectedPortal(tier === 'CM' ? 'cm' : 'politician_bbmp');
        if (tier === 'CM') {
          setActiveScreen((prev) =>
            prev === WorkspaceScreen.Overview ? WorkspaceScreen.CmOversight : prev
          );
        }

        // Clean up any stale citizen profile/stats doc so officials NEVER show up as citizens
        await purgeAdminFromCitizenCollections(user.uid);
        return;
      }

      setIsAdminUser(false);
      setAuthorityTier(null);
      setCurrentAdminRecord(null);
      setIsWelfareOfficer(woFlag);

      const req = await getAdminRequest(user.uid);
      setPendingAdminRequest(req);

      // 2. Only initialize Citizen profile & CitizenStats when operating in the Citizen Portal
      const effectivePortal = portalOverride ?? selectedPortal;
      if (effectivePortal === 'citizen') {
        let profile = await getCitizenProfile(user.uid);
        if (!profile) {
          await upsertCitizenProfile({
            uid: user.uid,
            displayName: user.displayName || 'Citizen Reporter',
            wardNumber: 1,
            locality: BENGALURU_LOCALITIES[0],
            email: user.email || '',
          });
          profile = await getCitizenProfile(user.uid);
        }
        setCitizenProfile(profile);

        await ensureCitizenStatsInitialized({
          uid: user.uid,
          displayName: profile?.displayName || user.displayName || 'Bengaluru Citizen',
          wardNumber: profile?.wardNumber || 1,
          locality: profile?.locality || BENGALURU_LOCALITIES[0],
        });
      } else {
        setCitizenProfile(null);
      }
    },
    [selectedPortal]
  );

  useEffect(() => {
    testFirestoreConnection().then((res) => {
      if (!res.connected && res.error) {
        setFirestoreError(res.error);
      }
    });
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      await resolveUserRoles(user);
      setAuthReady(true);
    });
    return () => unsub();
  }, [resolveUserRoles]);

  // Real-time Firestore Subscriptions gated on verified auth
  useEffect(() => {
    if (!authReady || !currentUser || !currentUser.emailVerified) {
      setIncidents([]);
      setDuplicateReviews([]);
      setExperiments([]);
      setAdminRequests([]);
      setAdmins([]);
      setWelfareOfficers([]);
      setAllCitizenStats([]);
      setMyPointTransactions([]);
      setCivicActivities([]);
      setWelfareProgrammes([]);
      setMyWelfareApplications([]);
      setAllWelfareApplications([]);
      setCmEscalations([]);
      setMyAppointments([]);
      setAllAppointments([]);
      return;
    }

    const unsubs: Array<() => void> = [];
    unsubs.push(
      subscribeComplaints(setIncidents, (err) =>
        showToast(`Firestore complaints sync notice: ${err.message}`)
      )
    );
    unsubs.push(subscribeWardBudgets(setWards));
    unsubs.push(subscribeResearchExperiments(setExperiments));
    unsubs.push(subscribeAllCitizenStats(setAllCitizenStats));
    unsubs.push(subscribeCivicActivities(setCivicActivities));
    unsubs.push(subscribeWelfareProgrammes(setWelfareProgrammes));
    // Local MLA / BBMP official work roster & CM escalations are transparent to all signed-in users
    unsubs.push(subscribeAdmins(setAdmins));
    unsubs.push(subscribeCmEscalations(setCmEscalations));

    if (!isAdminUser) {
      unsubs.push(subscribeCitizenPointTransactions(currentUser.uid, setMyPointTransactions));
      unsubs.push(subscribeMyWelfareApplications(currentUser.uid, setMyWelfareApplications));
      unsubs.push(subscribeMyAppointments(currentUser.uid, setMyAppointments));
    }

    if (isWelfareOfficer) {
      unsubs.push(subscribeAllWelfareApplications(setAllWelfareApplications));
    }

    if (isAdminUser) {
      unsubs.push(subscribeDuplicateReviews(setDuplicateReviews));
      unsubs.push(subscribeAdminRequests(setAdminRequests));
      unsubs.push(subscribeWelfareOfficers(setWelfareOfficers));
      unsubs.push(subscribeAllAppointments(setAllAppointments));
    }

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [authReady, currentUser, isAdminUser, isWelfareOfficer, showToast]);

  const inspectedIncident =
    incidents.find((inc) => inc.id === inspectedIncidentId) ?? null;

  const openTicketCount = incidents.filter(
    (inc) =>
      !inc.isMergedDuplicate &&
      inc.status !== IncidentStatus.Resolved &&
      inc.status !== IncidentStatus.Verified
  ).length;

  const adminUidSet = useMemo(() => {
    const s = new Set(admins.map((a) => a.uid));
    if (isAdminUser && currentUser) {
      s.add(currentUser.uid);
    }
    return s;
  }, [admins, isAdminUser, currentUser]);

  // Never display Politician, BBMP Official, or CM accounts inside Citizen Stats or Leaderboards
  const filteredCitizenStats = useMemo(
    () => allCitizenStats.filter((st) => !adminUidSet.has(st.uid)),
    [allCitizenStats, adminUidSet]
  );

  const backfilledComplaintIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isAdminUser || !currentUser || incidents.length === 0) return;
    const candidates = incidents.filter(
      (inc) =>
        !inc.isMergedDuplicate &&
        inc.status === IncidentStatus.Verified &&
        Boolean(inc.reporterUid) &&
        !adminUidSet.has(inc.reporterUid) &&
        !backfilledComplaintIdsRef.current.has(inc.id)
    );
    if (candidates.length === 0) return;

    candidates.forEach((inc) => {
      backfilledComplaintIdsRef.current.add(inc.id);
      void adminBackfillVerifiedPointsForComplaint({
        complaint: inc,
        adminUid: currentUser.uid,
      }).catch(() => {});
    });
  }, [isAdminUser, currentUser, incidents, adminUidSet]);

  const unreadCmAlertsCount = cmEscalations.filter(
    (e) => e.cmStatus === 'unread_alert'
  ).length;

  const pendingAppointmentsCount = allAppointments.filter(
    (a) => a.status === 'pending_permission' || a.status === 'escalated_to_cm'
  ).length;

  const pendingDuplicatesCount = duplicateReviews.filter(
    (r) => r.status === 'pending_review'
  ).length;

  const pendingAdminRequestsCount = adminRequests.filter(
    (r) => r.status === 'pending'
  ).length;

  const handlePortalSwitch = useCallback(
    (nextPortal: UserPortalRole) => {
      setSelectedPortal(nextPortal);
      if (nextPortal === 'citizen' && currentUser && !isAdminUser) {
        resolveUserRoles(currentUser, 'citizen');
      }
    },
    [currentUser, isAdminUser, resolveUserRoles]
  );

  // Loading state while auth initializes
  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F7FA] text-[#102A43]">
        <div className="rounded-lg border border-[#102A43]/15 bg-white px-6 py-5 text-sm font-semibold civic-shadow-1">
          Initializing Civic Authority / NAGRIK workspace...
        </div>
      </div>
    );
  }

  const needsCitizenKyc = Boolean(
    currentUser &&
      currentUser.emailVerified &&
      !isAdminUser &&
      selectedPortal === 'citizen' &&
      !citizenProfile?.kycVerified
  );

  // Gate 1: Unauthenticated, unverified email, pending Aadhaar+OTP KYC, or unapproved official/CM login
  if (
    !currentUser ||
    !currentUser.emailVerified ||
    needsCitizenKyc ||
    (selectedPortal !== 'citizen' && !isAdminUser)
  ) {
    return (
      <>
        {firestoreError && (
          <div className="border-b border-[#BA1A1A] bg-[#FFDAD6] px-4 py-2 text-center text-xs font-semibold text-[#BA1A1A]">
            Firestore Connection Notice: {firestoreError}
          </div>
        )}
        <AuthPortal
          currentUser={currentUser}
          citizenProfile={citizenProfile}
          pendingAdminRequest={pendingAdminRequest}
          selectedPortal={selectedPortal}
          onSelectPortal={handlePortalSwitch}
          onAuthComplete={() => resolveUserRoles(auth.currentUser)}
        />
      </>
    );
  }

  const myStats = !isAdminUser
    ? filteredCitizenStats.find((s) => s.uid === currentUser?.uid) ?? null
    : null;

  // Gate 2: Citizen Portal (or Official Public Transparency Preview)
  if (selectedPortal === 'citizen' || !isAdminUser) {
    return (
      <>
        <CitizenPortal
          user={currentUser}
          profile={isAdminUser ? null : citizenProfile}
          isAdmin={isAdminUser}
          authorityTier={authorityTier}
          isWelfareOfficer={isWelfareOfficer}
          complaints={incidents}
          wards={wards}
          policies={policies}
          admins={admins}
          cmEscalations={cmEscalations}
          myAppointments={myAppointments}
          myStats={myStats}
          allCitizenStats={filteredCitizenStats}
          pointTransactions={myPointTransactions}
          civicActivities={civicActivities}
          welfareProgrammes={welfareProgrammes}
          myWelfareApplications={myWelfareApplications}
          allWelfareApplications={allWelfareApplications}
          onSwitchToAdmin={() =>
            setSelectedPortal(authorityTier === 'CM' ? 'cm' : 'politician_bbmp')
          }
          onShowToast={showToast}
        />
        {toastMessage && (
          <div
            role="status"
            aria-live="polite"
            className="fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded border border-[#102A43] bg-[#102A43] px-4 py-3 text-sm font-medium text-white civic-shadow-2"
          >
            <span>{toastMessage}</span>
            <button
              type="button"
              onClick={() => setToastMessage(null)}
              aria-label="Dismiss notification"
              className="text-[#B0C9E8] hover:text-white cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </>
    );
  }

  // Official / CM Authority Action Handlers
  const resolvedTier: AuthorityTier = authorityTier || 'CM';
  const tierBadgeLabel =
    resolvedTier === 'CM'
      ? 'Chief Minister (CM) Oversight'
      : resolvedTier === 'MLA'
        ? 'Local MLA Command'
        : 'BBMP Municipal Command';
  const adminName =
    currentAdminRecord?.displayName ||
    currentUser.displayName ||
    currentUser.email ||
    tierBadgeLabel;

  const handleUpdateIncidentStatus = async (
    incidentId: string,
    nextStatus: IncidentStatus
  ) => {
    try {
      await adminUpdateComplaintWorkflow({
        complaintId: incidentId,
        actorUid: currentUser.uid,
        actorName: adminName,
        updates: { status: nextStatus },
        auditAction: `Status -> ${nextStatus}`,
        auditNote: `Admin Authority transitioned ticket status to ${nextStatus}.`,
      });
      showToast(`${incidentId} updated to ${nextStatus}.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Status update failed.');
    }
  };

  const handleBulkUpdateStatus = async (ids: string[], nextStatus: IncidentStatus) => {
    try {
      await Promise.all(
        ids.map((id) =>
          adminUpdateComplaintWorkflow({
            complaintId: id,
            actorUid: currentUser.uid,
            actorName: adminName,
            updates: { status: nextStatus },
            auditAction: 'Batch Dispatch Update',
            auditNote: `Batch transitioned to ${nextStatus}.`,
          })
        )
      );
      showToast(`${ids.length} ticket(s) updated to ${nextStatus}.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Batch update failed.');
    }
  };

  const handleAssignCrew = async (incidentId: string, crewId: string | null) => {
    const crewObj = crews.find((c) => c.id === crewId);
    const inc = incidents.find((i) => i.id === incidentId);
    const nextStatus =
      crewId && inc?.status === IncidentStatus.Submitted
        ? IncidentStatus.InProgress
        : inc?.status || IncidentStatus.Submitted;

    try {
      await adminUpdateComplaintWorkflow({
        complaintId: incidentId,
        actorUid: currentUser.uid,
        actorName: adminName,
        updates: {
          assignedCrewId: crewId || '',
          status: nextStatus,
        },
        auditAction: crewObj ? 'Crew Assigned' : 'Crew Unassigned',
        auditNote: crewObj
          ? `Assigned ${crewObj.name} (${crewObj.leadOfficer}) via ${crewObj.radioChannel}.`
          : 'Returned ticket to unassigned central dispatch queue.',
      });
      showToast(
        crewObj
          ? `${crewObj.name} assigned to ${incidentId}.`
          : `${incidentId} returned to unassigned queue.`
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Crew assignment failed.');
    }
  };

  const handleOverridePriority = async (
    incidentId: string,
    overrideTier: SeverityLevel,
    reason: string
  ) => {
    const targetIncident = incidents.find((i) => i.id === incidentId);
    const severityRank: Record<SeverityLevel, number> = {
      Low: 1,
      Medium: 2,
      High: 3,
      Critical: 4,
    };
    const isPriorityDowngrade =
      targetIncident &&
      severityRank[overrideTier] < severityRank[targetIncident.confirmedSeverity];

    try {
      await adminUpdateComplaintWorkflow({
        complaintId: incidentId,
        actorUid: currentUser.uid,
        actorName: adminName,
        updates: {
          adminPriorityOverride: overrideTier.toUpperCase(),
          overrideReason: reason,
          priorityTier: overrideTier,
          prioritySource: 'admin_override',
        },
        auditAction: `Priority Override -> ${overrideTier}`,
        auditNote: `${tierBadgeLabel} overrode ML priority (reason: ${reason}). Original ML score preserved.`,
      });

      if (isPriorityDowngrade && targetIncident && resolvedTier !== 'CM') {
        await createCmEscalation({
          title: `Auto CM Alert: Priority Downgraded (${targetIncident.confirmedSeverity} -> ${overrideTier}) on ${incidentId}`,
          misuseType: 'priority_manipulation',
          targetRole: resolvedTier === 'MLA' ? 'Local MLA' : 'BBMP Official',
          targetOfficialName: adminName,
          wardNumber: targetIncident.wardNumber,
          locality: targetIncident.locality,
          relatedComplaintId: incidentId,
          description: `${adminName} (${tierBadgeLabel}) manually downgraded ${incidentId} ("${targetIncident.title}") from ${targetIncident.confirmedSeverity} to ${overrideTier}. Reason stated: ${reason}`,
          evidenceSummary: `ML triage originally rated score ${targetIncident.priorityScore}/100 (${targetIncident.confirmedSeverity}). Automatic CM oversight audit triggered.`,
          severity: targetIncident.confirmedSeverity === 'Critical' ? 'Critical' : 'High',
          reportedByUid: currentUser.uid,
          reportedByName: `${adminName} (System Audit)`,
          sourceType: 'auto_system',
        });
        showToast(
          `${incidentId} downgraded to ${overrideTier}. Chief Minister Oversight has been notified automatically.`
        );
      } else {
        showToast(`${incidentId} priority overridden to ${overrideTier}.`);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Priority override failed.');
    }
  };

  const handleAddAuditNote = async (incidentId: string, note: string) => {
    const inc = incidents.find((i) => i.id === incidentId);
    if (!inc) return;
    try {
      await adminUpdateComplaintWorkflow({
        complaintId: incidentId,
        actorUid: currentUser.uid,
        actorName: adminName,
        updates: { status: inc.status },
        auditAction: 'Field Note Logged',
        auditNote: note,
      });
      showToast(`Audit entry added to ${incidentId}.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to log note.');
    }
  };

  const handleUpdateWardBudget = (
    wardNumber: number,
    updates: { allocatedBudgetInr?: number; spentBudgetInr?: number }
  ) => {
    const target = wards.find((w) => w.wardNumber === wardNumber);
    if (!target) return;
    const updatedWard = { ...target, ...updates };
    setWards((prev) => prev.map((w) => (w.wardNumber === wardNumber ? updatedWard : w)));
    saveWardBudgetToFirestore(updatedWard).catch(() => {});
  };

  const handleApplyDefaultWardBudgets = async () => {
    try {
      await saveAllWardsToFirestore(INITIAL_WARDS);
      showToast('Sample Indian Rupee (₹) ward budgets saved to Firestore.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save ward budgets.');
    }
  };

  const handleResetWorkspaceData = async () => {
    setCrews(NEW_USER_CREWS);
    setPolicies(NEW_USER_SLA_POLICIES);
    setSelectedWard(null);
    try {
      await saveAllWardsToFirestore(NEW_USER_WARDS);
      showToast('Ward budgets and SLA policies reset to clean new-user state.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Reset failed.');
    }
  };

  const handleUpdatePolicy = (
    category: IncidentCategory,
    updates: Partial<SlaPolicyRule>
  ) => {
    setPolicies((prev) =>
      prev.map((p) => (p.category === category ? { ...p, ...updates } : p))
    );
    showToast(`SLA directive updated for ${category}.`);
  };

  const handleApplyDefaultPolicies = () => {
    setPolicies(
      INITIAL_SLA_POLICIES.map((p) => ({
        ...p,
        compliance30dPct: null,
        statutoryMandate: 'Standard Municipal Baseline',
      }))
    );
    showToast('Standard municipal SLA targets applied.');
  };

  const navItems = [
    {
      screen: WorkspaceScreen.CmOversight,
      label: 'CM Oversight & Appts',
      icon: ShieldAlert,
      badge:
        unreadCmAlertsCount + pendingAppointmentsCount > 0
          ? unreadCmAlertsCount + pendingAppointmentsCount
          : null,
    },
    {
      screen: WorkspaceScreen.Overview,
      label: t('adminOverview'),
      icon: LayoutDashboard,
      badge: null,
    },
    {
      screen: WorkspaceScreen.Incidents,
      label: t('adminIncidents'),
      icon: ClipboardList,
      badge: openTicketCount,
    },
    {
      screen: WorkspaceScreen.Duplicates,
      label: t('adminDuplicates'),
      icon: GitMerge,
      badge: pendingDuplicatesCount > 0 ? pendingDuplicatesCount : null,
    },
    {
      screen: WorkspaceScreen.Wards,
      label: t('adminWards'),
      icon: MapIcon,
      badge: null,
    },
    {
      screen: WorkspaceScreen.SlaPolicy,
      label: t('adminSla'),
      icon: ShieldCheck,
      badge: null,
    },
    {
      screen: WorkspaceScreen.AiResearch,
      label: t('adminAiEval'),
      icon: FlaskConical,
      badge: null,
    },
    {
      screen: WorkspaceScreen.Leaderboard,
      label: t('adminLeaderboard'),
      icon: Trophy,
      badge: null,
    },
    {
      screen: WorkspaceScreen.PublicAccountability,
      label: t('adminPublic'),
      icon: BarChart3,
      badge: null,
    },
    {
      screen: WorkspaceScreen.WelfareOfficer,
      label: t('adminWelfare'),
      icon: HeartHandshake,
      badge:
        allWelfareApplications.filter(
          (a) => a.status === 'Submitted' || a.appealStatus === 'pending'
        ).length || null,
    },
    {
      screen: WorkspaceScreen.AdminAccess,
      label: t('adminAccess'),
      icon: Users,
      badge: pendingAdminRequestsCount > 0 ? pendingAdminRequestsCount : null,
    },
    {
      screen: WorkspaceScreen.Guide,
      label: t('adminGuide'),
      icon: HelpCircle,
      badge: null,
    },
  ];

  const currentScreenTitle =
    navItems.find((n) => n.screen === activeScreen)?.label ?? 'Operations Overview';

  const navigateTo = (screen: WorkspaceScreen) => {
    setActiveScreen(screen);
    setMobileNavOpen(false);
  };

  return (
    <div className="flex min-h-screen bg-[#F5F7FA] text-[#0A1D2B]">
      {/* Desktop Institutional Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col justify-between bg-[#102A43] text-white lg:flex">
        <div>
          <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-white/10 text-[#F2A541]">
              <Landmark className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="whitespace-nowrap font-display text-base font-bold tracking-tight text-white">
                {resolvedTier === 'CM'
                  ? 'CM State Oversight'
                  : resolvedTier === 'MLA'
                    ? 'Local MLA Desk'
                    : 'BBMP Command'}
              </div>
              <div className="truncate text-[11px] font-medium text-[#B0C9E8]">
                {tierBadgeLabel}
              </div>
            </div>
          </div>

          <nav className="mt-5 flex flex-col gap-1 px-3" aria-label="Primary workspace navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeScreen === item.screen;
              return (
                <button
                  key={item.screen}
                  type="button"
                  onClick={() => navigateTo(item.screen)}
                  className={`flex h-11 w-full cursor-pointer items-center justify-between rounded px-3 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-white font-semibold text-[#0A1D2B]'
                      : 'text-[#D1E4FF] hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-3 whitespace-nowrap">
                    <Icon
                      className={`h-4 w-4 shrink-0 ${
                        active ? 'text-[#102A43]' : 'text-[#B0C9E8]'
                      }`}
                      aria-hidden="true"
                    />
                    {item.label}
                  </span>
                  {item.badge !== null && (
                    <span
                      className={`rounded-full px-2 py-0.5 font-mono-tabular text-[11px] font-bold ${
                        active ? 'bg-[#102A43] text-white' : 'bg-white/15 text-white'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Institutional Footer + Public Transparency Preview / Sign Out */}
        <div className="flex flex-col gap-2 border-t border-white/10 px-4 py-4">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs font-semibold text-white">{adminName}</span>
            <span className="shrink-0 rounded bg-[#F2A541]/20 px-1.5 py-0.5 font-mono-tabular text-[10px] font-bold text-[#F2A541]">
              {resolvedTier}
            </span>
          </div>
          <div className="truncate text-[11px] text-[#B0C9E8]">{currentUser.email}</div>
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedPortal('citizen')}
              className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded border border-white/20 text-[11px] font-semibold text-[#D1E4FF] hover:bg-white/10 cursor-pointer"
            >
              <UserCheck className="h-3 w-3" />
              Public Preview
            </button>
            <button
              type="button"
              onClick={() => signOut(auth)}
              className="inline-flex h-8 items-center justify-center gap-1 rounded border border-white/20 px-2.5 text-[11px] font-semibold text-[#D1E4FF] hover:bg-white/10 cursor-pointer"
            >
              <LogOut className="h-3 w-3" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer Sidebar */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-50 flex bg-[#102A43]/40 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        >
          <aside
            className="flex h-full w-72 flex-col justify-between bg-[#102A43] text-white civic-shadow-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <div className="flex h-16 items-center justify-between border-b border-white/10 px-5">
                <div className="flex items-center gap-2.5">
                  <Landmark className="h-5 w-5 text-[#F2A541]" aria-hidden="true" />
                  <span className="font-display text-base font-bold">Civic Authority</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  aria-label="Close navigation menu"
                  className="flex h-10 w-10 items-center justify-center rounded text-white hover:bg-white/10"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <nav className="mt-4 flex flex-col gap-1 px-3" aria-label="Mobile navigation">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = activeScreen === item.screen;
                  return (
                    <button
                      key={item.screen}
                      type="button"
                      onClick={() => navigateTo(item.screen)}
                      className={`flex h-12 w-full cursor-pointer items-center justify-between rounded px-3 text-sm font-medium ${
                        active ? 'bg-white font-semibold text-[#0A1D2B]' : 'text-[#D1E4FF]'
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <Icon className="h-4 w-4 shrink-0" />
                        {item.label}
                      </span>
                      {item.badge !== null && (
                        <span className="rounded-full bg-white/15 px-2 py-0.5 font-mono-tabular text-[11px] font-bold">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            <div className="flex items-center justify-between border-t border-white/10 px-5 py-4 text-xs">
              <button
                type="button"
                onClick={() => {
                  setMobileNavOpen(false);
                  setSelectedPortal('citizen');
                }}
                className="font-semibold text-[#F2A541]"
              >
                Public Transparency Preview
              </button>
              <button
                type="button"
                onClick={() => signOut(auth)}
                className="font-semibold text-[#D1E4FF]"
              >
                Sign Out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-[#E2E8F0] bg-white px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded border border-[#CBD5E1] text-[#102A43] hover:bg-[#F5F7FA] lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="flex min-w-0 items-center gap-2 text-sm">
              <span className="hidden whitespace-nowrap font-medium text-[#52606D] sm:inline">
                {tierBadgeLabel}
              </span>
              <span className="hidden text-[#CBD5E1] sm:inline" aria-hidden="true">
                /
              </span>
              <span className="truncate font-display font-semibold text-[#0A1D2B]">
                {currentScreenTitle}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <LanguageSelector compact />
            <button
              type="button"
              onClick={() => setIsLogModalOpen(true)}
              className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded bg-[#102A43] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#0B1D2F] sm:h-11"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Log Incident
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {resolvedTier === 'CM' && unreadCmAlertsCount > 0 && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-[#BA1A1A] bg-[#FFDAD6] px-4 py-3 text-xs text-[#7A1010]">
              <div className="flex items-center gap-2.5 font-semibold">
                <ShieldAlert className="h-5 w-5 shrink-0 text-[#BA1A1A]" />
                <span>
                  Chief Minister Direct Alert: {unreadCmAlertsCount} unread Local MLA / BBMP misuse
                  or negligence report{unreadCmAlertsCount > 1 ? 's' : ''} awaiting CM directive.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveScreen(WorkspaceScreen.CmOversight)}
                className="h-9 cursor-pointer rounded bg-[#BA1A1A] px-3.5 text-xs font-bold text-white hover:bg-[#991515]"
              >
                Open CM Escalation Inbox
              </button>
            </div>
          )}

          {activeScreen === WorkspaceScreen.CmOversight && (
            <CmOversightAndAppointmentsScreen
              authorityTier={resolvedTier}
              actorUid={currentUser.uid}
              actorName={adminName}
              admins={admins}
              wards={wards}
              complaints={incidents}
              cmEscalations={cmEscalations}
              appointments={allAppointments}
              onShowToast={showToast}
            />
          )}

          {activeScreen === WorkspaceScreen.Overview && (
            <OverviewScreen
              incidents={incidents}
              wards={wards}
              crews={crews}
              selectedWard={selectedWard}
              onSelectWard={setSelectedWard}
              onInspectIncident={(id) => setInspectedIncidentId(id)}
              onNavigateIncidents={() => setActiveScreen(WorkspaceScreen.Incidents)}
              onNavigateWards={() => setActiveScreen(WorkspaceScreen.Wards)}
              onOpenNewIncident={() => setIsLogModalOpen(true)}
            />
          )}

          {activeScreen === WorkspaceScreen.Incidents && (
            <IncidentsScreen
              incidents={incidents}
              wards={wards}
              crews={crews}
              selectedWard={selectedWard}
              onSelectWard={setSelectedWard}
              onInspectIncident={(id) => setInspectedIncidentId(id)}
              onBulkUpdateStatus={handleBulkUpdateStatus}
              onOpenNewIncident={() => setIsLogModalOpen(true)}
            />
          )}

          {activeScreen === WorkspaceScreen.Duplicates && (
            <DuplicateMergeConsole
              complaints={incidents}
              reviews={duplicateReviews}
              adminUid={currentUser.uid}
              adminName={adminName}
              onShowToast={showToast}
              onInspectComplaint={(id) => setInspectedIncidentId(id)}
            />
          )}

          {activeScreen === WorkspaceScreen.Wards && (
            <WardsScreen
              wards={wards}
              crews={crews}
              incidents={incidents}
              usingSampleData={false}
              onUpdateWardBudget={handleUpdateWardBudget}
              onApplyDefaultBudgets={handleApplyDefaultWardBudgets}
              onResetWorkspaceData={handleResetWorkspaceData}
              onReassignCrewWard={(crewId, wardNum) =>
                setCrews((prev) =>
                  prev.map((c) => (c.id === crewId ? { ...c, assignedWardNumber: wardNum } : c))
                )
              }
              onUpdateCrewStatus={(crewId, status) =>
                setCrews((prev) => prev.map((c) => (c.id === crewId ? { ...c, status } : c)))
              }
              onViewWardTickets={(wardNum) => {
                setSelectedWard(wardNum);
                setActiveScreen(WorkspaceScreen.Incidents);
              }}
            />
          )}

          {activeScreen === WorkspaceScreen.SlaPolicy && (
            <SlaPolicyScreen
              policies={policies}
              incidents={incidents}
              usingSampleData={false}
              onUpdatePolicy={handleUpdatePolicy}
              onApplyDefaultPolicies={handleApplyDefaultPolicies}
              onResetWorkspaceData={handleResetWorkspaceData}
            />
          )}

          {activeScreen === WorkspaceScreen.AiResearch && (
            <AiEvaluationResearchScreen
              experiments={experiments}
              adminUid={currentUser.uid}
              onShowToast={showToast}
            />
          )}

          {activeScreen === WorkspaceScreen.Leaderboard && (
            <LeaderboardScreen
              currentUid={currentUser.uid}
              allStats={filteredCitizenStats}
              wards={wards}
              complaints={incidents}
              admins={admins}
            />
          )}

          {activeScreen === WorkspaceScreen.PublicAccountability && (
            <PublicAccountabilityDashboard
              complaints={incidents}
              wards={wards}
              allStats={filteredCitizenStats}
              activities={civicActivities}
              admins={admins}
              cmEscalations={cmEscalations}
            />
          )}

          {activeScreen === WorkspaceScreen.WelfareOfficer && (
            <WelfareOfficerDashboard
              officerUid={currentUser.uid}
              programmes={welfareProgrammes}
              applications={allWelfareApplications}
              onShowToast={showToast}
            />
          )}

          {activeScreen === WorkspaceScreen.AdminAccess && (
            <AdminAccessScreen
              requests={adminRequests}
              admins={admins}
              welfareOfficers={welfareOfficers}
              onShowToast={showToast}
            />
          )}

          {activeScreen === WorkspaceScreen.Guide && <GuideView mode="admin" />}
        </main>
      </div>

      {/* Level 2 Incident Inspector Drawer */}
      <IncidentDrawer
        incident={inspectedIncident}
        crews={crews}
        adminUid={currentUser.uid}
        adminName={adminName}
        onShowToast={showToast}
        onClose={() => setInspectedIncidentId(null)}
        onUpdateStatus={handleUpdateIncidentStatus}
        onAssignCrew={handleAssignCrew}
        onOverridePriority={handleOverridePriority}
        onOpenResolutionVerification={(inc) => setVerifyingIncident(inc)}
        onAddAuditNote={handleAddAuditNote}
      />

      {/* Objective 4 Admin Resolution Verification Modal */}
      <ResolutionVerificationModal
        incident={verifyingIncident}
        adminUid={currentUser.uid}
        adminName={adminName}
        onClose={() => setVerifyingIncident(null)}
        onVerifiedSubmitted={(id) =>
          showToast(`Resolution photo & GPS evidence submitted for ${id}.`)
        }
      />

      {/* Register Incident Modal */}
      <LogIncidentModal
        isOpen={isLogModalOpen}
        wards={wards}
        policies={policies}
        actorUid={currentUser.uid}
        actorName={adminName}
        onClose={() => setIsLogModalOpen(false)}
        onSubmitted={(id) => showToast(`${id} logged to Cloud Firestore.`)}
      />

      {/* Confirmation Toast */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded border border-[#102A43] bg-[#102A43] px-4 py-3 text-sm font-medium text-white civic-shadow-2"
        >
          <span>{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            aria-label="Dismiss notification"
            className="cursor-pointer text-[#B0C9E8] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
