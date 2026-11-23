import {
  Activity,
  AlertTriangle,
  Award,
  Bell,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  Flame,
  Gift,
  Heart,
  HeartHandshake,
  Home,
  Languages,
  ListChecks,
  Lock,
  LogOut,
  Map as MapIcon,
  MapPin,
  MessageSquare,
  Navigation,
  PhoneCall,
  PlusCircle,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  ThumbsUp,
  Ticket,
  Trash2,
  TrendingUp,
  Trophy,
  User,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import {
  CITIZEN_LEVELS,
  COMPLAINT_CATEGORIES,
  DEFAULT_POINTS_CONFIG,
  DEMO_CONSTITUENCIES,
  STATUS_COLORS,
  SUPPORTED_LANGUAGES,
  WELFARE_BENEFITS,
  WELFARE_MIN_CLAIM_POINTS,
} from '@shared/constants';
import { UI_STRINGS } from '@shared/i18n';
import {
  normalizeAdminDoc,
  normalizeBenefitClaimDoc,
  normalizeCommunityCommentDoc,
  normalizeComplaintDoc,
  normalizeConstituencyDoc,
  normalizeNotificationDoc,
  normalizePublicCitizenDoc,
  normalizeSeriousConcernDoc,
  stripUndefinedDeep,
} from '@shared/normalizers';
import { haversineMeters } from '@shared/geo';
import { computePriorityScore, getCommunityDemandInfo } from '@shared/priority';
import type {
  AreaCluster,
  BenefitClaim,
  CitizenLeaderboardRow,
  CitizenProfile,
  CitizenVerificationStatus,
  CommunityComment,
  Complaint,
  ConstituencyBoundary,
  NotificationItem,
  PointsConfig,
  PublicCitizenProfile,
  SeriousConcern,
  SupportedLanguage,
  WelfareBenefit,
} from '@shared/types';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  increment,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { BengaluruMap } from './components/BengaluruMap';
import { BengaluruSkyline } from './components/BengaluruSkyline';
import { GuideBotWidget } from './components/GuideBotWidget';
import { ReportFlowModal } from './components/ReportFlowModal';
import { SeriousConcernModal } from './components/SeriousConcernModal';
import { auth, db, testFirestoreConnection } from './firebase';
import { requestBestCurrentPosition } from './utils/gps';

type CitizenTab = 'home' | 'my_reports' | 'benefits' | 'rankings' | 'me';

export function App() {
  const [language, setLanguage] = useState<SupportedLanguage>(() => {
    const saved = localStorage.getItem('nagrik_lang') as SupportedLanguage | null;
    return saved && ['en', 'kn', 'hi', 'ta', 'te'].includes(saved) ? saved : 'en';
  });
  const [languageChosen, setLanguageChosen] = useState<boolean>(() =>
    Boolean(localStorage.getItem('nagrik_lang'))
  );
  const [simpleMode, setSimpleMode] = useState<boolean>(
    () => localStorage.getItem('nagrik_simple_mode') === 'true'
  );
  const [guideBotEnabled, setGuideBotEnabled] = useState<boolean>(
    () => localStorage.getItem('nagrik_guide_bot') !== 'false'
  );

  const t = UI_STRINGS[language] || UI_STRINGS.en;

  const [demoMode, setDemoMode] = useState(false);
  const [pointsConfig, setPointsConfig] = useState<PointsConfig>(DEFAULT_POINTS_CONFIG);
  const [activeTab, setActiveTab] = useState<CitizenTab>('home');
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [citizenProfile, setCitizenProfile] = useState<CitizenProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [blockedStaffMsg, setBlockedStaffMsg] = useState<string | null>(null);

  // Public & citizen data
  const [constituencies, setConstituencies] = useState<ConstituencyBoundary[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [complaintsLoaded, setComplaintsLoaded] = useState(false);
  const [clusters, setClusters] = useState<AreaCluster[]>([]);
  const [communityComments, setCommunityComments] = useState<CommunityComment[]>([]);
  const [publicCitizens, setPublicCitizens] = useState<PublicCitizenProfile[]>([]);
  const [expandedContributorUid, setExpandedContributorUid] = useState<string | null>(null);
  const [contributorSearch, setContributorSearch] = useState('');
  const [myConcerns, setMyConcerns] = useState<SeriousConcern[]>([]);
  const [myBenefitClaims, setMyBenefitClaims] = useState<BenefitClaim[]>([]);
  const [benefitFilter, setBenefitFilter] = useState<'all' | 'starter50' | 'unlocked' | 'claimed'>(
    'all'
  );
  const [claimingBenefitId, setClaimingBenefitId] = useState<string | null>(null);
  const [claimNoteInput, setClaimNoteInput] = useState('');
  const [claimBusyId, setClaimBusyId] = useState<string | null>(null);
  const [copiedVoucherId, setCopiedVoucherId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [focusedComplaintId, setFocusedComplaintId] = useState<string | null>(null);
  const [focusedConcernId, setFocusedConcernId] = useState<string | null>(null);

  // UI filters & modals
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [selectedConstituencyId, setSelectedConstituencyId] = useState<string>('ALL');
  const [feedSort, setFeedSort] = useState<
    'latest' | 'trending' | 'near_me' | 'awaiting_fix' | 'resolved'
  >('latest');
  const [searchQuery, setSearchQuery] = useState('');
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locatingUser, setLocatingUser] = useState(false);
  const [expandedPostIds, setExpandedPostIds] = useState<Record<string, boolean>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [commentKinds, setCommentKinds] = useState<Record<string, CommunityComment['kind']>>({});
  const [commentBusyId, setCommentBusyId] = useState<string | null>(null);
  const [aiBriefBusyId, setAiBriefBusyId] = useState<string | null>(null);
  const [transparencyConstId, setTransparencyConstId] = useState<string | null>(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [concernModalOpen, setConcernModalOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [celebrateMsg, setCelebrateMsg] = useState<string | null>(null);

  // Auth form
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | 'reset'>('signin');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [dpdpConsent, setDpdpConsent] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  useEffect(() => {
    void testFirestoreConnection();
    fetch('/api/config/public')
      .then((r) => r.json())
      .then((cfg: { demoMode?: boolean }) => {
        setDemoMode(Boolean(cfg.demoMode));
      })
      .catch(() => null);

    const unsubSettings = onSnapshot(doc(db, 'appConfig', 'settings'), (snap) => {
      if (snap.exists()) {
        const d = snap.data() as {
          demoMode?: boolean;
          pointsConfig?: Partial<PointsConfig>;
        };
        if (typeof d.demoMode === 'boolean') setDemoMode(d.demoMode);
        if (d.pointsConfig) {
          setPointsConfig({
            verifiedReport:
              typeof d.pointsConfig.verifiedReport === 'number'
                ? d.pointsConfig.verifiedReport
                : DEFAULT_POINTS_CONFIG.verifiedReport,
            confirmedResolved:
              typeof d.pointsConfig.confirmedResolved === 'number'
                ? d.pointsConfig.confirmedResolved
                : DEFAULT_POINTS_CONFIG.confirmedResolved,
            upvote: 0,
          });
        }
      }
    });
    return () => unsubSettings();
  }, []);

  // Load public constituencies, public complaints, and clusters
  useEffect(() => {
    const unsubConst = onSnapshot(collection(db, 'constituencies'), (snap) => {
      const items = snap.docs
        .map((d) => normalizeConstituencyDoc(d.id, d.data() as Record<string, unknown>))
        .filter((x): x is ConstituencyBoundary => x !== null);
      setConstituencies(items);
    });

    const unsubComplaints = onSnapshot(
      collection(db, 'complaints'),
      (snap) => {
        const list = snap.docs.map((d) =>
          normalizeComplaintDoc(d.id, d.data() as Record<string, unknown>)
        );
        list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setComplaints(list);
        setComplaintsLoaded(true);
      }
    );

    const unsubClusters = onSnapshot(collection(db, 'areaClusters'), (snap) => {
      setClusters(snap.docs.map((d) => d.data() as AreaCluster));
    });

    const unsubComments = onSnapshot(
      collection(db, 'communityComments'),
      (snap) => {
        const items = snap.docs.map((d) =>
          normalizeCommunityCommentDoc(d.id, d.data() as Record<string, unknown>)
        );
        items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setCommunityComments(items);
      },
      () => setCommunityComments([])
    );

    const unsubPublicCitizens = onSnapshot(
      collection(db, 'publicCitizens'),
      (snap) => {
        const rows = snap.docs.map((d) =>
          normalizePublicCitizenDoc(d.id, d.data() as Record<string, unknown>)
        );
        setPublicCitizens(rows);
      },
      () => setPublicCitizens([])
    );

    return () => {
      unsubConst();
      unsubComplaints();
      unsubClusters();
      unsubComments();
      unsubPublicCitizens();
    };
  }, []);

  // Auth listener: strictly rejects Admin accounts on the Citizen App
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setFirebaseUser(null);
        setCitizenProfile(null);
        setMyConcerns([]);
        setAuthReady(true);
        return;
      }

      try {
        const adminSnap = await getDoc(doc(db, 'admins', user.uid));
        const normalizedAdmin = adminSnap.exists()
          ? normalizeAdminDoc(user.uid, adminSnap.data() as Record<string, unknown>)
          : null;
        if (normalizedAdmin) {
          await signOut(auth);
          setBlockedStaffMsg(
            'This Google account is registered as official staff. Please sign in to the Citizen Portal with a separate citizen Google account — your official Staff Portal session stays signed in independently.'
          );
          setFirebaseUser(null);
          setCitizenProfile(null);
          setAuthReady(true);
          return;
        }
      } catch {
        // Not an admin doc
      }

      setBlockedStaffMsg(null);
      setFirebaseUser(user);

      // Load or sync citizen profile
      const profileRef = doc(db, 'citizens', user.uid);
      const profSnap = await getDoc(profileRef).catch(() => null);
      if (profSnap?.exists()) {
        const prof = profSnap.data() as CitizenProfile;
        setCitizenProfile(prof);
        setLanguage(prof.preferredLanguage);
        setSimpleMode(prof.simpleMode);
        setGuideBotEnabled(prof.guideBotEnabled);
      } else if (user.emailVerified) {
        const now = new Date().toISOString();
        const newProfile: CitizenProfile = {
          uid: user.uid,
          displayName: user.displayName || user.email?.split('@')[0] || 'Citizen',
          role: 'citizen',
          preferredLanguage: language,
          simpleMode,
          guideBotEnabled,
          verificationStatus: 'Verified',
          consentDpdpAccepted: true,
          consentDpdpAcceptedAt: now,
          shareContactWithMla: false,
          createdAt: now,
          updatedAt: now,
        };
        await setDoc(profileRef, newProfile).catch(() => null);
        await setDoc(doc(db, 'citizens', user.uid, 'private', 'contact'), {
          uid: user.uid,
          email: user.email || '',
          updatedAt: now,
        }).catch(() => null);
        setCitizenProfile(newProfile);
      }

      setAuthReady(true);
    });
    return unsub;
  }, []);

  async function syncPublicCitizenProfile(
    user: FirebaseUser,
    opts?: {
      extraNeighbourConfirm?: number;
      preferredDisplayName?: string;
    }
  ) {
    if (!user.emailVerified) return;
    try {
      const ref = doc(db, 'publicCitizens', user.uid);
      const existingSnap = await getDoc(ref).catch(() => null);
      const existingData = existingSnap?.exists()
        ? normalizePublicCitizenDoc(user.uid, existingSnap.data() as Record<string, unknown>)
        : null;

      const nonAnonReports = complaints.filter(
        (c) => !c.isAnonymous && c.reporterUid === user.uid
      );
      const liveReportsCount = nonAnonReports.length;
      const liveConfirmedCount = nonAnonReports.filter(
        (c) => c.status === 'CONFIRMED RESOLVED'
      ).length;
      const liveSupportsCount = complaints.filter((c) =>
        (c.upvoterUids || []).includes(user.uid)
      ).length;

      const now = new Date().toISOString();
      const rawName =
        opts?.preferredDisplayName ||
        citizenProfile?.displayName ||
        user.displayName ||
        user.email?.split('@')[0] ||
        existingData?.displayName ||
        'Citizen';
      const displayName = rawName.trim().slice(0, 120) || 'Citizen';

      const payload: PublicCitizenProfile = {
        uid: user.uid,
        displayName,
        reportsCount: complaintsLoaded
          ? liveReportsCount
          : Math.max(liveReportsCount, existingData?.reportsCount ?? 0),
        confirmedCount: complaintsLoaded
          ? liveConfirmedCount
          : Math.max(liveConfirmedCount, existingData?.confirmedCount ?? 0),
        supportsCount: complaintsLoaded
          ? liveSupportsCount
          : Math.max(liveSupportsCount, existingData?.supportsCount ?? 0),
        neighbourConfirmsCount: Math.min(
          100000,
          (existingData?.neighbourConfirmsCount ?? 0) + (opts?.extraNeighbourConfirm ?? 0)
        ),
        createdAt: existingData?.createdAt || now,
        updatedAt: now,
      };
      await setDoc(ref, payload).catch(() => null);
    } catch {
      // Non-blocking public contributor sync
    }
  }

  const totalCommunityActions = useMemo(
    () =>
      complaints.reduce(
        (acc, c) => acc + c.upvoteCount + (c.status === 'CONFIRMED RESOLVED' ? 1 : 0),
        0
      ),
    [complaints]
  );

  // Keep signed-in verified citizen's non-PII public summary synced whenever auth or complaints update
  useEffect(() => {
    if (!firebaseUser?.emailVerified) return;
    void syncPublicCitizenProfile(firebaseUser);
  }, [firebaseUser, complaintsLoaded, complaints.length, totalCommunityActions, communityComments.length, citizenProfile?.displayName]);

  // Load current citizen's own private serious concerns & private notifications
  useEffect(() => {
    if (!firebaseUser) {
      setMyConcerns([]);
      setNotifications([]);
      return;
    }

    const qNotif = query(
      collection(db, 'notifications'),
      where('recipientUid', '==', firebaseUser.uid)
    );
    const unsubNotif = onSnapshot(
      qNotif,
      (snap) => {
        const items = snap.docs.map((d) =>
          normalizeNotificationDoc(d.id, d.data() as Record<string, unknown>)
        );
        items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setNotifications(items);
      },
      () => setNotifications([])
    );

    if (!firebaseUser.emailVerified) {
      setMyConcerns([]);
      setMyBenefitClaims([]);
      return () => unsubNotif();
    }

    const qConcerns = query(
      collection(db, 'seriousConcerns'),
      where('reporterUid', '==', firebaseUser.uid)
    );
    const unsubConcerns = onSnapshot(
      qConcerns,
      (snap) => {
        const items = snap.docs.map((d) =>
          normalizeSeriousConcernDoc(d.id, d.data() as Record<string, unknown>)
        );
        items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setMyConcerns(items);
      },
      () => setMyConcerns([])
    );

    const qClaims = query(
      collection(db, 'benefitClaims'),
      where('citizenUid', '==', firebaseUser.uid)
    );
    const unsubClaims = onSnapshot(
      qClaims,
      (snap) => {
        const items = snap.docs.map((d) =>
          normalizeBenefitClaimDoc(d.id, d.data() as Record<string, unknown>)
        );
        items.sort((a, b) => b.claimedAt.localeCompare(a.claimedAt));
        setMyBenefitClaims(items);
      },
      () => setMyBenefitClaims([])
    );

    return () => {
      unsubNotif();
      unsubConcerns();
      unsubClaims();
    };
  }, [firebaseUser]);

  const effectiveConstituencies = useMemo(
    () => (constituencies.length > 0 ? constituencies : demoMode ? DEMO_CONSTITUENCIES : []),
    [constituencies, demoMode]
  );

  const visibleComplaints = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = complaints.filter((c) => {
      if (categoryFilter !== 'ALL' && c.category !== categoryFilter) return false;
      if (selectedConstituencyId !== 'ALL' && c.constituencyId !== selectedConstituencyId)
        return false;
      if (feedSort === 'awaiting_fix' && c.status !== 'Fixed, awaiting confirmation')
        return false;
      if (feedSort === 'resolved' && c.status !== 'CONFIRMED RESOLVED') return false;
      if (q) {
        const hay = `${c.title} ${c.description} ${c.englishTranslation || ''} ${c.localityName} ${c.constituencyName} ${c.category} ${c.assignedMlaName} ${c.ownerLabel}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const sorted = [...filtered];
    if (feedSort === 'trending') {
      sorted.sort(
        (a, b) =>
          b.upvoteCount - a.upvoteCount ||
          b.priorityScore - a.priorityScore ||
          b.updatedAt.localeCompare(a.updatedAt)
      );
    } else if (feedSort === 'near_me' && userCoords) {
      sorted.sort(
        (a, b) =>
          haversineMeters(userCoords.lat, userCoords.lng, a.latitude, a.longitude) -
          haversineMeters(userCoords.lat, userCoords.lng, b.latitude, b.longitude)
      );
    } else {
      sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }
    return sorted;
  }, [complaints, categoryFilter, selectedConstituencyId, feedSort, searchQuery, userCoords]);

  const myComplaints = useMemo(() => {
    if (!firebaseUser) return [];
    return complaints.filter((c) => c.reporterUid === firebaseUser.uid);
  }, [complaints, firebaseUser]);

  const unreadNotifications = useMemo(
    () => notifications.filter((n) => !n.read),
    [notifications]
  );

  const pendingVerificationComplaints = useMemo(
    () =>
      myComplaints.filter(
        (c) => c.status === 'Fixed, awaiting confirmation' && !c.isAnonymous
      ),
    [myComplaints]
  );

  // Real Citizen Leaderboard computed across ALL active/neighbour citizens + non-anonymous complaints (upvotes = 0 points!)
  const leaderboardRows = useMemo<CitizenLeaderboardRow[]>(() => {
    const map = new Map<
      string,
      {
        uid: string;
        displayName: string;
        reportsCount: number;
        confirmedCount: number;
        supportsCount: number;
        neighbourConfirmsCount: number;
      }
    >();

    // 1. Seed with every non-PII profile in publicCitizens (so ALL neighbour citizens appear symmetrically)
    for (const pc of publicCitizens) {
      if (!pc.uid) continue;
      map.set(pc.uid, {
        uid: pc.uid,
        displayName: pc.displayName || 'Citizen',
        reportsCount: pc.reportsCount,
        confirmedCount: pc.confirmedCount,
        supportsCount: pc.supportsCount,
        neighbourConfirmsCount: pc.neighbourConfirmsCount,
      });
    }

    // 2. Merge live non-anonymous complaints, community support & comment counts
    const liveReportsByUid = new Map<string, number>();
    const liveConfirmedByUid = new Map<string, number>();
    const liveSupportsByUid = new Map<string, number>();
    const liveCommentsByUid = new Map<string, number>();
    const liveNamesByUid = new Map<string, string>();

    for (const c of complaints) {
      if (!c.isAnonymous && c.reporterUid) {
        liveReportsByUid.set(c.reporterUid, (liveReportsByUid.get(c.reporterUid) || 0) + 1);
        if (c.status === 'CONFIRMED RESOLVED') {
          liveConfirmedByUid.set(
            c.reporterUid,
            (liveConfirmedByUid.get(c.reporterUid) || 0) + 1
          );
        }
        if (c.reporterDisplayName && c.reporterDisplayName !== 'Citizen') {
          liveNamesByUid.set(c.reporterUid, c.reporterDisplayName);
        }
      }
      for (const upUid of c.upvoterUids || []) {
        if (!upUid) continue;
        liveSupportsByUid.set(upUid, (liveSupportsByUid.get(upUid) || 0) + 1);
      }
    }

    for (const cm of communityComments) {
      if (!cm.authorUid) continue;
      liveCommentsByUid.set(cm.authorUid, (liveCommentsByUid.get(cm.authorUid) || 0) + 1);
      if (cm.authorDisplayName && cm.authorDisplayName !== 'Citizen') {
        liveNamesByUid.set(cm.authorUid, cm.authorDisplayName);
      }
    }

    const allUids = new Set<string>([
      ...map.keys(),
      ...liveReportsByUid.keys(),
      ...liveSupportsByUid.keys(),
      ...liveCommentsByUid.keys(),
    ]);

    for (const uid of allUids) {
      const existing = map.get(uid);
      const liveReports = liveReportsByUid.get(uid) || 0;
      const liveConfirmed = liveConfirmedByUid.get(uid) || 0;
      const liveSupports = liveSupportsByUid.get(uid) || 0;
      const name =
        existing?.displayName && existing.displayName !== 'Citizen'
          ? existing.displayName
          : liveNamesByUid.get(uid) || existing?.displayName || `Neighbour ${uid.slice(0, 5)}`;

      map.set(uid, {
        uid,
        displayName: name,
        reportsCount: Math.max(existing?.reportsCount || 0, liveReports),
        confirmedCount: Math.max(existing?.confirmedCount || 0, liveConfirmed),
        supportsCount: Math.max(existing?.supportsCount || 0, liveSupports),
        neighbourConfirmsCount: existing?.neighbourConfirmsCount || 0,
      });
    }

    const rows: CitizenLeaderboardRow[] = Array.from(map.values()).map((entry) => {
      const commentsCount = liveCommentsByUid.get(entry.uid) || 0;
      const points =
        entry.reportsCount * pointsConfig.verifiedReport +
        (entry.confirmedCount + entry.neighbourConfirmsCount) * pointsConfig.confirmedResolved;
      let levelName: string = CITIZEN_LEVELS[0].name;
      for (const lvl of CITIZEN_LEVELS) {
        if (points >= lvl.minPoints) levelName = lvl.name;
      }
      const badges: string[] = [];
      if (entry.reportsCount >= 1) badges.push('First Voice');
      if (entry.confirmedCount >= 1) badges.push('Verified Fixer');
      if (entry.reportsCount >= 3) badges.push('Area Watchdog');
      if (entry.confirmedCount >= 5) badges.push('Impact Champion');
      if (entry.supportsCount >= 3) badges.push('Community Supporter');
      if (entry.neighbourConfirmsCount >= 1) badges.push('Neighbour Verifier');
      if (commentsCount >= 2) badges.push('Active Voice');

      return {
        uid: entry.uid,
        displayName: entry.displayName,
        reportsCount: entry.reportsCount,
        confirmedCount: entry.confirmedCount,
        supportsCount: entry.supportsCount,
        neighbourConfirmsCount: entry.neighbourConfirmsCount,
        commentsCount,
        points,
        levelName,
        badges,
      };
    });

    rows.sort(
      (a, b) =>
        b.points - a.points ||
        b.confirmedCount - a.confirmedCount ||
        b.neighbourConfirmsCount - a.neighbourConfirmsCount ||
        b.reportsCount - a.reportsCount ||
        b.supportsCount - a.supportsCount ||
        b.commentsCount - a.commentsCount
    );
    return rows;
  }, [complaints, communityComments, publicCitizens, pointsConfig]);

  const myEarnedPoints = useMemo(() => {
    if (!firebaseUser) return 0;
    const myRow = leaderboardRows.find((r) => r.uid === firebaseUser.uid);
    return myRow?.points || 0;
  }, [firebaseUser, leaderboardRows]);

  const mySpentPoints = useMemo(
    () => myBenefitClaims.reduce((sum, cl) => sum + cl.pointsSpent, 0),
    [myBenefitClaims]
  );

  const myAvailablePoints = Math.max(0, myEarnedPoints - mySpentPoints);

  const commentsByComplaintId = useMemo(() => {
    const grouped = new Map<string, CommunityComment[]>();
    for (const cm of communityComments) {
      const list = grouped.get(cm.complaintId) || [];
      list.push(cm);
      grouped.set(cm.complaintId, list);
    }
    return grouped;
  }, [communityComments]);

  const liveActivityItems = useMemo(() => {
    const items: Array<{
      id: string;
      complaintId: string;
      actor: string;
      summary: string;
      badge: string;
      timestamp: string;
    }> = [];

    for (const cm of communityComments.slice(0, 8)) {
      const target = complaints.find((c) => c.id === cm.complaintId);
      if (!target) continue;
      items.push({
        id: `act-cm-${cm.id}`,
        complaintId: target.id,
        actor: cm.authorDisplayName,
        summary:
          cm.kind === 'fix_check'
            ? `verified repair photo on "${target.title}"`
            : cm.kind === 'ground_update'
              ? `shared ground update on "${target.title}"`
              : `commented on "${target.title}"`,
        badge: cm.kind === 'fix_check' ? 'Verify' : 'Comment',
        timestamp: cm.createdAt,
      });
    }

    for (const c of complaints.slice(0, 10)) {
      const actor = c.isAnonymous ? 'Anonymous Citizen' : c.reporterDisplayName || 'Citizen';
      if (c.status === 'CONFIRMED RESOLVED') {
        items.push({
          id: `act-green-${c.id}`,
          complaintId: c.id,
          actor: c.confirmedByLabel === 'confirmed by neighbours' ? 'Neighbours' : actor,
          summary: `confirmed "${c.title}" RESOLVED GREEN in ${c.localityName}`,
          badge: 'Green',
          timestamp: c.updatedAt,
        });
      } else if (c.status === 'Fixed, awaiting confirmation') {
        items.push({
          id: `act-fix-${c.id}`,
          complaintId: c.id,
          actor: c.assignedMlaName,
          summary: `uploaded repair proof for "${c.title}" — verify photo!`,
          badge: 'Check Fix',
          timestamp: c.updatedAt,
        });
      } else {
        items.push({
          id: `act-rep-${c.id}`,
          complaintId: c.id,
          actor,
          summary:
            c.upvoteCount > 0
              ? `reported "${c.title}" (${c.upvoteCount} upvotes)`
              : `reported "${c.title}" in ${c.localityName}`,
          badge: c.upvoteCount >= 3 ? `${c.upvoteCount} Likes` : 'New',
          timestamp: c.createdAt,
        });
      }
    }

    items.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return items.slice(0, 6);
  }, [complaints, communityComments]);

  function selectLanguage(lang: SupportedLanguage) {
    setLanguage(lang);
    setLanguageChosen(true);
    localStorage.setItem('nagrik_lang', lang);
    if (firebaseUser && citizenProfile) {
      void updateDoc(doc(db, 'citizens', firebaseUser.uid), {
        preferredLanguage: lang,
        updatedAt: new Date().toISOString(),
      }).catch(() => null);
    }
  }

  function toggleSimpleMode() {
    const next = !simpleMode;
    setSimpleMode(next);
    localStorage.setItem('nagrik_simple_mode', String(next));
    if (firebaseUser && citizenProfile) {
      void updateDoc(doc(db, 'citizens', firebaseUser.uid), {
        simpleMode: next,
        updatedAt: new Date().toISOString(),
      }).catch(() => null);
    }
  }

  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 5000);
  }

  function formatAuthError(err: unknown): string {
    const code = (err as { code?: string })?.code || '';
    if (code === 'auth/operation-not-allowed') {
      return 'Email/Password sign-in is disabled in Firebase Console. Use "Continue with Google" above, or enable Email/Password under Firebase Authentication > Sign-in method.';
    }
    if (code === 'auth/popup-blocked') {
      return 'Google sign-in popup was blocked by your browser. Please allow popups for this site and try again.';
    }
    if (code === 'auth/popup-closed-by-user') {
      return 'Sign-in popup was closed before finishing.';
    }
    if (code === 'auth/unauthorized-domain') {
      return 'This domain is not authorized in Firebase Console > Authentication > Settings > Authorized domains.';
    }
    return err instanceof Error ? err.message : 'Sign-in failed.';
  }

  async function handleCitizenGoogleSignIn() {
    setAuthError(null);
    setAuthBusy(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
      setAuthModalOpen(false);
    } catch (err) {
      setAuthError(formatAuthError(err));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    setAuthBusy(true);
    try {
      if (authMode === 'reset') {
        await sendPasswordResetEmail(auth, emailInput.trim());
        showToast('Password reset link sent to your email.');
        setAuthMode('signin');
        return;
      }

      if (authMode === 'signup') {
        if (!dpdpConsent) {
          throw new Error('Please accept the data privacy notice to create your account.');
        }
        const cred = await createUserWithEmailAndPassword(
          auth,
          emailInput.trim(),
          passwordInput
        );
        if (nameInput.trim()) {
          await updateProfile(cred.user, { displayName: nameInput.trim() });
        }
        await sendEmailVerification(cred.user);
        showToast('Account created! Please check your email and click the verification link.');
        setAuthModalOpen(false);
      } else {
        await signInWithEmailAndPassword(auth, emailInput.trim(), passwordInput);
        setAuthModalOpen(false);
      }
    } catch (err) {
      setAuthError(formatAuthError(err));
    } finally {
      setAuthBusy(false);
    }
  }

  function handleLocateForFeed() {
    setLocatingUser(true);
    const { promise } = requestBestCurrentPosition({ maxWaitMs: 8000 });
    void promise.then((outcome) => {
      setLocatingUser(false);
      if (!outcome.ok) {
        showToast(outcome.message);
        return;
      }
      setUserCoords({ lat: outcome.fix.lat, lng: outcome.fix.lng });
      setFeedSort('near_me');
      showToast(`Feed sorted by civic issues near you (±${outcome.fix.accuracyMeters}m).`);
    });
  }

  async function triggerCommunityAiBrief(c: Complaint, effectiveUpvotes: number, _effectiveScore: number) {
    if (!firebaseUser?.emailVerified) return;
    setAiBriefBusyId(c.id);
    try {
      const token = await firebaseUser.getIdToken();
      const resp = await fetch('/api/ai/community-brief', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: c.title,
          description: c.englishTranslation || c.description,
          category: c.category,
          localityName: c.localityName,
          constituencyName: c.constituencyName,
          upvoteCount: effectiveUpvotes,
          status: c.status,
          language,
        }),
      });
      const data = (await resp.json()) as {
        available?: boolean;
        communityBrief?: string;
        aiStatus?: 'completed' | 'unavailable';
      };
      await updateDoc(doc(db, 'complaints', c.id), {
        aiBackgroundStatus: data.aiStatus || 'unavailable',
        ...(data.communityBrief ? { aiCommunityBrief: data.communityBrief } : {}),
        updatedAt: new Date().toISOString(),
      }).catch(() => null);
    } catch {
      await updateDoc(doc(db, 'complaints', c.id), {
        aiBackgroundStatus: 'unavailable',
        updatedAt: new Date().toISOString(),
      }).catch(() => null);
    } finally {
      setAiBriefBusyId(null);
    }
  }

  async function handleUpvoteComplaint(c: Complaint) {
    if (!firebaseUser) {
      setAuthModalOpen(true);
      return;
    }
    if (!firebaseUser.emailVerified) {
      showToast('Verify your email first in the "Me" tab before liking or upvoting.');
      return;
    }
    if ((c.upvoterUids || []).includes(firebaseUser.uid)) {
      showToast('You already liked & supported this issue.');
      return;
    }
    try {
      const nextUpvotes = c.upvoteCount + 1;
      const ageHours = Math.max(
        0,
        (Date.now() - new Date(c.createdAt).getTime()) / 3_600_000
      );
      const prio = computePriorityScore({
        severity: c.severity,
        category: c.category,
        upvoteCount: nextUpvotes,
        ageHours,
      });
      await updateDoc(doc(db, 'complaints', c.id), {
        upvoteCount: increment(1),
        upvoterUids: arrayUnion(firebaseUser.uid),
        priorityScore: prio.score,
        priorityFactors: prio.factors,
        aiBackgroundStatus: 'pending',
        updatedAt: new Date().toISOString(),
      });
      void syncPublicCitizenProfile(firebaseUser);
      showToast('Liked & supported! Priority automatically boosted for official portal triage.');
      void triggerCommunityAiBrief(c, nextUpvotes, prio.score);
    } catch {
      showToast('Unable to record like right now.');
    }
  }

  function jumpToComplaint(complaintId: string, preferredTab?: 'home' | 'my_reports') {
    const isMyOwn = Boolean(
      firebaseUser && complaints.some((c) => c.id === complaintId && c.reporterUid === firebaseUser.uid)
    );
    const targetTab: 'home' | 'my_reports' = preferredTab || (isMyOwn ? 'my_reports' : 'home');
    if (targetTab === 'home') {
      setCategoryFilter('ALL');
      setSelectedConstituencyId('ALL');
      setSearchQuery('');
      setViewMode('list');
      setFeedSort('latest');
    }
    setActiveTab(targetTab);
    setExpandedPostIds((prev) => ({ ...prev, [complaintId]: true }));
    setFocusedComplaintId(complaintId);
    setFocusedConcernId(null);

    const domId =
      targetTab === 'my_reports'
        ? `my-complaint-card-${complaintId}`
        : `complaint-card-${complaintId}`;
    setTimeout(() => {
      document.getElementById(domId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 140);
  }

  function openContributorProfile(uid: string) {
    if (!uid) return;
    setActiveTab('rankings');
    setContributorSearch('');
    setExpandedContributorUid(uid);
    setTimeout(() => {
      document
        .getElementById(`contributor-card-${uid}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 140);
  }

  async function handlePostComment(
    c: Complaint,
    overrideKind?: CommunityComment['kind'],
    overrideText?: string
  ) {
    if (!firebaseUser) {
      setAuthModalOpen(true);
      return;
    }
    if (!firebaseUser.emailVerified) {
      showToast('Please verify your email in the "Me" tab before posting community comments.');
      return;
    }
    const text = (overrideText ?? commentDrafts[c.id] ?? '').trim();
    if (text.length < 2) {
      showToast('Please write at least 2 characters for your comment.');
      return;
    }
    const kind = overrideKind || commentKinds[c.id] || 'comment';
    setCommentBusyId(c.id);
    try {
      const commentId = `cmt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const authorDisplayName = (
        citizenProfile?.displayName ||
        firebaseUser.displayName ||
        firebaseUser.email?.split('@')[0] ||
        'Citizen'
      )
        .trim()
        .slice(0, 120);
      const docPayload: CommunityComment = {
        id: commentId,
        complaintId: c.id,
        authorUid: firebaseUser.uid,
        authorDisplayName,
        text: text.slice(0, 600),
        kind,
        createdAt: new Date().toISOString(),
      };
      await setDoc(doc(db, 'communityComments', commentId), docPayload);
      setCommentDrafts((prev) => ({ ...prev, [c.id]: '' }));
      setExpandedPostIds((prev) => ({ ...prev, [c.id]: true }));
      if (kind === 'fix_check') {
        await markComplaintNotificationsRead(c.id);
        await syncPublicCitizenProfile(firebaseUser, { extraNeighbourConfirm: 1 });
        setCelebrateMsg(
          `Repair photo verified! +${pointsConfig.confirmedResolved} civic points earned!`
        );
        setTimeout(() => setCelebrateMsg(null), 4500);
      } else {
        void syncPublicCitizenProfile(firebaseUser);
        showToast('Community update posted live!');
      }
    } catch {
      showToast('Unable to post community update right now.');
    } finally {
      setCommentBusyId(null);
    }
  }

  async function markNotificationRead(notif: NotificationItem) {
    if (!notif.read) {
      await updateDoc(doc(db, 'notifications', notif.id), {
        read: true,
        readAt: new Date().toISOString(),
      }).catch(() => null);
    }
    setNotifOpen(false);
    if (notif.type === 'welfare_update') {
      setActiveTab('benefits');
      setBenefitFilter('claimed');
      return;
    }
    if (notif.complaintId) {
      jumpToComplaint(notif.complaintId);
      return;
    }
    if (notif.concernId) {
      setFocusedConcernId(notif.concernId);
      setActiveTab('my_reports');
      setTimeout(() => {
        document
          .getElementById(`my-concern-card-${notif.concernId}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 140);
      return;
    }
    setActiveTab('my_reports');
  }

  async function handleClaimBenefit(benefit: WelfareBenefit) {
    if (!firebaseUser) {
      setAuthModalOpen(true);
      return;
    }
    if (!firebaseUser.emailVerified) {
      showToast('Please verify your email first in the "Me" tab before claiming welfare benefits.');
      return;
    }
    if (myAvailablePoints < WELFARE_MIN_CLAIM_POINTS || myAvailablePoints < benefit.pointsRequired) {
      showToast(
        `You need ${Math.max(WELFARE_MIN_CLAIM_POINTS, benefit.pointsRequired)} available points to claim "${benefit.title}".`
      );
      return;
    }

    setClaimBusyId(benefit.id);
    const now = new Date().toISOString();
    const randSuffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    const claimId = `clm-${Date.now()}-${randSuffix.toLowerCase()}`;
    const voucherCode = `ND-WEL-${randSuffix}${String(Date.now()).slice(-3)}`;

    try {
      // Ensure citizen profile doc exists before rule check on benefitClaims
      const citizenRef = doc(db, 'citizens', firebaseUser.uid);
      const citizenSnap = await getDoc(citizenRef).catch(() => null);
      if (!citizenSnap?.exists()) {
        const fallbackProfile: CitizenProfile = {
          uid: firebaseUser.uid,
          displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Citizen',
          role: 'citizen',
          preferredLanguage: language,
          simpleMode,
          guideBotEnabled,
          verificationStatus: 'Verified',
          consentDpdpAccepted: true,
          consentDpdpAcceptedAt: now,
          shareContactWithMla: false,
          createdAt: now,
          updatedAt: now,
        };
        await setDoc(citizenRef, fallbackProfile);
        setCitizenProfile(fallbackProfile);
      }

      const citizenLatestReport = myComplaints[0];
      const payload = stripUndefinedDeep<BenefitClaim>({
        id: claimId,
        benefitId: benefit.id,
        benefitTitle: benefit.title,
        benefitCategory: benefit.category,
        department: benefit.department,
        rewardValueLabel: benefit.rewardValueLabel,
        citizenUid: firebaseUser.uid,
        citizenName:
          citizenProfile?.displayName ||
          firebaseUser.displayName ||
          firebaseUser.email?.split('@')[0] ||
          'Citizen',
        pointsSpent: benefit.pointsRequired,
        voucherCode,
        constituencyId: citizenLatestReport?.constituencyId,
        constituencyName: citizenLatestReport?.constituencyName,
        householdNote: claimNoteInput.trim() ? claimNoteInput.trim().slice(0, 280) : undefined,
        status: 'Claimed',
        claimedAt: now,
        updatedAt: now,
      });

      await setDoc(doc(db, 'benefitClaims', claimId), payload);
      setClaimingBenefitId(null);
      setClaimNoteInput('');
      setCelebrateMsg(
        `Claimed "${benefit.title}"! Voucher ${voucherCode} generated (${benefit.pointsRequired} pts redeemed).`
      );
      setTimeout(() => setCelebrateMsg(null), 7000);
      showToast(`Benefit claimed! Voucher code: ${voucherCode}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to claim benefit right now.');
    } finally {
      setClaimBusyId(null);
    }
  }

  async function markComplaintNotificationsRead(complaintId: string) {
    const matching = unreadNotifications.filter((n) => n.complaintId === complaintId);
    const now = new Date().toISOString();
    await Promise.all(
      matching.map((n) =>
        updateDoc(doc(db, 'notifications', n.id), { read: true, readAt: now }).catch(() => null)
      )
    );
  }

  /**
   * THE GREEN RULE:
   * Only the citizen reporter OR nearby verified citizens (after 7 days / if anonymous)
   * can turn a complaint status green ("CONFIRMED RESOLVED").
   */
  async function handleCitizenConfirmGreen(c: Complaint, isNeighbour: boolean) {
    if (!firebaseUser?.emailVerified) return;
    const now = new Date().toISOString();
    const label = isNeighbour ? 'confirmed by neighbours' : 'reporter';
    try {
      await updateDoc(doc(db, 'complaints', c.id), {
        status: 'CONFIRMED RESOLVED',
        confirmedByLabel: label,
        ownerLabel:
          label === 'confirmed by neighbours'
            ? 'Confirmed fixed by neighbours'
            : 'Confirmed fixed by reporter',
        timeline: [
          ...(c.timeline || []),
          {
            status: 'CONFIRMED RESOLVED',
            actorLabel:
              label === 'confirmed by neighbours'
                ? 'Verified neighbour'
                : firebaseUser.displayName || 'Reporter',
            note:
              label === 'confirmed by neighbours'
                ? 'Fix confirmed by neighbours'
                : 'Reporter confirmed the repair is complete',
            timestamp: now,
          },
        ],
        updatedAt: now,
      });
      await markComplaintNotificationsRead(c.id);
      void syncPublicCitizenProfile(firebaseUser, {
        extraNeighbourConfirm: isNeighbour ? 1 : 0,
      });
      setCelebrateMsg(
        c.isAnonymous
          ? 'Issue Confirmed Resolved!'
          : `Issue Confirmed Resolved! +${pointsConfig.confirmedResolved} civic points earned!`
      );
      setTimeout(() => setCelebrateMsg(null), 4500);
    } catch {
      showToast('Unable to confirm fix (check reporter ownership or 7-day neighbour rule).');
    }
  }

  async function handleDisputeReopen(c: Complaint) {
    if (!firebaseUser?.emailVerified) return;
    const now = new Date().toISOString();
    try {
      await updateDoc(doc(db, 'complaints', c.id), {
        status: 'Reopened',
        ownerLabel: `${c.assignedMlaName} (${c.constituencyName})`,
        timeline: [
          ...(c.timeline || []),
          {
            status: 'Reopened',
            actorLabel: firebaseUser.displayName || 'Reporter',
            note: 'Reporter reported the issue is not fixed yet — reopened for review.',
            timestamp: now,
          },
        ],
        updatedAt: now,
      });
      await markComplaintNotificationsRead(c.id);
      showToast('Report reopened and sent back to the MLA office.');
    } catch {
      showToast('Unable to reopen report.');
    }
  }

  async function handleDeleteMyData() {
    if (!firebaseUser) return;
    try {
      await deleteDoc(doc(db, 'citizens', firebaseUser.uid, 'private', 'contact')).catch(
        () => null
      );
      await deleteDoc(doc(db, 'citizens', firebaseUser.uid)).catch(() => null);
      await deleteDoc(doc(db, 'publicCitizens', firebaseUser.uid)).catch(() => null);
      await signOut(auth);
      showToast('Your citizen profile & private contact data have been deleted.');
    } catch {
      showToast('Unable to delete profile data right now.');
    }
  }

  const verificationLabel: CitizenVerificationStatus = !firebaseUser
    ? 'Not verified'
    : firebaseUser.emailVerified
      ? citizenProfile?.verificationStatus || 'Verified'
      : 'Pending';

  const canUseReportFlow = () => {
    if (!firebaseUser) {
      setAuthModalOpen(true);
      return false;
    }
    if (!firebaseUser.emailVerified) {
      showToast('Please verify your email link first (check your inbox or Me tab).');
      setActiveTab('me');
      return false;
    }
    return true;
  };

  const transparencyConst = effectiveConstituencies.find(
    (c) => c.id === transparencyConstId
  );

  return (
    <div
      className={`min-h-screen bg-[#F4F6F9] text-[#0F2942] pb-24 ${
        simpleMode ? 'simple-mode-active' : ''
      }`}
    >
      {/* First-Launch Language Modal */}
      {!languageChosen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F2942]/80 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="text-center space-y-1">
              <div className="font-display text-2xl font-extrabold text-[#0F2942]">
                Namma Dhwani
              </div>
              <p className="text-sm text-slate-600">Your Voice. Your City. Your Impact.</p>
            </div>
            <div className="text-sm font-bold text-[#0F2942]">
              Choose your language / ನಿಮ್ಮ ಭಾಷೆ / अपनी भाषा:
            </div>
            <div className="grid grid-cols-1 gap-2.5">
              {SUPPORTED_LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => selectLanguage(lang.code)}
                  className="flex items-center justify-between rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-left font-semibold hover:border-[#0F2942] hover:bg-slate-50"
                >
                  <span className="text-[#0F2942]">{lang.nativeName}</span>
                  <span className="text-xs text-slate-500">{lang.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Top Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        {demoMode && (
          <div className="bg-amber-100 border-b border-amber-300 px-4 py-1.5 text-center text-xs font-bold text-amber-950">
            DEMO MODE ACTIVE — 9 grid areas &amp; fictional Demo Members for development testing
          </div>
        )}
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0F2942] font-display text-lg font-extrabold text-white">
              N
            </div>
            <div>
              <div className="font-display text-lg font-extrabold leading-tight text-[#0F2942]">
                {t.appName}
              </div>
              <div className="text-xs text-slate-600">{t.tagline}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              aria-label="Language"
              value={language}
              onChange={(e) => selectLanguage(e.target.value as SupportedLanguage)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-[#0F2942]"
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.nativeName}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={toggleSimpleMode}
              className={`rounded-lg border px-2.5 py-2 text-xs font-semibold ${
                simpleMode
                  ? 'border-[#0F2942] bg-[#0F2942] text-white'
                  : 'border-slate-300 bg-white text-[#0F2942]'
              }`}
              title={t.simpleMode}
            >
              A+
            </button>

            {firebaseUser && (
              <div className="relative">
                <button
                  type="button"
                  aria-label="Notifications"
                  onClick={() => setNotifOpen(!notifOpen)}
                  className="relative rounded-lg border border-slate-300 bg-white p-2 text-[#0F2942] hover:bg-slate-50"
                >
                  <Bell className="h-4 w-4" />
                  {unreadNotifications.length > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#E67E22] px-1 text-[10px] font-bold text-white">
                      {unreadNotifications.length}
                    </span>
                  )}
                </button>

                {notifOpen && (
                  <div className="absolute right-0 mt-2 w-80 max-w-[90vw] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl z-40 space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <span className="text-xs font-bold text-[#0F2942]">
                        Notifications ({unreadNotifications.length} unread)
                      </span>
                      <button
                        type="button"
                        onClick={() => setNotifOpen(false)}
                        className="text-xs text-slate-500 hover:text-slate-800"
                      >
                        Close
                      </button>
                    </div>
                    {notifications.length === 0 ? (
                      <div className="py-4 text-center text-xs text-slate-500">
                        No notifications yet.
                      </div>
                    ) : (
                      <div className="max-h-72 overflow-y-auto space-y-1.5">
                        {notifications.slice(0, 12).map((n) => (
                          <button
                            key={n.id}
                            type="button"
                            onClick={() => void markNotificationRead(n)}
                            className={`w-full rounded-xl border p-2.5 text-left text-xs transition ${
                              n.read
                                ? 'border-slate-200 bg-white text-slate-600'
                                : 'border-[#E67E22] bg-amber-50 text-[#0F2942]'
                            }`}
                          >
                            <div className="font-bold">{n.title}</div>
                            <div className="mt-0.5">{n.body}</div>
                            <div className="mt-1 text-[10px] text-slate-500">
                              {new Date(n.createdAt).toLocaleString()}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {!firebaseUser && authReady && (
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="rounded-lg bg-[#0F2942] px-3 py-2 text-xs font-bold text-white hover:bg-[#173A5E]"
              >
                Sign in
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Actionable Citizen Fix Verification Alert */}
      {firebaseUser &&
        (() => {
          const unreadFixNotif = unreadNotifications.find(
            (n) => n.type === 'fix_awaiting_confirmation' && n.complaintId
          );
          const alertComplaint =
            pendingVerificationComplaints[0] ||
            (unreadFixNotif?.complaintId
              ? complaints.find((c) => c.id === unreadFixNotif.complaintId)
              : undefined);
          if (!alertComplaint && pendingVerificationComplaints.length === 0) return null;
          return (
            <div className="mx-auto mt-3 max-w-4xl px-4">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-[#15803D] bg-emerald-50 px-4 py-3 text-sm text-[#0F2942] shadow-sm">
                <div className="flex items-center gap-2 font-bold">
                  <Bell className="h-4 w-4 shrink-0 text-[#15803D]" />
                  <span>
                    {alertComplaint
                      ? `Office marked "${alertComplaint.title}" fixed! Click to inspect before/after photos & confirm resolved.`
                      : 'An office marked an issue fixed! Inspect the repair photo and confirm on the ground.'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (alertComplaint) {
                      jumpToComplaint(alertComplaint.id);
                    } else {
                      setActiveTab('my_reports');
                    }
                  }}
                  className="rounded-lg bg-[#15803D] px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800"
                >
                  Inspect &amp; Verify Photo
                </button>
              </div>
            </div>
          );
        })()}

      {/* Floating Celebration / Toast Notifications (always visible when scrolled) */}
      {celebrateMsg && (
        <div className="fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-md">
          <div className="flex items-center gap-2 rounded-xl border-2 border-[#15803D] bg-emerald-50 px-4 py-3 text-sm font-bold text-[#15803D] shadow-xl animate-bounce">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <span>{celebrateMsg}</span>
          </div>
        </div>
      )}

      {toastMsg && (
        <div className="fixed bottom-20 right-4 z-50 max-w-sm">
          <div className="rounded-xl border border-[#0F2942] bg-[#0F2942] px-4 py-3 text-sm font-medium text-white shadow-xl">
            {toastMsg}
          </div>
        </div>
      )}

      {blockedStaffMsg && (
        <div className="mx-auto mt-3 max-w-4xl px-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-900">
            <span>{blockedStaffMsg}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleCitizenGoogleSignIn()}
                className="rounded-lg bg-[#0F2942] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#173A5E]"
              >
                Use Another Google Account
              </button>
              <button
                type="button"
                onClick={() => setBlockedStaffMsg(null)}
                className="rounded-lg border border-red-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-800"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-4xl px-4 py-5 space-y-5">
        {/* HOME TAB */}
        {activeTab === 'home' && (
          <>
            {/* 112 Emergency Banner */}
            <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950">
              <PhoneCall className="h-5 w-5 shrink-0 text-red-700" />
              <span className="font-semibold">{t.emergencyBanner}</span>
            </div>

            {/* Hero Action Card with Bengaluru Skyline */}
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="p-5 pb-2 space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h1 className="font-display text-2xl font-extrabold text-[#0F2942]">
                      Karnataka Civic Feed
                    </h1>
                    <p className="text-sm text-slate-600 mt-1">
                      See issues across Karnataka &amp; your neighbourhood, like to boost official priority, and track live MLA &amp; civic office action.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (canUseReportFlow()) setReportModalOpen(true);
                    }}
                    className="flex min-h-[60px] items-center justify-center gap-2.5 rounded-xl bg-[#0F2942] px-5 py-3.5 text-base font-bold text-white shadow hover:bg-[#173A5E]"
                  >
                    <PlusCircle className="h-5 w-5 text-[#E67E22]" />
                    <span>{t.reportButton}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (canUseReportFlow()) setConcernModalOpen(true);
                    }}
                    className="flex min-h-[60px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-sm font-semibold text-[#0F2942] hover:bg-slate-50"
                  >
                    <Lock className="h-4 w-4 text-[#E67E22]" />
                    <span>{t.seriousConcernButton}</span>
                  </button>
                </div>
              </div>
              <BengaluruSkyline className="w-full h-20 opacity-90" />
            </section>

            {/* Live Citizen <-> Official Portal Connection Bar */}
            <section className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                <div className="flex items-center gap-2 text-xs font-bold text-[#0F2942]">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#15803D] animate-pulse" />
                  <span>Live synced with Karnataka MLA &amp; Civic Offices</span>
                </div>
                <span className="text-[11px] text-slate-500">
                  Likes auto-prioritize serious issues in Admin Portal &amp; trigger AI impact summaries
                </span>
              </div>
              <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4 text-center">
                <div className="rounded-xl bg-slate-50 px-3 py-2">
                  <div className="font-mono-num text-lg font-extrabold text-[#0F2942]">
                    {complaints.length}
                  </div>
                  <div className="text-[11px] font-semibold text-slate-600">Total Reports</div>
                </div>
                <div className="rounded-xl bg-amber-50 px-3 py-2">
                  <div className="font-mono-num text-lg font-extrabold text-[#E67E22]">
                    {complaints.filter((c) => c.status === 'Fixed, awaiting confirmation').length}
                  </div>
                  <div className="text-[11px] font-semibold text-amber-900">Awaiting Citizen Check</div>
                </div>
                <div className="rounded-xl bg-emerald-50 px-3 py-2">
                  <div className="font-mono-num text-lg font-extrabold text-[#15803D]">
                    {complaints.filter((c) => c.status === 'CONFIRMED RESOLVED').length}
                  </div>
                  <div className="text-[11px] font-semibold text-emerald-900">Confirmed Green</div>
                </div>
                <div className="rounded-xl bg-blue-50 px-3 py-2">
                  <div className="font-mono-num text-lg font-extrabold text-[#0F2942]">
                    {complaints.reduce((sum, c) => sum + c.upvoteCount, 0) +
                      communityComments.length}
                  </div>
                  <div className="text-[11px] font-semibold text-slate-700">
                    Likes &amp; Comments
                  </div>
                </div>
              </div>

              {liveActivityItems.length > 0 && (
                <div className="mt-3 border-t border-slate-100 pt-2.5 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    <Activity className="h-3.5 w-3.5 text-[#E67E22]" />
                    <span>Live Community Activity</span>
                  </div>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {liveActivityItems.map((act) => (
                      <button
                        key={act.id}
                        type="button"
                        onClick={() => jumpToComplaint(act.complaintId, 'home')}
                        className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left text-xs hover:border-[#0F2942] hover:bg-white"
                      >
                        <span className="truncate text-slate-700">
                          <strong className="text-[#0F2942]">{act.actor}</strong> {act.summary}
                        </span>
                        <span className="shrink-0 rounded bg-white border border-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-[#0F2942]">
                          {act.badge}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* Locality Social Feed Filters & Search */}
            <section className="space-y-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display text-lg font-bold text-[#0F2942]">
                    {t.nearbyIssues} ({visibleComplaints.length})
                  </h2>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setViewMode(viewMode === 'list' ? 'map' : 'list')}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-[#0F2942] hover:bg-slate-50"
                    >
                      <MapIcon className="h-4 w-4 text-[#E67E22]" />
                      <span>{viewMode === 'list' ? 'Map view' : 'Feed view'}</span>
                    </button>

                    {viewMode === 'map' && (
                      <button
                        type="button"
                        onClick={() => setShowHeatmap(!showHeatmap)}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                          showHeatmap
                            ? 'border-[#E67E22] bg-amber-50 text-[#0F2942]'
                            : 'border-slate-300 bg-white text-slate-700'
                        }`}
                      >
                        <Flame className="h-4 w-4 text-[#E67E22]" />
                        <span>Heatmap</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Search Locality / Keyword + Area + Category */}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search locality, road, or issue..."
                      className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-xs font-medium text-[#0F2942]"
                    />
                  </div>

                  <select
                    aria-label="Filter feed by category"
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-[#0F2942]"
                  >
                    <option value="ALL">All Categories</option>
                    {COMPLAINT_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>

                  <select
                    aria-label="Filter feed by constituency"
                    value={selectedConstituencyId}
                    onChange={(e) => setSelectedConstituencyId(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-[#0F2942]"
                  >
                    <option value="ALL">All Karnataka / Bengaluru Areas</option>
                    {effectiveConstituencies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Feed Sort Tabs */}
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setFeedSort('latest')}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${
                      feedSort === 'latest'
                        ? 'border-[#0F2942] bg-[#0F2942] text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Latest Updates
                  </button>
                  <button
                    type="button"
                    onClick={() => setFeedSort('trending')}
                    className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-bold ${
                      feedSort === 'trending'
                        ? 'border-[#0F2942] bg-[#0F2942] text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <TrendingUp className="h-3.5 w-3.5" />
                    <span>Most Liked</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (userCoords) {
                        setFeedSort('near_me');
                      } else {
                        handleLocateForFeed();
                      }
                    }}
                    disabled={locatingUser}
                    className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-bold ${
                      feedSort === 'near_me'
                        ? 'border-[#0F2942] bg-[#0F2942] text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Navigation className="h-3.5 w-3.5" />
                    <span>{locatingUser ? 'Locating...' : 'Near Me'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFeedSort('awaiting_fix')}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${
                      feedSort === 'awaiting_fix'
                        ? 'border-[#E67E22] bg-[#E67E22] text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Awaiting Check
                  </button>
                  <button
                    type="button"
                    onClick={() => setFeedSort('resolved')}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${
                      feedSort === 'resolved'
                        ? 'border-[#15803D] bg-[#15803D] text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Confirmed Green
                  </button>
                </div>
              </div>

              {viewMode === 'map' && (
                <BengaluruMap
                  mode="feed"
                  complaints={visibleComplaints}
                  constituencies={effectiveConstituencies}
                  showHeatmap={showHeatmap}
                  heightClass="h-80"
                />
              )}

              {visibleComplaints.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center space-y-2">
                  <p className="text-sm font-semibold text-slate-700">
                    No matching civic posts yet.
                  </p>
                  <p className="text-xs text-slate-500">
                    Clear your filter or report an issue anywhere in Karnataka — every report routes automatically to the area civic office.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {visibleComplaints.map((c) => {
                    const badge = STATUS_COLORS[c.status] || STATUS_COLORS.Reported;
                    const alreadyUpvoted = Boolean(
                      firebaseUser && (c.upvoterUids || []).includes(firebaseUser.uid)
                    );
                    const isMyReport = Boolean(
                      firebaseUser?.emailVerified &&
                        !c.isAnonymous &&
                        c.reporterUid === firebaseUser.uid
                    );
                    const canNeighbourConfirm =
                      firebaseUser?.emailVerified &&
                      c.status === 'Fixed, awaiting confirmation' &&
                      c.reporterUid !== firebaseUser.uid &&
                      (c.isAnonymous ||
                        (c.fixedAt &&
                          Date.now() - new Date(c.fixedAt).getTime() >= 7 * 86_400_000));
                    const isExpanded = Boolean(expandedPostIds[c.id]);
                    const authorName = c.isAnonymous
                      ? 'Anonymous Citizen'
                      : c.reporterDisplayName || 'Citizen';
                    const authorInitial = c.isAnonymous ? '?' : authorName.charAt(0).toUpperCase();
                    const distanceMeters = userCoords
                      ? Math.round(
                          haversineMeters(
                            userCoords.lat,
                            userCoords.lng,
                            c.latitude,
                            c.longitude
                          )
                        )
                      : null;

                    const demand = getCommunityDemandInfo(c);
                    const postComments = commentsByComplaintId.get(c.id) || [];
                    const isFocused = focusedComplaintId === c.id;
                    const alreadyPostedFixCheck = Boolean(
                      firebaseUser &&
                        postComments.some(
                          (cm) => cm.authorUid === firebaseUser.uid && cm.kind === 'fix_check'
                        )
                    );

                    return (
                      <article
                        id={`complaint-card-${c.id}`}
                        key={c.id}
                        className={`rounded-2xl bg-white p-4 shadow-sm space-y-3 transition ${
                          isFocused
                            ? 'ring-2 ring-[#E67E22] border-2 border-[#E67E22]'
                            : demand.tier === 'serious'
                              ? 'border-2 border-red-400 bg-red-50/15'
                              : demand.tier === 'elevated'
                                ? 'border border-amber-300'
                                : 'border border-slate-200'
                        }`}
                      >
                        {/* Social Post Header */}
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0F2942] font-display text-sm font-extrabold text-white">
                              {authorInitial}
                            </div>
                            <div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                {!c.isAnonymous && c.reporterUid ? (
                                  <button
                                    type="button"
                                    onClick={() => openContributorProfile(c.reporterUid)}
                                    className="text-sm font-bold text-[#0F2942] hover:text-[#E67E22] hover:underline"
                                    title="View citizen contributions in Rankings"
                                  >
                                    {authorName}
                                  </button>
                                ) : (
                                  <span className="text-sm font-bold text-[#0F2942]">
                                    {authorName}
                                  </span>
                                )}
                                {c.isDemo && (
                                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                                    DEMO
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                                <span className="inline-flex items-center gap-1">
                                  <MapPin className="h-3 w-3 text-[#E67E22]" />
                                  {c.localityName}
                                </span>
                                {distanceMeters !== null && (
                                  <span className="font-semibold text-[#0F2942]">
                                    ·{' '}
                                    {distanceMeters >= 1000
                                      ? `${(distanceMeters / 1000).toFixed(1)} km away`
                                      : `${distanceMeters} m away`}
                                  </span>
                                )}
                                <span>· {new Date(c.updatedAt).toLocaleDateString()}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            {demand.tier === 'serious' && (
                              <span className="inline-flex items-center gap-1 rounded border border-red-300 bg-red-100 px-2 py-0.5 text-[11px] font-extrabold text-red-900">
                                <Flame className="h-3 w-3 text-red-600" />
                                {demand.label}
                              </span>
                            )}
                            {demand.tier === 'elevated' && (
                              <span className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-950">
                                {demand.label}
                              </span>
                            )}
                            <span
                              className={`inline-block rounded border px-2 py-0.5 text-xs font-bold ${badge.bg} ${badge.text} ${badge.border}`}
                            >
                              {badge.label}
                              {c.confirmedByLabel === 'confirmed by neighbours'
                                ? ' · by neighbours'
                                : ''}
                            </span>
                            <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono-num text-[11px] font-bold text-[#0F2942]">
                              Priority {c.priorityScore}/100
                            </span>
                          </div>
                        </div>

                        {/* Title & Description */}
                        <div>
                          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span className="font-semibold text-[#0F2942]">{c.category}</span>
                            <span>·</span>
                            <button
                              type="button"
                              onClick={() => setTransparencyConstId(c.constituencyId)}
                              className="font-semibold text-[#0F2942] underline hover:text-[#E67E22]"
                            >
                              {c.constituencyName} ({c.assignedMlaName})
                            </button>
                          </div>
                          <h3 className="font-display text-base font-bold text-[#0F2942]">
                            {c.title}
                          </h3>
                          <p className="mt-1 text-sm text-slate-700">{c.description}</p>
                        </div>

                        {/* Before & After Photos right on the Social Feed */}
                        {(c.photoDataUrl || c.afterPhotoDataUrl) && (
                          <div
                            className={`grid gap-2.5 ${
                              c.photoDataUrl && c.afterPhotoDataUrl
                                ? 'grid-cols-1 sm:grid-cols-2'
                                : 'grid-cols-1'
                            }`}
                          >
                            {c.photoDataUrl && (
                              <div>
                                {c.afterPhotoDataUrl && (
                                  <div className="mb-1 text-[10px] font-bold uppercase text-slate-500">
                                    Before (Citizen Report)
                                  </div>
                                )}
                                <img
                                  src={c.photoDataUrl}
                                  alt={c.title}
                                  className="max-h-60 w-full rounded-xl object-cover border border-slate-200"
                                />
                              </div>
                            )}
                            {c.afterPhotoDataUrl && (
                              <div>
                                <div className="mb-1 text-[10px] font-bold uppercase text-[#15803D]">
                                  After Repair (Official Photo)
                                </div>
                                <img
                                  src={c.afterPhotoDataUrl}
                                  alt={`${c.title} after repair`}
                                  className="max-h-60 w-full rounded-xl object-cover border-2 border-emerald-300"
                                />
                              </div>
                            )}
                          </div>
                        )}

                        {/* Live Official Routing Connection Strip */}
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                          <div className="flex flex-wrap items-center gap-2">
                            <Building2 className="h-3.5 w-3.5 text-[#0F2942]" />
                            <span>
                              Office status:{' '}
                              <strong className="text-[#0F2942]">{c.ownerLabel}</strong>
                            </span>
                            {c.forwardedAgencyName && (
                              <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[11px] font-semibold text-blue-900">
                                Agency: {c.forwardedAgencyName}
                              </span>
                            )}
                            {c.escalatedToCm && (
                              <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[11px] font-semibold text-purple-900">
                                CM Office Escalated
                              </span>
                            )}
                          </div>
                        </div>

                        {/* AI Suggestion Card (Community impact from Likes + Repair verification + Draft) */}
                        {(c.aiCommunityBrief ||
                          c.aiFixAssessment ||
                          c.aiDraftReply ||
                          c.aiBackgroundStatus === 'pending' ||
                          aiBriefBusyId === c.id) && (
                          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 font-bold text-amber-950">
                                <Sparkles className="h-3.5 w-3.5 text-[#E67E22]" />
                                <span>AI suggestion</span>
                                {(c.aiBackgroundStatus === 'pending' ||
                                  aiBriefBusyId === c.id) && (
                                  <span className="text-[10px] font-normal text-amber-800">
                                    (updating from community support...)
                                  </span>
                                )}
                              </div>
                            </div>
                            {c.aiCommunityBrief && (
                              <div className="text-slate-800">
                                <strong>Community impact:</strong> {c.aiCommunityBrief}
                              </div>
                            )}
                            {c.aiFixAssessment && (
                              <div className="text-slate-800">
                                <strong>Repair check ({c.aiFixAssessment.verdict}):</strong>{' '}
                                {c.aiFixAssessment.summary}
                              </div>
                            )}
                            {c.aiDraftReply && (
                              <div className="text-slate-700">
                                <strong>Office note:</strong> {c.aiDraftReply}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Inline Fix Verification & Points Banner directly from Feed */}
                        {c.status === 'Fixed, awaiting confirmation' &&
                          (isMyReport || canNeighbourConfirm || firebaseUser?.emailVerified) && (
                            <div className="rounded-xl border-2 border-[#15803D] bg-emerald-50 p-3 space-y-2">
                              <div className="text-xs font-bold text-[#0F2942]">
                                {isMyReport
                                  ? `Office marked your issue fixed! Verify the photo and confirm resolved to turn it Green & earn +${pointsConfig.confirmedResolved} pts:`
                                  : canNeighbourConfirm
                                    ? `Office marked this fixed — confirm as a verified neighbour to turn it Green & earn +${pointsConfig.confirmedResolved} pts:`
                                    : `Office uploaded a repair update! Inspect the before/after photos and verify if the repair looks genuine (+${pointsConfig.confirmedResolved} pts):`}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {isMyReport && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => void handleCitizenConfirmGreen(c, false)}
                                      className="inline-flex items-center gap-1 rounded-lg bg-[#15803D] px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800"
                                    >
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                      <span>
                                        Verify Photo &amp; Confirm Resolved (+
                                        {pointsConfig.confirmedResolved} pts)
                                      </span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void handleDisputeReopen(c)}
                                      className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-bold text-red-800"
                                    >
                                      Not fixed — Reopen
                                    </button>
                                  </>
                                )}
                                {!isMyReport && canNeighbourConfirm && (
                                  <button
                                    type="button"
                                    onClick={() => void handleCitizenConfirmGreen(c, true)}
                                    className="inline-flex items-center gap-1 rounded-lg bg-[#15803D] px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800"
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    <span>
                                      Confirm Resolved by Neighbours (+
                                      {pointsConfig.confirmedResolved} pts)
                                    </span>
                                  </button>
                                )}
                                {!isMyReport &&
                                  !canNeighbourConfirm &&
                                  firebaseUser?.emailVerified &&
                                  (alreadyPostedFixCheck ? (
                                    <span className="inline-flex items-center gap-1 rounded-lg bg-white border border-emerald-300 px-3 py-1.5 text-xs font-bold text-[#15803D]">
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                      <span>Repair Photo Verified (+{pointsConfig.confirmedResolved} pts credited)</span>
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={commentBusyId === c.id}
                                      onClick={() =>
                                        void handlePostComment(
                                          c,
                                          'fix_check',
                                          'Verified the repair photo — issue looks resolved on the ground!'
                                        )
                                      }
                                      className="inline-flex items-center gap-1 rounded-lg bg-[#0F2942] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#173A5E]"
                                    >
                                      <ShieldCheck className="h-3.5 w-3.5 text-[#E67E22]" />
                                      <span>
                                        Verify Repair Photo Looks Fixed (+
                                        {pointsConfig.confirmedResolved} pts)
                                      </span>
                                    </button>
                                  ))}
                              </div>
                            </div>
                          )}

                        {/* Social Engagement Footer */}
                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void handleUpvoteComplaint(c)}
                              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
                                alreadyUpvoted
                                  ? 'border-[#0F2942] bg-[#0F2942] text-white'
                                  : 'border-slate-300 bg-white text-[#0F2942] hover:border-[#E67E22] hover:bg-amber-50'
                              }`}
                            >
                              <Heart
                                className={`h-3.5 w-3.5 ${
                                  alreadyUpvoted ? 'fill-[#E67E22] text-[#E67E22]' : 'text-[#E67E22]'
                                }`}
                              />
                              <span>
                                {alreadyUpvoted ? 'Liked' : 'Like'} · {t.thisAffectsMe} (
                                {c.upvoteCount})
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                setExpandedPostIds((prev) => ({
                                  ...prev,
                                  [c.id]: !prev[c.id],
                                }))
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-[#0F2942] hover:bg-slate-50"
                            >
                              <MessageSquare className="h-3.5 w-3.5 text-slate-500" />
                              <span>
                                Comments ({postComments.length}) · Log ({(c.timeline || []).length})
                              </span>
                              {isExpanded ? (
                                <ChevronUp className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5" />
                              )}
                            </button>

                            {(alreadyUpvoted || isMyReport) && (
                              <button
                                type="button"
                                disabled={aiBriefBusyId === c.id}
                                onClick={() =>
                                  void triggerCommunityAiBrief(c, c.upvoteCount, c.priorityScore)
                                }
                                className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-50"
                              >
                                <Sparkles className="h-3.5 w-3.5 text-[#E67E22]" />
                                <span>
                                  {aiBriefBusyId === c.id ? 'Updating...' : 'AI Brief'}
                                </span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Expandable Social Comments + Official Timeline Drawer */}
                        {isExpanded && (
                          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
                            {/* Citizen Social Comments & Ground Updates */}
                            <div className="space-y-2">
                              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                                Community Comments &amp; Ground Updates ({postComments.length})
                              </div>

                              <form
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  void handlePostComment(c);
                                }}
                                className="flex flex-wrap gap-2"
                              >
                                <select
                                  aria-label="Comment type"
                                  value={commentKinds[c.id] || 'comment'}
                                  onChange={(e) =>
                                    setCommentKinds((prev) => ({
                                      ...prev,
                                      [c.id]: e.target.value as CommunityComment['kind'],
                                    }))
                                  }
                                  className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-[#0F2942]"
                                >
                                  <option value="comment">Comment</option>
                                  <option value="ground_update">Ground Update</option>
                                </select>
                                <input
                                  type="text"
                                  value={commentDrafts[c.id] || ''}
                                  onChange={(e) =>
                                    setCommentDrafts((prev) => ({
                                      ...prev,
                                      [c.id]: e.target.value,
                                    }))
                                  }
                                  placeholder="Share a ground update or comment with neighbours..."
                                  className="min-w-[180px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
                                />
                                <button
                                  type="submit"
                                  disabled={commentBusyId === c.id}
                                  className="inline-flex items-center gap-1 rounded-lg bg-[#0F2942] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#173A5E] disabled:opacity-50"
                                >
                                  <Send className="h-3 w-3" />
                                  <span>Post</span>
                                </button>
                              </form>

                              {postComments.length === 0 ? (
                                <div className="text-xs text-slate-500">
                                  No citizen comments yet — be the first neighbour to comment or
                                  share a ground update!
                                </div>
                              ) : (
                                <div className="space-y-1.5">
                                  {postComments.map((cm) => (
                                    <div
                                      key={cm.id}
                                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                                    >
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex items-center gap-1.5">
                                          <button
                                            type="button"
                                            onClick={() => openContributorProfile(cm.authorUid)}
                                            className="font-bold text-[#0F2942] hover:text-[#E67E22] hover:underline"
                                          >
                                            {cm.authorDisplayName}
                                          </button>
                                          {cm.kind === 'fix_check' && (
                                            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-[#15803D]">
                                              Verified Fix Photo
                                            </span>
                                          )}
                                          {cm.kind === 'ground_update' && (
                                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                                              Ground Update
                                            </span>
                                          )}
                                        </div>
                                        <span className="font-mono-num text-[10px] text-slate-400">
                                          {new Date(cm.createdAt).toLocaleString()}
                                        </span>
                                      </div>
                                      <p className="mt-1 text-slate-700">{cm.text}</p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Official Portal Activity Log */}
                            <div className="border-t border-slate-200 pt-2 space-y-1.5">
                              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                                Live Portal Activity Log (Citizen &amp; Official Actions)
                              </div>
                              {(c.timeline || []).length === 0 ? (
                                <div className="text-xs text-slate-500">
                                  Report received — awaiting office acknowledgement.
                                </div>
                              ) : (
                                (c.timeline || []).map((ev, idx) => (
                                  <div
                                    key={idx}
                                    className="flex flex-wrap items-baseline justify-between gap-1 border-b border-slate-200/70 pb-1 last:border-0 last:pb-0 text-xs"
                                  >
                                    <div>
                                      <span className="font-bold text-[#0F2942]">{ev.status}</span>
                                      {' — '}
                                      <span className="text-slate-700">{ev.note}</span>{' '}
                                      <span className="text-slate-500">({ev.actorLabel})</span>
                                    </div>
                                    <span className="font-mono-num text-[10px] text-slate-400">
                                      {new Date(ev.timestamp).toLocaleString()}
                                    </span>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}

        {/* MY REPORTS TAB */}
        {activeTab === 'my_reports' && (
          <section className="space-y-4">
            <h1 className="font-display text-xl font-extrabold text-[#0F2942]">
              {t.tabs.myReports}
            </h1>

            {!firebaseUser ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center space-y-3">
                <p className="text-sm text-slate-700">
                  Sign in to see your submitted reports, timelines, and fix confirmations.
                </p>
                <button
                  type="button"
                  onClick={() => setAuthModalOpen(true)}
                  className="rounded-xl bg-[#0F2942] px-5 py-2.5 text-sm font-bold text-white"
                >
                  Sign in
                </button>
              </div>
            ) : myComplaints.length === 0 && myConcerns.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
                You have not submitted any reports yet.
              </div>
            ) : (
              <div className="space-y-4">
                {myComplaints.map((c) => {
                  const badge = STATUS_COLORS[c.status] || STATUS_COLORS.Reported;
                  const canConfirmOrDispute =
                    c.status === 'Fixed, awaiting confirmation' && !c.isAnonymous;

                  return (
                    <div
                      id={`my-complaint-card-${c.id}`}
                      key={c.id}
                      className={`rounded-2xl bg-white p-4 shadow-sm space-y-3 ${
                        focusedComplaintId === c.id
                          ? 'ring-2 ring-[#E67E22] border-2 border-[#E67E22]'
                          : 'border border-slate-200'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span
                          className={`rounded border px-2.5 py-1 text-xs font-bold ${badge.bg} ${badge.text} ${badge.border}`}
                        >
                          {badge.label}
                        </span>
                        <span className="font-mono-num text-xs text-slate-500">
                          {new Date(c.updatedAt).toLocaleString()}
                        </span>
                      </div>
                      <h2 className="font-display text-base font-bold text-[#0F2942]">
                        {c.title}
                      </h2>
                      <div className="text-xs text-slate-600">
                        Assigned to: <strong>{c.ownerLabel}</strong>
                      </div>

                      {(c.photoDataUrl || c.afterPhotoDataUrl) && (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {c.photoDataUrl && (
                            <div>
                              <div className="mb-1 text-[11px] font-bold uppercase text-slate-500">
                                Your Before Photo
                              </div>
                              <img
                                src={c.photoDataUrl}
                                alt="Original report"
                                className="max-h-40 w-full rounded-lg object-cover border border-slate-200"
                              />
                            </div>
                          )}
                          {c.afterPhotoDataUrl && (
                            <div>
                              <div className="mb-1 text-[11px] font-bold uppercase text-emerald-700">
                                Official After-Repair Photo
                              </div>
                              <img
                                src={c.afterPhotoDataUrl}
                                alt="After repair proof"
                                className="max-h-40 w-full rounded-lg object-cover border border-emerald-300"
                              />
                            </div>
                          )}
                        </div>
                      )}

                      {(c.aiCommunityBrief ||
                        c.aiFixAssessment ||
                        c.aiDraftReply ||
                        c.aiBackgroundStatus === 'pending') && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs space-y-1">
                          <div className="flex items-center gap-1.5 font-bold text-amber-950">
                            <Sparkles className="h-3.5 w-3.5 text-[#E67E22]" />
                            <span>AI suggestion</span>
                            {c.aiBackgroundStatus === 'pending' && (
                              <span className="ml-1 text-[10px] font-normal text-amber-800">
                                (checking in background...)
                              </span>
                            )}
                          </div>
                          {c.aiCommunityBrief && (
                            <div className="text-slate-800">
                              <strong>Community impact:</strong> {c.aiCommunityBrief}
                            </div>
                          )}
                          {c.aiFixAssessment && (
                            <div className="text-slate-800">
                              <strong>Repair verification ({c.aiFixAssessment.verdict}):</strong>{' '}
                              {c.aiFixAssessment.summary}
                            </div>
                          )}
                          {c.aiDraftReply && (
                            <div className="text-slate-700">{c.aiDraftReply}</div>
                          )}
                        </div>
                      )}

                      {canConfirmOrDispute && (
                        <div className="rounded-xl border-2 border-[#15803D] bg-emerald-50 p-3.5 space-y-2.5">
                          <div className="text-sm font-bold text-[#0F2942]">
                            Official marked this fixed. Is the issue actually fixed on the ground?
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void handleCitizenConfirmGreen(c, false)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-[#15803D] px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              <span>Yes, Confirm Resolved</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDisputeReopen(c)}
                              className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-bold text-red-800 hover:bg-red-50"
                            >
                              Not fixed — Reopen
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="border-t border-slate-100 pt-2 space-y-1.5">
                        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                          Timeline
                        </div>
                        {(c.timeline || []).map((ev, idx) => (
                          <div key={idx} className="text-xs text-slate-700">
                            <span className="font-semibold">{ev.status}</span> — {ev.note} (
                            {ev.actorLabel})
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {myConcerns.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <h2 className="font-display text-sm font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                      <Lock className="h-4 w-4" />
                      Private Serious Concerns (never public)
                    </h2>
                    {myConcerns.map((sc) => (
                      <div
                        id={`my-concern-card-${sc.id}`}
                        key={sc.id}
                        className={`rounded-2xl bg-white p-4 space-y-1.5 ${
                          focusedConcernId === sc.id
                            ? 'ring-2 ring-[#E67E22] border-2 border-[#E67E22]'
                            : 'border border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="rounded bg-slate-100 px-2 py-0.5 font-bold text-[#0F2942]">
                            {sc.status}
                          </span>
                          <span className="text-slate-500">
                            {sc.directToCm ? 'CM Office' : sc.targetMlaName}
                          </span>
                        </div>
                        <div className="font-bold text-sm text-[#0F2942]">{sc.title}</div>
                        <p className="text-xs text-slate-600">{sc.description}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* BENEFITS & WELFARE TAB (Unlocks at 50+ Points) */}
        {activeTab === 'benefits' && (() => {
          const thresholdPct = Math.min(
            100,
            Math.round((myAvailablePoints / WELFARE_MIN_CLAIM_POINTS) * 100)
          );
          const canUnlockWelfare = myAvailablePoints >= WELFARE_MIN_CLAIM_POINTS;
          const pointsRemainingTo50 = Math.max(0, WELFARE_MIN_CLAIM_POINTS - myAvailablePoints);
          const filteredBenefits = WELFARE_BENEFITS.filter((b) => {
            if (benefitFilter === 'starter50') return b.pointsRequired === WELFARE_MIN_CLAIM_POINTS;
            if (benefitFilter === 'unlocked') return myAvailablePoints >= b.pointsRequired;
            return true;
          });

          return (
            <section className="space-y-4">
              {/* Welfare Wallet & 50-Point Unlock Progress */}
              <div
                className={`rounded-2xl border-2 bg-white p-5 shadow-sm space-y-4 ${
                  canUnlockWelfare ? 'border-[#15803D]' : 'border-slate-200'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-[#E67E22]">
                      <HeartHandshake className="h-4 w-4" />
                      <span>Namma Dhwani Civic Welfare &amp; Benefits</span>
                    </div>
                    <h1 className="font-display text-xl font-extrabold text-[#0F2942]">
                      Redeem Civic Points for Welfare Benefits
                    </h1>
                    <p className="text-xs text-slate-600 max-w-2xl">
                      Reach <strong>{WELFARE_MIN_CLAIM_POINTS} civic points</strong> by submitting
                      verified reports and confirming repaired issues to unlock transit passes,
                      utility rebates, nutrition packs, health checks, and Sakala fast-track passes.
                    </p>
                  </div>

                  {!firebaseUser ? (
                    <button
                      type="button"
                      onClick={() => setAuthModalOpen(true)}
                      className="shrink-0 whitespace-nowrap rounded-xl bg-[#0F2942] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#173A5E]"
                    >
                      Sign in to Claim Benefits
                    </button>
                  ) : (
                    <div
                      className={`shrink-0 rounded-xl border px-3.5 py-2 text-xs font-extrabold ${
                        canUnlockWelfare
                          ? 'border-emerald-300 bg-emerald-50 text-[#15803D]'
                          : 'border-amber-300 bg-amber-50 text-amber-900'
                      }`}
                    >
                      {canUnlockWelfare
                        ? '50+ Points Unlocked · Ready to Claim'
                        : `${pointsRemainingTo50} pts left to reach 50-pt unlock`}
                    </div>
                  )}
                </div>

                {/* Points Summary Strip */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 border-t border-slate-100 pt-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <div className="text-[11px] font-bold uppercase text-slate-500">
                      Available to Claim
                    </div>
                    <div className="font-mono-num text-xl font-extrabold text-[#15803D]">
                      {myAvailablePoints} pts
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <div className="text-[11px] font-bold uppercase text-slate-500">
                      Lifetime Earned
                    </div>
                    <div className="font-mono-num text-xl font-extrabold text-[#0F2942]">
                      {myEarnedPoints} pts
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <div className="text-[11px] font-bold uppercase text-slate-500">
                      Points Redeemed
                    </div>
                    <div className="font-mono-num text-xl font-extrabold text-slate-700">
                      {mySpentPoints} pts
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <div className="text-[11px] font-bold uppercase text-slate-500">
                      Claimed Vouchers
                    </div>
                    <div className="font-mono-num text-xl font-extrabold text-[#E67E22]">
                      {myBenefitClaims.length}
                    </div>
                  </div>
                </div>

                {/* 50-Point Progress Bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-[#0F2942]">
                      50-Point Benefit Unlock Progress
                    </span>
                    <span className="font-mono-num text-[#15803D]">
                      {Math.min(myAvailablePoints, WELFARE_MIN_CLAIM_POINTS)} /{' '}
                      {WELFARE_MIN_CLAIM_POINTS} pts ({thresholdPct}%)
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full transition-all ${
                        canUnlockWelfare ? 'bg-[#15803D]' : 'bg-[#E67E22]'
                      }`}
                      style={{ width: `${thresholdPct}%` }}
                    />
                  </div>
                  {firebaseUser && !canUnlockWelfare && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-slate-600">
                      <span>
                        Earn +{pointsConfig.verifiedReport} pts per report &amp; +
                        {pointsConfig.confirmedResolved} pts when you verify a fixed issue!
                      </span>
                      <button
                        type="button"
                        onClick={() => setReportModalOpen(true)}
                        className="rounded-lg bg-[#E67E22] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#cf6d17]"
                      >
                        Report Issue (+{pointsConfig.verifiedReport} pts)
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Filter Bar */}
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3">
                {(
                  [
                    { key: 'all', label: `All Benefits (${WELFARE_BENEFITS.length})` },
                    {
                      key: 'starter50',
                      label: `50-Pt Starter (${WELFARE_BENEFITS.filter((b) => b.pointsRequired === 50).length})`,
                    },
                    {
                      key: 'unlocked',
                      label: `Unlocked Now (${WELFARE_BENEFITS.filter((b) => myAvailablePoints >= b.pointsRequired).length})`,
                    },
                    { key: 'claimed', label: `My Claimed Vouchers (${myBenefitClaims.length})` },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setBenefitFilter(item.key)}
                    className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold ${
                      benefitFilter === item.key
                        ? 'bg-[#0F2942] text-white'
                        : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {/* Catalog Grid (when not strictly viewing claimed vouchers only) */}
              {benefitFilter !== 'claimed' && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {filteredBenefits.length === 0 ? (
                    <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-white p-8 text-center space-y-2">
                      <p className="text-sm font-bold text-[#0F2942]">
                        No welfare benefits unlocked at your current balance yet.
                      </p>
                      <p className="text-xs text-slate-600">
                        You need at least {WELFARE_MIN_CLAIM_POINTS} available civic points to
                        unlock your first welfare voucher.
                      </p>
                      <button
                        type="button"
                        onClick={() => setBenefitFilter('all')}
                        className="rounded-lg bg-[#0F2942] px-3.5 py-2 text-xs font-bold text-white"
                      >
                        Browse All Schemes
                      </button>
                    </div>
                  ) : (
                    filteredBenefits.map((benefit) => {
                      const isUnlocked =
                        Boolean(firebaseUser?.emailVerified) &&
                        myAvailablePoints >= benefit.pointsRequired;
                      const shortfall = Math.max(0, benefit.pointsRequired - myAvailablePoints);
                      const isConfirming = claimingBenefitId === benefit.id;
                      const isBusy = claimBusyId === benefit.id;

                      return (
                        <div
                          key={benefit.id}
                          className={`flex flex-col justify-between rounded-2xl border bg-white p-4 shadow-sm space-y-3 ${
                            isUnlocked ? 'border-emerald-300' : 'border-slate-200'
                          }`}
                        >
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-bold text-[#0F2942]">
                                {benefit.category}
                              </span>
                              <span
                                className={`font-mono-num rounded px-2.5 py-0.5 text-xs font-extrabold ${
                                  isUnlocked
                                    ? 'bg-emerald-100 text-[#15803D] border border-emerald-300'
                                    : 'bg-amber-50 text-amber-900 border border-amber-200'
                                }`}
                              >
                                {benefit.pointsRequired} pts required
                              </span>
                            </div>

                            <div>
                              <h2 className="font-display text-base font-extrabold text-[#0F2942]">
                                {benefit.title}
                              </h2>
                              <div className="text-[11px] font-semibold text-slate-500">
                                {benefit.department}
                              </div>
                            </div>

                            <div className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-bold text-[#15803D]">
                              <Gift className="h-3.5 w-3.5" />
                              <span>{benefit.rewardValueLabel}</span>
                            </div>

                            <p className="text-xs text-slate-700 leading-relaxed">
                              {benefit.description}
                            </p>
                            <div className="text-[11px] text-slate-500">
                              {benefit.eligibilityNote}
                            </div>
                          </div>

                          <div className="border-t border-slate-100 pt-3 space-y-2.5">
                            {isConfirming ? (
                              <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 space-y-2">
                                <label className="block text-[11px] font-bold text-[#0F2942]">
                                  {benefit.claimPromptLabel}
                                </label>
                                <input
                                  type="text"
                                  value={claimNoteInput}
                                  onChange={(e) => setClaimNoteInput(e.target.value)}
                                  placeholder={benefit.claimPromptPlaceholder}
                                  className="w-full rounded-lg border border-emerald-300 bg-white px-2.5 py-1.5 text-xs"
                                />
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => void handleClaimBenefit(benefit)}
                                    className="rounded-lg bg-[#15803D] px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
                                  >
                                    {isBusy
                                      ? 'Generating Voucher...'
                                      : `Confirm & Spend ${benefit.pointsRequired} pts`}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setClaimingBenefitId(null);
                                      setClaimNoteInput('');
                                    }}
                                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : !firebaseUser ? (
                              <button
                                type="button"
                                onClick={() => setAuthModalOpen(true)}
                                className="w-full rounded-xl border border-slate-300 bg-white py-2 text-xs font-bold text-[#0F2942] hover:bg-slate-50"
                              >
                                Sign in to Claim ({benefit.pointsRequired} pts)
                              </button>
                            ) : isUnlocked ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setClaimingBenefitId(benefit.id);
                                  setClaimNoteInput('');
                                }}
                                className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#15803D] py-2.5 text-xs font-extrabold text-white hover:bg-emerald-800"
                              >
                                <Ticket className="h-4 w-4" />
                                <span>Claim Benefit ({benefit.pointsRequired} pts)</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled
                                className="w-full rounded-xl border border-slate-200 bg-slate-100 py-2 text-xs font-bold text-slate-500 cursor-not-allowed"
                              >
                                Locked · Need {shortfall} more pts
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* My Claimed Welfare Vouchers */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Ticket className="h-5 w-5 text-[#E67E22]" />
                    <h2 className="font-display text-lg font-extrabold text-[#0F2942]">
                      My Claimed Welfare Vouchers ({myBenefitClaims.length})
                    </h2>
                  </div>
                  <span className="text-xs text-slate-500">
                    Present your voucher code at the civic desk or wait for Welfare Reviewer approval
                  </span>
                </div>

                {!firebaseUser ? (
                  <p className="text-xs text-slate-600">
                    Sign in to view and manage your redeemed welfare vouchers.
                  </p>
                ) : myBenefitClaims.length === 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-center text-xs text-slate-600">
                    You have not claimed any welfare vouchers yet. Reach 50 available points and
                    click <strong>Claim Benefit</strong> on any scheme above!
                  </div>
                ) : (
                  <div className="space-y-3">
                    {myBenefitClaims.map((cl) => (
                      <div
                        key={cl.id}
                        className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded border px-2 py-0.5 text-[11px] font-bold ${
                                cl.status === 'Approved & Issued'
                                  ? 'border-emerald-300 bg-emerald-100 text-[#15803D]'
                                  : cl.status === 'Redeemed'
                                    ? 'border-blue-300 bg-blue-100 text-blue-900'
                                    : 'border-amber-300 bg-amber-100 text-amber-900'
                              }`}
                            >
                              {cl.status}
                            </span>
                            <span className="font-mono-num text-xs font-bold text-[#0F2942]">
                              -{cl.pointsSpent} pts
                            </span>
                            <span className="text-xs font-bold text-[#15803D]">
                              {cl.rewardValueLabel}
                            </span>
                          </div>
                          <span className="font-mono-num text-[11px] text-slate-500">
                            {new Date(cl.claimedAt).toLocaleString()}
                          </span>
                        </div>

                        <div className="font-display text-sm font-extrabold text-[#0F2942]">
                          {cl.benefitTitle}
                        </div>
                        <div className="text-xs text-slate-600">{cl.department}</div>

                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                          <div className="text-xs">
                            <span className="text-slate-500">Voucher Code: </span>
                            <strong className="font-mono-num text-sm text-[#0F2942]">
                              {cl.voucherCode}
                            </strong>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              void navigator.clipboard.writeText(cl.voucherCode);
                              setCopiedVoucherId(cl.id);
                              setTimeout(() => setCopiedVoucherId(null), 2000);
                            }}
                            className="inline-flex items-center gap-1 rounded border border-slate-300 px-2.5 py-1 text-[11px] font-bold text-[#0F2942] hover:bg-slate-50"
                          >
                            {copiedVoucherId === cl.id ? (
                              <>
                                <Check className="h-3 w-3 text-[#15803D]" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" />
                                <span>Copy Code</span>
                              </>
                            )}
                          </button>
                        </div>

                        {cl.householdNote && (
                          <div className="text-xs text-slate-600">
                            <strong>Your note:</strong> {cl.householdNote}
                          </div>
                        )}
                        {cl.officialNote && (
                          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-950">
                            <strong>Welfare Desk Update:</strong> {cl.officialNote}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          );
        })()}

        {/* RANKINGS TAB (Live Citizen Leaderboard & Progress Rings) */}
        {activeTab === 'rankings' && (
          <section className="space-y-4">
            {(() => {
              const myRow = firebaseUser
                ? leaderboardRows.find((r) => r.uid === firebaseUser.uid)
                : undefined;
              const myPoints = myRow?.points || 0;
              const currentLevelIdx = CITIZEN_LEVELS.reduce(
                (acc, lvl, idx) => (myPoints >= lvl.minPoints ? idx : acc),
                0
              );
              const currentLevel = CITIZEN_LEVELS[currentLevelIdx];
              const nextLevel = CITIZEN_LEVELS[currentLevelIdx + 1];
              const ringPct = nextLevel
                ? Math.min(
                    100,
                    Math.round(
                      ((myPoints - currentLevel.minPoints) /
                        Math.max(1, nextLevel.minPoints - currentLevel.minPoints)) *
                        100
                    )
                  )
                : 100;
              const ringRadius = 36;
              const ringCirc = 2 * Math.PI * ringRadius;
              const ringOffset = ringCirc - (ringPct / 100) * ringCirc;
              const myAnonCount = myComplaints.filter((c) => c.isAnonymous).length;

              return (
                <>
                  {/* Personal Progress Ring & Badges */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="relative flex h-24 w-24 items-center justify-center">
                          <svg className="h-24 w-24 -rotate-90" viewBox="0 0 88 88">
                            <circle
                              cx="44"
                              cy="44"
                              r={ringRadius}
                              fill="none"
                              stroke="#E2E8F0"
                              strokeWidth="8"
                            />
                            <circle
                              cx="44"
                              cy="44"
                              r={ringRadius}
                              fill="none"
                              stroke="#15803D"
                              strokeWidth="8"
                              strokeLinecap="round"
                              strokeDasharray={ringCirc}
                              strokeDashoffset={ringOffset}
                            />
                          </svg>
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="font-mono-num text-lg font-extrabold text-[#0F2942]">
                              {myPoints}
                            </span>
                            <span className="text-[10px] font-semibold text-slate-500">PTS</span>
                          </div>
                        </div>

                        <div>
                          <div className="text-xs font-bold uppercase tracking-wide text-[#E67E22]">
                            {firebaseUser ? 'Your Civic Level' : 'Citizen Impact'}
                          </div>
                          <h1 className="font-display text-xl font-extrabold text-[#0F2942]">
                            {currentLevel.name}
                          </h1>
                          <p className="text-xs text-slate-600 mt-0.5">
                            {nextLevel
                              ? `${nextLevel.minPoints - myPoints} points to reach ${nextLevel.name}`
                              : 'Highest citizen impact tier reached!'}
                          </p>
                          {firebaseUser && myRow && (
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {myRow.badges.map((b) => (
                                <span
                                  key={b}
                                  className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-[#15803D]"
                                >
                                  <Award className="h-3 w-3" />
                                  {b}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs space-y-1">
                        <div className="font-bold text-[#0F2942]">How Points Work</div>
                        <div>
                          Verified Report: <strong>+{pointsConfig.verifiedReport} pts</strong>
                        </div>
                        <div>
                          Confirmed Green / Fix Verify:{' '}
                          <strong>+{pointsConfig.confirmedResolved} pts</strong>
                        </div>
                        <div className="text-slate-600">
                          Upvotes (&ldquo;This affects me&rdquo;): <strong>0 pts</strong> (boosts
                          admin urgency!)
                        </div>
                      </div>
                    </div>

                    {firebaseUser && (
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-2.5 text-xs">
                        <div>
                          <strong className="text-[#0F2942]">
                            Available to Claim: {myAvailablePoints} pts
                          </strong>{' '}
                          <span className="text-slate-600">
                            (Redeemed: {mySpentPoints} pts · Lifetime: {myPoints} pts)
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveTab('benefits')}
                          className="rounded-lg bg-[#15803D] px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800"
                        >
                          {myAvailablePoints >= WELFARE_MIN_CLAIM_POINTS
                            ? 'Claim Welfare Benefits (50+ Unlocked)'
                            : `${WELFARE_MIN_CLAIM_POINTS - myAvailablePoints} pts to Unlock Benefits`}
                        </button>
                      </div>
                    )}

                    {firebaseUser && myAnonCount > 0 && (
                      <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600">
                        You also filed {myAnonCount} anonymous report(s) — hidden from public
                        rankings to protect your identity.
                      </div>
                    )}
                  </div>

                  {/* Public Non-Anonymous Citizen Leaderboard & Neighbour Contributions */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-[#0F2942]">
                        <Trophy className="h-5 w-5 text-[#E67E22]" />
                        <h2 className="font-display text-lg font-extrabold">
                          All Civic Contributors &amp; Neighbours
                        </h2>
                      </div>
                      <span className="text-xs font-semibold text-slate-500">
                        {leaderboardRows.length} contributing citizens
                      </span>
                    </div>

                    <p className="text-xs text-slate-600">
                      Every verified citizen and neighbour contributing to the city &amp;
                      environment appears here — inspect their reports, supports, repair photo
                      verifications, and community comments.
                    </p>

                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        value={contributorSearch}
                        onChange={(e) => setContributorSearch(e.target.value)}
                        placeholder="Find any citizen contributor by name or level..."
                        className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-xs font-medium text-[#0F2942]"
                      />
                    </div>

                    {(() => {
                      const cq = contributorSearch.trim().toLowerCase();
                      const filteredRows = cq
                        ? leaderboardRows.filter(
                            (r) =>
                              r.displayName.toLowerCase().includes(cq) ||
                              r.levelName.toLowerCase().includes(cq) ||
                              r.badges.some((b) => b.toLowerCase().includes(cq))
                          )
                        : leaderboardRows;

                      if (filteredRows.length === 0) {
                        return (
                          <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
                            {leaderboardRows.length === 0
                              ? "No public non-anonymous citizen contributions recorded yet. Submit a civic report, comment, or support a neighbour's issue to appear on the board!"
                              : 'No citizen contributors matched your search.'}
                          </div>
                        );
                      }

                      return (
                      <div className="space-y-2.5">
                        {filteredRows.map((row, idx) => {
                          const isMe = Boolean(firebaseUser && row.uid === firebaseUser.uid);
                          const isExpanded = expandedContributorUid === row.uid;
                          const theirReports = complaints.filter(
                            (c) => !c.isAnonymous && c.reporterUid === row.uid
                          );
                          const theirSupported = complaints.filter((c) =>
                            (c.upvoterUids || []).includes(row.uid)
                          );

                          return (
                            <div
                              id={`contributor-card-${row.uid}`}
                              key={row.uid}
                              className={`rounded-xl border p-3 space-y-2.5 ${
                                isMe
                                  ? 'border-[#0F2942] bg-blue-50/50'
                                  : isExpanded
                                    ? 'border-[#E67E22] bg-amber-50/20'
                                    : 'border-slate-200 bg-white'
                              }`}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                  <span
                                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-mono-num text-sm font-extrabold ${
                                      idx === 0
                                        ? 'bg-[#E67E22] text-white'
                                        : idx === 1
                                          ? 'bg-[#0F2942] text-white'
                                          : 'bg-slate-100 text-[#0F2942]'
                                    }`}
                                  >
                                    #{idx + 1}
                                  </span>
                                  <div>
                                    <div className="text-sm font-bold text-[#0F2942]">
                                      {row.displayName}{' '}
                                      {isMe && (
                                        <span className="text-xs font-semibold text-[#E67E22]">
                                          (You)
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-xs text-slate-500">
                                      {row.levelName} · {row.reportsCount} reports ·{' '}
                                      {row.confirmedCount} confirmed green ·{' '}
                                      {row.supportsCount} supports · {row.commentsCount} comments
                                      {row.neighbourConfirmsCount > 0
                                        ? ` · ${row.neighbourConfirmsCount} fix verifies`
                                        : ''}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-3">
                                  <div className="text-right">
                                    <div className="font-mono-num text-base font-extrabold text-[#15803D]">
                                      {row.points} pts
                                    </div>
                                    {row.badges.length > 0 && (
                                      <div className="text-[11px] text-slate-500">
                                        {row.badges.slice(0, 2).join(' · ')}
                                      </div>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedContributorUid(isExpanded ? null : row.uid)
                                    }
                                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-[#0F2942] hover:bg-slate-50"
                                  >
                                    <Eye className="h-3.5 w-3.5 text-[#E67E22]" />
                                    <span>Contributions</span>
                                  </button>
                                </div>
                              </div>

                              {isExpanded && (
                                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2 text-xs">
                                  <div>
                                    <div className="font-bold text-[#0F2942] mb-1">
                                      Public Reports Filed ({theirReports.length})
                                    </div>
                                    {theirReports.length === 0 ? (
                                      <div className="text-slate-500">
                                        No public non-anonymous reports yet.
                                      </div>
                                    ) : (
                                      <div className="space-y-1">
                                        {theirReports.slice(0, 5).map((r) => (
                                          <button
                                            key={r.id}
                                            type="button"
                                            onClick={() => jumpToComplaint(r.id, 'home')}
                                            className="flex w-full flex-wrap items-center justify-between gap-2 rounded bg-white px-2.5 py-1.5 border border-slate-200 text-left hover:border-[#0F2942]"
                                          >
                                            <span className="font-semibold text-[#0F2942]">
                                              {r.title}{' '}
                                              <span className="font-normal text-slate-500">
                                                ({r.localityName})
                                              </span>
                                            </span>
                                            <span className="text-[11px] font-bold text-[#15803D]">
                                              {r.status} · {r.upvoteCount} upvotes
                                            </span>
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>

                                  <div>
                                    <div className="font-bold text-[#0F2942] mb-1">
                                      Community Issues Supported / Upvoted ({theirSupported.length})
                                    </div>
                                    {theirSupported.length === 0 ? (
                                      <div className="text-slate-500">
                                        No community upvotes recorded yet.
                                      </div>
                                    ) : (
                                      <div className="space-y-1">
                                        {theirSupported.slice(0, 5).map((s) => (
                                          <button
                                            key={s.id}
                                            type="button"
                                            onClick={() => jumpToComplaint(s.id, 'home')}
                                            className="flex w-full flex-wrap items-center justify-between gap-2 rounded bg-white px-2.5 py-1.5 border border-slate-200 text-left hover:border-[#0F2942]"
                                          >
                                            <span className="font-medium text-slate-800">
                                              {s.title}{' '}
                                              <span className="text-slate-500">
                                                ({s.localityName})
                                              </span>
                                            </span>
                                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#E67E22]">
                                              <ThumbsUp className="h-3 w-3" />
                                              {s.upvoteCount}
                                            </span>
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      );
                    })()}
                  </div>
                </>
              );
            })()}
          </section>
        )}

        {/* ME TAB */}
        {activeTab === 'me' && (
          <section className="space-y-4">
            <h1 className="font-display text-xl font-extrabold text-[#0F2942]">
              {t.tabs.me}
            </h1>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-display text-base font-bold text-[#0F2942]">
                    {firebaseUser ? firebaseUser.displayName || firebaseUser.email : 'Guest Citizen'}
                  </div>
                  <div className="text-xs text-slate-600 mt-0.5">
                    Verification status:{' '}
                    <span className="font-bold text-[#0F2942]">{verificationLabel}</span>
                  </div>
                </div>
                {firebaseUser && (
                  <button
                    type="button"
                    onClick={() => void signOut(auth)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Sign out</span>
                  </button>
                )}
              </div>

              {firebaseUser && !firebaseUser.emailVerified && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-sm space-y-2">
                  <div className="font-bold text-amber-950">
                    Email verification pending
                  </div>
                  <p className="text-xs text-amber-900">
                    Click the verification link sent to {firebaseUser.email}, then tap Refresh.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void sendEmailVerification(firebaseUser).then(() =>
                          showToast('Verification email resent.')
                        );
                      }}
                      className="rounded-lg bg-[#0F2942] px-3 py-1.5 text-xs font-bold text-white"
                    >
                      Resend verification link
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void firebaseUser.reload().then(() => {
                          setFirebaseUser({ ...firebaseUser });
                        });
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>I verified my email</span>
                    </button>
                  </div>
                </div>
              )}

              {!firebaseUser && (
                <button
                  type="button"
                  onClick={() => setAuthModalOpen(true)}
                  className="w-full rounded-xl bg-[#0F2942] py-3 text-sm font-bold text-white"
                >
                  Sign in or Create Citizen Account
                </button>
              )}

              <div className="border-t border-slate-200 pt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold">
                    <Languages className="h-4 w-4 text-[#E67E22]" />
                    <span>Language</span>
                  </div>
                  <select
                    value={language}
                    onChange={(e) => selectLanguage(e.target.value as SupportedLanguage)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold"
                  >
                    {SUPPORTED_LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.nativeName}
                      </option>
                    ))}
                  </select>
                </div>

                <label className="flex items-center justify-between cursor-pointer">
                  <span className="font-semibold">{t.simpleMode}</span>
                  <input
                    type="checkbox"
                    checked={simpleMode}
                    onChange={toggleSimpleMode}
                    className="h-5 w-5"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer">
                  <span className="font-semibold">Contextual AI Helper Bot</span>
                  <input
                    type="checkbox"
                    checked={guideBotEnabled}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setGuideBotEnabled(next);
                      localStorage.setItem('nagrik_guide_bot', String(next));
                    }}
                    className="h-5 w-5"
                  />
                </label>
              </div>

              {firebaseUser && (
                <div className="border-t border-slate-200 pt-4">
                  <button
                    type="button"
                    onClick={() => void handleDeleteMyData()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-red-800 hover:bg-red-100"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>Delete my citizen profile &amp; private contact data (DPDP)</span>
                  </button>
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      {/* Bottom 5-Tab Navigation (Strict Max 5 Tabs) */}
      <nav
        aria-label="Primary navigation"
        className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white"
      >
        <div className="mx-auto grid max-w-4xl grid-cols-5">
          {(
            [
              { id: 'home', label: t.tabs.home, Icon: Home },
              { id: 'my_reports', label: t.tabs.myReports, Icon: ListChecks },
              { id: 'benefits', label: t.tabs.benefits, Icon: HeartHandshake },
              { id: 'rankings', label: t.tabs.rankings, Icon: Award },
              { id: 'me', label: t.tabs.me, Icon: User },
            ] as const
          ).map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`flex min-h-[58px] flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-bold ${
                  active ? 'text-[#0F2942] border-t-2 border-[#E67E22]' : 'text-slate-500'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="truncate max-w-full">{label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Per-Constituency Transparency Page Drawer */}
      {transparencyConst && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F2942]/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <div className="text-xs font-bold uppercase text-[#E67E22]">
                  Constituency Transparency
                </div>
                <h2 className="font-display text-lg font-bold text-[#0F2942]">
                  {transparencyConst.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setTransparencyConstId(null)}
                className="rounded px-2 py-1 text-sm font-bold text-slate-600 hover:bg-slate-100"
              >
                Close
              </button>
            </div>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-slate-600">Current MLA Office:</span>{' '}
                <strong>{transparencyConst.mlaName}</strong>
              </div>
              <div>
                <span className="text-slate-600">Official verified:</span>{' '}
                <span>{transparencyConst.lastVerifiedDate}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="rounded-xl bg-slate-50 p-3 border border-slate-200">
                  <div className="text-xs text-slate-500">Total Public Reports</div>
                  <div className="font-mono-num text-xl font-bold text-[#0F2942]">
                    {complaints.filter((c) => c.constituencyId === transparencyConst.id).length}
                  </div>
                </div>
                <div className="rounded-xl bg-emerald-50 p-3 border border-emerald-200">
                  <div className="text-xs text-emerald-800">Confirmed Resolved</div>
                  <div className="font-mono-num text-xl font-bold text-[#15803D]">
                    {
                      complaints.filter(
                        (c) =>
                          c.constituencyId === transparencyConst.id &&
                          c.status === 'CONFIRMED RESOLVED'
                      ).length
                    }
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-500 pt-1">
                Notice: No reporter identities, private serious concerns, or welfare data are ever
                shown here.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Citizen Sign-In / Sign-Up Modal */}
      {authModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F2942]/70 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-extrabold text-[#0F2942]">
                {authMode === 'signup'
                  ? 'Create Citizen Account'
                  : authMode === 'reset'
                    ? 'Reset Password'
                    : 'Citizen Sign In'}
              </h2>
              <button
                type="button"
                onClick={() => setAuthModalOpen(false)}
                className="text-sm font-semibold text-slate-500"
              >
                Close
              </button>
            </div>

            {authError && (
              <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-900">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            {authMode !== 'reset' && (
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={authBusy}
                  onClick={() => void handleCitizenGoogleSignIn()}
                  className="flex w-full items-center justify-center gap-2.5 rounded-xl border-2 border-[#0F2942] bg-white py-3 text-sm font-bold text-[#0F2942] hover:bg-slate-50 disabled:opacity-50"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.3 0 6.08-1.09 8.11-2.96l-3.88-3.05c-1.1.74-2.51 1.18-4.23 1.18-3.25 0-6.01-2.2-7-5.16H1.01v3.14C3.05 21.2 7.21 24 12 24Z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5 14.01c-.25-.74-.39-1.54-.39-2.36 0-.82.14-1.62.39-2.36V6.15H1.01C.37 7.43 0 8.88 0 11.65s.37 4.22 1.01 5.5l3.99-3.14Z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.79 0 3.4.62 4.67 1.83l3.5-3.5C18.07 1.19 15.29 0 12 0 7.21 0 3.05 2.8 1.01 6.85l3.99 3.14c.99-2.96 3.75-5.24 7-5.24Z"
                    />
                  </svg>
                  <span>{authBusy ? 'Please wait...' : 'Continue with Google'}</span>
                </button>
                <p className="text-[11px] text-slate-500 text-center">
                  By continuing, you consent under India&apos;s DPDP Act to store your civic
                  reports and name. No Aadhaar numbers or fake OTPs are collected.
                </p>
              </div>
            )}

            <details open={authMode === 'reset'} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <summary className="cursor-pointer text-xs font-semibold text-slate-600 select-none">
                {authMode === 'reset'
                  ? 'Reset Email & Password'
                  : 'Or sign in with Email & Password'}
              </summary>
              <form onSubmit={(e) => void handleAuthSubmit(e)} className="mt-3 space-y-3">
                {authMode === 'signup' && (
                  <div>
                    <label className="mb-1 block text-xs font-semibold">Full Name</label>
                    <input
                      type="text"
                      required
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
                    />
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-xs font-semibold">Email</label>
                  <input
                    type="email"
                    required
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
                  />
                </div>

                {authMode !== 'reset' && (
                  <div>
                    <label className="mb-1 block text-xs font-semibold">Password</label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
                    />
                  </div>
                )}

                {authMode === 'signup' && (
                  <label className="flex items-start gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={dpdpConsent}
                      onChange={(e) => setDpdpConsent(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      I consent under India&apos;s DPDP Act to store my reports and name for civic
                      redressal. We never collect Aadhaar numbers or fake OTPs.
                    </span>
                  </label>
                )}

                <button
                  type="submit"
                  disabled={authBusy}
                  className="w-full rounded-xl bg-[#0F2942] py-2.5 text-sm font-bold text-white hover:bg-[#173A5E]"
                >
                  {authBusy
                    ? 'Please wait...'
                    : authMode === 'signup'
                      ? 'Sign up & Send Verification Email'
                      : authMode === 'reset'
                        ? 'Send Password Reset Email'
                        : 'Sign in'}
                </button>

                <div className="flex items-center justify-between text-xs text-slate-600 pt-1">
                  <button
                    type="button"
                    onClick={() => setAuthMode(authMode === 'signin' ? 'signup' : 'signin')}
                    className="font-semibold text-[#0F2942] underline"
                  >
                    {authMode === 'signin' ? 'Need an account? Sign up' : 'Back to Sign in'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthMode('reset')}
                    className="underline"
                  >
                    Forgot password?
                  </button>
                </div>
              </form>
            </details>
          </div>
        </div>
      )}

      {/* Modals */}
      <ReportFlowModal
        open={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        language={language}
        simpleMode={simpleMode}
        constituencies={effectiveConstituencies}
        existingComplaints={complaints}
        existingClusters={clusters}
        onCitizenActivity={() => {
          if (firebaseUser?.emailVerified) {
            void syncPublicCitizenProfile(firebaseUser);
          }
        }}
        onSubmitted={(msg, targetComplaintId) => {
          showToast(msg);
          if (targetComplaintId) {
            jumpToComplaint(targetComplaintId);
          } else {
            setActiveTab('my_reports');
          }
        }}
      />

      <SeriousConcernModal
        open={concernModalOpen}
        onClose={() => setConcernModalOpen(false)}
        language={language}
        constituencies={effectiveConstituencies}
        onSubmitted={(msg) => {
          showToast(msg);
          setActiveTab('my_reports');
        }}
      />

      {/* Contextual AI Guide Bot */}
      <GuideBotWidget
        language={language}
        screen={reportModalOpen ? 'report' : activeTab}
        enabled={guideBotEnabled && languageChosen}
        simpleMode={simpleMode}
        onTurnOff={() => {
          setGuideBotEnabled(false);
          localStorage.setItem('nagrik_guide_bot', 'false');
        }}
        actionButtonLabel={activeTab === 'home' ? t.reportButton : undefined}
        onTriggerAction={
          activeTab === 'home'
            ? () => {
                if (canUseReportFlow()) setReportModalOpen(true);
              }
            : undefined
        }
      />
    </div>
  );
}

export default App;
