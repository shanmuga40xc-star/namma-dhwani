import L from 'leaflet';
import {
  AlertTriangle,
  ArrowUpRight,
  Camera,
  Check,
  CheckCircle2,
  Copy,
  Database,
  ExternalLink,
  FileSpreadsheet,
  Flame,
  HeartHandshake,
  Inbox,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  Map as MapIcon,
  Send,
  Settings,
  Shield,
  ShieldAlert,
  Sparkles,
  Trash2,
  UserPlus,
  XCircle,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  DEFAULT_POINTS_CONFIG,
  DEMO_AGENCIES,
  DEMO_CONSTITUENCIES,
  KARNATAKA_BOUNDS,
  STATUS_COLORS,
} from '@shared/constants';
import {
  normalizeAdminDoc,
  normalizeBenefitClaimDoc,
  normalizeComplaintDoc,
  normalizeConstituencyDoc,
  normalizeSeriousConcernDoc,
  stripUndefinedDeep,
  toIsoString,
} from '@shared/normalizers';
import { getCommunityDemandInfo } from '@shared/priority';
import type {
  AdminRole,
  AdminUserRecord,
  AgencyContact,
  AuditLogEntry,
  BenefitClaim,
  BenefitClaimStatus,
  BoundaryFlag,
  Complaint,
  ConstituencyBoundary,
  DemoEmailLog,
  FixVerificationAiResult,
  NotificationItem,
  PointsConfig,
  SeriousConcern,
} from '@shared/types';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, testFirestoreConnection } from './firebase';

type AdminTab = 'inbox' | 'emergency' | 'map' | 'concerns' | 'welfare' | 'setup';

function compressAfterPhoto(file: File, maxDim = 680): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result || ''));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = () => reject(new Error('Could not read repair photo'));
      img.src = String(reader.result || '');
    };
    reader.onerror = () => reject(new Error('Failed to read repair photo file'));
    reader.readAsDataURL(file);
  });
}

