import React, { useEffect, useMemo, useState } from 'react';
import { signOut, type User } from 'firebase/auth';
import {
  AlertTriangle,
  Award,
  BadgeCheck,
  BarChart3,
  Camera,
  CheckCircle2,
  ClipboardPlus,
  Compass,
  Construction,
  Droplets,
  ExternalLink,
  Globe2,
  HeartHandshake,
  HelpCircle,
  Landmark,
  Lightbulb,
  LogOut,
  MapPin,
  MessageSquarePlus,
  Shield,
  ShieldAlert,
  ThumbsUp,
  Trash2,
  Trophy,
  Upload,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { auth } from '../firebase';
import {
  BENGALURU_LOCALITIES,
  BENGALURU_LOCALITY_COORDS,
  BENGALURU_WARD_COORDS,
} from '../data/mockCivicData';
import {
  classifyCivicPhoto,
  detectDuplicateComplaints,
  scoreComplaintPriority,
  type ClassifyApiResponse,
} from '../services/aiClient';
import {
  citizenRespondToVerification,
  createCmEscalation,
  createComplaintInFirestore,
  hasCitizenSupportedComplaint,
  submitComplaintContribution,
  subscribeComplaintContributions,
  subscribeComplaintVerifications,
  supportComplaintUnique,
} from '../services/firestoreService';
import {
  buildCompleteLocationString,
  buildOpenStreetMapExternalUrl,
  reverseGeocodeSpot,
  type ReverseGeocodeResult,
} from '../services/mapsClient';
import {
  AdminRecord,
  AuthorityAppointment,
  AuthorityTier,
  CitizenProfile,
  CitizenStats,
  CivicActivity,
  CivicIncident,
  CmEscalationAlert,
  ComplaintContribution,
  ContributionType,
  DuplicateCandidate,
  IncidentCategory,
  IncidentStatus,
  PointTransaction,
  ResolutionVerification,
  SeverityLevel,
  SlaPolicyRule,
  WardSummary,
  WelfareApplication,
  WelfareProgramme,
} from '../types/civic';
import { useLanguage } from '../i18n/LanguageContext';
import { compressImageFileToDataUrl } from '../utils/imageCompression';
import { CivicIncidentsLiveMap, CivicSpotPickerMap } from './CivicLiveMap';
import { CitizenProfileParticipation } from './CitizenProfileParticipation';
import { CitizenTransparencyAppointments } from './CitizenTransparencyAppointments';
import { GuideView } from './GuideView';
import { LanguageSelector } from './LanguageSelector';
import { LeaderboardScreen } from './LeaderboardScreen';
import { PublicAccountabilityDashboard } from './PublicAccountabilityDashboard';
import { CategoryIcon, PriorityText, StatusBadge } from './StatusBadge';
import { WelfareOfficerDashboard } from './WelfareOfficerDashboard';
import { WelfarePortalScreen } from './WelfarePortalScreen';

interface CitizenPortalProps {
  user: User;
  profile: CitizenProfile | null;
  isAdmin: boolean;
  authorityTier?: AuthorityTier | null;
  isWelfareOfficer: boolean;
  complaints: CivicIncident[];
  wards: WardSummary[];
  policies: SlaPolicyRule[];
  admins: AdminRecord[];
  cmEscalations: CmEscalationAlert[];
  myAppointments: AuthorityAppointment[];
  myStats: CitizenStats | null;
  allCitizenStats: CitizenStats[];
  pointTransactions: PointTransaction[];
  civicActivities: CivicActivity[];
  welfareProgrammes: WelfareProgramme[];
  myWelfareApplications: WelfareApplication[];
  allWelfareApplications: WelfareApplication[];
  onSwitchToAdmin: () => void;
  onShowToast: (msg: string) => void;
}

const CATEGORIES = Object.values(IncidentCategory);
const SEVERITIES: SeverityLevel[] = ['Low', 'Medium', 'High', 'Critical'];

type CitizenTab =
  | 'feed'
  | 'submit'
  | 'participation'
  | 'leaderboard'
  | 'welfare'
  | 'accountability'
  | 'appointments'
  | 'guide'
  | 'officer_desk';

export const CitizenPortal: React.FC<CitizenPortalProps> = ({
  user,
  profile,
  isAdmin,
  authorityTier = null,
  isWelfareOfficer,
  complaints,
  wards,
  policies,
  admins,
  cmEscalations,
  myAppointments,
  myStats,
  allCitizenStats,
  pointTransactions,
  civicActivities,
  welfareProgrammes,
  myWelfareApplications,
  allWelfareApplications,
  onSwitchToAdmin,
  onShowToast,
}) => {
  const { t, speakText, stopSpeech, isSpeaking } = useLanguage();
  const [activeTab, setActiveTab] = useState<CitizenTab>('feed');
  const [feedFilter, setFeedFilter] = useState<'all' | 'mine' | 'verify'>('all');
  const [welcomeDismissed, setWelcomeDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('nagrik_welcome_dismissed') === '1';
    } catch {
      return false;
    }
  });

  const dismissWelcome = () => {
    setWelcomeDismissed(true);
    try {
      localStorage.setItem('nagrik_welcome_dismissed', '1');
    } catch {
      // ignore
    }
  };

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const initialLocality =
    profile?.locality && BENGALURU_LOCALITIES.includes(profile.locality)
      ? profile.locality
      : BENGALURU_LOCALITIES[0];
  const [wardNumber, setWardNumber] = useState<number>(profile?.wardNumber || 1);
  const [locality, setLocality] = useState<string>(initialLocality);
  const [address, setAddress] = useState('');
  const initialCoords = BENGALURU_LOCALITY_COORDS[initialLocality] ||
    BENGALURU_WARD_COORDS[profile?.wardNumber || 1] || {
      lat: 12.9716,
      lng: 77.5946,
    };
  const [latitude, setLatitude] = useState<number>(initialCoords.lat);
  const [longitude, setLongitude] = useState<number>(initialCoords.lng);
  const [resolvedGeo, setResolvedGeo] = useState<ReverseGeocodeResult | null>(null);
  const [showFeedMap, setShowFeedMap] = useState<boolean>(true);
  const [gpsBlockedByFrame, setGpsBlockedByFrame] = useState(false);
  const [showManualCoords, setShowManualCoords] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<string>(
    `Pinned in ${initialLocality}, Bengaluru — drag pin or search spot on map`
  );
  const [photoDataUrl, setPhotoDataUrl] = useState<string>('');
  const [aiClassify, setAiClassify] = useState<ClassifyApiResponse | null>(null);
  const [classifying, setClassifying] = useState(false);
  const [confirmedCategory, setConfirmedCategory] = useState<IncidentCategory>(
    IncidentCategory.Potholes
  );
  const [confirmedSeverity, setConfirmedSeverity] = useState<SeverityLevel>('Medium');
  const [duplicateMatches, setDuplicateMatches] = useState<DuplicateCandidate[]>([]);
  const [duplicateNotice, setDuplicateNotice] = useState<string | null>(null);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Support state cache
  const [supportedMap, setSupportedMap] = useState<Record<string, boolean>>({});
  const [supportingId, setSupportingId] = useState<string | null>(null);

  // Citizen verification inspection state
  const [verifyingComplaint, setVerifyingComplaint] = useState<CivicIncident | null>(null);
  const [verifications, setVerifications] = useState<ResolutionVerification[]>([]);
  const [citizenNote, setCitizenNote] = useState('');
  const [disputePhotoUrl, setDisputePhotoUrl] = useState('');
  const [submittingDecision, setSubmittingDecision] = useState(false);

  // Citizen Complaint Detail & Participation Modal state
  const [inspectedComplaint, setInspectedComplaint] = useState<CivicIncident | null>(null);
  const [complaintContributions, setComplaintContributions] = useState<ComplaintContribution[]>(
    []
  );
  const [contribType, setContribType] = useState<ContributionType>('additional_info');
  const [contribNote, setContribNote] = useState('');
  const [relatedComplaintId, setRelatedComplaintId] = useState('');
  const [verifOutcome, setVerifOutcome] = useState<'confirmed_fixed' | 'still_unresolved'>(
    'confirmed_fixed'
  );
  const [contribPhotoUrl, setContribPhotoUrl] = useState('');
  const [submittingContrib, setSubmittingContrib] = useState(false);

  useEffect(() => {
    let active = true;
    const checkSupports = async () => {
      const entries: Record<string, boolean> = {};
      await Promise.all(
        complaints.slice(0, 40).map(async (c) => {
          entries[c.id] = await hasCitizenSupportedComplaint(c.id, user.uid);
        })
      );
      if (active) setSupportedMap(entries);
    };
    if (complaints.length > 0) {
      checkSupports();
    }
    return () => {
      active = false;
    };
  }, [complaints, user.uid]);

  useEffect(() => {
    if (!verifyingComplaint) {
      setVerifications([]);
      return;
    }
    const unsub = subscribeComplaintVerifications(verifyingComplaint.id, setVerifications);
    return () => unsub();
  }, [verifyingComplaint]);

  useEffect(() => {
    if (!inspectedComplaint) {
      setComplaintContributions([]);
      return;
    }
    const unsub = subscribeComplaintContributions(
      inspectedComplaint.id,
      setComplaintContributions
    );
    return () => unsub();
  }, [inspectedComplaint]);

  const myVerificationQueueCount = useMemo(
    () =>
      complaints.filter(
        (c) => c.reporterUid === user.uid && c.status === IncidentStatus.Resolved
      ).length,
    [complaints, user.uid]
  );

  const visibleComplaints = useMemo(() => {
    return complaints.filter((c) => {
      if (feedFilter === 'mine') return c.reporterUid === user.uid;
      if (feedFilter === 'verify')
        return c.reporterUid === user.uid && c.status === IncidentStatus.Resolved;
      return true;
    });
  }, [complaints, feedFilter, user.uid]);

  const applyResolvedSpot = (
    coords: { lat: number; lng: number },
    resolved?: ReverseGeocodeResult,
    sourceLabel?: string
  ) => {
    setLatitude(coords.lat);
    setLongitude(coords.lng);
    if (resolved) {
      setResolvedGeo(resolved);
      if (resolved.matchedLocality && BENGALURU_LOCALITIES.includes(resolved.matchedLocality)) {
        setLocality(resolved.matchedLocality);
      }
      if (resolved.matchedWardNumber) {
        setWardNumber(resolved.matchedWardNumber);
      }
      const composed = buildCompleteLocationString({
        specificSpot: resolved.specificSpot,
        formattedAddress: resolved.formattedAddress,
        area: resolved.area,
      });
      if (composed) {
        setAddress(composed);
      }
      setGpsStatus(
        `${sourceLabel || 'Exact spot pinned'}: ${resolved.specificSpot || resolved.area || resolved.formattedAddress}`
      );
    } else {
      setGpsStatus(
        `${sourceLabel || 'Coordinates set'}: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`
      );
    }
  };

  const handleCaptureGps = () => {
    const fallbackCoords = BENGALURU_LOCALITY_COORDS[locality] ||
      BENGALURU_WARD_COORDS[wardNumber] || { lat: 12.9716, lng: 77.5946 };

    if (!navigator.geolocation) {
      setLatitude(fallbackCoords.lat);
      setLongitude(fallbackCoords.lng);
      void reverseGeocodeSpot(fallbackCoords.lat, fallbackCoords.lng)
        .then((geo) => applyResolvedSpot(fallbackCoords, geo, `Area location (${locality})`))
        .catch(() =>
          setGpsStatus(
            `Using ${locality} Bengaluru coordinates (${fallbackCoords.lat.toFixed(4)}, ${fallbackCoords.lng.toFixed(4)}).`
          )
        );
      return;
    }
    setGpsStatus('Requesting live browser GPS coordinates...');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setGpsBlockedByFrame(false);
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        setLatitude(lat);
        setLongitude(lng);
        try {
          const geo = await reverseGeocodeSpot(lat, lng);
          applyResolvedSpot({ lat, lng }, geo, `Live GPS (±${Math.round(pos.coords.accuracy)}m)`);
        } catch {
          setGpsStatus(
            `Live GPS captured (${lat.toFixed(4)}, ${lng.toFixed(4)} · ±${Math.round(pos.coords.accuracy)}m)`
          );
        }
      },
      (err) => {
        setLatitude(fallbackCoords.lat);
        setLongitude(fallbackCoords.lng);
        const msg = (err.message || '').toLowerCase();
        if (msg.includes('permissions policy') || msg.includes('disabled in this document')) {
          setGpsBlockedByFrame(true);
        }
        void reverseGeocodeSpot(fallbackCoords.lat, fallbackCoords.lng)
          .then((geo) =>
            applyResolvedSpot(
              fallbackCoords,
              geo,
              msg.includes('permissions policy') || msg.includes('disabled in this document')
                ? 'Preview mode — pick exact spot on the live map below'
                : `Using ${locality} map spot`
            )
          )
          .catch(() => {
            setGpsStatus(
              `Embedded preview blocks live GPS — drag pin or search spot on the live map below (${locality}).`
            );
          });
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFormError(null);
    setClassifying(true);
    try {
      const compressed = await compressImageFileToDataUrl(file);
      setPhotoDataUrl(compressed);
      const res = await classifyCivicPhoto(compressed, `${title} ${description}`);
      setAiClassify(res);
      setConfirmedCategory(res.predicted_category);
      setConfirmedSeverity(res.predicted_severity);
      onShowToast('AI image analysis completed. Please verify category & severity.');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to process uploaded image.');
    } finally {
      setClassifying(false);
    }
  };

  const handleRunDuplicateCheck = async (): Promise<DuplicateCandidate[]> => {
    setCheckingDuplicates(true);
    setDuplicateNotice(null);
    try {
      const resp = await detectDuplicateComplaints({
        new_complaint: {
          title: title || confirmedCategory,
          description: description || title || confirmedCategory,
          category: confirmedCategory,
          locality,
          latitude,
          longitude,
          photo_base64: photoDataUrl || undefined,
        },
        existing_complaints: complaints
          .filter((c) => !c.isMergedDuplicate)
          .slice(0, 50)
          .map((c) => ({
            id: c.id,
            title: c.title,
            description: c.description,
            category: c.confirmedCategory,
            locality: c.locality,
            latitude: c.latitude,
            longitude: c.longitude,
            photo_base64: c.photoDataUrl,
          })),
        radius_meters: 100,
        auto_group_policy_enabled: false,
      });
      setDuplicateMatches(resp.candidates);
      if (resp.fallback_notice) setDuplicateNotice(resp.fallback_notice);
      return resp.candidates;
    } catch {
      return [];
    } finally {
      setCheckingDuplicates(false);
    }
  };

  const handleSubmitComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const resolvedArea = (resolvedGeo?.area || locality).trim();
    const effectiveAddress =
      address.trim() ||
      buildCompleteLocationString({
        specificSpot: resolvedGeo?.specificSpot,
        formattedAddress: resolvedGeo?.formattedAddress,
        area: resolvedArea,
      }) ||
      `${resolvedArea} Main Road, Bengaluru`;
    const effectiveTitle = title.trim() || `${confirmedCategory} near ${resolvedGeo?.specificSpot || effectiveAddress}`;
    const effectiveDescription =
      description.trim() ||
      `Citizen reported ${confirmedCategory} (${confirmedSeverity} urgency) at ${effectiveAddress} (${resolvedArea}).`;

    if (effectiveAddress.length < 2) {
      setFormError('Tap GPS location, pin a spot on the live map, or enter a nearby landmark.');
      return;
    }

    setSubmitting(true);
    try {
      const dupes = await handleRunDuplicateCheck();
      const priorityResp = await scoreComplaintPriority({
        severity: confirmedSeverity,
        category: confirmedCategory,
        unique_supports: 0,
        age_hours: 0,
        locality: resolvedArea,
        duplicate_count: dupes.length,
        ward_avg_res_hours: 24,
      });

      const wardObj = wards.find((w) => w.wardNumber === wardNumber) ?? wards[0];
      const policy = policies.find((p) => p.category === confirmedCategory);
      const slaTargetHours = policy?.resolutionTargetHours ?? 24;
      const newId = `INC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 8999)}`;

      const predictedCat = aiClassify?.predicted_category ?? confirmedCategory;
      const predictedSev = aiClassify?.predicted_severity ?? confirmedSeverity;
      const topDup = dupes[0];

      await createComplaintInFirestore({
        id: newId,
        title: effectiveTitle,
        description: effectiveDescription,
        locality: resolvedArea.slice(0, 120),
        address: effectiveAddress.slice(0, 240),
        wardNumber: wardObj.wardNumber,
        wardName: wardObj.name,
        latitude,
        longitude,
        reporterUid: user.uid,
        reporterName: profile?.displayName || user.displayName || 'Citizen Reporter',
        aiPredictedCategory: predictedCat,
        aiCategoryConfidence: aiClassify?.confidence ?? 0.42,
        confirmedCategory,
        categoryCorrectedByCitizen: Boolean(aiClassify && predictedCat !== confirmedCategory),
        aiPredictedSeverity: predictedSev,
        confirmedSeverity,
        severityCorrectedByHuman: Boolean(aiClassify && predictedSev !== confirmedSeverity),
        aiSource: aiClassify?.ai_source ?? 'fallback_rule_based',
        priorityScore: priorityResp.priority_score,
        priorityTier: priorityResp.priority_tier,
        prioritySource: priorityResp.scoring_source,
        priorityFactors: priorityResp.influencing_factors,
        photoDataUrl: photoDataUrl || undefined,
        slaTargetHours,
        potentialDuplicate:
          topDup && topDup.duplicate_confidence >= 0.5
            ? {
                originalComplaintId: topDup.original_complaint_id,
                distanceMeters: topDup.distance_meters,
                imageSimilarity: topDup.image_similarity,
                textSimilarity: topDup.text_similarity,
                categoryMatch: topDup.category_match,
                duplicateConfidence: topDup.duplicate_confidence,
                recommendedAction: topDup.recommended_action,
              }
            : undefined,
      });

      onShowToast(
        `${newId} submitted (${confirmedCategory} · Priority ${priorityResp.priority_score}/100).`
      );
      setTitle('');
      setDescription('');
      setAddress('');
      setPhotoDataUrl('');
      setAiClassify(null);
      setDuplicateMatches([]);
      setActiveTab('feed');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save civic report.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSupport = async (complaintId: string) => {
    setSupportingId(complaintId);
    try {
      await supportComplaintUnique(complaintId, user.uid);
      setSupportedMap((prev) => ({ ...prev, [complaintId]: true }));
      onShowToast(`Recorded unique support for ${complaintId}.`);
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Could not record support.');
    } finally {
      setSupportingId(null);
    }
  };

  const handleDisputePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await compressImageFileToDataUrl(file);
    setDisputePhotoUrl(compressed);
  };

  const handleCitizenVerificationDecision = async (decision: 'confirmed' | 'disputed') => {
    if (!verifyingComplaint || verifications.length === 0) return;
    const latest = verifications[0];
    setSubmittingDecision(true);
    try {
      await citizenRespondToVerification({
        complaintId: verifyingComplaint.id,
        verificationId: latest.id,
        citizenUid: user.uid,
        citizenName: profile?.displayName || user.displayName || 'Citizen Reporter',
        decision,
        citizenNote: citizenNote.trim() || undefined,
        disputePhotoDataUrl: disputePhotoUrl || undefined,
      });
      onShowToast(
        decision === 'confirmed'
          ? `${verifyingComplaint.id} confirmed resolved and closed as Verified.`
          : `${verifyingComplaint.id} disputed and reopened for municipal follow-up.`
      );
      setVerifyingComplaint(null);
      setCitizenNote('');
      setDisputePhotoUrl('');
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Failed to submit verification decision.');
    } finally {
      setSubmittingDecision(false);
    }
  };

  const handleContribPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await compressImageFileToDataUrl(file);
    setContribPhotoUrl(compressed);
  };

  const handleSubmitContribution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inspectedComplaint) return;
    if (contribNote.trim().length < 4) {
      onShowToast('Enter a clear note or observation (at least 4 characters).');
      return;
    }
    setSubmittingContrib(true);
    try {
      await submitComplaintContribution({
        complaint: inspectedComplaint,
        contributorUid: user.uid,
        contributorName:
          myStats?.publicDisplayName ||
          profile?.displayName ||
          user.displayName ||
          'Bengaluru Citizen',
        type: contribType,
        note: contribNote,
        relatedComplaintId: contribType === 'duplicate_flag' ? relatedComplaintId : undefined,
        verificationOutcome:
          contribType === 'independent_verification' ? verifOutcome : undefined,
        photoDataUrl: contribPhotoUrl || undefined,
      });
      onShowToast(
        'Civic contribution submitted for verification. Verified points are awarded once accepted.'
      );
      setContribNote('');
      setRelatedComplaintId('');
      setContribPhotoUrl('');
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Failed to submit contribution.');
    } finally {
      setSubmittingContrib(false);
    }
  };

  const displayName =
    myStats?.publicDisplayName ||
    profile?.displayName ||
    user.displayName ||
    user.email ||
    'NAGRIK User';

  const authorityPreviewLabel =
    authorityTier === 'CM'
      ? 'Chief Minister (CM) Oversight'
      : authorityTier === 'MLA'
        ? 'Local MLA Representative'
        : 'BBMP Municipal Official';

  const approvedPassCount = myAppointments.filter(
    (a) => a.status === 'approved_scheduled'
  ).length;

  const [escalatingSla, setEscalatingSla] = useState(false);

  const handleEscalateSlaBreachToCm = async (inc: CivicIncident) => {
    setEscalatingSla(true);
    try {
      await createCmEscalation({
        title: `Breached SLA Alert on ${inc.id} (${Math.abs(Math.round(inc.slaHoursRemaining))}h overdue)`,
        misuseType: 'sla_negligence',
        targetRole: 'BBMP Official',
        targetOfficialName: inc.assignedCrewId
          ? `Ward 0${inc.wardNumber} Crew ${inc.assignedCrewId}`
          : `Ward 0${inc.wardNumber} BBMP Desk`,
        wardNumber: inc.wardNumber,
        locality: inc.locality,
        relatedComplaintId: inc.id,
        description: `Citizen ${displayName} escalated overdue complaint ${inc.id} ("${inc.title}") at ${inc.address}. SLA deadline exceeded by ${Math.abs(Math.round(inc.slaHoursRemaining))} hours with status ${inc.status}.`,
        evidenceSummary: `Priority Score ${inc.priorityScore}/100 (${inc.confirmedSeverity}). Direct CM action requested.`,
        severity: inc.confirmedSeverity === 'Critical' ? 'Critical' : 'High',
        reportedByUid: user.uid,
        reportedByName: displayName,
        sourceType: 'citizen_report',
      });
      onShowToast(
        `Breached SLA complaint ${inc.id} escalated directly to Chief Minister Oversight.`
      );
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Failed to escalate to CM.');
    } finally {
      setEscalatingSla(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F7FA] text-[#0A1D2B]">
      {/* Citizen Portal / Official Public Transparency Header */}
      <header className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-[#102A43] text-white">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded bg-white/10 text-[#F2A541]">
              <Landmark className="h-5 w-5" />
            </div>
            <div>
              <div className="font-display text-base font-bold leading-tight">
                {isAdmin ? 'NAGRIK Public Transparency Preview' : 'NAGRIK Citizen Portal'}
              </div>
              <div className="text-[11px] text-[#B0C9E8]">
                {isAdmin
                  ? `${authorityPreviewLabel} · ${user.email || displayName} (Non-Citizen Account)`
                  : `${displayName} · ${myStats?.locality || profile?.locality || 'Indiranagar'} (Ward 0${
                      myStats?.wardNumber || profile?.wardNumber || 1
                    })`}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <LanguageSelector dark compact />

            <button
              type="button"
              onClick={() =>
                isSpeaking
                  ? stopSpeech()
                  : speakText(
                      `${t('simpleStep1Title')}. ${t('simpleStep1Desc')} ${t('simpleStep2Title')}. ${t('simpleStep2Desc')} ${t('simpleStep3Title')}. ${t('simpleStep3Desc')}`
                    )
              }
              className="inline-flex h-9 cursor-pointer items-center gap-1 rounded border border-white/25 bg-white/10 px-2.5 text-xs font-semibold text-white hover:bg-white/20"
              title={t('listenAloud')}
            >
              {isSpeaking ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{isSpeaking ? t('stopAudio') : t('listenAloud')}</span>
            </button>

            {!isAdmin && profile?.kycVerified && (
              <span className="hidden items-center gap-1 rounded border border-[#168B55]/60 bg-[#168B55]/20 px-2.5 py-1 text-[11px] font-semibold text-[#D1FAE5] md:inline-flex">
                <BadgeCheck className="h-3.5 w-3.5" />
                Aadhaar KYC
              </span>
            )}

            {!isAdmin && (
              <button
                type="button"
                onClick={() => setActiveTab('participation')}
                className="hidden cursor-pointer items-center gap-1.5 rounded border border-[#168B55]/60 bg-[#168B55]/20 px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#168B55]/30 lg:inline-flex"
              >
                <Award className="h-3.5 w-3.5 text-[#F2A541]" />
                <span className="font-mono-tabular">{myStats?.totalPoints ?? 0} pts</span>
                <span className="text-[#D1E4FF]">
                  · {myStats?.achievementLevel || 'Bronze Citizen'}
                </span>
              </button>
            )}

            {isAdmin && (
              <button
                type="button"
                onClick={onSwitchToAdmin}
                className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded border border-[#F2A541]/60 bg-white/10 px-3 text-xs font-semibold text-[#F2A541] hover:bg-white/20"
              >
                <Shield className="h-3.5 w-3.5" />
                {authorityTier === 'CM' ? 'Return to CM Oversight' : 'Return to Authority Desk'}
              </button>
            )}
            <button
              type="button"
              onClick={() => signOut(auth)}
              className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded border border-white/20 px-3 text-xs font-semibold text-white hover:bg-white/10"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('signOutBtn')}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8">
        {/* First-Time Friendly Visual Onboarding Strip */}
        {!welcomeDismissed && (
          <section className="mb-6 rounded-lg border border-[#102A43]/20 bg-white p-4 civic-shadow-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.05em] text-[#168B55]">
                  {t('userGuideTitle')}
                </div>
                <h2 className="mt-0.5 font-display text-base font-bold text-[#0A1D2B]">
                  Report Any Civic Problem in 3 Easy Taps
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('guide')}
                  className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded border border-[#102A43] px-3 text-xs font-semibold text-[#102A43] hover:bg-[#ECF4FF]"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                  {t('tabGuide')}
                </button>
                <button
                  type="button"
                  onClick={dismissWelcome}
                  aria-label="Dismiss welcome guide"
                  className="inline-flex h-9 cursor-pointer items-center rounded border border-[#CBD5E1] px-2.5 text-xs text-[#52606D] hover:bg-[#F5F7FA]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <div className="flex items-center gap-3 rounded border border-[#E2E8F0] bg-[#F7F9FF] p-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#102A43] text-white">
                  <Camera className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-[#0A1D2B]">{t('simpleStep1Title')}</div>
                  <div className="text-[11px] text-[#52606D]">{t('simpleStep1Desc')}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded border border-[#E2E8F0] bg-[#F7F9FF] p-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#102A43] text-white">
                  <MapPin className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-[#0A1D2B]">{t('simpleStep2Title')}</div>
                  <div className="text-[11px] text-[#52606D]">{t('simpleStep2Desc')}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded border border-[#E2E8F0] bg-[#E8F5EC] p-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#168B55] text-white">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-[#0A1D2B]">{t('simpleStep3Title')}</div>
                  <div className="text-[11px] text-[#253746]">{t('simpleStep3Desc')}</div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Citizen Navigation Strip */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('feed')}
              className={`h-11 cursor-pointer rounded px-3.5 text-xs font-semibold transition-colors ${
                activeTab === 'feed'
                  ? 'bg-[#102A43] text-white'
                  : 'border border-[#CBD5E1] bg-white text-[#253746] hover:bg-[#ECF4FF]'
              }`}
            >
              {t('tabFeed')} ({complaints.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('submit')}
              className={`inline-flex h-11 cursor-pointer items-center gap-1.5 rounded px-4 text-xs font-bold transition-colors ${
                activeTab === 'submit'
                  ? 'bg-[#168B55] text-white'
                  : 'border-2 border-[#168B55] bg-[#E8F5EC] text-[#168B55] hover:bg-[#d8efe0]'
              }`}
            >
              <ClipboardPlus className="h-4 w-4" />
              {t('tabReport')}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('participation')}
              className={`inline-flex h-11 cursor-pointer items-center gap-1.5 rounded px-3.5 text-xs font-semibold transition-colors ${
                activeTab === 'participation'
                  ? 'bg-[#102A43] text-white'
                  : 'border border-[#CBD5E1] bg-white text-[#253746] hover:bg-[#ECF4FF]'
              }`}
            >
              <Award className="h-3.5 w-3.5" />
              {t('tabParticipation')}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('leaderboard')}
              className={`inline-flex h-11 cursor-pointer items-center gap-1.5 rounded px-3.5 text-xs font-semibold transition-colors ${
                activeTab === 'leaderboard'
                  ? 'bg-[#102A43] text-white'
                  : 'border border-[#CBD5E1] bg-white text-[#253746] hover:bg-[#ECF4FF]'
              }`}
            >
              <Trophy className="h-3.5 w-3.5" />
              {t('tabLeaderboard')}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('welfare')}
              className={`inline-flex h-11 cursor-pointer items-center gap-1.5 rounded px-3.5 text-xs font-semibold transition-colors ${
                activeTab === 'welfare'
                  ? 'bg-[#102A43] text-white'
                  : 'border border-[#CBD5E1] bg-white text-[#253746] hover:bg-[#ECF4FF]'
              }`}
            >
              <HeartHandshake className="h-3.5 w-3.5" />
              {t('tabWelfare')}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('accountability')}
              className={`inline-flex h-11 cursor-pointer items-center gap-1.5 rounded px-3.5 text-xs font-semibold transition-colors ${
                activeTab === 'accountability'
                  ? 'bg-[#102A43] text-white'
                  : 'border border-[#CBD5E1] bg-white text-[#253746] hover:bg-[#ECF4FF]'
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              {t('tabAccountability')}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('appointments')}
              className={`inline-flex h-11 cursor-pointer items-center gap-1.5 rounded px-3.5 text-xs font-semibold transition-colors ${
                activeTab === 'appointments'
                  ? 'bg-[#102A43] text-white'
                  : 'border border-[#BA1A1A]/30 bg-[#FFF8F6] text-[#8A1818] hover:bg-[#FFDAD6]/40'
              }`}
            >
              <Landmark className="h-3.5 w-3.5" />
              MLA / CM &amp; Appointments
              {approvedPassCount > 0 && (
                <span className="rounded-full bg-[#168B55] px-1.5 py-0.5 font-mono-tabular text-[10px] font-bold text-white">
                  {approvedPassCount} Pass
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('guide')}
              className={`inline-flex h-11 cursor-pointer items-center gap-1.5 rounded px-3.5 text-xs font-semibold transition-colors ${
                activeTab === 'guide'
                  ? 'bg-[#102A43] text-white'
                  : 'border border-[#CBD5E1] bg-white text-[#102A43] hover:bg-[#ECF4FF]'
              }`}
            >
              <HelpCircle className="h-3.5 w-3.5" />
              {t('tabGuide')}
            </button>
            {isWelfareOfficer && (
              <button
                type="button"
                onClick={() => setActiveTab('officer_desk')}
                className={`inline-flex h-11 cursor-pointer items-center gap-1.5 rounded px-3.5 text-xs font-semibold transition-colors ${
                  activeTab === 'officer_desk'
                    ? 'bg-[#F2A541] text-[#102A43]'
                    : 'border border-[#F2A541] bg-[#FEF5E7] text-[#8A5208]'
                }`}
              >
                <Shield className="h-3.5 w-3.5" />
                Welfare Officer Desk
              </button>
            )}
          </div>

          {myVerificationQueueCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setActiveTab('feed');
                setFeedFilter('verify');
              }}
              className="inline-flex h-11 cursor-pointer items-center gap-2 rounded border border-[#168B55] bg-[#E8F5EC] px-3.5 text-xs font-semibold text-[#168B55]"
            >
              <CheckCircle2 className="h-4 w-4" />
              {myVerificationQueueCount} Resolution{myVerificationQueueCount > 1 ? 's' : ''} Awaiting
              Your Sign-off
            </button>
          )}
        </div>

        {activeTab === 'guide' && (
          <GuideView
            mode="citizen"
            onStartReport={() => setActiveTab('submit')}
            onDismissBanner={dismissWelcome}
          />
        )}

        {activeTab === 'participation' && (
          <CitizenProfileParticipation
            uid={user.uid}
            displayName={displayName}
            isAdmin={isAdmin}
            stats={myStats}
            transactions={pointTransactions}
            activities={civicActivities}
            wards={wards}
            onShowToast={onShowToast}
          />
        )}

        {activeTab === 'leaderboard' && (
          <LeaderboardScreen
            currentUid={user.uid}
            allStats={allCitizenStats}
            wards={wards}
            complaints={complaints}
            admins={admins}
          />
        )}

        {activeTab === 'welfare' && (
          <WelfarePortalScreen
            uid={user.uid}
            displayName={displayName}
            wardNumber={profile?.wardNumber || 1}
            locality={profile?.locality || BENGALURU_LOCALITIES[0]}
            stats={myStats}
            programmes={welfareProgrammes}
            myApplications={myWelfareApplications}
            onShowToast={onShowToast}
          />
        )}

        {activeTab === 'accountability' && (
          <PublicAccountabilityDashboard
            complaints={complaints}
            wards={wards}
            allStats={allCitizenStats}
            activities={civicActivities}
            admins={admins}
            cmEscalations={cmEscalations}
          />
        )}

        {activeTab === 'appointments' && (
          <CitizenTransparencyAppointments
            uid={user.uid}
            displayName={displayName}
            defaultWardNumber={profile?.wardNumber || 1}
            defaultLocality={profile?.locality || BENGALURU_LOCALITIES[0]}
            admins={admins}
            wards={wards}
            complaints={complaints}
            cmEscalations={cmEscalations}
            myAppointments={myAppointments}
            onShowToast={onShowToast}
          />
        )}

        {activeTab === 'officer_desk' && isWelfareOfficer && (
          <WelfareOfficerDashboard
            officerUid={user.uid}
            programmes={welfareProgrammes}
            applications={allWelfareApplications}
            onShowToast={onShowToast}
          />
        )}

        {activeTab === 'submit' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <form
              onSubmit={handleSubmitComplaint}
              className="rounded-lg border border-[#102A43]/15 bg-white p-6 civic-shadow-1 lg:col-span-8"
              noValidate
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="font-display text-xl font-bold text-[#0A1D2B]">
                    {t('tabReport')}
                  </h1>
                  <p className="mt-1 text-xs text-[#52606D]">
                    {t('simpleStep1Desc')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    speakText(
                      `${t('simpleStep1Title')}. ${t('simpleStep1Desc')} ${t('simpleStep2Title')}. ${t('simpleStep2Desc')} ${t('simpleStep3Title')}. ${t('simpleStep3Desc')}`
                    )
                  }
                  className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded border border-[#102A43]/25 bg-[#ECF4FF] px-3 text-xs font-semibold text-[#102A43]"
                >
                  <Volume2 className="h-4 w-4" />
                  {t('listenAloud')}
                </button>
              </div>

              {/* STEP 1: Take Photo & Pick Big Problem Picture */}
              <div className="mt-5 rounded-lg border border-[#102A43]/15 bg-[#F7F9FF] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-[#102A43]">{t('simpleStep1Title')}</div>
                    <p className="text-xs text-[#52606D]">{t('simpleStep1Desc')}</p>
                  </div>
                  <label className="inline-flex h-12 cursor-pointer items-center gap-2 rounded bg-[#102A43] px-5 text-sm font-bold text-white hover:bg-[#0B1D2F]">
                    <Camera className="h-5 w-5" />
                    {photoDataUrl ? 'Change Photo' : t('takePhotoBtn')}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                {classifying && (
                  <div className="mt-3 text-xs font-semibold text-[#102A43]">
                    AI is looking at your photo...
                  </div>
                )}

                {photoDataUrl && (
                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <img
                      src={photoDataUrl}
                      alt="Uploaded civic issue preview"
                      className="h-44 w-full rounded border border-[#CBD5E1] object-cover"
                    />
                    {aiClassify && (
                      <div className="flex flex-col justify-between gap-2 rounded border border-[#102A43]/15 bg-white p-3.5">
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#52606D]">
                            AI Detected Issue
                          </div>
                          <div className="mt-1 text-sm font-bold text-[#0A1D2B]">
                            {aiClassify.predicted_category}{' '}
                            <span className="font-mono-tabular text-xs font-semibold text-[#168B55]">
                              ({Math.round(aiClassify.confidence * 100)}% conf)
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-[#253746]">
                            Urgency:{' '}
                            <span className="font-semibold">{aiClassify.predicted_severity}</span>
                          </div>
                          {aiClassify.visual_reason && (
                            <p className="mt-1.5 text-[11px] leading-snug text-[#43474D]">
                              <strong>Why:</strong> {aiClassify.visual_reason}
                            </p>
                          )}
                          {aiClassify.class_probabilities && (
                            <div className="mt-2 flex flex-col gap-1">
                              {Object.entries(aiClassify.class_probabilities)
                                .sort((a, b) => b[1] - a[1])
                                .map(([lbl, prob]) => (
                                  <div key={lbl} className="flex items-center gap-1.5 text-[10px]">
                                    <span className="w-28 truncate text-[#52606D]">{lbl}</span>
                                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#E2E8F0]">
                                      <div
                                        className={`h-full rounded-full ${
                                          lbl === aiClassify.predicted_category
                                            ? 'bg-[#168B55]'
                                            : 'bg-[#94A3B8]'
                                        }`}
                                        style={{ width: `${Math.round(prob * 100)}%` }}
                                      />
                                    </div>
                                    <span className="w-8 text-right font-mono-tabular text-[#43474D]">
                                      {Math.round(prob * 100)}%
                                    </span>
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>

                        <div
                          className={`rounded px-2.5 py-2 text-[11px] ${
                            aiClassify.fallback_used
                              ? 'border border-[#F2A541] bg-[#FEF5E7] text-[#8A5208]'
                              : 'border border-[#168B55]/40 bg-[#E8F5EC] text-[#168B55]'
                          }`}
                        >
                          {aiClassify.fallback_used
                            ? aiClassify.fallback_notice ||
                              'Tap a picture box below if you want to change it.'
                            : `Analyzed by ${aiClassify.model_version || '30-Feature Spatial CV + Adam MLP'}.`}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Big Pictorial Category Buttons */}
                <div className="mt-4">
                  <div className="mb-2 text-xs font-bold uppercase tracking-[0.04em] text-[#253746]">
                    Tap Problem Type:
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    {(
                      [
                        {
                          cat: IncidentCategory.Potholes,
                          label: t('catPotholes'),
                          Icon: Construction,
                        },
                        {
                          cat: IncidentCategory.GarbageAccumulation,
                          label: t('catGarbage'),
                          Icon: Trash2,
                        },
                        {
                          cat: IncidentCategory.WaterLeakage,
                          label: t('catWater'),
                          Icon: Droplets,
                        },
                        {
                          cat: IncidentCategory.BrokenStreetlights,
                          label: t('catStreetlights'),
                          Icon: Lightbulb,
                        },
                      ] as const
                    ).map(({ cat, label, Icon }) => {
                      const active = confirmedCategory === cat;
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setConfirmedCategory(cat)}
                          className={`flex min-h-[76px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 p-2.5 text-center transition-colors ${
                            active
                              ? 'border-[#102A43] bg-[#102A43] text-white'
                              : 'border-[#CBD5E1] bg-white text-[#0A1D2B] hover:border-[#102A43]/60'
                          }`}
                        >
                          <Icon
                            className={`h-6 w-6 ${active ? 'text-[#F2A541]' : 'text-[#102A43]'}`}
                          />
                          <span className="text-xs font-bold leading-tight">{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Clear Severity Selector Buttons */}
                <div className="mt-4">
                  <div className="mb-2 text-xs font-bold uppercase tracking-[0.04em] text-[#253746]">
                    How Urgent Is It?
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {(
                      [
                        { sev: 'Low', label: t('sevLow'), dot: 'bg-[#168B55]' },
                        { sev: 'Medium', label: t('sevMedium'), dot: 'bg-[#3B82F6]' },
                        { sev: 'High', label: t('sevHigh'), dot: 'bg-[#F2A541]' },
                        { sev: 'Critical', label: t('sevCritical'), dot: 'bg-[#BA1A1A]' },
                      ] as const
                    ).map(({ sev, label, dot }) => {
                      const active = confirmedSeverity === sev;
                      return (
                        <button
                          key={sev}
                          type="button"
                          onClick={() => setConfirmedSeverity(sev)}
                          className={`flex h-11 cursor-pointer items-center justify-center gap-2 rounded border-2 px-3 text-xs font-bold transition-colors ${
                            active
                              ? 'border-[#102A43] bg-[#ECF4FF] text-[#102A43]'
                              : 'border-[#E2E8F0] bg-white text-[#253746] hover:border-[#CBD5E1]'
                          }`}
                        >
                          <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
                          <span>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* STEP 2: Live Geographical Spot Picker + Area & Specific Spot */}
              <div className="mt-5 flex flex-col gap-4 rounded-lg border border-[#E2E8F0] bg-[#F5F7FA] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-bold text-[#102A43]">{t('simpleStep2Title')}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-[#168B55] font-medium">
                      <span>{gpsStatus}</span>
                      <button
                        type="button"
                        onClick={() => setShowManualCoords((prev) => !prev)}
                        className="cursor-pointer font-semibold text-[#102A43] underline"
                      >
                        {showManualCoords ? 'Hide Coordinates' : 'Edit Lat/Lng'}
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {gpsBlockedByFrame && typeof window !== 'undefined' && (
                      <a
                        href={window.location.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-11 items-center gap-1.5 rounded border border-[#102A43] bg-white px-3.5 text-xs font-bold text-[#102A43] hover:bg-[#ECF4FF]"
                      >
                        <MapPin className="h-4 w-4 text-[#168B55]" />
                        Open Full Tab for Live GPS
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={handleCaptureGps}
                      className="inline-flex h-11 cursor-pointer items-center gap-2 rounded bg-[#102A43] px-4 text-xs font-bold text-white hover:bg-[#0B1D2F]"
                    >
                      <Compass className="h-4 w-4 text-[#F2A541]" />
                      {t('tapGpsBtn')}
                    </button>
                  </div>
                </div>

                {/* Live Interactive Leaflet & OpenStreetMap Spot Picker */}
                <CivicSpotPickerMap
                  latitude={latitude}
                  longitude={longitude}
                  externalResolved={resolvedGeo}
                  heightClass="h-[290px]"
                  onSelectLocation={(coords, resolved) =>
                    applyResolvedSpot(coords, resolved, 'Pinned on live map')
                  }
                />

                {showManualCoords && (
                  <div className="grid grid-cols-1 gap-3 rounded border border-[#CBD5E1] bg-white p-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-[0.04em] text-[#253746]">
                        Latitude (Bengaluru ~12.84 – 13.12)
                      </label>
                      <input
                        type="number"
                        step="0.000001"
                        value={latitude}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (!Number.isNaN(v)) setLatitude(v);
                        }}
                        className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] px-3 font-mono-tabular text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-[0.04em] text-[#253746]">
                        Longitude (Bengaluru ~77.45 – 77.78)
                      </label>
                      <input
                        type="number"
                        step="0.000001"
                        value={longitude}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (!Number.isNaN(v)) setLongitude(v);
                        }}
                        className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] px-3 font-mono-tabular text-xs"
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-[0.04em] text-[#253746]">
                      Municipal Ward
                    </label>
                    <select
                      value={wardNumber}
                      onChange={(e) => {
                        const wNum = Number(e.target.value);
                        setWardNumber(wNum);
                        const coords = BENGALURU_WARD_COORDS[wNum];
                        if (coords) {
                          setLatitude(coords.lat);
                          setLongitude(coords.lng);
                          void reverseGeocodeSpot(coords.lat, coords.lng)
                            .then((geo) => applyResolvedSpot(coords, geo, `Ward 0${wNum}`))
                            .catch(() =>
                              setGpsStatus(`Location set to Ward 0${wNum} (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`)
                            );
                        }
                      }}
                      className="civic-input mt-1 h-12 w-full rounded border border-[#CBD5E1] bg-white px-3 text-sm"
                    >
                      {wards.map((w) => (
                        <option key={w.wardNumber} value={w.wardNumber}>
                          Ward 0{w.wardNumber} — {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-[0.04em] text-[#253746]">
                      Locality / Area
                    </label>
                    <select
                      value={locality}
                      onChange={(e) => {
                        const loc = e.target.value;
                        setLocality(loc);
                        const coords = BENGALURU_LOCALITY_COORDS[loc];
                        if (coords) {
                          setLatitude(coords.lat);
                          setLongitude(coords.lng);
                          void reverseGeocodeSpot(coords.lat, coords.lng)
                            .then((geo) => applyResolvedSpot(coords, geo, loc))
                            .catch(() =>
                              setGpsStatus(`Location ready: ${loc} (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`)
                            );
                        }
                      }}
                      className="civic-input mt-1 h-12 w-full rounded border border-[#CBD5E1] bg-white px-3 text-sm"
                    >
                      {BENGALURU_LOCALITIES.map((loc) => (
                        <option key={loc} value={loc}>
                          {loc}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-[0.04em] text-[#253746]">
                      Specific Spot / Street / Landmark
                    </label>
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Auto-filled from map pin, or add shop / pole..."
                      className="civic-input mt-1 h-12 w-full rounded border border-[#CBD5E1] bg-white px-3 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* STEP 3: Optional Short Note & Big Send Button */}
              <div className="mt-5 flex flex-col gap-3">
                <div className="text-sm font-bold text-[#102A43]">{t('simpleStep3Title')}</div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-[0.04em] text-[#253746]">
                      Short Title (Optional — auto-filled if blank)
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={`${confirmedCategory} near ${locality}`}
                      className="civic-input mt-1 h-11 w-full rounded border border-[#CBD5E1] px-3 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-[0.04em] text-[#253746]">
                      More Details (Optional)
                    </label>
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe hazard or how long it has been broken..."
                      className="civic-input mt-1 h-11 w-full rounded border border-[#CBD5E1] px-3 text-sm"
                    />
                  </div>
                </div>
              </div>

              {formError && (
                <div className="mt-4 rounded border border-[#BA1A1A] bg-[#FFDAD6] px-3 py-2 text-xs font-medium text-[#BA1A1A]">
                  {formError}
                </div>
              )}

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#E2E8F0] pt-4">
                <button
                  type="button"
                  disabled={checkingDuplicates}
                  onClick={handleRunDuplicateCheck}
                  className="inline-flex h-12 cursor-pointer items-center gap-2 rounded border border-[#102A43] px-4 text-xs font-semibold text-[#102A43] hover:bg-[#ECF4FF]"
                >
                  {checkingDuplicates ? 'Checking Nearby Reports...' : 'Check Nearby Duplicates (100m)'}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex h-12 cursor-pointer items-center gap-2 rounded bg-[#168B55] px-7 text-sm font-bold text-white hover:bg-[#127446] disabled:opacity-60"
                >
                  {submitting ? 'Sending Report...' : t('sendReportBtn')}
                </button>
              </div>
            </form>

            {/* Right Duplicate Pre-Check Panel */}
            <aside className="rounded-lg border border-[#102A43]/15 bg-white p-5 civic-shadow-1 lg:col-span-4">
              <h2 className="font-display text-base font-semibold text-[#0A1D2B]">
                Nearby Duplicate Check (Objective 2)
              </h2>
              <p className="mt-1 text-xs text-[#52606D]">
                Searches open reports within 100m using Haversine GPS + multimodal similarity.
              </p>

              {duplicateNotice && (
                <div className="mt-3 rounded border border-[#CBD5E1] bg-[#F5F7FA] p-2.5 text-[11px] text-[#43474D]">
                  {duplicateNotice}
                </div>
              )}

              {duplicateMatches.length === 0 ? (
                <div className="mt-4 rounded border border-[#E2E8F0] bg-[#F5F7FA] p-4 text-xs text-[#52606D]">
                  No high-confidence nearby duplicate detected yet. Click &ldquo;Check Nearby
                  Duplicates&rdquo; after entering location and description.
                </div>
              ) : (
                <div className="mt-4 flex flex-col gap-3">
                  <div className="flex items-start gap-2 rounded border border-[#F2A541] bg-[#FEF5E7] p-3 text-xs text-[#8A5208]">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      {duplicateMatches.length} similar nearby issue(s) found. Consider supporting
                      the original report instead, or submit to flag for Admin review.
                    </span>
                  </div>
                  {duplicateMatches.map((m) => (
                    <div
                      key={m.original_complaint_id}
                      className="rounded border border-[#CBD5E1] p-3 text-xs"
                    >
                      <div className="flex items-center justify-between font-mono-tabular font-bold text-[#102A43]">
                        <span>{m.original_complaint_id}</span>
                        <span>{Math.round(m.duplicate_confidence * 100)}% match</span>
                      </div>
                      <div className="mt-1 text-[#43474D]">
                        Distance: {m.distance_meters}m · Text sim:{' '}
                        {Math.round(m.text_similarity * 100)}% · Image sim:{' '}
                        {Math.round(m.image_similarity * 100)}%
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          handleSupport(m.original_complaint_id);
                          setActiveTab('feed');
                        }}
                        className="mt-2 h-8 w-full rounded bg-[#168B55] text-xs font-semibold text-white hover:bg-[#127446] cursor-pointer"
                      >
                        Support Original Instead
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </aside>
          </div>
        )}

        {activeTab === 'feed' && (
          /* Citizen Community Feed & Live Geographical Map */
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-[#E2E8F0] bg-white p-2">
              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    { id: 'all', label: `All Community Issues (${complaints.length})` },
                    {
                      id: 'mine',
                      label: `My Submitted Reports (${
                        complaints.filter((c) => c.reporterUid === user.uid).length
                      })`,
                    },
                    {
                      id: 'verify',
                      label: `Awaiting My Verification (${myVerificationQueueCount})`,
                    },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFeedFilter(tab.id)}
                    className={`h-9 rounded px-3 text-xs font-semibold cursor-pointer ${
                      feedFilter === tab.id
                        ? 'bg-[#102A43] text-white'
                        : 'text-[#253746] hover:bg-[#F5F7FA]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowFeedMap((prev) => !prev)}
                className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded border border-[#102A43]/25 bg-[#ECF4FF] px-3 text-xs font-semibold text-[#102A43] hover:bg-[#D7EAFE]"
              >
                <Globe2 className="h-3.5 w-3.5" />
                {showFeedMap ? 'Hide Live Map' : 'Show Live Map'}
              </button>
            </div>

            {showFeedMap && (
              <div className="rounded-lg border border-[#102A43]/15 bg-white p-4 civic-shadow-1">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-display text-base font-semibold text-[#0A1D2B]">
                      Live Geographical Civic Issue Map (Bengaluru)
                    </h2>
                    <p className="text-xs text-[#52606D]">
                      Every pin marks the exact reported street, spot, and area. Tap a pin to inspect or support.
                    </p>
                  </div>
                </div>
                <CivicIncidentsLiveMap
                  incidents={visibleComplaints}
                  selectedWard={null}
                  actionLabel="Inspect & Support"
                  heightClass="h-[320px]"
                  onSelectIncident={(inc) => {
                    setInspectedComplaint(inc);
                    const mine = inc.reporterUid === user.uid;
                    setContribType(
                      !mine &&
                        (inc.status === IncidentStatus.Resolved ||
                          inc.status === IncidentStatus.Verified)
                        ? 'independent_verification'
                        : 'additional_info'
                    );
                  }}
                />
              </div>
            )}

            {visibleComplaints.length === 0 ? (
              <div className="rounded-lg border border-[#102A43]/10 bg-white px-6 py-12 text-center civic-shadow-1">
                <h2 className="font-display text-lg font-semibold text-[#0A1D2B]">
                  No civic reports in this view yet
                </h2>
                <p className="mt-1 text-xs text-[#52606D]">
                  Report an infrastructure issue with a site photo to initiate AI triage and ward
                  dispatch.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('submit')}
                  className="mt-4 h-11 rounded bg-[#102A43] px-5 text-xs font-semibold text-white hover:bg-[#0B1D2F] cursor-pointer"
                >
                  Report First Issue
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {visibleComplaints.map((item) => {
                  const isMine = item.reporterUid === user.uid;
                  const alreadySupported = Boolean(supportedMap[item.id]);
                  const canCitizenVerify =
                    isMine && item.status === IncidentStatus.Resolved;

                  return (
                    <article
                      key={item.id}
                      className="flex flex-col justify-between rounded-lg border border-[#102A43]/10 bg-white p-4 civic-shadow-1"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono-tabular text-xs font-bold text-[#102A43]">
                            {item.id}
                          </span>
                          <StatusBadge status={item.status} />
                        </div>

                        {item.photoDataUrl && (
                          <img
                            src={item.photoDataUrl}
                            alt={item.title}
                            className="mt-3 h-36 w-full rounded border border-[#E2E8F0] object-cover"
                          />
                        )}

                        <div className="mt-3 flex items-center gap-2 text-xs text-[#43474D]">
                          <CategoryIcon category={item.category} className="h-3.5 w-3.5 text-[#102A43]" />
                          <span className="font-semibold text-[#0A1D2B]">{item.category}</span>
                          <span>·</span>
                          <PriorityText priority={item.priority} />
                          <span className="ml-auto font-mono-tabular text-[11px] font-bold text-[#102A43]">
                            Score {item.priorityScore}/100
                          </span>
                        </div>

                        <h3 className="mt-2 font-display text-base font-semibold text-[#0A1D2B]">
                          {item.title}
                        </h3>
                        <p className="mt-1 line-clamp-2 text-xs text-[#43474D]">
                          {item.description}
                        </p>

                        <div className="mt-2.5 rounded border border-[#E2E8F0] bg-[#F5F7FA] px-2.5 py-2 text-[11px] text-[#253746]">
                          <div className="flex items-start gap-1.5 font-semibold text-[#0A1D2B]">
                            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#BA1A1A]" />
                            <span className="line-clamp-2">{item.address}</span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center justify-between gap-1 text-[10px] text-[#52606D]">
                            <span>
                              Area: <strong>{item.locality}</strong> · Ward 0{item.wardNumber} ({item.wardName})
                            </span>
                            <a
                              href={buildOpenStreetMapExternalUrl(item.latitude, item.longitude)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-0.5 font-semibold text-[#102A43] hover:underline"
                            >
                              Map
                              <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          </div>
                        </div>

                        {item.isMergedDuplicate && item.masterComplaintId && (
                          <div className="mt-2 rounded border border-[#CBD5E1] bg-[#F5F7FA] px-2.5 py-1.5 text-[11px] text-[#253746]">
                            Linked to master complaint{' '}
                            <span className="font-mono-tabular font-bold">
                              {item.masterComplaintId}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#E2E8F0] pt-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={
                              isMine ||
                              alreadySupported ||
                              supportingId === item.id ||
                              item.status === IncidentStatus.Verified
                            }
                            onClick={() => handleSupport(item.id)}
                            title={
                              isMine
                                ? 'Reporters cannot self-support their own complaint'
                                : 'Support this civic complaint'
                            }
                            className={`inline-flex h-10 items-center gap-1.5 rounded border px-3 text-xs font-semibold cursor-pointer disabled:cursor-default ${
                              isMine
                                ? 'border-[#E2E8F0] bg-[#F5F7FA] text-[#52606D]'
                                : alreadySupported
                                  ? 'border-[#168B55] bg-[#E8F5EC] text-[#168B55]'
                                  : 'border-[#CBD5E1] bg-white text-[#102A43] hover:bg-[#ECF4FF]'
                            }`}
                          >
                            <ThumbsUp className="h-3.5 w-3.5" />
                            <span>
                              {isMine
                                ? `Your Report (${item.supportCount})`
                                : alreadySupported
                                  ? `${t('supportedBtn')} (${item.supportCount})`
                                  : `${t('supportBtn')} (${item.supportCount})`}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              speakText(
                                `${item.title}. ${item.category}. ${item.address}, Ward ${item.wardNumber}. Status ${item.status}.`
                              )
                            }
                            aria-label={`${t('listenAloud')} ${item.id}`}
                            className="inline-flex h-10 cursor-pointer items-center gap-1 rounded border border-[#CBD5E1] bg-white px-2.5 text-xs font-semibold text-[#253746] hover:bg-[#F5F7FA]"
                          >
                            <Volume2 className="h-3.5 w-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setInspectedComplaint(item);
                              setContribType(
                                !isMine &&
                                  (item.status === IncidentStatus.Resolved ||
                                    item.status === IncidentStatus.Verified)
                                  ? 'independent_verification'
                                  : 'additional_info'
                              );
                            }}
                            className="inline-flex h-10 items-center gap-1.5 rounded border border-[#102A43]/30 bg-white px-3 text-xs font-semibold text-[#102A43] hover:bg-[#ECF4FF] cursor-pointer"
                          >
                            <MessageSquarePlus className="h-3.5 w-3.5" />
                            Participate
                          </button>
                        </div>

                        {canCitizenVerify && (
                          <button
                            type="button"
                            onClick={() => setVerifyingComplaint(item)}
                            className="inline-flex h-10 items-center gap-1.5 rounded bg-[#168B55] px-3 text-xs font-semibold text-white hover:bg-[#127446] cursor-pointer"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {t('verifyFixBtn')}
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Citizen Complaint Participation Modal (Add Info, Flag Duplicate, Independent Verification) */}
      {inspectedComplaint && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#102A43]/50 p-4"
          onClick={() => setInspectedComplaint(null)}
        >
          <div
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 civic-shadow-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-[#E2E8F0] pb-4">
              <div>
                <div className="font-mono-tabular text-xs font-bold text-[#102A43]">
                  {inspectedComplaint.id} · {inspectedComplaint.locality} (Ward 0
                  {inspectedComplaint.wardNumber})
                </div>
                <h2 className="mt-1 font-display text-xl font-semibold text-[#0A1D2B]">
                  {inspectedComplaint.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setInspectedComplaint(null)}
                className="rounded p-1.5 text-[#52606D] hover:bg-[#F5F7FA] cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-4 text-xs">
              <p className="text-[#253746]">{inspectedComplaint.description}</p>

              <div className="rounded border border-[#102A43]/15 bg-[#F5F7FA] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.04em] text-[#52606D]">
                      Exact Spot, Area &amp; Ward
                    </div>
                    <div className="font-semibold text-[#0A1D2B]">{inspectedComplaint.address}</div>
                    <div className="text-[11px] text-[#43474D]">
                      Area: {inspectedComplaint.locality} · Ward 0{inspectedComplaint.wardNumber} (
                      {inspectedComplaint.wardName}) · {inspectedComplaint.coordinates}
                    </div>
                  </div>
                  <a
                    href={buildOpenStreetMapExternalUrl(
                      inspectedComplaint.latitude,
                      inspectedComplaint.longitude
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded border border-[#102A43] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#102A43] hover:bg-[#ECF4FF]"
                  >
                    Open in OpenStreetMap
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <div className="mt-2.5">
                  <CivicSpotPickerMap
                    latitude={inspectedComplaint.latitude}
                    longitude={inspectedComplaint.longitude}
                    readOnly
                    showSearch={false}
                    showResolvedPanel={false}
                    heightClass="h-[190px]"
                    pinLabel={inspectedComplaint.address}
                  />
                </div>
              </div>

              {!isAdmin &&
                inspectedComplaint.slaHoursRemaining < 0 &&
                inspectedComplaint.status !== IncidentStatus.Resolved &&
                inspectedComplaint.status !== IncidentStatus.Verified && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-[#BA1A1A] bg-[#FFDAD6] px-3 py-2.5 text-xs text-[#7A1010]">
                    <div className="flex items-center gap-2 font-semibold">
                      <ShieldAlert className="h-4 w-4 shrink-0 text-[#BA1A1A]" />
                      <span>
                        SLA breached by {Math.abs(Math.round(inspectedComplaint.slaHoursRemaining))}h —
                        notify Chief Minister Oversight or apply for MLA/CM hearing.
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={escalatingSla}
                      onClick={() => handleEscalateSlaBreachToCm(inspectedComplaint)}
                      className="h-8 cursor-pointer rounded bg-[#BA1A1A] px-3 text-[11px] font-bold text-white hover:bg-[#991515]"
                    >
                      {escalatingSla ? 'Notifying CM...' : 'Notify CM Directly'}
                    </button>
                  </div>
                )}

              {/* Submit Citizen Contribution Form */}
              <form
                onSubmit={handleSubmitContribution}
                className="rounded border border-[#102A43]/15 bg-[#F7F9FF] p-4"
              >
                <div className="font-bold uppercase tracking-[0.04em] text-[#102A43]">
                  Contribute to Civic Verification
                </div>
                <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => setContribType('additional_info')}
                    className={`h-9 rounded px-2.5 text-xs font-semibold cursor-pointer ${
                      contribType === 'additional_info'
                        ? 'bg-[#102A43] text-white'
                        : 'border border-[#CBD5E1] bg-white text-[#253746]'
                    }`}
                  >
                    Additional Info (+5 pts)
                  </button>
                  <button
                    type="button"
                    onClick={() => setContribType('duplicate_flag')}
                    className={`h-9 rounded px-2.5 text-xs font-semibold cursor-pointer ${
                      contribType === 'duplicate_flag'
                        ? 'bg-[#102A43] text-white'
                        : 'border border-[#CBD5E1] bg-white text-[#253746]'
                    }`}
                  >
                    Flag Duplicate (+5 pts)
                  </button>
                  <button
                    type="button"
                    disabled={
                      inspectedComplaint.reporterUid === user.uid ||
                      (inspectedComplaint.status !== IncidentStatus.Resolved &&
                        inspectedComplaint.status !== IncidentStatus.Verified)
                    }
                    onClick={() => setContribType('independent_verification')}
                    title={
                      inspectedComplaint.reporterUid === user.uid
                        ? 'Independent verification must be done by another citizen'
                        : 'Available once complaint is marked Resolved'
                    }
                    className={`h-9 rounded px-2.5 text-xs font-semibold cursor-pointer disabled:opacity-50 ${
                      contribType === 'independent_verification'
                        ? 'bg-[#168B55] text-white'
                        : 'border border-[#CBD5E1] bg-white text-[#253746]'
                    }`}
                  >
                    Independent Check (+15 pts)
                  </button>
                </div>

                {contribType === 'duplicate_flag' && (
                  <div className="mt-3">
                    <label className="block font-semibold text-[#253746]">
                      Original / Related Complaint ID
                    </label>
                    <select
                      value={relatedComplaintId}
                      onChange={(e) => setRelatedComplaintId(e.target.value)}
                      className="civic-input mt-1 h-9 w-full rounded border border-[#CBD5E1] bg-white px-2.5"
                    >
                      <option value="">Select matching complaint (optional)...</option>
                      {complaints
                        .filter((c) => c.id !== inspectedComplaint.id)
                        .slice(0, 30)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.id} — {c.title}
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                {contribType === 'independent_verification' && (
                  <div className="mt-3 flex flex-wrap gap-3">
                    <label className="flex items-center gap-1.5 font-semibold text-[#168B55]">
                      <input
                        type="radio"
                        name="verifOutcome"
                        checked={verifOutcome === 'confirmed_fixed'}
                        onChange={() => setVerifOutcome('confirmed_fixed')}
                      />
                      Confirmed Genuinely Fixed
                    </label>
                    <label className="flex items-center gap-1.5 font-semibold text-[#BA1A1A]">
                      <input
                        type="radio"
                        name="verifOutcome"
                        checked={verifOutcome === 'still_unresolved'}
                        onChange={() => setVerifOutcome('still_unresolved')}
                      />
                      Issue Remains Unresolved
                    </label>
                  </div>
                )}

                <textarea
                  rows={2}
                  value={contribNote}
                  onChange={(e) => setContribNote(e.target.value)}
                  placeholder={
                    contribType === 'duplicate_flag'
                      ? 'Explain why this matches another open complaint...'
                      : contribType === 'independent_verification'
                        ? 'Describe on-site inspection result after repair...'
                        : 'Add helpful hazard landmarks, timing, or access details...'
                  }
                  className="civic-input mt-3 w-full rounded border border-[#CBD5E1] bg-white p-2.5"
                />

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded border border-[#CBD5E1] bg-white px-3 font-semibold text-[#253746]">
                    <Upload className="h-3.5 w-3.5" />
                    {contribPhotoUrl ? 'Photo Attached' : 'Attach Field Photo (Optional)'}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleContribPhotoUpload}
                      className="hidden"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={submittingContrib}
                    className="h-9 rounded bg-[#102A43] px-4 font-semibold text-white cursor-pointer"
                  >
                    {submittingContrib ? 'Submitting...' : 'Submit Contribution'}
                  </button>
                </div>
              </form>

              {/* Existing Contributions */}
              <div>
                <div className="font-bold uppercase tracking-[0.04em] text-[#52606D]">
                  Community Contributions ({complaintContributions.length})
                </div>
                {complaintContributions.length === 0 ? (
                  <p className="mt-1 text-[#52606D]">No community contributions recorded yet.</p>
                ) : (
                  <div className="mt-2 flex flex-col gap-2">
                    {complaintContributions.map((c) => (
                      <div key={c.id} className="rounded border border-[#E2E8F0] bg-[#F5F7FA] p-2.5">
                        <div className="flex items-center justify-between font-semibold">
                          <span>
                            {c.contributorName} · {c.type.replace('_', ' ')}
                          </span>
                          <span className="font-mono-tabular uppercase text-[#102A43]">
                            {c.status}
                            {c.pointsAwarded > 0 ? ` (+${c.pointsAwarded} pts)` : ''}
                          </span>
                        </div>
                        <p className="mt-1 text-[#253746]">{c.note}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Citizen Resolution Verification Modal (Objective 4 Sign-off / Dispute) */}
      {verifyingComplaint && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#102A43]/50 p-4"
          onClick={() => setVerifyingComplaint(null)}
        >
          <div
            className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white p-6 civic-shadow-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-[#E2E8F0] pb-4">
              <div>
                <div className="font-mono-tabular text-xs font-bold text-[#102A43]">
                  {verifyingComplaint.id} · CITIZEN RESOLUTION VERIFICATION
                </div>
                <h2 className="mt-1 font-display text-xl font-semibold text-[#0A1D2B]">
                  {verifyingComplaint.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setVerifyingComplaint(null)}
                className="rounded border border-[#CBD5E1] px-3 py-1.5 text-xs font-semibold text-[#253746] cursor-pointer"
              >
                Close
              </button>
            </div>

            {verifications.length === 0 ? (
              <div className="mt-4 rounded border border-[#E2E8F0] bg-[#F5F7FA] p-4 text-xs text-[#52606D]">
                Loading submitted field verification evidence...
              </div>
            ) : (
              <div className="mt-4 flex flex-col gap-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="rounded border border-[#E2E8F0] p-3">
                    <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#52606D]">
                      Before (Your Original Evidence)
                    </div>
                    {verifyingComplaint.photoDataUrl ? (
                      <img
                        src={verifyingComplaint.photoDataUrl}
                        alt="Before repair"
                        className="mt-2 h-48 w-full rounded object-cover"
                      />
                    ) : (
                      <div className="mt-2 flex h-48 items-center justify-center rounded bg-[#F5F7FA] text-xs text-[#52606D]">
                        No original photo attached
                      </div>
                    )}
                  </div>
                  <div className="rounded border border-[#168B55]/40 p-3">
                    <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#168B55]">
                      After (Admin Resolution Proof)
                    </div>
                    <img
                      src={verifications[0].afterPhotoDataUrl}
                      alt="After repair"
                      className="mt-2 h-48 w-full rounded object-cover"
                    />
                  </div>
                </div>

                <div className="rounded border border-[#102A43]/15 bg-[#F7F9FF] p-4 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-[#102A43]">
                      AI Evidence Check: {verifications[0].aiRecommendation}
                    </span>
                    <span className="font-mono-tabular text-[#253746]">
                      GPS Delta: {verifications[0].gpsDistanceMeters.toFixed(1)}m · SSIM:{' '}
                      {verifications[0].ssimScore.toFixed(2)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[#253746]">{verifications[0].aiExplanation}</p>
                  <p className="mt-2 border-t border-[#E2E8F0] pt-2 text-[#43474D]">
                    <strong>Admin Notes:</strong> {verifications[0].resolutionNotes} (Location:{' '}
                    {verifications[0].resolutionLocation})
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-[0.04em] text-[#253746]">
                    Citizen Feedback Note (Optional for confirm, recommended if disputing)
                  </label>
                  <textarea
                    rows={2}
                    value={citizenNote}
                    onChange={(e) => setCitizenNote(e.target.value)}
                    placeholder="Confirm work quality or explain why the issue remains unresolved..."
                    className="civic-input mt-1 w-full rounded border border-[#CBD5E1] p-3 text-sm"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded border border-[#CBD5E1] px-3 text-xs font-semibold text-[#253746] hover:bg-[#F5F7FA]">
                    <Upload className="h-3.5 w-3.5" />
                    {disputePhotoUrl ? 'Dispute Photo Attached' : 'Attach Dispute Photo (Optional)'}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleDisputePhotoUpload}
                      className="hidden"
                    />
                  </label>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      disabled={submittingDecision}
                      onClick={() => handleCitizenVerificationDecision('disputed')}
                      className="inline-flex h-11 items-center gap-1.5 rounded border border-[#BA1A1A] bg-[#FFDAD6] px-4 text-xs font-semibold text-[#BA1A1A] hover:bg-[#fbc9c3] cursor-pointer"
                    >
                      <ShieldAlert className="h-4 w-4" />
                      Dispute &amp; Reopen
                    </button>
                    <button
                      type="button"
                      disabled={submittingDecision}
                      onClick={() => handleCitizenVerificationDecision('confirmed')}
                      className="inline-flex h-11 items-center gap-1.5 rounded bg-[#168B55] px-5 text-xs font-semibold text-white hover:bg-[#127446] cursor-pointer"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Confirm Resolved
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