export function App() {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [adminRecord, setAdminRecord] = useState<AdminUserRecord | null>(null);
  const [authReady, setAuthReady] = useState(false);

  // 2-step TOTP session state
  const [step2Token, setStep2Token] = useState<string>(() =>
    sessionStorage.getItem('nagrik_admin_step2') || ''
  );
  const [totpQr, setTotpQr] = useState<string>('');
  const [totpManualKey, setTotpManualKey] = useState<string>('');
  const [totpAlreadyEnrolled, setTotpAlreadyEnrolled] = useState<boolean>(false);
  const [totpCodeInput, setTotpCodeInput] = useState('');
  const [totpError, setTotpError] = useState<string | null>(null);

  // Bootstrap first Super Admin state
  const [bootstrapDone, setBootstrapDone] = useState<boolean>(false);
  const [firestoreRulesBlocked, setFirestoreRulesBlocked] = useState(false);
  const [eligibleForBootstrap, setEligibleForBootstrap] = useState(false);
  const [superAdminEnvConfigured, setSuperAdminEnvConfigured] = useState(false);
  const [bootstrapReason, setBootstrapReason] = useState<string | null>(null);
  const [bootstrapHint, setBootstrapHint] = useState<string[]>([]);
  const [copiedUid, setCopiedUid] = useState(false);

  // Login inputs (NO public signup!)
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  // Domain state
  const [activeTab, setActiveTab] = useState<AdminTab>('inbox');
  const [demoMode, setDemoMode] = useState(false);
  const [constituencies, setConstituencies] = useState<ConstituencyBoundary[]>([]);
  const [agencies, setAgencies] = useState<AgencyContact[]>([]);
  const [adminsList, setAdminsList] = useState<AdminUserRecord[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [concerns, setConcerns] = useState<SeriousConcern[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [benefitClaims, setBenefitClaims] = useState<BenefitClaim[]>([]);
  const [welfareNoteInputs, setWelfareNoteInputs] = useState<Record<string, string>>({});
  const [boundaryFlags, setBoundaryFlags] = useState<BoundaryFlag[]>([]);
  const [demoEmails, setDemoEmails] = useState<DemoEmailLog[]>([]);
  const [pointsConfig, setPointsConfig] = useState<PointsConfig>(DEFAULT_POINTS_CONFIG);
  const [pointsVerifiedInput, setPointsVerifiedInput] = useState<number>(
    DEFAULT_POINTS_CONFIG.verifiedReport
  );
  const [pointsResolvedInput, setPointsResolvedInput] = useState<number>(
    DEFAULT_POINTS_CONFIG.confirmedResolved
  );

  // Inbox & High Emergency filters & inline staff action state
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [emergencyFilter, setEmergencyFilter] = useState<
    'ALL' | 'CRITICAL' | 'ACTION_NEEDED' | 'AWAITING_CHECK'
  >('ALL');
  const [actionPanel, setActionPanel] = useState<{
    complaintId: string;
    mode: 'resolve' | 'forward' | 'reject' | 'escalate';
  } | null>(null);
  const [afterPhotoDataUrl, setAfterPhotoDataUrl] = useState<string>('');
  const [resolveNote, setResolveNote] = useState<string>('');
  const [selectedAgencyId, setSelectedAgencyId] = useState<string>('');
  const [rejectReason, setRejectReason] = useState<string>('');
  const [escalateReason, setEscalateReason] = useState<string>('');
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [aiBackgroundBusyId, setAiBackgroundBusyId] = useState<string | null>(null);

  const [toast, setToast] = useState<string | null>(null);
  const [setupBusy, setSetupBusy] = useState(false);
  const [generatedCredsOnce, setGeneratedCredsOnce] = useState<
    Array<{ email: string; role: string; constituency: string; password: string }>
  >([]);

  // Invite official account form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteUid, setInviteUid] = useState('');
  const [inviteRole, setInviteRole] = useState<AdminRole>('mla_owner');
  const [inviteConstId, setInviteConstId] = useState('');
  const [inviteDept, setInviteDept] = useState('');

  // GeoJSON / CSV import state
  const [importText, setImportText] = useState('');

  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 5000);
  }

  useEffect(() => {
    void testFirestoreConnection();
    fetch('/api/config/public')
      .then((r) => r.json())
      .then((cfg: { demoMode?: boolean; superAdminConfigured?: boolean }) => {
        setDemoMode(Boolean(cfg.demoMode));
        setSuperAdminEnvConfigured(Boolean(cfg.superAdminConfigured));
      })
      .catch(() => null);

    const unsubSettings = onSnapshot(doc(db, 'appConfig', 'settings'), (snap) => {
      if (snap.exists()) {
        const d = snap.data() as {
          demoMode?: boolean;
          pointsConfig?: Partial<PointsConfig>;
        };
        setDemoMode(Boolean(d.demoMode));
        if (d.pointsConfig) {
          const nextPts: PointsConfig = {
            verifiedReport:
              typeof d.pointsConfig.verifiedReport === 'number'
                ? d.pointsConfig.verifiedReport
                : DEFAULT_POINTS_CONFIG.verifiedReport,
            confirmedResolved:
              typeof d.pointsConfig.confirmedResolved === 'number'
                ? d.pointsConfig.confirmedResolved
                : DEFAULT_POINTS_CONFIG.confirmedResolved,
            upvote: 0,
          };
          setPointsConfig(nextPts);
          setPointsVerifiedInput(nextPts.verifiedReport);
          setPointsResolvedInput(nextPts.confirmedResolved);
        }
      }
    });
    const unsubBootstrap = onSnapshot(
      doc(db, 'appConfig', 'bootstrap'),
      (snap) => {
        setFirestoreRulesBlocked(false);
        setBootstrapDone(snap.exists());
      },
      (err) => {
        if (err?.code === 'permission-denied') {
          setFirestoreRulesBlocked(true);
        }
        setBootstrapDone(false);
      }
    );

    return () => {
      unsubSettings();
      unsubBootstrap();
    };
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setFirebaseUser(null);
        setAdminRecord(null);
        setStep2Token('');
        sessionStorage.removeItem('nagrik_admin_step2');
        setEligibleForBootstrap(false);
        setAuthReady(true);
        return;
      }

      setFirebaseUser(user);
      const token = await user.getIdToken();

      // Check existing admin doc (normalize so legacy pre-Step-1 docs don't crash or block bootstrap)
      let permissionDenied = false;
      const snap = await getDoc(doc(db, 'admins', user.uid)).catch((err) => {
        if ((err as { code?: string })?.code === 'permission-denied') {
          permissionDenied = true;
          setFirestoreRulesBlocked(true);
        }
        return null;
      });
      if (!permissionDenied) {
        setFirestoreRulesBlocked(false);
      }
      const rec = snap?.exists()
        ? normalizeAdminDoc(user.uid, snap.data() as Record<string, unknown>)
        : null;
      if (rec) {
        setAdminRecord(rec);

        const enteredWithGoogle = await tryGoogleDirectSession(user, token);
        if (!enteredWithGoogle) {
          // Load TOTP setup/status for email/password staff
          const totpResp = await fetch('/api/admin/totp/setup', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => null);
          if (totpResp?.ok) {
            const data = (await totpResp.json()) as {
              qrDataUrl: string;
              manualKey: string;
              alreadyEnrolled: boolean;
            };
            setTotpQr(data.qrDataUrl);
            setTotpManualKey(data.manualKey);
            setTotpAlreadyEnrolled(data.alreadyEnrolled);
          }
        }
      } else {
        setAdminRecord(null);
        // Check if eligible as First Super Admin via env var
        await runBootstrapCheck(user);
      }
      setAuthReady(true);
    });
    return unsub;
  }, []);

  async function tryGoogleDirectSession(user: FirebaseUser, token?: string): Promise<boolean> {
    try {
      const tokenResult = await user.getIdTokenResult();
      const isGoogle =
        tokenResult.signInProvider === 'google.com' ||
        user.providerData.some((p) => p.providerId === 'google.com');
      if (!isGoogle) return false;

      const freshToken = token || (await user.getIdToken());
      const resp = await fetch('/api/admin/google-session', {
        method: 'POST',
        headers: { Authorization: `Bearer ${freshToken}` },
      });
      if (!resp.ok) return false;
      const data = (await resp.json()) as { verified?: boolean; step2Token?: string };
      if (data.verified && data.step2Token) {
        sessionStorage.setItem('nagrik_admin_step2', data.step2Token);
        setStep2Token(data.step2Token);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async function runBootstrapCheck(user: FirebaseUser) {
    try {
      const token = await user.getIdToken(true);

      let rulesBlocked = false;
      const bootSnap = await getDoc(doc(db, 'appConfig', 'bootstrap')).catch((err) => {
        if ((err as { code?: string })?.code === 'permission-denied') {
          rulesBlocked = true;
        }
        return null;
      });
      if (bootSnap) {
        setBootstrapDone(bootSnap.exists());
      } else if (rulesBlocked) {
        setBootstrapDone(false);
      }

      const adminSnap = await getDoc(doc(db, 'admins', user.uid)).catch((err) => {
        if ((err as { code?: string })?.code === 'permission-denied') {
          rulesBlocked = true;
        }
        return null;
      });
      setFirestoreRulesBlocked(rulesBlocked);

      const rec = adminSnap?.exists()
        ? normalizeAdminDoc(user.uid, adminSnap.data() as Record<string, unknown>)
        : null;
      if (rec) {
        setAdminRecord(rec);
        if (rec.role === 'super_admin') setActiveTab('setup');
        const enteredWithGoogle = await tryGoogleDirectSession(user, token);
        if (!enteredWithGoogle) {
          const totpResp = await fetch('/api/admin/totp/setup', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => null);
          if (totpResp?.ok) {
            const data = (await totpResp.json()) as {
              qrDataUrl: string;
              manualKey: string;
              alreadyEnrolled: boolean;
            };
            setTotpQr(data.qrDataUrl);
            setTotpManualKey(data.manualKey);
            setTotpAlreadyEnrolled(data.alreadyEnrolled);
          }
        }
        return;
      }

      const bootResp = await fetch('/api/admin/bootstrap-check', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const bData = (await bootResp.json().catch(() => ({}))) as {
        eligibleForBootstrap?: boolean;
        superAdminEnvConfigured?: boolean;
        reason?: string;
        maskedConfiguredHint?: string[];
        error?: string;
      };
      if (bootResp.ok) {
        setEligibleForBootstrap(Boolean(bData.eligibleForBootstrap));
        setSuperAdminEnvConfigured(Boolean(bData.superAdminEnvConfigured));
        setBootstrapReason(bData.reason || null);
        setBootstrapHint(Array.isArray(bData.maskedConfiguredHint) ? bData.maskedConfiguredHint : []);
      } else {
        setEligibleForBootstrap(false);
        setBootstrapReason(bData.error || `HTTP_${bootResp.status}`);
        setBootstrapHint([]);
      }
    } catch (err) {
      setEligibleForBootstrap(false);
      setBootstrapReason(err instanceof Error ? err.message : 'BOOTSTRAP_CHECK_FAILED');
      setBootstrapHint([]);
    }
  }

  // Live Firestore subscriptions after 2-step authentication completes
  useEffect(() => {
    if (!adminRecord || !step2Token) return;

    const uConst = onSnapshot(collection(db, 'constituencies'), (s) =>
      setConstituencies(
        s.docs
          .map((d) => normalizeConstituencyDoc(d.id, d.data() as Record<string, unknown>))
          .filter((x): x is ConstituencyBoundary => x !== null)
      )
    );
    const uAgency = onSnapshot(collection(db, 'agencies'), (s) =>
      setAgencies(s.docs.map((d) => d.data() as AgencyContact))
    );
    const uCmp = onSnapshot(collection(db, 'complaints'), (s) => {
      const list = s.docs.map((d) =>
        normalizeComplaintDoc(d.id, d.data() as Record<string, unknown>)
      );
      list.sort(
        (a, b) =>
          getCommunityDemandInfo(b).adminTriageScore -
            getCommunityDemandInfo(a).adminTriageScore ||
          b.upvoteCount - a.upvoteCount ||
          b.updatedAt.localeCompare(a.updatedAt)
      );
      setComplaints(list);
    });
    const uConcerns = onSnapshot(
      collection(db, 'seriousConcerns'),
      (s) =>
        setConcerns(
          s.docs.map((d) => normalizeSeriousConcernDoc(d.id, d.data() as Record<string, unknown>))
        ),
      () => setConcerns([])
    );

    let uAdmins = () => {};
    let uAudit = () => {};
    let uFlags = () => {};
    let uEmails = () => {};
    let uClaims = () => {};
    if (adminRecord.role === 'super_admin' || adminRecord.role === 'cm_office') {
      uAdmins = onSnapshot(collection(db, 'admins'), (s) =>
        setAdminsList(
          s.docs
            .map((d) => normalizeAdminDoc(d.id, d.data() as Record<string, unknown>))
            .filter((x): x is AdminUserRecord => x !== null)
        )
      );
      uAudit = onSnapshot(
        collection(db, 'auditLogs'),
        (s) => {
          const logs = s.docs.map((d) => {
            const raw = d.data() as Record<string, unknown>;
            return {
              ...(raw as unknown as AuditLogEntry),
              id: typeof raw.id === 'string' ? raw.id : d.id,
              createdAt: toIsoString(raw.createdAt),
            };
          });
          logs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          setAuditLogs(logs);
        },
        () => setAuditLogs([])
      );
    }
    if (adminRecord.role === 'super_admin' || adminRecord.role === 'welfare_reviewer') {
      uClaims = onSnapshot(
        collection(db, 'benefitClaims'),
        (s) => {
          const items = s.docs.map((d) =>
            normalizeBenefitClaimDoc(d.id, d.data() as Record<string, unknown>)
          );
          items.sort((a, b) => b.claimedAt.localeCompare(a.claimedAt));
          setBenefitClaims(items);
        },
        () => setBenefitClaims([])
      );
    }
    if (adminRecord.role === 'super_admin') {
      uFlags = onSnapshot(collection(db, 'boundaryFlags'), (s) =>
        setBoundaryFlags(s.docs.map((d) => d.data() as BoundaryFlag))
      );
      uEmails = onSnapshot(collection(db, 'demoEmailLogs'), (s) =>
        setDemoEmails(s.docs.map((d) => d.data() as DemoEmailLog))
      );
    }

    return () => {
      uConst();
      uAgency();
      uCmp();
      uConcerns();
      uAdmins();
      uAudit();
      uClaims();
      uFlags();
      uEmails();
    };
  }, [adminRecord, step2Token]);

  // Role & Constituency Isolation Filter
  const scopedComplaints = useMemo(() => {
    if (!adminRecord) return [];
    if (adminRecord.role === 'super_admin') return complaints;
    if (adminRecord.role === 'cm_office') {
      return complaints.filter((c) => c.escalatedToCm);
    }
    if (adminRecord.role === 'mla_owner' || adminRecord.role === 'mla_member') {
      return complaints.filter((c) => c.constituencyId === adminRecord.constituencyId);
    }
    return [];
  }, [complaints, adminRecord]);

  // Dedicated High Emergency Queue: any open complaint upvoted/liked by citizens (1+ upvotes)
  const emergencyComplaints = useMemo(() => {
    return scopedComplaints
      .filter(
        (c) =>
          c.status !== 'CONFIRMED RESOLVED' &&
          c.status !== 'Rejected' &&
          c.upvoteCount >= 1
      )
      .sort((a, b) => {
        if (b.upvoteCount !== a.upvoteCount) return b.upvoteCount - a.upvoteCount;
        const triageDiff =
          getCommunityDemandInfo(b).adminTriageScore -
          getCommunityDemandInfo(a).adminTriageScore;
        if (triageDiff !== 0) return triageDiff;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [scopedComplaints]);

  const scopedConcerns = useMemo(() => {
    if (!adminRecord) return [];
    if (adminRecord.role === 'super_admin') return concerns;
    if (adminRecord.role === 'cm_office') {
      return concerns.filter(
        (sc) => sc.directToCm || sc.status === 'Escalated to CM Office'
      );
    }
    if (adminRecord.role === 'mla_owner' || adminRecord.role === 'mla_member') {
      return concerns.filter(
        (sc) => sc.constituencyId === adminRecord.constituencyId && !sc.directToCm
      );
    }
    return [];
  }, [concerns, adminRecord]);

  // Render Leaflet map on Map tab
  useEffect(() => {
    if (activeTab !== 'map' || !mapDivRef.current) return;
    if (leafletMapRef.current) {
      leafletMapRef.current.remove();
      leafletMapRef.current = null;
    }

    const map = L.map(mapDivRef.current, {
      center: [12.9716, 77.5946],
      zoom: 11,
      minZoom: 6,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    L.rectangle(
      [
        [KARNATAKA_BOUNDS.south, KARNATAKA_BOUNDS.west],
        [KARNATAKA_BOUNDS.north, KARNATAKA_BOUNDS.east],
      ],
      {
        color: '#0F2942',
        weight: 1.5,
        dashArray: '6 4',
        fill: false,
      }
    ).addTo(map);

    for (const c of constituencies) {
      if (
        (adminRecord?.role === 'mla_owner' || adminRecord?.role === 'mla_member') &&
        c.id !== adminRecord.constituencyId
      ) {
        continue;
      }
      L.rectangle(
        [
          [c.bounds.south, c.bounds.west],
          [c.bounds.north, c.bounds.east],
        ],
        { color: '#0F2942', weight: 1.5, fillOpacity: 0.04 }
      )
        .bindTooltip(`${c.name} — ${c.mlaName}`)
        .addTo(map);
    }

    for (const cmp of scopedComplaints) {
      const demand = getCommunityDemandInfo(cmp);
      const isOpenUpvotedEmergency =
        cmp.status !== 'CONFIRMED RESOLVED' &&
        cmp.status !== 'Rejected' &&
        cmp.upvoteCount >= 1;
      L.circleMarker([cmp.latitude, cmp.longitude], {
        radius:
          demand.tier === 'serious' || cmp.upvoteCount >= 5
            ? 12
            : isOpenUpvotedEmergency
              ? 10
              : 8,
        color: '#FFFFFF',
        weight: 2,
        fillColor:
          cmp.status === 'CONFIRMED RESOLVED'
            ? '#15803D'
            : isOpenUpvotedEmergency
              ? '#DC2626'
              : '#E67E22',
        fillOpacity: 0.92,
      })
        .bindPopup(
          `<strong>${cmp.title}</strong><br/>${cmp.status} · Priority ${cmp.priorityScore}<br/>${cmp.upvoteCount} citizen upvotes${isOpenUpvotedEmergency ? ' — HIGH EMERGENCY' : ''}${demand.label ? ` (${demand.label})` : ''}`
        )
        .addTo(map);
    }

    leafletMapRef.current = map;
    return () => {
      map.remove();
      leafletMapRef.current = null;
    };
  }, [activeTab, scopedComplaints, constituencies, adminRecord]);

  async function writeAuditLog(
    action: string,
    targetCollection: string,
    targetId: string,
    summary: string,
    constituencyId?: string
  ) {
    if (!adminRecord || !firebaseUser) return;
    const id = `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const entry: AuditLogEntry = {
      id,
      actorUid: firebaseUser.uid,
      actorEmail: adminRecord.email,
      actorRole: adminRecord.role,
      action,
      targetCollection,
      targetId,
      ...(constituencyId ? { constituencyId } : {}),
      summary,
      createdAt: new Date().toISOString(),
    };
    await setDoc(doc(db, 'auditLogs', id), entry).catch(() => null);
  }

  async function sendCitizenNotification(params: {
    recipientUid?: string;
    complaintId?: string;
    concernId?: string;
    title: string;
    body: string;
    type: NotificationItem['type'];
  }) {
    if (!params.recipientUid) return;
    const notifId = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const item: NotificationItem = {
      id: notifId,
      recipientUid: params.recipientUid,
      ...(params.complaintId ? { complaintId: params.complaintId } : {}),
      ...(params.concernId ? { concernId: params.concernId } : {}),
      title: params.title,
      body: params.body,
      type: params.type,
      read: false,
      createdAt: new Date().toISOString(),
    };
    await setDoc(doc(db, 'notifications', notifId), item).catch(() => null);
  }

  async function logDemoNotification(recipientEmail: string, subject: string, previewText: string, relatedId?: string) {
    if (!demoMode) return;
    const logId = `dlog-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    await setDoc(
      doc(db, 'demoEmailLogs', logId),
      stripUndefinedDeep({
        id: logId,
        recipientEmail,
        subject,
        previewText,
        ...(relatedId ? { relatedId } : {}),
        createdAt: new Date().toISOString(),
      })
    ).catch(() => null);
  }

  async function handleStatusTransition(
    c: Complaint,
    nextStatus: 'Acknowledged' | 'In progress',
    note: string
  ) {
    if (!adminRecord || !firebaseUser) return;
    setActionBusyId(c.id);
    const now = new Date().toISOString();
    try {
      await updateDoc(doc(db, 'complaints', c.id), {
        status: nextStatus,
        timeline: [
          ...(c.timeline || []),
          {
            status: nextStatus,
            actorLabel: `${adminRecord.displayName} (${adminRecord.role})`,
            note,
            timestamp: now,
          },
        ],
        updatedAt: now,
      });
      await writeAuditLog(
        `complaint_${nextStatus.toLowerCase().replace(/\s+/g, '_')}`,
        'complaints',
        c.id,
        `${nextStatus}: ${c.title}`,
        c.constituencyId
      );
      await sendCitizenNotification({
        recipientUid: c.reporterUid,
        complaintId: c.id,
        title: `Update on "${c.title}"`,
        body: `Your report status is now ${nextStatus}.`,
        type: 'status_update',
      });
      showToast(`Updated "${c.title}" to ${nextStatus}.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to update status.');
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleBackgroundAiDraft(c: Complaint) {
    if (!firebaseUser || !step2Token) return;
    setAiBackgroundBusyId(c.id);
    try {
      await updateDoc(doc(db, 'complaints', c.id), {
        aiBackgroundStatus: 'pending',
        updatedAt: new Date().toISOString(),
      }).catch(() => null);

      const token = await firebaseUser.getIdToken();
      const resp = await fetch('/api/ai/background-draft', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Admin-Step2-Token': step2Token,
        },
        body: JSON.stringify({
          title: c.title,
          description: c.englishTranslation || c.description,
          category: c.category,
          status: c.status,
          originalLanguage: c.originalLanguage,
          localityName: c.localityName,
          constituencyName: c.constituencyName,
        }),
      });
      const data = (await resp.json()) as {
        available?: boolean;
        aiStatus?: 'completed' | 'unavailable';
        draftReply?: string;
      };
      await updateDoc(doc(db, 'complaints', c.id), {
        aiBackgroundStatus: data.aiStatus || 'unavailable',
        ...(data.draftReply ? { aiDraftReply: data.draftReply } : {}),
        updatedAt: new Date().toISOString(),
      });
      await writeAuditLog(
        'ai_background_draft',
        'complaints',
        c.id,
        `Background AI draft status=${data.aiStatus || 'unavailable'}`,
        c.constituencyId
      );
      showToast(
        data.available
          ? 'Background AI suggestion draft added.'
          : 'AI draft unavailable right now; manual handling remains active.'
      );
    } catch {
      showToast('Background AI draft could not complete.');
    } finally {
      setAiBackgroundBusyId(null);
    }
  }

  async function handleForwardToAgency(c: Complaint) {
    if (!adminRecord || !selectedAgencyId) return;
    const agency = agencies.find((a) => a.id === selectedAgencyId);
    if (!agency) return;
    setActionBusyId(c.id);
    const now = new Date().toISOString();
    const nextStatus =
      c.status === 'Reported' || c.status === 'Acknowledged' || c.status === 'Reopened'
        ? 'In progress'
        : c.status;
    try {
      await updateDoc(doc(db, 'complaints', c.id), {
        status: nextStatus,
        forwardedAgencyId: agency.id,
        forwardedAgencyName: agency.name,
        ownerLabel: `Forwarded to ${agency.name} (${c.constituencyName})`,
        timeline: [
          ...(c.timeline || []),
          {
            status: nextStatus,
            actorLabel: `${adminRecord.displayName} (${adminRecord.role})`,
            note: `Forwarded to ${agency.name} (${agency.officialEmail})`,
            timestamp: now,
          },
        ],
        updatedAt: now,
      });
      await writeAuditLog(
        'forward_to_agency',
        'complaints',
        c.id,
        `Forwarded "${c.title}" to ${agency.name}`,
        c.constituencyId
      );
      await logDemoNotification(
        agency.officialEmail,
        `Forwarded Issue: ${c.title}`,
        `Would email ${agency.name} regarding ${c.title} at ${c.localityName}`,
        c.id
      );
      await sendCitizenNotification({
        recipientUid: c.reporterUid,
        complaintId: c.id,
        title: `Forwarded to ${agency.name}`,
        body: `"${c.title}" was forwarded to ${agency.name} for action.`,
        type: 'status_update',
      });
      setActionPanel(null);
      setSelectedAgencyId('');
      showToast(`Forwarded to ${agency.name}.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to forward to agency.');
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleResolveAwaitingConfirmation(c: Complaint) {
    if (!adminRecord || !firebaseUser) return;
    setActionBusyId(c.id);
    const now = new Date().toISOString();
    const fixedAtMs = Date.now();
    const noteText =
      resolveNote.trim() || 'Repair work completed; awaiting citizen confirmation.';

    try {
      // THE GREEN RULE: Officials NEVER set 'CONFIRMED RESOLVED' directly!
      await updateDoc(doc(db, 'complaints', c.id), {
        status: 'Fixed, awaiting confirmation',
        fixedAt: now,
        fixedAtMs,
        ...(afterPhotoDataUrl ? { afterPhotoDataUrl } : {}),
        ownerLabel: 'Fixed — awaiting citizen confirmation',
        aiBackgroundStatus: 'pending',
        timeline: [
          ...(c.timeline || []),
          {
            status: 'Fixed, awaiting confirmation',
            actorLabel: `${adminRecord.displayName} (${adminRecord.role})`,
            note: noteText,
            timestamp: now,
          },
        ],
        updatedAt: now,
      });

      await writeAuditLog(
        'mark_fixed_awaiting_citizen',
        'complaints',
        c.id,
        `Marked fixed (awaiting citizen confirmation): ${c.title}`,
        c.constituencyId
      );

      const recipientUids = Array.from(
        new Set([c.reporterUid, ...(c.upvoterUids || [])].filter(Boolean))
      );
      await Promise.all(
        recipientUids.map((recipientUid) => {
          const isOriginalReporter = recipientUid === c.reporterUid;
          return sendCitizenNotification({
            recipientUid,
            complaintId: c.id,
            title: isOriginalReporter
              ? 'Issue Marked Fixed — Verify Repair Photo!'
              : 'Upvoted Issue Marked Fixed — Inspect Photo!',
            body: isOriginalReporter
              ? `Your report "${c.title}" was marked fixed. Tap to view the after-repair photo & confirm resolved (+${pointsConfig.confirmedResolved} pts).`
              : `"${c.title}" (which you upvoted) was marked fixed. Tap to inspect the before/after photo and verify on the ground.`,
            type: 'fix_awaiting_confirmation',
          });
        })
      );

      const capturedAfter = afterPhotoDataUrl;
      setActionPanel(null);
      setAfterPhotoDataUrl('');
      setResolveNote('');
      showToast(
        `Marked fixed! ${recipientUids.length} citizen(s) notified for verification & AI check running.`
      );

      // Run background AI verification (non-blocking; fails gracefully & labelled "AI suggestion")
      if (step2Token) {
        setAiBackgroundBusyId(c.id);
        void (async () => {
          try {
            const token = await firebaseUser.getIdToken();
            const resp = await fetch('/api/ai/verify-fix', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
                'X-Admin-Step2-Token': step2Token,
              },
              body: JSON.stringify({
                title: c.title,
                description: c.englishTranslation || c.description,
                category: c.category,
                resolutionNote: noteText,
                beforePhotoDataUrl: c.photoDataUrl,
                afterPhotoDataUrl: capturedAfter,
              }),
            });
            const aiFixAssessment = (await resp.json()) as FixVerificationAiResult;
            await updateDoc(doc(db, 'complaints', c.id), {
              aiFixAssessment: stripUndefinedDeep(aiFixAssessment),
              aiBackgroundStatus: aiFixAssessment.available ? 'completed' : 'unavailable',
              updatedAt: new Date().toISOString(),
            });
          } catch {
            await updateDoc(doc(db, 'complaints', c.id), {
              aiBackgroundStatus: 'unavailable',
              updatedAt: new Date().toISOString(),
            }).catch(() => null);
          } finally {
            setAiBackgroundBusyId(null);
          }
        })();
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to mark issue fixed.');
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleRejectComplaint(c: Complaint) {
    if (!adminRecord || !rejectReason.trim()) return;
    setActionBusyId(c.id);
    const now = new Date().toISOString();
    try {
      await updateDoc(doc(db, 'complaints', c.id), {
        status: 'Rejected',
        rejectionReason: rejectReason.trim(),
        ownerLabel: `Closed (${adminRecord.displayName})`,
        timeline: [
          ...(c.timeline || []),
          {
            status: 'Rejected',
            actorLabel: `${adminRecord.displayName} (${adminRecord.role})`,
            note: `Rejected: ${rejectReason.trim()}`,
            timestamp: now,
          },
        ],
        updatedAt: now,
      });
      await writeAuditLog(
        'reject_complaint',
        'complaints',
        c.id,
        `Rejected "${c.title}": ${rejectReason.trim()}`,
        c.constituencyId
      );
      await sendCitizenNotification({
        recipientUid: c.reporterUid,
        complaintId: c.id,
        title: `Report Rejected: "${c.title}"`,
        body: `Reason: ${rejectReason.trim()}`,
        type: 'status_update',
      });
      setActionPanel(null);
      setRejectReason('');
      showToast('Report rejected with official reason.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to reject report.');
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleEscalateToCm(c: Complaint) {
    if (!adminRecord || !escalateReason.trim()) return;
    setActionBusyId(c.id);
    const now = new Date().toISOString();
    try {
      await updateDoc(doc(db, 'complaints', c.id), {
        escalatedToCm: true,
        escalationReason: escalateReason.trim(),
        ownerLabel: `Escalated to CM Office (${c.constituencyName})`,
        timeline: [
          ...(c.timeline || []),
          {
            status: c.status,
            actorLabel: `${adminRecord.displayName} (${adminRecord.role})`,
            note: `Escalated to CM Office: ${escalateReason.trim()}`,
            timestamp: now,
          },
        ],
        updatedAt: now,
      });
      await writeAuditLog(
        'escalate_to_cm',
        'complaints',
        c.id,
        `Escalated "${c.title}" to CM Office`,
        c.constituencyId
      );
      await sendCitizenNotification({
        recipientUid: c.reporterUid,
        complaintId: c.id,
        title: `Escalated to CM Office`,
        body: `"${c.title}" was escalated to the CM Office for attention.`,
        type: 'status_update',
      });
      setActionPanel(null);
      setEscalateReason('');
      showToast('Escalated to CM Office inbox.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to escalate report.');
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleUpdateBenefitClaim(
    claim: BenefitClaim,
    nextStatus: BenefitClaimStatus
  ) {
    if (!adminRecord) return;
    setActionBusyId(claim.id);
    const now = new Date().toISOString();
    const noteText =
      (welfareNoteInputs[claim.id] || '').trim() ||
      (nextStatus === 'Approved & Issued'
        ? `Voucher ${claim.voucherCode} approved by ${adminRecord.displayName}.`
        : `Voucher ${claim.voucherCode} marked redeemed.`);
    try {
      await updateDoc(doc(db, 'benefitClaims', claim.id), {
        status: nextStatus,
        reviewedBy: `${adminRecord.displayName} (${adminRecord.role})`,
        officialNote: noteText,
        updatedAt: now,
      });
      await writeAuditLog(
        'update_benefit_claim',
        'benefitClaims',
        claim.id,
        `${nextStatus} "${claim.benefitTitle}" (${claim.voucherCode}) for ${claim.citizenName}`
      );
      await sendCitizenNotification({
        recipientUid: claim.citizenUid,
        title: `Welfare Benefit ${nextStatus}: ${claim.benefitTitle}`,
        body: `${noteText} Tap to open your claimed voucher in Benefits.`,
        type: 'welfare_update',
      });
      showToast(`Welfare claim marked "${nextStatus}" & citizen notified.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to update welfare claim.');
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleUpdateConcernStatus(
    sc: SeriousConcern,
    nextStatus: 'Under review' | 'Escalated to CM Office' | 'Closed'
  ) {
    if (!adminRecord) return;
    setActionBusyId(sc.id);
    const now = new Date().toISOString();
    try {
      await updateDoc(doc(db, 'seriousConcerns', sc.id), {
        status: nextStatus,
        lastChangedBy: `${adminRecord.displayName} (${adminRecord.role})`,
        updatedAt: now,
      });
      await writeAuditLog(
        'update_serious_concern',
        'seriousConcerns',
        sc.id,
        `Set private concern status to "${nextStatus}"`,
        sc.constituencyId
      );
      await sendCitizenNotification({
        recipientUid: sc.reporterUid,
        concernId: sc.id,
        title: 'Private Concern Update',
        body: `Your confidential report "${sc.title}" is now marked: ${nextStatus}.`,
        type: 'concern_update',
      });
      showToast(`Private concern marked "${nextStatus}".`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to update private concern.');
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleSavePointsConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!firebaseUser || adminRecord?.role !== 'super_admin') return;
    setSetupBusy(true);
    const nextConfig: PointsConfig = {
      verifiedReport: Math.max(0, Math.round(pointsVerifiedInput)),
      confirmedResolved: Math.max(0, Math.round(pointsResolvedInput)),
      upvote: 0,
    };
    try {
      await setDoc(doc(db, 'appConfig', 'settings'), {
        id: 'settings',
        demoMode,
        aiImageBlockingEnabled: false,
        pointsConfig: nextConfig,
        updatedByUid: firebaseUser.uid,
        updatedAt: new Date().toISOString(),
      });
      await writeAuditLog(
        'update_points_config',
        'appConfig',
        'settings',
        `Updated citizen points config: report=${nextConfig.verifiedReport}, confirmedResolved=${nextConfig.confirmedResolved}, upvote=0`
      );
      showToast('Citizen points rules saved.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save points rules.');
    } finally {
      setSetupBusy(false);
    }
  }

  function formatAuthError(err: unknown): string {
    const code = (err as { code?: string })?.code || '';
    if (code === 'auth/operation-not-allowed') {
      return 'Email/Password sign-in is disabled in Firebase Console. Please use "Sign in with Google" above, or enable Email/Password under Firebase Authentication > Sign-in method.';
    }
    if (code === 'auth/popup-blocked') {
      return 'Google sign-in popup was blocked by your browser. Please allow popups for this site and try again.';
    }
    if (code === 'auth/popup-closed-by-user') {
      return 'Sign-in popup was closed before completing login.';
    }
    if (code === 'auth/unauthorized-domain') {
      return 'This preview domain is not authorized in Firebase Console > Authentication > Settings > Authorized domains.';
    }
    return err instanceof Error ? err.message : 'Sign-in failed.';
  }

  async function handleGoogleSignIn() {
    setAuthError(null);
    setAuthBusy(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (err) {
      setAuthError(formatAuthError(err));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    setAuthBusy(true);
    try {
      await signInWithEmailAndPassword(auth, emailInput.trim(), passwordInput);
    } catch (err) {
      setAuthError(formatAuthError(err));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleBootstrapSuperAdmin() {
    if (!firebaseUser || !eligibleForBootstrap) return;
    setAuthBusy(true);
    setAuthError(null);
    try {
      const now = new Date().toISOString();
      const batch = writeBatch(db);
      batch.set(doc(db, 'appConfig', 'bootstrap'), {
        id: 'bootstrap',
        ownerUid: firebaseUser.uid,
        bootstrapCompleted: true,
        updatedAt: now,
      });
      const rec: AdminUserRecord = {
        uid: firebaseUser.uid,
        email: firebaseUser.email || '',
        displayName: firebaseUser.displayName || 'Super Admin',
        role: 'super_admin',
        invitedByUid: firebaseUser.uid,
        totpEnrolled: false,
        active: true,
        isDemo: false,
        createdAt: now,
        updatedAt: now,
      };
      batch.set(doc(db, 'admins', firebaseUser.uid), rec);
      await batch.commit();

      await setDoc(doc(db, 'appConfig', 'settings'), {
        id: 'settings',
        demoMode,
        aiImageBlockingEnabled: false,
        pointsConfig,
        updatedByUid: firebaseUser.uid,
        updatedAt: now,
      });
      setAdminRecord(rec);
      setEligibleForBootstrap(false);

      const token = await firebaseUser.getIdToken();
      const enteredWithGoogle = await tryGoogleDirectSession(firebaseUser, token);
      if (!enteredWithGoogle) {
        const totpResp = await fetch('/api/admin/totp/setup', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (totpResp.ok) {
          const data = (await totpResp.json()) as {
            qrDataUrl: string;
            manualKey: string;
            alreadyEnrolled: boolean;
          };
          setTotpQr(data.qrDataUrl);
          setTotpManualKey(data.manualKey);
          setTotpAlreadyEnrolled(data.alreadyEnrolled);
        }
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Bootstrap failed.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleVerifyTotp(e: React.FormEvent) {
    e.preventDefault();
    if (!firebaseUser) return;
    setTotpError(null);
    try {
      const token = await firebaseUser.getIdToken();
      const resp = await fetch('/api/admin/totp/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code: totpCodeInput }),
      });
      const data = (await resp.json()) as {
        verified?: boolean;
        step2Token?: string;
        error?: string;
      };
      if (!resp.ok || !data.verified || !data.step2Token) {
        throw new Error(data.error || 'Verification failed.');
      }
      sessionStorage.setItem('nagrik_admin_step2', data.step2Token);
      setStep2Token(data.step2Token);
      if (adminRecord && !adminRecord.totpEnrolled) {
        await updateDoc(doc(db, 'admins', firebaseUser.uid), {
          totpEnrolled: true,
          updatedAt: new Date().toISOString(),
        }).catch(() => null);
      }
    } catch (err) {
      setTotpError(err instanceof Error ? err.message : 'Invalid code.');
    }
  }

  async function handleSeedDemoData() {
    if (!firebaseUser || !step2Token || adminRecord?.role !== 'super_admin') return;
    setSetupBusy(true);
    try {
      const token = await firebaseUser.getIdToken();
      const now = new Date().toISOString();

      await setDoc(doc(db, 'appConfig', 'settings'), {
        id: 'settings',
        demoMode: true,
        aiImageBlockingEnabled: false,
        pointsConfig,
        updatedByUid: firebaseUser.uid,
        updatedAt: now,
      });

      const batch = writeBatch(db);
      for (const c of DEMO_CONSTITUENCIES) {
        batch.set(doc(db, 'constituencies', c.id), c);
      }
      for (const ag of DEMO_AGENCIES) {
        batch.set(doc(db, 'agencies', ag.id), ag);
      }
      await batch.commit();

      const accountsToCreate = [
        ...DEMO_CONSTITUENCIES.map((c) => ({
          email: c.mlaOfficeEmail,
          displayName: c.mlaName,
          role: 'mla_owner' as AdminRole,
          constituencyId: c.id,
          constituencyName: c.name,
        })),
        {
          email: 'cm-demo@example.com',
          displayName: 'Demo CM Office Staff',
          role: 'cm_office' as AdminRole,
          constituencyId: '',
          constituencyName: 'State CM Escalation Inbox [DEMO]',
        },
        {
          email: 'reviewer-demo@example.com',
          displayName: 'Demo Welfare Reviewer',
          role: 'welfare_reviewer' as AdminRole,
          constituencyId: '',
          constituencyName: 'Demo Social Welfare Dept',
        },
      ];

      const createdCreds: Array<{
        email: string;
        role: string;
        constituency: string;
        password: string;
      }> = [];

      const provResp = await fetch('/api/demo/provision-accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Admin-Step2-Token': step2Token,
        },
        body: JSON.stringify({
          accounts: accountsToCreate.map((a) => ({
            email: a.email,
            displayName: a.displayName,
          })),
        }),
      }).catch(() => null);

      const provData = provResp?.ok
        ? ((await provResp.json()) as {
            results?: Array<{
              email: string;
              uid?: string;
              oneTimePassword?: string;
              alreadyExists?: boolean;
              error?: string;
            }>;
          })
        : null;

      for (const resItem of provData?.results || []) {
        if (resItem.error) continue;
        const spec = accountsToCreate.find((a) => a.email === resItem.email);
        if (!spec || !resItem.uid) continue;

        const adminDoc: AdminUserRecord = {
          uid: resItem.uid,
          email: resItem.email,
          displayName: spec.displayName,
          role: spec.role,
          ...(spec.constituencyId
            ? { constituencyId: spec.constituencyId, constituencyName: spec.constituencyName }
            : {}),
          ...(spec.role === 'welfare_reviewer' ? { department: spec.constituencyName } : {}),
          invitedByUid: firebaseUser.uid,
          totpEnrolled: false,
          active: true,
          isDemo: true,
          createdAt: now,
          updatedAt: now,
        };
        await setDoc(doc(db, 'admins', resItem.uid), adminDoc);

        const logId = `dlog-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        await setDoc(doc(db, 'demoEmailLogs', logId), {
          id: logId,
          recipientEmail: resItem.email,
          subject: `Demo Account Created — ${spec.role}`,
          previewText: `Would have sent invite to ${resItem.email} for ${spec.constituencyName}`,
          relatedId: resItem.uid,
          createdAt: now,
        });

        if (resItem.oneTimePassword) {
          createdCreds.push({
            email: resItem.email,
            role: spec.role,
            constituency: spec.constituencyName,
            password: resItem.oneTimePassword,
          });
        }
      }

      setGeneratedCredsOnce(createdCreds);
      await writeAuditLog(
        'seed_demo_data',
        'constituencies',
        'demo-grid-9',
        'Seeded 9 constituencies and 5 civic agencies.'
      );
      showToast(
        createdCreds.length > 0
          ? '9 zones, 5 agencies & demo staff logins seeded! Save passwords below.'
          : 'Seeded 9 constituencies & 5 agencies cleanly! Citizens across Karnataka can report issues immediately.'
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Zone seeding failed.');
    } finally {
      setSetupBusy(false);
    }
  }

  async function handleDeleteDemoData() {
    if (adminRecord?.role !== 'super_admin') return;
    setSetupBusy(true);
    try {
      for (const colName of ['constituencies', 'agencies', 'complaints', 'admins', 'demoEmailLogs']) {
        const snap = await getDocs(collection(db, colName));
        for (const d of snap.docs) {
          const data = d.data() as { isDemo?: boolean; role?: string };
          if (colName === 'demoEmailLogs' || data.isDemo === true) {
            if (colName === 'admins' && d.id === firebaseUser?.uid) continue;
            await deleteDoc(doc(db, colName, d.id)).catch(() => null);
          }
        }
      }
      setGeneratedCredsOnce([]);
      await writeAuditLog(
        'delete_demo_data',
        'appConfig',
        'settings',
        'Deleted all DEMO records across constituencies, agencies, complaints, and demo accounts.'
      );
      showToast('All demo records deleted.');
    } finally {
      setSetupBusy(false);
    }
  }

  async function handleToggleDemoMode(nextDemo: boolean) {
    if (!firebaseUser || adminRecord?.role !== 'super_admin') return;
    await setDoc(doc(db, 'appConfig', 'settings'), {
      id: 'settings',
      demoMode: nextDemo,
      aiImageBlockingEnabled: false,
      pointsConfig,
      updatedByUid: firebaseUser.uid,
      updatedAt: new Date().toISOString(),
    });
    await writeAuditLog(
      'toggle_demo_mode',
      'appConfig',
      'settings',
      `Set demoMode=${nextDemo}`
    );
    showToast(nextDemo ? 'Switched to DEMO MODE' : 'Switched to Real Official Data mode');
  }

  async function handleInviteOfficial(e: React.FormEvent) {
    e.preventDefault();
    if (!firebaseUser || !step2Token || adminRecord?.role !== 'super_admin') return;
    setSetupBusy(true);
    try {
      let targetUid = inviteUid.trim();
      let targetEmail = inviteEmail.trim();

      if (!targetUid) {
        const token = await firebaseUser.getIdToken();
        const resp = await fetch('/api/admin/provision-account', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'X-Admin-Step2-Token': step2Token,
          },
          body: JSON.stringify({
            email: inviteEmail.trim(),
            displayName: inviteName.trim(),
            role: inviteRole,
            isDemo: false,
          }),
        });
        const data = (await resp.json()) as {
          uid?: string;
          email?: string;
          oneTimePassword?: string;
          code?: string;
          error?: string;
        };
        if (!resp.ok || !data.uid) {
          throw new Error(data.error || 'Invite failed');
        }
        targetUid = data.uid;
        targetEmail = data.email || targetEmail;
      }

      const selectedConst = constituencies.find((c) => c.id === inviteConstId);
      const now = new Date().toISOString();
      const adminDoc: AdminUserRecord = {
        uid: targetUid,
        email: targetEmail,
        displayName: inviteName.trim() || targetEmail,
        role: inviteRole,
        ...(selectedConst
          ? { constituencyId: selectedConst.id, constituencyName: selectedConst.name }
          : {}),
        ...(inviteDept.trim() ? { department: inviteDept.trim() } : {}),
        invitedByUid: firebaseUser.uid,
        totpEnrolled: false,
        active: true,
        isDemo: false,
        createdAt: now,
        updatedAt: now,
      };
      await setDoc(doc(db, 'admins', targetUid), adminDoc);
      await writeAuditLog(
        'invite_admin',
        'admins',
        targetUid,
        `Invited ${adminDoc.email} as ${inviteRole}`
      );
      const usedExistingUid = Boolean(inviteUid.trim());
      setInviteEmail('');
      setInviteName('');
      setInviteUid('');
      showToast(
        usedExistingUid
          ? `Authorized existing Google account ${adminDoc.email} (${inviteRole}).`
          : `Invited ${adminDoc.email}. Verification & password reset emails sent.`
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to invite account.');
    } finally {
      setSetupBusy(false);
    }
  }

  async function handleImportConstituencies() {
    if (adminRecord?.role !== 'super_admin' || !importText.trim()) return;
    setSetupBusy(true);
    try {
      const now = new Date().toISOString();
      const trimmed = importText.trim();
      const imported: ConstituencyBoundary[] = [];

      if (trimmed.startsWith('{')) {
        const gj = JSON.parse(trimmed) as {
          features?: Array<{
            properties?: Record<string, string>;
            geometry?: { type?: string; coordinates?: number[][][] };
          }>;
        };
        for (const [idx, feat] of (gj.features || []).entries()) {
          const ring = feat.geometry?.coordinates?.[0] || [];
          if (ring.length < 3) continue;
          const lats = ring.map((p) => p[1]);
          const lngs = ring.map((p) => p[0]);
          const props = feat.properties || {};
          const id = `const-${Date.now()}-${idx}`;
          imported.push({
            id,
            name: props.name || props.CONSTITUENCY || `Constituency ${idx + 1}`,
            code: props.code || `BLR-${idx + 1}`,
            bounds: {
              south: Math.min(...lats),
              west: Math.min(...lngs),
              north: Math.max(...lats),
              east: Math.max(...lngs),
            },
            polygon: ring.map((p) => [p[0], p[1]]),
            mlaName: props.mlaName || 'Official MLA Office',
            mlaOfficeEmail: props.mlaOfficeEmail || `office-${idx + 1}@example.com`,
            officeContactNote: props.officeContactNote || 'Imported GeoJSON boundary',
            lastVerifiedDate: props.lastVerifiedDate || now.slice(0, 10),
            isDemo: false,
            updatedAt: now,
          });
        }
      } else {
        // CSV: name,code,south,west,north,east,mlaName,mlaOfficeEmail,lastVerifiedDate
        const lines = trimmed.split(/\r?\n/).filter(Boolean);
        for (const [idx, line] of lines.entries()) {
          if (idx === 0 && line.toLowerCase().includes('south')) continue;
          const cols = line.split(',').map((s) => s.trim());
          if (cols.length < 8) continue;
          const id = `const-${Date.now()}-${idx}`;
          imported.push({
            id,
            name: cols[0],
            code: cols[1],
            bounds: {
              south: Number(cols[2]),
              west: Number(cols[3]),
              north: Number(cols[4]),
              east: Number(cols[5]),
            },
            mlaName: cols[6],
            mlaOfficeEmail: cols[7],
            officeContactNote: 'Imported CSV constituency',
            lastVerifiedDate: cols[8] || now.slice(0, 10),
            isDemo: false,
            updatedAt: now,
          });
        }
      }

      if (imported.length === 0) {
        throw new Error('No valid GeoJSON features or CSV rows detected.');
      }

      const batch = writeBatch(db);
      for (const c of imported) {
        batch.set(doc(db, 'constituencies', c.id), c);
      }
      await batch.commit();
      await writeAuditLog(
        'import_constituencies',
        'constituencies',
        'batch',
        `Imported ${imported.length} constituency boundaries`
      );
      setImportText('');
      showToast(`Imported ${imported.length} constituencies successfully.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setSetupBusy(false);
    }
  }

  // ---------------------------------------------------------------------------
  // RENDER AUTH / BOOTSTRAP / 2-STEP TOTP GATE
  // ---------------------------------------------------------------------------
  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F4F6F9] text-sm font-semibold text-[#0F2942]">
        Loading Staff Portal...
      </div>
    );
  }

  if (!firebaseUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F4F6F9] p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-lg space-y-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0F2942] text-white">
              <Shield className="h-6 w-6 text-[#E67E22]" />
            </div>
            <div>
              <h1 className="font-display text-xl font-extrabold text-[#0F2942]">
                Namma Dhwani Staff Portal
              </h1>
              <p className="text-xs text-slate-600">
                MLA Offices, CM Office, Department Reviewers &amp; Super Admin
              </p>
            </div>
          </div>

          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-700">
            Accounts are created strictly by the Super Admin. Public signup is disabled.
          </div>

          {authError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-900">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          <button
            type="button"
            disabled={authBusy}
            onClick={() => void handleGoogleSignIn()}
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
            <span>{authBusy ? 'Signing in...' : 'Sign in with Google'}</span>
          </button>

          <details className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <summary className="cursor-pointer text-xs font-semibold text-slate-600 select-none">
              Or sign in with Official Email &amp; Password (if enabled)
            </summary>
            <div className="mt-3 space-y-3">
              <form onSubmit={(e) => void handleSignIn(e)} className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold">Official Email</label>
                  <input
                    type="email"
                    required
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">Password</label>
                  <input
                    type="password"
                    required
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={authBusy}
                  className="w-full rounded-xl bg-[#0F2942] py-2.5 text-sm font-bold text-white hover:bg-[#173A5E]"
                >
                  {authBusy ? 'Signing in...' : 'Sign in with Email & Password'}
                </button>
              </form>

              <button
                type="button"
                onClick={() => {
                  if (!emailInput.trim()) {
                    setAuthError('Enter your official email first to reset password.');
                    return;
                  }
                  void sendPasswordResetEmail(auth, emailInput.trim())
                    .then(() => showToast('Password reset email sent.'))
                    .catch((e) => setAuthError(formatAuthError(e)));
                }}
                className="text-xs font-semibold text-[#0F2942] underline"
              >
                Forgot password?
              </button>
            </div>
          </details>
        </div>
      </div>
    );
  }

  // Signed in to Firebase, but not in admins/{uid}
  if (!adminRecord) {
    const firebaseRulesUrl = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/firestore/databases/${firebaseConfig.firestoreDatabaseId || '(default)'}/rules`;
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F4F6F9] p-4">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-lg space-y-4">
          <h1 className="font-display text-lg font-bold text-[#0F2942]">
            Staff Authorization Check
          </h1>
          <div className="space-y-1.5 text-xs text-slate-600">
            <p>
              Signed in as <strong>{firebaseUser.email}</strong> (Email verified:{' '}
              <strong>{firebaseUser.emailVerified ? 'Yes' : 'No'}</strong>)
            </p>
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
              <span className="text-[11px] font-semibold text-slate-500">User UID:</span>
              <code className="font-mono-num text-[11px] text-[#0F2942] break-all">
                {firebaseUser.uid}
              </code>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(firebaseUser.uid).then(() => {
                    setCopiedUid(true);
                    setTimeout(() => setCopiedUid(false), 2500);
                  });
                }}
                className="ml-auto inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
              >
                {copiedUid ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-600" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span>Copy UID</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {firestoreRulesBlocked && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950 space-y-2">
              <div className="flex items-center gap-1.5 font-bold">
                <ShieldAlert className="h-4 w-4 text-amber-700 shrink-0" />
                <span>Firestore Security Rules Not Published Yet</span>
              </div>
              <p>
                Firestore denied access (<code>permission-denied</code>) on database{' '}
                <code>{firebaseConfig.firestoreDatabaseId || '(default)'}</code> in project{' '}
                <code>{firebaseConfig.projectId}</code>. New Cloud Firestore databases block all
                reads and writes until <code>firestore.rules</code> is published.
              </p>
              <ol className="list-decimal pl-4 space-y-1">
                <li>Open Firebase Console Firestore Rules for this database.</li>
                <li>
                  Paste the contents of <code>firestore.rules</code> from the repository and click{' '}
                  <strong>Publish</strong>.
                </li>
                <li>
                  Return here and click <strong>Re-check Authorization</strong>.
                </li>
              </ol>
              <a
                href={firebaseRulesUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F2942] px-3 py-2 text-xs font-bold text-white hover:bg-[#173A5E]"
              >
                <span>Open Firestore Rules in Firebase Console</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          )}

          {!bootstrapDone && eligibleForBootstrap ? (
            <div className="space-y-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm">
              <div className="font-bold text-[#15803D]">
                First Super Admin Environment Match Confirmed
              </div>
              <p className="text-xs text-slate-700">
                Your verified email matches <code>SUPER_ADMIN_EMAIL</code>. Complete one-time
                initialization below.
              </p>
              <button
                type="button"
                disabled={authBusy || firestoreRulesBlocked}
                onClick={() => void handleBootstrapSuperAdmin()}
                className="w-full rounded-xl bg-[#0F2942] py-3 text-sm font-bold text-white disabled:opacity-50"
              >
                Initialize Super Admin Portal
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-900 space-y-2">
              <div className="font-bold">Access not authorized</div>
              <p>
                {!superAdminEnvConfigured && !bootstrapDone
                  ? `SUPER_ADMIN_EMAIL environment variable is not configured on the server yet. Set SUPER_ADMIN_EMAIL=${firebaseUser.email || 'your-email'} in your environment/secrets and restart the server.`
                  : !bootstrapDone && bootstrapReason === 'EMAIL_MISMATCH'
                    ? `Signed-in email (${firebaseUser.email}) does not match the server's SUPER_ADMIN_EMAIL${bootstrapHint.length > 0 ? ` (${bootstrapHint.join(', ')})` : ''}. Update SUPER_ADMIN_EMAIL in your environment/secrets, sign in with that Super Admin email, or ask your Super Admin to invite this account using your User UID above.`
                    : !bootstrapDone && bootstrapReason && bootstrapReason !== 'EMAIL_NOT_VERIFIED'
                      ? `Authorization check failed: ${bootstrapReason}`
                      : !bootstrapDone
                        ? 'Your email must be verified and match the configured SUPER_ADMIN_EMAIL.'
                        : 'No active admin invitation exists for this account yet. Ask your Super Admin to invite your official email (or pass your User UID above if you already signed in with Google).'}
              </p>
            </div>
          )}

          {authError && <div className="text-xs text-red-700">{authError}</div>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void runBootstrapCheck(firebaseUser)}
              className="flex-1 rounded-lg bg-[#0F2942] py-2.5 text-xs font-bold text-white"
            >
              Re-check Authorization
            </button>
            <button
              type="button"
              onClick={() => void signOut(auth)}
              className="flex-1 rounded-lg border border-slate-300 py-2.5 text-xs font-bold text-slate-700"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step 2: Genuine 6-digit TOTP Authenticator Gate
  if (!step2Token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F4F6F9] p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-lg space-y-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-[#E67E22]" />
            <h1 className="font-display text-lg font-extrabold text-[#0F2942]">
              Step 2: Authenticator Verification
            </h1>
          </div>

          <p className="text-xs text-slate-600">
            Role: <strong>{adminRecord.role}</strong> · {adminRecord.email}
          </p>

          {firebaseUser.providerData.some((p) => p.providerId === 'google.com') && (
            <button
              type="button"
              onClick={() => void tryGoogleDirectSession(firebaseUser)}
              className="w-full rounded-xl bg-[#15803D] py-3 text-sm font-bold text-white hover:bg-[#166534]"
            >
              Enter Admin Portal with Verified Google Sign-In
            </button>
          )}

          {!totpAlreadyEnrolled && totpQr && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center space-y-2">
              <div className="text-xs font-semibold text-[#0F2942]">
                Scan with Google Authenticator or any TOTP app:
              </div>
              <img src={totpQr} alt="TOTP Setup QR Code" className="mx-auto rounded-lg border" />
              <div className="text-[11px] font-mono-num break-all text-slate-600">
                Secret: {totpManualKey}
              </div>
            </div>
          )}

          {totpError && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-2.5 text-xs text-red-900">
              {totpError}
            </div>
          )}

          <form onSubmit={(e) => void handleVerifyTotp(e)} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold">
                6-digit Authenticator Code
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                value={totpCodeInput}
                onChange={(e) => setTotpCodeInput(e.target.value)}
                placeholder="123456"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-center font-mono-num text-lg tracking-widest"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-xl bg-[#0F2942] py-3 text-sm font-bold text-white"
            >
              Verify &amp; Enter Portal
            </button>
          </form>

          <button
            type="button"
            onClick={() => void signOut(auth)}
            className="w-full text-xs font-semibold text-slate-500 underline"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // AUTHENTICATED ADMIN WORKSPACE (INBOX, HIGH EMERGENCY, MAP, CONCERNS, SETUP)
  // ---------------------------------------------------------------------------
  const pendingWelfareClaimsCount = benefitClaims.filter((c) => c.status === 'Claimed').length;
  const visibleTabs: Array<{
    id: AdminTab;
    label: string;
    Icon: React.ElementType;
    badge?: number;
  }> = [
    { id: 'inbox', label: 'Inbox', Icon: Inbox },
    {
      id: 'emergency',
      label: 'High Emergency',
      Icon: Flame,
      badge: emergencyComplaints.length,
    },
    { id: 'map', label: 'Map', Icon: MapIcon },
    { id: 'concerns', label: 'Serious Concerns', Icon: Lock },
    ...(adminRecord.role === 'super_admin' || adminRecord.role === 'welfare_reviewer'
      ? [
          {
            id: 'welfare' as const,
            label: 'Welfare Claims',
            Icon: HeartHandshake,
            badge: pendingWelfareClaimsCount,
          },
        ]
      : []),
    ...(adminRecord.role === 'super_admin'
      ? [{ id: 'setup' as const, label: 'Setup', Icon: Settings }]
      : []),
  ];

  function renderComplaintCard(c: Complaint, options?: { emergencyMode?: boolean }) {
    const st = STATUS_COLORS[c.status] || STATUS_COLORS.Reported;
    const demand = getCommunityDemandInfo(c);
    const isPanelOpen = actionPanel?.complaintId === c.id;
    const isBusy = actionBusyId === c.id;
    const isAiBusy = aiBackgroundBusyId === c.id || c.aiBackgroundStatus === 'pending';
    const isClosedOrResolved =
      c.status === 'CONFIRMED RESOLVED' || c.status === 'Rejected';
    const isCitizenUpvotedEmergency = !isClosedOrResolved && c.upvoteCount >= 1;
    const isEmergencyHighlighted = Boolean(options?.emergencyMode) || isCitizenUpvotedEmergency;

    return (
      <div
        id={`admin-complaint-${c.id}`}
        key={c.id}
        className={`rounded-2xl p-4 shadow-sm space-y-3 ${
          isEmergencyHighlighted
            ? c.upvoteCount >= 5 || options?.emergencyMode
              ? 'border-2 border-red-600 bg-red-50/45'
              : 'border-2 border-red-500 bg-red-50/30'
            : 'border border-slate-200 bg-white'
        }`}
      >
        {isEmergencyHighlighted && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-300 bg-red-600 px-3 py-2 text-xs font-extrabold text-white">
            <div className="flex items-center gap-2">
              <Flame className="h-4 w-4 shrink-0 text-white" />
              <span>
                {c.upvoteCount >= 5
                  ? `HIGH EMERGENCY · CRITICAL (${c.upvoteCount} CITIZEN UPVOTES — RESOLVE FIRST)`
                  : `HIGH EMERGENCY · CITIZEN UPVOTED (${c.upvoteCount} ${c.upvoteCount === 1 ? 'CITIZEN LIKE' : 'CITIZEN UPVOTES'})`}
              </span>
            </div>
            <span className="font-mono-num rounded bg-red-900/60 px-2 py-0.5 text-[11px] font-bold">
              +{c.upvoteCount} Upvotes · Urgent Queue
            </span>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded border px-2 py-0.5 text-xs font-bold ${st.bg} ${st.text} ${st.border}`}
            >
              {st.label}
            </span>
            {!isClosedOrResolved && demand.tier === 'serious' && (
              <span className="inline-flex items-center gap-1 rounded border border-red-300 bg-red-100 px-2 py-0.5 text-[11px] font-extrabold text-red-900">
                <AlertTriangle className="h-3 w-3 text-red-600" />
                {demand.label}
              </span>
            )}
            {!isClosedOrResolved && demand.tier === 'elevated' && (
              <span className="inline-flex items-center gap-1 rounded border border-red-300 bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-900">
                {demand.label}
              </span>
            )}
            <span className="font-mono-num text-xs font-bold text-[#0F2942]">
              Priority {c.priorityScore}/100 ({c.severity})
            </span>
            <span className="font-mono-num rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
              Auto-Triage Priority {demand.adminTriageScore}
            </span>
            <span className="text-xs text-slate-500">· {c.category}</span>
            {c.escalatedToCm && (
              <span className="rounded bg-purple-100 border border-purple-300 px-2 py-0.5 text-[11px] font-bold text-purple-900">
                Escalated to CM
              </span>
            )}
            {c.forwardedAgencyName && (
              <span className="rounded bg-blue-50 border border-blue-200 px-2 py-0.5 text-[11px] font-semibold text-blue-900">
                {c.forwardedAgencyName}
              </span>
            )}
          </div>
          <span className="text-xs font-medium text-slate-500">
            {c.constituencyName} · {c.localityName}
          </span>
        </div>

        <div className="font-display text-base font-bold text-[#0F2942]">
          {c.title}
        </div>
        <p className="text-sm text-slate-700">
          {c.englishTranslation || c.description}
        </p>

        {c.originalLanguage !== 'en' && c.originalText && (
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-1.5 text-xs text-slate-600">
            <strong>Original ({c.originalLanguage.toUpperCase()}):</strong>{' '}
            {c.originalText}
          </div>
        )}

        {(c.photoDataUrl || c.afterPhotoDataUrl) && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {c.photoDataUrl && (
              <div>
                <div className="mb-1 text-[11px] font-bold uppercase text-slate-500">
                  Citizen Before Photo
                </div>
                <img
                  src={c.photoDataUrl}
                  alt="Citizen issue"
                  className="max-h-40 w-full rounded-lg object-cover border border-slate-200"
                />
              </div>
            )}
            {c.afterPhotoDataUrl && (
              <div>
                <div className="mb-1 text-[11px] font-bold uppercase text-emerald-700">
                  Office After-Repair Photo
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

        {/* Background AI outputs (always labeled "AI suggestion") */}
        {(isAiBusy || c.aiFixAssessment || c.aiDraftReply || c.aiCommunityBrief) && (
          <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-amber-950">
              <Sparkles className="h-3.5 w-3.5 text-[#E67E22]" />
              <span>AI suggestion (Background intelligence)</span>
              {isAiBusy && (
                <span className="ml-1 rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                  Running in background...
                </span>
              )}
            </div>
            {c.aiFixAssessment && (
              <div className="text-slate-800">
                <strong>Repair check ({c.aiFixAssessment.verdict}):</strong>{' '}
                {c.aiFixAssessment.summary}
              </div>
            )}
            {c.aiCommunityBrief && (
              <div className="text-slate-800">
                <strong>Community upvote brief:</strong> {c.aiCommunityBrief}
              </div>
            )}
            {c.aiDraftReply && (
              <div className="text-slate-700">
                <strong>Draft citizen update:</strong> {c.aiDraftReply}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <div>
            Reporter: {c.isAnonymous ? 'Anonymous' : c.reporterDisplayName} ·{' '}
            {c.shareContactConsent
              ? 'Contact consent granted'
              : 'Contact minimized (DPDP)'}{' '}
            ·{' '}
            <span
              className={`font-mono-num font-bold ${
                isCitizenUpvotedEmergency ? 'text-red-700' : 'text-slate-600'
              }`}
            >
              Citizen Upvotes: {c.upvoteCount}
            </span>
          </div>
          <div className="font-mono-num">
            Updated {new Date(c.updatedAt).toLocaleString()}
          </div>
        </div>

        {/* Official Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          {(c.status === 'Reported' || c.status === 'Reopened') && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() =>
                void handleStatusTransition(
                  c,
                  'Acknowledged',
                  'Report acknowledged by assigned office.'
                )
              }
              className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-900 hover:bg-blue-100 disabled:opacity-50"
            >
              Acknowledge
            </button>
          )}

          {c.status !== 'In progress' && !isClosedOrResolved && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() =>
                void handleStatusTransition(
                  c,
                  'In progress',
                  'Field inspection and repair work in progress.'
                )
              }
              className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
            >
              Mark In Progress
            </button>
          )}

          {!isClosedOrResolved && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => {
                setAfterPhotoDataUrl(c.afterPhotoDataUrl || '');
                setResolveNote('');
                setActionPanel(
                  isPanelOpen && actionPanel?.mode === 'resolve'
                    ? null
                    : { complaintId: c.id, mode: 'resolve' }
                );
              }}
              className="inline-flex items-center gap-1 rounded-lg bg-[#15803D] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>
                {c.status === 'Fixed, awaiting confirmation'
                  ? 'Update Fixed Photo & Re-notify'
                  : 'Resolve Issue (Upload Fixed Photo)'}
              </span>
            </button>
          )}

          {!isClosedOrResolved && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => {
                setSelectedAgencyId(agencies[0]?.id || '');
                setActionPanel(
                  isPanelOpen && actionPanel?.mode === 'forward'
                    ? null
                    : { complaintId: c.id, mode: 'forward' }
                );
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-[#0F2942] hover:bg-slate-50"
            >
              <Send className="h-3.5 w-3.5 text-[#E67E22]" />
              <span>Forward Agency</span>
            </button>
          )}

          <button
            type="button"
            disabled={isAiBusy}
            onClick={() => void handleBackgroundAiDraft(c)}
            className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-950 hover:bg-amber-100 disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5 text-[#E67E22]" />
            <span>{isAiBusy ? 'AI Running...' : 'AI Draft Reply'}</span>
          </button>

          {!c.escalatedToCm &&
            adminRecord?.role !== 'cm_office' &&
            !isClosedOrResolved && (
              <button
                type="button"
                disabled={isBusy}
                onClick={() => {
                  setEscalateReason('');
                  setActionPanel(
                    isPanelOpen && actionPanel?.mode === 'escalate'
                      ? null
                      : { complaintId: c.id, mode: 'escalate' }
                  );
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-purple-300 bg-purple-50 px-3 py-1.5 text-xs font-bold text-purple-900 hover:bg-purple-100"
              >
                <ArrowUpRight className="h-3.5 w-3.5" />
                <span>Escalate to CM</span>
              </button>
            )}

          {!isClosedOrResolved && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => {
                setRejectReason('');
                setActionPanel(
                  isPanelOpen && actionPanel?.mode === 'reject'
                    ? null
                    : { complaintId: c.id, mode: 'reject' }
                );
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-800 hover:bg-red-100"
            >
              <XCircle className="h-3.5 w-3.5" />
              <span>Reject</span>
            </button>
          )}
        </div>

        {/* Inline Action Panels */}
        {isPanelOpen && actionPanel?.mode === 'resolve' && (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3.5 space-y-3">
            <div className="text-xs font-bold text-[#0F2942]">
              Upload After-Repair Photo &amp; Send for Citizen Verification
            </div>
            <p className="text-[11px] text-slate-700">
              Sets status to <strong>Fixed, awaiting confirmation</strong>, notifies
              both the reporter and all <strong>{c.upvoteCount}</strong> upvoter(s)
              with a direct link to verify the photo, and runs AI repair comparison
              in the background. Only citizen verification turns it green (CONFIRMED
              RESOLVED) &amp; awards citizen points.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-emerald-400 bg-white px-3 py-2 text-xs font-bold text-[#0F2942]">
                <Camera className="h-4 w-4 text-[#15803D]" />
                <span>
                  {afterPhotoDataUrl ? 'Change After Photo' : 'Attach After Photo'}
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      void compressAfterPhoto(f)
                        .then(setAfterPhotoDataUrl)
                        .catch((err) =>
                          showToast(
                            err instanceof Error ? err.message : 'Invalid photo'
                          )
                        );
                    }
                  }}
                />
              </label>
              {afterPhotoDataUrl && (
                <img
                  src={afterPhotoDataUrl}
                  alt="After preview"
                  className="h-14 w-20 rounded object-cover border border-emerald-300"
                />
              )}
            </div>
            <input
              type="text"
              value={resolveNote}
              onChange={(e) => setResolveNote(e.target.value)}
              placeholder="Repair note for citizen (e.g. Road resurfaced & inspected)"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void handleResolveAwaitingConfirmation(c)}
                className="rounded-lg bg-[#15803D] px-4 py-2 text-xs font-bold text-white"
              >
                {isBusy ? 'Saving...' : 'Mark Fixed & Notify Citizen'}
              </button>
              <button
                type="button"
                onClick={() => setActionPanel(null)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {isPanelOpen && actionPanel?.mode === 'forward' && (
          <div className="rounded-xl border border-slate-300 bg-slate-50 p-3.5 space-y-2.5">
            <div className="text-xs font-bold text-[#0F2942]">
              Forward to Civic Agency
            </div>
            {agencies.length === 0 ? (
              <div className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                No civic agencies configured yet. Seed Demo Data or import agencies
                in the Setup tab first.
              </div>
            ) : (
              <select
                value={selectedAgencyId}
                onChange={(e) => setSelectedAgencyId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
              >
                <option value="">Select Agency...</option>
                {agencies.map((ag) => (
                  <option key={ag.id} value={ag.id}>
                    {ag.name} ({ag.officialEmail})
                  </option>
                ))}
              </select>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={isBusy || !selectedAgencyId}
                onClick={() => void handleForwardToAgency(c)}
                className="rounded-lg bg-[#0F2942] px-4 py-2 text-xs font-bold text-white disabled:opacity-40"
              >
                Confirm Forward
              </button>
              <button
                type="button"
                onClick={() => setActionPanel(null)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {isPanelOpen && actionPanel?.mode === 'escalate' && (
          <div className="rounded-xl border border-purple-300 bg-purple-50 p-3.5 space-y-2.5">
            <div className="text-xs font-bold text-purple-950">
              Escalate to CM Office
            </div>
            <input
              type="text"
              value={escalateReason}
              onChange={(e) => setEscalateReason(e.target.value)}
              placeholder="Reason for escalating to CM Office..."
              className="w-full rounded-lg border border-purple-300 bg-white px-3 py-2 text-xs"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={isBusy || !escalateReason.trim()}
                onClick={() => void handleEscalateToCm(c)}
                className="rounded-lg bg-purple-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-40"
              >
                Confirm Escalation
              </button>
              <button
                type="button"
                onClick={() => setActionPanel(null)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {isPanelOpen && actionPanel?.mode === 'reject' && (
          <div className="rounded-xl border border-red-300 bg-red-50 p-3.5 space-y-2.5">
            <div className="text-xs font-bold text-red-950">
              Reject Report (Citizen will be notified)
            </div>
            <input
              type="text"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Official reason for rejection..."
              className="w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-xs"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={isBusy || !rejectReason.trim()}
                onClick={() => void handleRejectComplaint(c)}
                className="rounded-lg bg-red-800 px-4 py-2 text-xs font-bold text-white disabled:opacity-40"
              >
                Confirm Rejection
              </button>
              <button
                type="button"
                onClick={() => setActionPanel(null)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F6F9] text-[#0F2942]">
      {demoMode && (
        <div className="bg-amber-100 border-b border-amber-300 px-4 py-1.5 text-center text-xs font-bold text-amber-950">
          DEMO MODE — Fictional grid boundaries, Demo Member offices, and @example.com test
          accounts active
        </div>
      )}

      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0F2942] text-white">
              <Shield className="h-5 w-5 text-[#E67E22]" />
            </div>
            <div>
              <div className="font-display text-base font-extrabold text-[#0F2942]">
                Namma Dhwani Official Portal
              </div>
              <div className="text-xs text-slate-600">
                {adminRecord.displayName} · <strong>{adminRecord.role}</strong>
                {adminRecord.constituencyName ? ` · ${adminRecord.constituencyName}` : ''}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto">
            {visibleTabs.map(({ id, label, Icon, badge }) => {
              const isEmergencyTab = id === 'emergency';
              const isActive = activeTab === id;
              const hasEmergencyItems = isEmergencyTab && (badge || 0) > 0;

              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={`inline-flex shrink-0 whitespace-nowrap items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold ${
                    isEmergencyTab
                      ? isActive
                        ? 'bg-red-600 text-white'
                        : hasEmergencyItems
                          ? 'border border-red-400 bg-red-50 text-red-900 hover:bg-red-100'
                          : 'bg-white text-red-700 hover:bg-red-50'
                      : isActive
                        ? 'bg-[#0F2942] text-white'
                        : 'bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{label}</span>
                  {typeof badge === 'number' && badge > 0 && (
                    <span
                      className={`font-mono-num rounded px-1.5 py-0.5 text-[11px] font-extrabold ${
                        isEmergencyTab
                          ? isActive
                            ? 'bg-white text-red-700'
                            : 'bg-red-600 text-white'
                          : isActive
                            ? 'bg-white text-[#0F2942]'
                            : 'bg-[#E67E22] text-white'
                      }`}
                    >
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => void signOut(auth)}
              className="ml-2 inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </header>

      {toast && (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-50 max-w-md rounded-xl border border-white/20 bg-[#0F2942] px-4 py-3 text-sm font-medium text-white shadow-2xl"
        >
          {toast}
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 py-6 space-y-5">
        {/* DEDICATED HIGH EMERGENCY TAB (All Open Citizen-Upvoted Issues Styled in Red Urgency) */}
        {activeTab === 'emergency' && (() => {
          const criticalEmergencyCount = emergencyComplaints.filter(
            (c) => c.upvoteCount >= 5
          ).length;
          const totalUpvotesAcrossQueue = emergencyComplaints.reduce(
            (acc, c) => acc + c.upvoteCount,
            0
          );
          const awaitingCheckCount = emergencyComplaints.filter(
            (c) => c.status === 'Fixed, awaiting confirmation'
          ).length;
          const actionNeededCount = emergencyComplaints.length - awaitingCheckCount;
          const filteredEmergency = emergencyComplaints.filter((c) => {
            if (emergencyFilter === 'CRITICAL') return c.upvoteCount >= 5;
            if (emergencyFilter === 'ACTION_NEEDED') {
              return c.status !== 'Fixed, awaiting confirmation';
            }
            if (emergencyFilter === 'AWAITING_CHECK') {
              return c.status === 'Fixed, awaiting confirmation';
            }
            return true;
          });
          const topEmergency = emergencyComplaints[0];

          return (
            <section className="space-y-4">
              <div className="rounded-2xl border-2 border-red-600 bg-red-50 p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-2 rounded bg-red-600 px-2.5 py-1 text-xs font-extrabold uppercase tracking-wide text-white">
                      <Flame className="h-4 w-4 shrink-0" />
                      <span>High Emergency Priority Queue</span>
                    </div>
                    <h1 className="font-display text-xl font-extrabold text-red-950">
                      Citizen-Upvoted Complaints Requiring Immediate Resolution
                    </h1>
                    <p className="text-xs text-red-900 max-w-2xl">
                      As soon as citizens upvote or like any complaint, it enters this red High
                      Emergency section automatically. Highest-upvoted issues stay pinned at the
                      top until repaired and verified.
                    </p>
                  </div>

                  {topEmergency && (
                    <button
                      type="button"
                      onClick={() => {
                        setAfterPhotoDataUrl(topEmergency.afterPhotoDataUrl || '');
                        setResolveNote('');
                        setActionPanel({ complaintId: topEmergency.id, mode: 'resolve' });
                        setTimeout(() => {
                          document
                            .getElementById(`admin-complaint-${topEmergency.id}`)
                            ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }, 80);
                      }}
                      className="shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 rounded-xl bg-red-700 px-4 py-2.5 text-xs font-extrabold text-white hover:bg-red-800"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Resolve #1 Emergency ({topEmergency.upvoteCount} Upvotes)</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 border-t border-red-200 pt-3">
                  <div className="rounded-xl border border-red-200 bg-white px-3 py-2.5">
                    <div className="text-[11px] font-bold uppercase text-red-700">
                      High Emergency Queue
                    </div>
                    <div className="font-mono-num text-xl font-extrabold text-red-950">
                      {emergencyComplaints.length}
                    </div>
                  </div>
                  <div className="rounded-xl border border-red-200 bg-white px-3 py-2.5">
                    <div className="text-[11px] font-bold uppercase text-red-700">
                      Needs Field Fix
                    </div>
                    <div className="font-mono-num text-xl font-extrabold text-red-950">
                      {actionNeededCount}
                    </div>
                  </div>
                  <div className="rounded-xl border border-red-200 bg-white px-3 py-2.5">
                    <div className="text-[11px] font-bold uppercase text-red-700">
                      Critical (5+ Upvotes)
                    </div>
                    <div className="font-mono-num text-xl font-extrabold text-red-950">
                      {criticalEmergencyCount}
                    </div>
                  </div>
                  <div className="rounded-xl border border-red-200 bg-white px-3 py-2.5">
                    <div className="text-[11px] font-bold uppercase text-red-700">
                      Total Citizen Upvotes
                    </div>
                    <div className="font-mono-num text-xl font-extrabold text-red-950">
                      {totalUpvotesAcrossQueue}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-red-200 pt-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {(
                      [
                        { key: 'ALL', label: `All High Emergency (${emergencyComplaints.length})` },
                        { key: 'ACTION_NEEDED', label: `Needs Action (${actionNeededCount})` },
                        { key: 'CRITICAL', label: `Critical 5+ Upvotes (${criticalEmergencyCount})` },
                        { key: 'AWAITING_CHECK', label: `Awaiting Citizen Check (${awaitingCheckCount})` },
                      ] as const
                    ).map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => setEmergencyFilter(f.key)}
                        className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold ${
                          emergencyFilter === f.key
                            ? 'bg-red-700 text-white'
                            : 'border border-red-300 bg-white text-red-900 hover:bg-red-100'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <span className="font-mono-num text-xs font-bold text-red-900">
                    {filteredEmergency.length} shown
                  </span>
                </div>
              </div>

              {filteredEmergency.length === 0 ? (
                <div className="rounded-2xl border border-red-200 bg-white p-8 text-center space-y-3">
                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-red-600">
                    <Flame className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-bold text-[#0F2942]">
                    {emergencyComplaints.length === 0
                      ? 'No citizen-upvoted emergency issues right now.'
                      : 'No emergency issues match this filter.'}
                  </p>
                  <p className="text-xs text-slate-600 max-w-md mx-auto">
                    Whenever a citizen upvotes or likes an open complaint in Namma Dhwani, it
                    immediately appears here in red High Emergency urgency so your team resolves
                    it first.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (emergencyComplaints.length > 0) {
                        setEmergencyFilter('ALL');
                      } else {
                        setActiveTab('inbox');
                      }
                    }}
                    className="rounded-xl bg-[#0F2942] px-4 py-2 text-xs font-bold text-white hover:bg-[#173A5E]"
                  >
                    {emergencyComplaints.length > 0
                      ? 'Show All High Emergency Issues'
                      : 'View All Inbox Reports'}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredEmergency.map((c) => renderComplaintCard(c, { emergencyMode: true }))}
                </div>
              )}
            </section>
          );
        })()}

        {/* INBOX TAB (Constituency-Isolated & Auto-Prioritized by Community Upvotes) */}
        {activeTab === 'inbox' && (() => {
          const criticalUrgentCount = emergencyComplaints.filter(
            (c) => c.upvoteCount >= 5
          ).length;
          const topPriorityIssue = emergencyComplaints[0];

          const filteredInbox = scopedComplaints.filter((c) => {
            if (statusFilter === 'ALL') return true;
            if (statusFilter === 'ESCALATED') return c.escalatedToCm;
            if (statusFilter === 'HIGH_EMERGENCY') {
              return (
                c.status !== 'CONFIRMED RESOLVED' &&
                c.status !== 'Rejected' &&
                c.upvoteCount >= 1
              );
            }
            if (statusFilter === 'HIGH_DEMAND') {
              return (
                c.status !== 'CONFIRMED RESOLVED' &&
                c.status !== 'Rejected' &&
                getCommunityDemandInfo(c).tier !== 'standard'
              );
            }
            return c.status === statusFilter;
          });

          return (
          <section className="space-y-4">
            {emergencyComplaints.length > 0 && topPriorityIssue && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-red-600 bg-red-50 px-4 py-3.5 text-xs text-red-950 shadow-sm">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-extrabold text-sm text-red-900">
                    <Flame className="h-4 w-4 shrink-0 text-red-600" />
                    <span>
                      HIGH EMERGENCY ALERT — {emergencyComplaints.length} citizen-upvoted issue(s)
                      must be resolved first!
                    </span>
                  </div>
                  <div className="text-xs text-red-900">
                    #1 Top Emergency: <strong>{topPriorityIssue.title}</strong> (
                    <strong className="font-mono-num">
                      {topPriorityIssue.upvoteCount} citizen{' '}
                      {topPriorityIssue.upvoteCount === 1 ? 'upvote' : 'upvotes'}
                    </strong>{' '}
                    · {topPriorityIssue.localityName})
                    {criticalUrgentCount > 0
                      ? ` · ${criticalUrgentCount} critical (5+ upvotes)`
                      : ''}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('emergency')}
                    className="whitespace-nowrap inline-flex items-center gap-1.5 rounded-lg bg-red-700 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-red-800"
                  >
                    <Flame className="h-3.5 w-3.5" />
                    <span>Open High Emergency ({emergencyComplaints.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter('ALL');
                      setAfterPhotoDataUrl('');
                      setResolveNote('');
                      setActionPanel({ complaintId: topPriorityIssue.id, mode: 'resolve' });
                      setTimeout(() => {
                        document
                          .getElementById(`admin-complaint-${topPriorityIssue.id}`)
                          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }, 80);
                    }}
                    className="whitespace-nowrap rounded-lg bg-[#15803D] px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800"
                  >
                    Resolve #1 Priority Now
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
              <div>
                <h1 className="font-display text-lg font-extrabold text-[#0F2942]">
                  {adminRecord.role === 'cm_office'
                    ? 'CM Office Escalated Inbox'
                    : adminRecord.constituencyName
                      ? `${adminRecord.constituencyName} — Complaints Inbox`
                      : 'All Constituencies Inbox (Super Admin)'}
                </h1>
                <p className="text-xs text-slate-600 mt-0.5">
                  Strict constituency isolation enforced. Citizen upvotes automatically route
                  urgent issues to High Emergency; officials mark repairs &ldquo;Fixed, awaiting
                  confirmation&rdquo; (The Green Rule).
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Filter complaints by status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-[#0F2942]"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="HIGH_EMERGENCY">High Emergency (1+ Upvotes)</option>
                  <option value="HIGH_DEMAND">Serious / High Upvotes (3+)</option>
                  <option value="Reported">Reported</option>
                  <option value="Acknowledged">Acknowledged</option>
                  <option value="In progress">In progress</option>
                  <option value="Fixed, awaiting confirmation">Fixed, awaiting check</option>
                  <option value="CONFIRMED RESOLVED">Confirmed Resolved</option>
                  <option value="Reopened">Reopened</option>
                  <option value="Rejected">Rejected</option>
                  <option value="ESCALATED">Escalated to CM</option>
                </select>
                <span className="font-mono-num rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold">
                  {filteredInbox.length} visible
                </span>
              </div>
            </div>

            {filteredInbox.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center space-y-3">
                <p className="text-sm font-bold text-[#0F2942]">
                  No citizen complaints in this view yet.
                </p>
                <p className="text-xs text-slate-600 max-w-lg mx-auto">
                  Reports submitted by citizens in Namma Dhwani appear here automatically in real
                  time. High-upvote issues are auto-prioritized to the top.
                </p>
                {adminRecord.role === 'super_admin' && constituencies.length === 0 && (
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={setupBusy}
                      onClick={() => void handleSeedDemoData()}
                      className="rounded-xl bg-[#0F2942] px-4 py-2 text-xs font-bold text-white hover:bg-[#173A5E] disabled:opacity-50"
                    >
                      {setupBusy ? 'Seeding...' : 'Load 9 Default Zones & Agencies'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('setup')}
                      className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-[#0F2942] hover:bg-slate-50"
                    >
                      Open Setup
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {filteredInbox.map((c) => renderComplaintCard(c))}
              </div>
            )}
          </section>
          );
        })()}

        {/* MAP TAB */}
        {activeTab === 'map' && (
          <section className="space-y-3">
            <h1 className="font-display text-lg font-extrabold text-[#0F2942]">
              Jurisdiction Map
            </h1>
            <div
              ref={mapDivRef}
              className="h-[500px] w-full rounded-2xl border border-slate-300 bg-slate-100"
            />
          </section>
        )}

        {/* SERIOUS CONCERNS TAB */}
        {activeTab === 'concerns' && (
          <section className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h1 className="font-display text-lg font-extrabold text-[#0F2942]">
                Private Serious Concerns
              </h1>
              <p className="text-xs text-slate-600">
                Visible only to the assigned office or CM Office (when directed to CM). Never public.
              </p>
            </div>

            {scopedConcerns.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
                No private serious concerns in your office scope.
              </div>
            ) : (
              <div className="space-y-3">
                {scopedConcerns.map((sc) => (
                  <div
                    key={sc.id}
                    className="rounded-2xl border border-slate-300 bg-white p-4 space-y-2.5"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="rounded bg-red-50 px-2 py-0.5 font-bold text-red-900 border border-red-200">
                        {sc.concernType} · {sc.status}
                      </span>
                      <span className="text-slate-500">
                        {sc.constituencyName} · {sc.localityName}
                      </span>
                    </div>
                    <div className="font-bold text-[#0F2942]">{sc.title}</div>
                    <p className="text-sm text-slate-700">{sc.englishTranslation || sc.description}</p>
                    <div className="text-xs text-slate-500">
                      Last updated by: {sc.lastChangedBy}
                    </div>
                    {sc.status !== 'Closed' && (
                      <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-2.5">
                        {sc.status === 'Submitted privately' && (
                          <button
                            type="button"
                            disabled={actionBusyId === sc.id}
                            onClick={() => void handleUpdateConcernStatus(sc, 'Under review')}
                            className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-900"
                          >
                            Mark Under Review
                          </button>
                        )}
                        {sc.status !== 'Escalated to CM Office' &&
                          !sc.directToCm &&
                          adminRecord.role !== 'cm_office' && (
                            <button
                              type="button"
                              disabled={actionBusyId === sc.id}
                              onClick={() =>
                                void handleUpdateConcernStatus(sc, 'Escalated to CM Office')
                              }
                              className="rounded-lg border border-purple-300 bg-purple-50 px-3 py-1.5 text-xs font-bold text-purple-900"
                            >
                              Escalate to CM Office
                            </button>
                          )}
                        <button
                          type="button"
                          disabled={actionBusyId === sc.id}
                          onClick={() => void handleUpdateConcernStatus(sc, 'Closed')}
                          className="rounded-lg border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs font-bold text-[#0F2942]"
                        >
                          Close Concern
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* WELFARE CLAIMS TAB (SUPER ADMIN & WELFARE REVIEWER) */}
        {activeTab === 'welfare' &&
          (adminRecord.role === 'super_admin' || adminRecord.role === 'welfare_reviewer') && (
            <section className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <HeartHandshake className="h-5 w-5 text-[#E67E22]" />
                    <h1 className="font-display text-lg font-extrabold text-[#0F2942]">
                      Citizen Welfare Benefit Claims (50+ Civic Points)
                    </h1>
                  </div>
                  <span className="font-mono-num rounded-lg bg-slate-100 px-3 py-1 text-xs font-bold text-[#0F2942]">
                    {benefitClaims.length} total · {pendingWelfareClaimsCount} awaiting issue
                  </span>
                </div>
                <p className="text-xs text-slate-600">
                  Citizens who earn 50+ available civic points can redeem Karnataka transit,
                  utility, nutrition, health, and Sakala priority vouchers. Approve &amp; issue
                  vouchers here to notify citizens immediately.
                </p>
              </div>

              {benefitClaims.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
                  No citizen welfare claims submitted yet. Once citizens reach 50+ points and claim
                  benefits, they appear here in real time.
                </div>
              ) : (
                <div className="space-y-3">
                  {benefitClaims.map((cl) => (
                    <div
                      key={cl.id}
                      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded border px-2 py-0.5 font-bold ${
                              cl.status === 'Approved & Issued'
                                ? 'border-emerald-300 bg-emerald-100 text-[#15803D]'
                                : cl.status === 'Redeemed'
                                  ? 'border-blue-300 bg-blue-100 text-blue-900'
                                  : 'border-amber-300 bg-amber-100 text-amber-900'
                            }`}
                          >
                            {cl.status}
                          </span>
                          <span className="font-mono-num font-bold text-[#0F2942]">
                            {cl.voucherCode}
                          </span>
                          <span className="font-mono-num rounded bg-slate-100 px-2 py-0.5 font-bold text-slate-700">
                            {cl.pointsSpent} pts redeemed
                          </span>
                        </div>
                        <span className="font-mono-num text-slate-500">
                          {new Date(cl.claimedAt).toLocaleString()}
                        </span>
                      </div>

                      <div className="font-display text-base font-bold text-[#0F2942]">
                        {cl.benefitTitle} ·{' '}
                        <span className="text-[#15803D]">{cl.rewardValueLabel}</span>
                      </div>
                      <div className="text-xs text-slate-600">
                        Citizen: <strong>{cl.citizenName}</strong> · Department: {cl.department}
                        {cl.constituencyName ? ` · ${cl.constituencyName}` : ''}
                      </div>
                      {cl.householdNote && (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700">
                          <strong>Citizen Account / Ward Note:</strong> {cl.householdNote}
                        </div>
                      )}
                      {cl.officialNote && (
                        <div className="text-xs text-emerald-900">
                          <strong>Official Note:</strong> {cl.officialNote}
                        </div>
                      )}

                      {cl.status !== 'Redeemed' && (
                        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5">
                          <input
                            type="text"
                            value={welfareNoteInputs[cl.id] || ''}
                            onChange={(e) =>
                              setWelfareNoteInputs((prev) => ({
                                ...prev,
                                [cl.id]: e.target.value,
                              }))
                            }
                            placeholder="Optional fulfillment note or counter instructions..."
                            className="min-w-[220px] flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
                          />
                          {cl.status === 'Claimed' && (
                            <button
                              type="button"
                              disabled={actionBusyId === cl.id}
                              onClick={() =>
                                void handleUpdateBenefitClaim(cl, 'Approved & Issued')
                              }
                              className="rounded-lg bg-[#15803D] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
                            >
                              Approve &amp; Issue Voucher
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={actionBusyId === cl.id}
                            onClick={() => void handleUpdateBenefitClaim(cl, 'Redeemed')}
                            className="rounded-lg bg-[#0F2942] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#173A5E] disabled:opacity-50"
                          >
                            Mark Redeemed
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

        {/* SETUP TAB (SUPER ADMIN ONLY) */}
        {activeTab === 'setup' && adminRecord.role === 'super_admin' && (
          <section className="space-y-6">
            {/* Zone & Data Controls */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Database className="h-5 w-5 text-[#E67E22]" />
                  <div>
                    <h2 className="font-display text-lg font-extrabold text-[#0F2942]">
                      Zones, Agencies &amp; Data Mode
                    </h2>
                    <p className="text-xs text-slate-600">
                      Active: <strong>{constituencies.length}</strong> constituencies ·{' '}
                      <strong>{agencies.length}</strong> civic agencies ·{' '}
                      <strong>{complaints.length}</strong> live citizen complaints
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={setupBusy}
                    onClick={() => void handleSeedDemoData()}
                    className="rounded-xl bg-[#0F2942] px-4 py-2 text-xs font-bold text-white hover:bg-[#173A5E] disabled:opacity-50"
                  >
                    Seed 9 Default Zones &amp; Agencies
                  </button>
                  {constituencies.some((c) => c.isDemo) && (
                    <button
                      type="button"
                      disabled={setupBusy}
                      onClick={() => void handleDeleteDemoData()}
                      className="inline-flex items-center gap-1 rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-xs font-bold text-red-800"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Clear Demo Zones</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleToggleDemoMode(!demoMode)}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-[#0F2942]"
                  >
                    {demoMode ? 'Switch to Production Mode' : 'Enable Demo Mode'}
                  </button>
                </div>
              </div>

              {generatedCredsOnce.length > 0 && (
                <div className="rounded-xl border-2 border-[#E67E22] bg-amber-50 p-4 space-y-2">
                  <div className="text-xs font-bold text-[#0F2942]">
                    Generated Demo Accounts (shown ONCE — copy now for testing):
                  </div>
                  <div className="max-h-56 overflow-y-auto space-y-1 font-mono-num text-xs">
                    {generatedCredsOnce.map((g) => (
                      <div key={g.email} className="rounded bg-white px-2.5 py-1.5 border">
                        <strong>{g.email}</strong> | {g.role} | {g.constituency} | Password:{' '}
                        <code>{g.password}</code>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Optional GeoJSON / CSV Constituency Import (Collapsed unless needed) */}
            <details className="rounded-2xl border border-slate-200 bg-white p-5">
              <summary className="flex cursor-pointer items-center justify-between gap-2 font-display text-sm font-extrabold text-[#0F2942]">
                <span className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-[#E67E22]" />
                  <span>Optional: Bulk Import Official Constituencies (GeoJSON or CSV)</span>
                </span>
                <span className="text-xs font-semibold text-slate-500">
                  {constituencies.length} loaded
                </span>
              </summary>
              <div className="mt-4 space-y-3">
                <p className="text-xs text-slate-600">
                  Paste GeoJSON FeatureCollection or CSV lines (
                  <code>name,code,south,west,north,east,mlaName,mlaOfficeEmail,lastVerifiedDate</code>
                  ).
                </p>
                <textarea
                  rows={4}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder='{"type":"FeatureCollection","features":[...]} or CSV rows...'
                  className="w-full rounded-lg border border-slate-300 p-3 font-mono-num text-xs"
                />
                <button
                  type="button"
                  disabled={setupBusy || !importText.trim()}
                  onClick={() => void handleImportConstituencies()}
                  className="rounded-xl bg-[#0F2942] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40"
                >
                  Import Constituencies
                </button>
              </div>
            </details>

            {/* Invite Official Staff Account */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
              <div className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-[#E67E22]" />
                <h2 className="font-display text-lg font-extrabold text-[#0F2942]">
                  Invite Official Staff Account (No public signup)
                </h2>
              </div>
              <p className="text-xs text-slate-600">
                Leave <strong>User UID</strong> blank to create a brand-new password-reset invite,
                or paste the colleague&apos;s Firebase UID from the Staff Authorization Check card if
                they already signed in with Google.
              </p>
              <form
                onSubmit={(e) => void handleInviteOfficial(e)}
                className="grid grid-cols-1 gap-3 sm:grid-cols-2"
              >
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="Official email"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  required
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="Official display name"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  value={inviteUid}
                  onChange={(e) => setInviteUid(e.target.value)}
                  placeholder="Optional: Existing Google User UID"
                  className="sm:col-span-2 rounded-lg border border-slate-300 px-3 py-2 font-mono-num text-xs"
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as AdminRole)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="mla_owner">MLA Office Owner</option>
                  <option value="mla_member">MLA Team Member</option>
                  <option value="cm_office">CM Office Staff</option>
                  <option value="welfare_reviewer">Welfare Reviewer</option>
                  <option value="super_admin">Super Admin</option>
                </select>
                {(inviteRole === 'mla_owner' || inviteRole === 'mla_member') && (
                  <select
                    value={inviteConstId}
                    onChange={(e) => setInviteConstId(e.target.value)}
                    required
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">Assign Constituency...</option>
                    {constituencies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
                {inviteRole === 'welfare_reviewer' && (
                  <input
                    type="text"
                    required
                    value={inviteDept}
                    onChange={(e) => setInviteDept(e.target.value)}
                    placeholder="Department name"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                )}
                <button
                  type="submit"
                  disabled={setupBusy}
                  className="sm:col-span-2 rounded-xl bg-[#0F2942] py-2.5 text-sm font-bold text-white"
                >
                  {inviteUid.trim()
                    ? 'Authorize Existing Google Account'
                    : 'Create & Send Official Invitation'}
                </button>
              </form>
            </div>

            {/* Super Admin Citizen Points Rules Table */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
              <h2 className="font-display text-lg font-extrabold text-[#0F2942]">
                Citizen Points Rules Table
              </h2>
              <p className="text-xs text-slate-600">
                Configure points awarded to citizens for verified submissions and confirmed fixes.
                Upvotes always award 0 points to prevent spam.
              </p>
              <form
                onSubmit={(e) => void handleSavePointsConfig(e)}
                className="grid grid-cols-1 gap-3 sm:grid-cols-3"
              >
                <div>
                  <label className="mb-1 block text-xs font-semibold">
                    Verified Report Points
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={500}
                    value={pointsVerifiedInput}
                    onChange={(e) => setPointsVerifiedInput(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">
                    Confirmed Resolved Bonus
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={500}
                    value={pointsResolvedInput}
                    onChange={(e) => setPointsResolvedInput(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">Upvote Points (Fixed)</label>
                  <input
                    type="number"
                    disabled
                    value={0}
                    className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={setupBusy}
                  className="sm:col-span-3 rounded-xl bg-[#0F2942] py-2.5 text-sm font-bold text-white"
                >
                  Save Points Rules
                </button>
              </form>
            </div>

            {/* Demo Email Logs (only shown when entries exist) & Immutable Audit Trail */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {demoEmails.length > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-sm text-[#0F2942]">
                    <Mail className="h-4 w-4 text-[#E67E22]" />
                    <span>Demo Email Logs ({demoEmails.length})</span>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1.5 text-xs">
                    {demoEmails.map((em) => (
                      <div key={em.id} className="rounded border border-slate-200 p-2">
                        <div className="font-semibold">{em.recipientEmail}</div>
                        <div className="text-slate-600">{em.previewText}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className={`rounded-2xl border border-slate-200 bg-white p-4 space-y-2 ${demoEmails.length === 0 ? 'lg:col-span-2' : ''}`}>
                <div className="flex items-center gap-2 font-bold text-sm text-[#0F2942]">
                  <ShieldAlert className="h-4 w-4 text-[#E67E22]" />
                  <span>Boundary Flags ({boundaryFlags.length}) &amp; Audit Logs ({auditLogs.length})</span>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1.5 text-xs">
                  {auditLogs.length === 0 ? (
                    <div className="text-slate-500">No admin audit actions recorded yet.</div>
                  ) : (
                    auditLogs.slice(0, 15).map((log) => (
                      <div key={log.id} className="rounded border border-slate-200 p-2">
                        <div className="font-semibold">
                          [{log.action}] {log.actorEmail}
                        </div>
                        <div className="text-slate-600">{log.summary}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
