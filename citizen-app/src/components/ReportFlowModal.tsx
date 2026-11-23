import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronRight,
  Flag,
  ImagePlus,
  LocateFixed,
  MapPin,
  Mic,
  MicOff,
  Search,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  COMPLAINT_CATEGORIES,
  KARNATAKA_BOUNDS,
  SEVERITY_LEVELS,
} from '@shared/constants';
import { runDuplicateEngine } from '@shared/duplicate';
import { isInsideBengaluru, isInsideKarnataka, lookupConstituency } from '@shared/geo';
import { UI_STRINGS } from '@shared/i18n';
import { stripUndefinedDeep } from '@shared/normalizers';
import { computePriorityScore } from '@shared/priority';
import type {
  AreaCluster,
  Complaint,
  ComplaintCategory,
  ConstituencyBoundary,
  DuplicateCheckResult,
  MediaAuthenticityMetadata,
  MediaInspectionResult,
  SeverityLevel,
  SupportedLanguage,
} from '@shared/types';
import { doc, setDoc, updateDoc, arrayUnion, increment } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { requestBestCurrentPosition } from '../utils/gps';
import { BengaluruMap } from './BengaluruMap';

interface ReportFlowModalProps {
  open: boolean;
  onClose: () => void;
  language: SupportedLanguage;
  simpleMode: boolean;
  constituencies: ConstituencyBoundary[];
  existingComplaints: Complaint[];
  existingClusters: AreaCluster[];
  onSubmitted: (message: string, newComplaintId?: string) => void;
  onCitizenActivity?: (kind: 'report' | 'support') => void;
}

function compressImageDataUrl(file: File, maxDim = 900): Promise<string> {
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
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      };
      img.onerror = () => reject(new Error('Could not read image'));
      img.src = String(reader.result || '');
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export const ReportFlowModal: React.FC<ReportFlowModalProps> = ({
  open,
  onClose,
  language,
  simpleMode,
  constituencies,
  existingComplaints,
  existingClusters,
  onSubmitted,
  onCitizenActivity,
}) => {
  const t = UI_STRINGS[language] || UI_STRINGS.en;

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [busy, setBusy] = useState(false);
  const [photoAnalyzing, setPhotoAnalyzing] = useState(false);
  const [photoDetectionNotice, setPhotoDetectionNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Tap 1: Photo or Voice + editable fields
  const [photoDataUrl, setPhotoDataUrl] = useState<string>('');
  const [mediaInfo, setMediaInfo] = useState<MediaInspectionResult | null>(null);
  const [appealNote, setAppealNote] = useState('');
  const [recording, setRecording] = useState(false);
  const [retainAudio, setRetainAudio] = useState(false);
  const [placeClues, setPlaceClues] = useState('');

  const [detectedLang, setDetectedLang] = useState<SupportedLanguage>(language);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [englishTranslation, setEnglishTranslation] = useState('');
  const [category, setCategory] = useState<ComplaintCategory>('Potholes');
  const [severity, setSeverity] = useState<SeverityLevel>('Medium');
  const [aiMeta, setAiMeta] = useState<{
    suggestedCategory: ComplaintCategory;
    suggestedSeverity: SeverityLevel;
    suggestedTitle: string;
    suggestedDescription: string;
    englishTranslation: string;
    hasAiSuggestion: boolean;
  }>({
    suggestedCategory: 'Potholes',
    suggestedSeverity: 'Medium',
    suggestedTitle: '',
    suggestedDescription: '',
    englishTranslation: '',
    hasAiSuggestion: false,
  });

  // Tap 2: Location pin (entire Karnataka — NO ward/constituency dropdowns!)
  const [pinLat, setPinLat] = useState<number>(KARNATAKA_BOUNDS.centerLat);
  const [pinLng, setPinLng] = useState<number>(KARNATAKA_BOUNDS.centerLng);
  const [localityName, setLocalityName] = useState('Bengaluru');
  const [addressLabel, setAddressLabel] = useState('Bengaluru Center');
  const [boundaryFlagDone, setBoundaryFlagDone] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsNotice, setGpsNotice] = useState<string | null>(null);
  const [gpsAccuracyMeters, setGpsAccuracyMeters] = useState<number | null>(null);
  const [gpsStatusKind, setGpsStatusKind] = useState<
    'idle' | 'searching' | 'locked' | 'approx' | 'warning' | 'error'
  >('idle');
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeResults, setPlaceResults] = useState<
    Array<{ label: string; lat: number; lng: number; locality: string }>
  >([]);
  const [placeSearching, setPlaceSearching] = useState(false);

  // Tap 3: Duplicate check + privacy toggles
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [shareContactConsent, setShareContactConsent] = useState(false);
  const [dupResult, setDupResult] = useState<DuplicateCheckResult | null>(null);
  const [distinctOverridden, setDistinctOverridden] = useState(false);

  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const userEditedTitleRef = useRef(false);
  const userEditedDescRef = useRef(false);
  const gpsCancelRef = useRef<(() => void) | null>(null);
  const pinLockedByUserOrExifRef = useRef(false);
  const gpsLockedThisSessionRef = useRef(false);

  const lookup = lookupConstituency(pinLat, pinLng, constituencies);
  const cleanArea = (localityName || 'Karnataka').trim();
  const areaSlug =
    cleanArea
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'karnataka';
  const insideBengaluruPin = isInsideBengaluru(pinLat, pinLng);
  const resolvedConstituency =
    lookup.constituency ||
    (lookup.insideServiceArea
      ? {
          id: insideBengaluruPin ? 'bengaluru-central-desk' : `karnataka-${areaSlug}-desk`,
          name: insideBengaluruPin
            ? 'Bengaluru (Pending Boundary Import)'
            : `${cleanArea}, Karnataka`,
          mlaName: insideBengaluruPin
            ? 'Bengaluru Civic Desk'
            : `${cleanArea} Civic & MLA Desk`,
          isDemo: false,
        }
      : null);

  // Live citizen-layer duplicate detection across all active Karnataka complaints
  const liveDupResult = useMemo<DuplicateCheckResult>(() => {
    return runDuplicateEngine(
      {
        latitude: pinLat,
        longitude: pinLng,
        category,
        title: title || `${category} near ${localityName}`,
        description: description || `${category} reported at ${addressLabel}`,
        englishTranslation: englishTranslation || description,
        dHash: mediaInfo?.dHash,
        sha256: mediaInfo?.sha256,
        reusedComplaintId: mediaInfo?.reusedComplaintId,
      },
      existingComplaints.map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        englishTranslation: c.englishTranslation,
        originalText: c.originalText,
        localityName: c.localityName,
        photoDataUrl: c.photoDataUrl,
        reporterUid: c.reporterUid,
        upvoterUids: c.upvoterUids,
        category: c.category,
        status: c.status,
        latitude: c.latitude,
        longitude: c.longitude,
        upvoteCount: c.upvoteCount,
        clusterId: c.clusterId,
        dHash: c.mediaAuth?.dHash,
        sha256: c.mediaAuth?.sha256,
      })),
      existingClusters
    );
  }, [
    pinLat,
    pinLng,
    category,
    title,
    description,
    englishTranslation,
    localityName,
    addressLabel,
    mediaInfo?.dHash,
    mediaInfo?.sha256,
    mediaInfo?.reusedComplaintId,
    existingComplaints,
    existingClusters,
  ]);

  function resetDraftForm() {
    setPhotoDataUrl('');
    setMediaInfo(null);
    setAppealNote('');
    setPlaceClues('');
    setTitle('');
    setDescription('');
    setEnglishTranslation('');
    setCategory('Potholes');
    setSeverity('Medium');
    setDetectedLang(language);
    setPhotoDetectionNotice(null);
    setPhotoAnalyzing(false);
    userEditedTitleRef.current = false;
    userEditedDescRef.current = false;
    setAiMeta({
      suggestedCategory: 'Potholes',
      suggestedSeverity: 'Medium',
      suggestedTitle: '',
      suggestedDescription: '',
      englishTranslation: '',
      hasAiSuggestion: false,
    });
  }

  function requestGpsLocation(userInitiated = false) {
    gpsCancelRef.current?.();
    if (userInitiated) {
      pinLockedByUserOrExifRef.current = false;
    }

    setGpsBusy(true);
    setGpsStatusKind('searching');
    setGpsNotice('Detecting your current GPS location...');

    const { promise, cancel } = requestBestCurrentPosition({
      onRefine: (fix) => {
        if (!userInitiated && pinLockedByUserOrExifRef.current) return;
        if (isInsideKarnataka(fix.lat, fix.lng)) {
          setPinLat(fix.lat);
          setPinLng(fix.lng);
          setGpsAccuracyMeters(fix.accuracyMeters);
          setBoundaryFlagDone(false);
          if (fix.isLowAccuracy) {
            setGpsStatusKind('approx');
            setGpsNotice(
              `Approximate device location (±${fix.accuracyMeters}m via network/Wi-Fi). Refining GPS or drag pin to exact spot.`
            );
          } else {
            setGpsStatusKind('locked');
            setGpsNotice(`Current GPS locked (±${fix.accuracyMeters}m).`);
          }
        }
      },
    });
    gpsCancelRef.current = cancel;

    void promise.then((outcome) => {
      setGpsBusy(false);
      if (!outcome.ok) {
        setGpsStatusKind('error');
        setGpsNotice(outcome.message);
        return;
      }

      const { fix } = outcome;
      if (!userInitiated && pinLockedByUserOrExifRef.current) return;

      if (isInsideKarnataka(fix.lat, fix.lng)) {
        gpsLockedThisSessionRef.current = true;
        setPinLat(fix.lat);
        setPinLng(fix.lng);
        setGpsAccuracyMeters(fix.accuracyMeters);
        setBoundaryFlagDone(false);
        if (fix.isLowAccuracy) {
          setGpsStatusKind('approx');
          setGpsNotice(
            `Approximate location detected (±${fix.accuracyMeters}m — desktop/indoor Wi-Fi). Drag the pin or search your street if needed.`
          );
        } else {
          setGpsStatusKind('locked');
          setGpsNotice(`Current GPS locked (±${fix.accuracyMeters}m).`);
        }
      } else {
        setGpsStatusKind('warning');
        setGpsNotice(
          `Your device GPS (${fix.lat.toFixed(3)}, ${fix.lng.toFixed(3)}) is outside Karnataka. Search any Karnataka area below or tap the map.`
        );
      }
    });
  }

  async function handleSearchPlace() {
    const q = placeQuery.trim();
    if (q.length < 2) return;
    setPlaceSearching(true);
    setGpsNotice(null);
    try {
      const resp = await fetch(`/api/maps/search?q=${encodeURIComponent(q)}`);
      const data = (await resp.json()) as {
        results?: Array<{ label: string; lat: number; lng: number; locality: string }>;
      };
      const items = Array.isArray(data.results) ? data.results : [];
      setPlaceResults(items);
      if (items.length === 0) {
        setGpsStatusKind('warning');
        setGpsNotice(
          `No Karnataka places found for "${q}". Try a city, road, circle, or area name.`
        );
      }
    } catch {
      setGpsStatusKind('warning');
      setGpsNotice('Place search unavailable right now; tap or drag the pin on the map.');
    } finally {
      setPlaceSearching(false);
    }
  }

  useEffect(() => {
    if (!open) {
      gpsCancelRef.current?.();
      gpsCancelRef.current = null;
      return;
    }
    setErrorMsg(null);
    setGpsNotice(null);
    setGpsAccuracyMeters(null);
    setGpsStatusKind('idle');
    setPlaceResults([]);
    setStep(1);
    setBoundaryFlagDone(false);
    setDistinctOverridden(false);
    setDupResult(null);
    setPhotoDetectionNotice(null);
    pinLockedByUserOrExifRef.current = false;
    gpsLockedThisSessionRef.current = false;
    requestGpsLocation(false);
    return () => {
      gpsCancelRef.current?.();
      gpsCancelRef.current = null;
    };
  }, [open]);

  // Ensure Step 2 always attempts automatic GPS if not yet locked and user didn't set EXIF/manual pin
  useEffect(() => {
    if (!open || step !== 2) return;
    if (!pinLockedByUserOrExifRef.current && !gpsLockedThisSessionRef.current && !gpsBusy) {
      requestGpsLocation(false);
    }
  }, [open, step]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function resolveAddr() {
      try {
        const resp = await fetch(`/api/maps/reverse-geocode?lat=${pinLat}&lng=${pinLng}`);
        const data = (await resp.json()) as {
          localityName?: string;
          addressLabel?: string;
        };
        if (!cancelled) {
          setLocalityName(data.localityName || 'Karnataka');
          setAddressLabel(data.addressLabel || 'Karnataka');
        }
      } catch {
        // ignore network blip cleanly
      }
    }
    void resolveAddr();
    return () => {
      cancelled = true;
    };
  }, [open, pinLat, pinLng]);

  async function handlePhotoSelected(file: File, source: 'live_camera' | 'gallery_upload') {
    setErrorMsg(null);
    setBusy(true);
    setPhotoAnalyzing(true);
    setPhotoDetectionNotice('Inspecting photo & automatically detecting issue details...');
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Please sign in first.');

      const compressed = await compressImageDataUrl(file);
      setPhotoDataUrl(compressed);

      const hashes = existingComplaints
        .filter((c) => c.mediaAuth?.sha256 || c.mediaAuth?.dHash)
        .slice(0, 60)
        .map((c) => ({
          complaintId: c.id,
          sha256: c.mediaAuth?.sha256,
          dHash: c.mediaAuth?.dHash,
        }));

      const resp = await fetch('/api/media/inspect-and-analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          imageBase64: compressed,
          mimeType: 'image/jpeg',
          captureSource: source,
          language,
          existingImageHashes: hashes,
        }),
      });
      const data = (await resp.json()) as {
        error?: string;
        media?: MediaInspectionResult;
        aiAnalysis?: {
          available: boolean;
          suggestedCategory: ComplaintCategory;
          suggestedSeverity: SeverityLevel;
          suggestedTitle: string;
          suggestedDescription: string;
          englishTranslation: string;
          notice?: string;
        };
      };
      if (!resp.ok) {
        throw new Error(data.error || 'Photo check failed');
      }
      if (data.media) {
        setMediaInfo(data.media);
        if (
          data.media.exifLatitude &&
          data.media.exifLongitude &&
          isInsideKarnataka(data.media.exifLatitude, data.media.exifLongitude)
        ) {
          pinLockedByUserOrExifRef.current = true;
          setPinLat(data.media.exifLatitude);
          setPinLng(data.media.exifLongitude);
          setGpsStatusKind('locked');
          setGpsAccuracyMeters(null);
          setGpsNotice('Location read directly from your photo EXIF GPS metadata.');
        }
      }
      if (data.aiAnalysis) {
        const ai = data.aiAnalysis;
        setCategory(ai.suggestedCategory);
        setSeverity(ai.suggestedSeverity);
        setEnglishTranslation(ai.englishTranslation || ai.suggestedDescription);
        setDetectedLang(language);
        setAiMeta({
          suggestedCategory: ai.suggestedCategory,
          suggestedSeverity: ai.suggestedSeverity,
          suggestedTitle: ai.suggestedTitle,
          suggestedDescription: ai.suggestedDescription,
          englishTranslation: ai.englishTranslation || ai.suggestedDescription,
          hasAiSuggestion: ai.available,
        });

        if (ai.available) {
          // Immediately populate title & description unless citizen deliberately wrote custom text
          if (!userEditedTitleRef.current || !title.trim()) {
            setTitle(ai.suggestedTitle);
            userEditedTitleRef.current = false;
          }
          if (!userEditedDescRef.current || !description.trim()) {
            setDescription(ai.suggestedDescription);
            userEditedDescRef.current = false;
          }
          setPhotoDetectionNotice(
            `Photo detected: ${ai.suggestedCategory} (${ai.suggestedSeverity} urgency). Title & description have been drafted automatically — feel free to edit.`
          );
        } else {
          setPhotoDetectionNotice(
            ai.notice || 'Photo uploaded. AI auto-description is unavailable right now — please type a short description below.'
          );
        }
      }
    } catch (err) {
      setPhotoDetectionNotice(null);
      setErrorMsg(err instanceof Error ? err.message : 'Unable to process photo.');
    } finally {
      setBusy(false);
      setPhotoAnalyzing(false);
    }
  }

  async function toggleVoiceRecord() {
    if (recording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      return;
    }

    setErrorMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          setBusy(true);
          try {
            const token = await auth.currentUser?.getIdToken();
            if (!token) throw new Error('Sign in required.');
            const resp = await fetch('/api/ai/transcribe-voice', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                audioBase64: String(reader.result || ''),
                mimeType: blob.type || 'audio/webm',
                hintLanguage: language,
              }),
            });
            const data = (await resp.json()) as {
              available: boolean;
              detectedLanguage: SupportedLanguage;
              transcript: string;
              englishTranslation: string;
              suggestedTitle: string;
              suggestedCategory: ComplaintCategory;
              suggestedSeverity: SeverityLevel;
              placeClues: string;
              notice?: string;
            };
            if (!data.available || !data.transcript) {
              setErrorMsg(data.notice || 'Voice transcription unavailable; please type below.');
            } else {
              setDetectedLang(data.detectedLanguage);
              setDescription(data.transcript);
              setEnglishTranslation(data.englishTranslation);
              setTitle(data.suggestedTitle);
              setCategory(data.suggestedCategory);
              setSeverity(data.suggestedSeverity);
              if (data.placeClues) setPlaceClues(data.placeClues);
              setAiMeta({
                suggestedCategory: data.suggestedCategory,
                suggestedSeverity: data.suggestedSeverity,
                suggestedTitle: data.suggestedTitle,
                suggestedDescription: data.transcript,
                hasAiSuggestion: true,
                englishTranslation: data.englishTranslation,
              });
            }
          } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : 'Voice processing failed.');
          } finally {
            setBusy(false);
          }
        };
        reader.readAsDataURL(blob);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setErrorMsg('Microphone permission unavailable. You can type your complaint below.');
    }
  }

  async function goToDuplicateReviewStep() {
    setErrorMsg(null);
    if (!lookup.insideServiceArea || !resolvedConstituency) {
      setErrorMsg(t.outsideBengaluru);
      return;
    }
    // Run citizen-layer duplicate detection immediately so UI never blocks or misses local matches
    setDupResult(liveDupResult);
    setDistinctOverridden(false);
    setStep(3);

    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const resp = await fetch('/api/complaints/duplicate-check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          candidate: {
            latitude: pinLat,
            longitude: pinLng,
            category,
            title: title || `${category} near ${localityName}`,
            description: description || `${category} reported at ${addressLabel}`,
            englishTranslation: englishTranslation || description,
            dHash: mediaInfo?.dHash,
            sha256: mediaInfo?.sha256,
            reusedComplaintId: mediaInfo?.reusedComplaintId,
          },
          existingComplaints: existingComplaints.map((c) => ({
            id: c.id,
            title: c.title,
            description: c.description,
            englishTranslation: c.englishTranslation,
            originalText: c.originalText,
            localityName: c.localityName,
            photoDataUrl: c.photoDataUrl,
            reporterUid: c.reporterUid,
            upvoterUids: c.upvoterUids,
            category: c.category,
            status: c.status,
            latitude: c.latitude,
            longitude: c.longitude,
            upvoteCount: c.upvoteCount,
            clusterId: c.clusterId,
            dHash: c.mediaAuth?.dHash,
            sha256: c.mediaAuth?.sha256,
          })),
          existingClusters,
        }),
      });
      if (resp.ok) {
        const dup = (await resp.json()) as DuplicateCheckResult;
        setDupResult(dup);
      }
    } catch {
      // Citizen-layer liveDupResult already populated above cleanly
    }
  }

  async function handleUpvoteTier1(primaryId: string) {
    const user = auth.currentUser;
    if (!user) return;
    setBusy(true);
    try {
      const target = existingComplaints.find((c) => c.id === primaryId);
      const alreadyUpvoted = Boolean(target && (target.upvoterUids || []).includes(user.uid));
      let nextUpvotes = target?.upvoteCount || 1;
      if (target && !alreadyUpvoted) {
        nextUpvotes = target.upvoteCount + 1;
        const ageHours = Math.max(
          0,
          (Date.now() - new Date(target.createdAt).getTime()) / 3_600_000
        );
        const prio = computePriorityScore({
          severity: target.severity,
          category: target.category,
          upvoteCount: nextUpvotes,
          ageHours,
        });
        await updateDoc(doc(db, 'complaints', primaryId), {
          upvoteCount: increment(1),
          upvoterUids: arrayUnion(user.uid),
          priorityScore: prio.score,
          priorityFactors: prio.factors,
          aiBackgroundStatus: 'pending',
          updatedAt: new Date().toISOString(),
        });

        onCitizenActivity?.('support');

        // Refresh community impact brief in background for high-support visibility
        void (async () => {
          try {
            const token = await user.getIdToken();
            const resp = await fetch('/api/ai/community-brief', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                title: target.title,
                description: target.englishTranslation || target.description,
                category: target.category,
                localityName: target.localityName,
                constituencyName: target.constituencyName,
                upvoteCount: nextUpvotes,
                status: target.status,
                language,
              }),
            });
            const data = (await resp.json()) as {
              communityBrief?: string;
              aiStatus?: 'completed' | 'unavailable';
            };
            await updateDoc(doc(db, 'complaints', primaryId), {
              aiBackgroundStatus: data.aiStatus || 'unavailable',
              ...(data.communityBrief ? { aiCommunityBrief: data.communityBrief } : {}),
              updatedAt: new Date().toISOString(),
            }).catch(() => null);
          } catch {
            // non-blocking
          }
        })();
      }

      const activeMatches = liveDupResult.tier1Matches.length > 0
        ? liveDupResult.tier1Matches
        : dupResult?.tier1Matches || [];
      const matched = activeMatches.find((m) => m.complaintId === primaryId) || activeMatches[0];
      const pairId = `pair-${Date.now()}`;
      await setDoc(doc(db, 'duplicatePairs', pairId), {
        id: pairId,
        primaryComplaintId: primaryId,
        candidateTitle: title || `${category} report`,
        candidateDescription: description || 'Supported existing nearby report',
        candidateCategory: category,
        distanceMeters: matched?.distanceMeters || 0,
        textSimilarity: matched?.textSimilarity || 0,
        imageSimilarity: matched?.imageSimilarity || 0,
        userDecision: 'auto_upvoted',
        reporterUid: user.uid,
        constituencyId: resolvedConstituency?.id || '',
        createdAt: new Date().toISOString(),
      });

      resetDraftForm();
      onSubmitted(
        alreadyUpvoted
          ? 'This duplicate report is already on your supported list!'
          : 'Supported & prioritized existing nearby report instead of filing a duplicate!',
        primaryId
      );
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to add support.');
    } finally {
      setBusy(false);
    }
  }

  async function handleFinalSubmit() {
    const user = auth.currentUser;
    if (!user || !lookup.insideServiceArea || !resolvedConstituency) return;
    if (mediaInfo?.blocked && !appealNote.trim()) {
      setErrorMsg('Please add an appeal note or capture a real live photo.');
      return;
    }

    setBusy(true);
    setErrorMsg(null);
    try {
      const now = new Date().toISOString();
      const id = `cmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const trimmedTitle = title.trim();
      const trimmedDesc = description.trim();
      const finalTitle = (
        trimmedTitle.length >= 3 ? trimmedTitle : `${category} near ${localityName}`
      ).slice(0, 175);
      const finalDesc = (
        trimmedDesc.length >= 4 ? trimmedDesc : `${category} issue at ${addressLabel}`
      ).slice(0, 2400);

      let translated = englishTranslation.trim();
      if (!translated && detectedLang !== 'en') {
        const token = await user.getIdToken();
        const trResp = await fetch('/api/ai/translate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ text: finalDesc, sourceLanguage: detectedLang }),
        });
        const trData = (await trResp.json()) as { englishTranslation?: string };
        translated = trData.englishTranslation || finalDesc;
      }
      if (!translated) translated = finalDesc;

      const prio = computePriorityScore({
        severity,
        category,
        upvoteCount: 0,
        ageHours: 0,
      });

      // Handle Tier 2 cluster creation/linking (100m-500m)
      let clusterId = dupResult?.suggestedClusterId;
      if (!clusterId && (dupResult?.tier2ClusterMatches.length || 0) > 0) {
        clusterId = `cls-${Date.now()}`;
        const relatedIds = [id, ...dupResult!.tier2ClusterMatches.map((m) => m.complaintId)];
        await setDoc(doc(db, 'areaClusters', clusterId), {
          id: clusterId,
          constituencyId: resolvedConstituency.id,
          category,
          centroidLat: pinLat,
          centroidLng: pinLng,
          radiusMeters: 500,
          complaintIds: relatedIds,
          reportCount: relatedIds.length,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        });
      } else if (clusterId) {
        await updateDoc(doc(db, 'areaClusters', clusterId), {
          complaintIds: arrayUnion(id),
          reportCount: increment(1),
          updatedAt: now,
        }).catch(() => null);
      }

      // Log labelled "This is a different problem" pair if Tier 1 existed
      if (distinctOverridden && dupResult?.tier1Matches[0]) {
        const pairId = `pair-${Date.now()}`;
        await setDoc(doc(db, 'duplicatePairs', pairId), {
          id: pairId,
          primaryComplaintId: dupResult.tier1Matches[0].complaintId,
          candidateTitle: finalTitle,
          candidateDescription: finalDesc,
          candidateCategory: category,
          distanceMeters: dupResult.tier1Matches[0].distanceMeters,
          textSimilarity: dupResult.tier1Matches[0].textSimilarity,
          imageSimilarity: dupResult.tier1Matches[0].imageSimilarity,
          userDecision: 'different_problem',
          reporterUid: user.uid,
          constituencyId: resolvedConstituency.id,
          createdAt: now,
        });
      }

      const mediaAuthPayload: MediaAuthenticityMetadata | undefined = mediaInfo
        ? stripUndefinedDeep({
            captureSource:
              mediaInfo.authenticityStatus === 'verified_live'
                ? 'live_camera'
                : 'gallery_upload',
            authenticityStatus: appealNote.trim()
              ? 'appealed_review'
              : mediaInfo.authenticityStatus,
            ...(mediaInfo.exifTimestamp ? { exifTimestamp: mediaInfo.exifTimestamp } : {}),
            ...(typeof mediaInfo.exifLatitude === 'number'
              ? { exifLatitude: mediaInfo.exifLatitude }
              : {}),
            ...(typeof mediaInfo.exifLongitude === 'number'
              ? { exifLongitude: mediaInfo.exifLongitude }
              : {}),
            hasC2paManifest: Boolean(mediaInfo.hasC2paManifest),
            sha256: mediaInfo.sha256,
            dHash: mediaInfo.dHash,
            ...(mediaInfo.reusedComplaintId
              ? { reusedComplaintId: mediaInfo.reusedComplaintId }
              : {}),
            ...(typeof mediaInfo.aiDetectorScore === 'number'
              ? { aiDetectorScore: mediaInfo.aiDetectorScore }
              : {}),
            aiDetectorBlocked: Boolean(mediaInfo.blocked),
            ...(appealNote.trim() ? { appealNote: appealNote.trim(), appealedAt: now } : {}),
          })
        : undefined;

      const newComplaint: Complaint = stripUndefinedDeep({
        id,
        title: finalTitle,
        description: finalDesc,
        originalLanguage: detectedLang,
        originalText: finalDesc,
        englishTranslation: translated,
        category,
        aiSuggestedCategory: aiMeta.suggestedCategory,
        severity,
        aiSuggestedSeverity: aiMeta.suggestedSeverity,
        aiSuggestedTitle: aiMeta.suggestedTitle || finalTitle,
        aiSuggestedDescription: aiMeta.suggestedDescription || finalDesc,
        aiSuggestionAccepted: aiMeta.hasAiSuggestion,
        latitude: pinLat,
        longitude: pinLng,
        localityName: localityName || 'Karnataka',
        addressLabel: addressLabel || 'Karnataka',
        constituencyId: resolvedConstituency.id,
        constituencyName: resolvedConstituency.name,
        assignedMlaName: resolvedConstituency.mlaName,
        nearBoundary: Boolean(lookup.nearBoundary),
        boundaryFlagged: Boolean(boundaryFlagDone),
        status: 'Reported',
        isAnonymous,
        reporterUid: user.uid,
        reporterDisplayName: isAnonymous
          ? 'Anonymous Citizen'
          : user.displayName || 'Citizen',
        shareContactConsent: !isAnonymous && shareContactConsent,
        priorityScore: prio.score,
        priorityFactors: prio.factors,
        upvoteCount: 0,
        upvoterUids: [],
        ...(clusterId ? { clusterId } : {}),
        ...(photoDataUrl ? { photoDataUrl } : {}),
        ...(mediaAuthPayload ? { mediaAuth: mediaAuthPayload } : {}),
        audioRetained: retainAudio,
        escalatedToCm: false,
        ownerLabel: `${resolvedConstituency.mlaName} (${resolvedConstituency.name})`,
        timeline: [
          {
            status: 'Reported',
            actorLabel: isAnonymous ? 'Anonymous Citizen' : user.displayName || 'Citizen',
            note: `Routed automatically to ${resolvedConstituency.mlaName}, ${resolvedConstituency.name}`,
            timestamp: now,
          },
        ],
        aiBackgroundStatus: 'pending',
        isDemo: Boolean(resolvedConstituency.isDemo),
        createdAt: now,
        updatedAt: now,
      });

      await setDoc(doc(db, 'complaints', id), newComplaint);
      if (!isAnonymous) {
        onCitizenActivity?.('report');
      }

      // Run background AI enrichment asynchronously without blocking the 3-tap UI
      void (async () => {
        try {
          const token = await user.getIdToken();
          const resp = await fetch('/api/ai/background-enrich-report', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              title: finalTitle,
              description: translated,
              category,
              status: 'Reported',
              originalLanguage: detectedLang,
              localityName,
              constituencyName: resolvedConstituency.name,
            }),
          });
          if (!resp.ok) throw new Error('Background AI HTTP error');
          const bgData = (await resp.json()) as {
            aiStatus?: 'completed' | 'unavailable';
            draftReply?: string;
          };
          await updateDoc(doc(db, 'complaints', id), {
            aiBackgroundStatus: bgData.aiStatus || 'unavailable',
            ...(bgData.draftReply ? { aiDraftReply: bgData.draftReply } : {}),
            updatedAt: new Date().toISOString(),
          });
        } catch {
          await updateDoc(doc(db, 'complaints', id), {
            aiBackgroundStatus: 'unavailable',
            updatedAt: new Date().toISOString(),
          }).catch(() => null);
        }
      })();

      resetDraftForm();
      onSubmitted(
        `Report sent to ${resolvedConstituency.mlaName} (${resolvedConstituency.name})!`,
        id
      );
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to send report.');
    } finally {
      setBusy(false);
    }
  }

  async function handleFlagBoundary() {
    const user = auth.currentUser;
    if (!user || !lookup.constituency) return;
    try {
      const flagId = `flag-${Date.now()}`;
      await setDoc(doc(db, 'boundaryFlags', flagId), {
        id: flagId,
        latitude: pinLat,
        longitude: pinLng,
        matchedConstituencyId: lookup.constituency.id,
        matchedConstituencyName: lookup.constituency.name,
        citizenNote: `Citizen flagged boundary near ${addressLabel}`,
        reportedByUid: user.uid,
        status: 'open',
        createdAt: new Date().toISOString(),
      });
      setBoundaryFlagDone(true);
    } catch {
      setErrorMsg('Unable to send boundary flag right now.');
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#0F2942]/60 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Report a civic issue in 3 taps"
    >
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-[#E67E22]">
              Tap {step} of 3
            </div>
            <h2 className="font-display text-lg font-bold text-[#0F2942]">
              {step === 1
                ? '1. Photo or voice'
                : step === 2
                  ? '2. Confirm location pin'
                  : '3. Check & send report'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {errorMsg && (
            <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* STEP 1: PHOTO OR VOICE */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={busy}
                  className="flex min-h-[56px] items-center justify-center gap-2 rounded-xl bg-[#0F2942] px-4 py-3 text-sm font-semibold text-white hover:bg-[#173A5E]"
                >
                  <Camera className="h-5 w-5 text-[#E67E22]" />
                  <span>{t.takePhoto}</span>
                </button>
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  disabled={busy}
                  className="flex min-h-[56px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-[#0F2942] hover:bg-slate-50"
                >
                  <ImagePlus className="h-5 w-5" />
                  <span>{t.uploadGallery}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void toggleVoiceRecord()}
                  disabled={busy}
                  className={`flex min-h-[56px] items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold ${
                    recording
                      ? 'border-red-600 bg-red-600 text-white'
                      : 'border-slate-300 bg-white text-[#0F2942] hover:bg-slate-50'
                  }`}
                >
                  {recording ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5 text-[#E67E22]" />}
                  <span>{recording ? 'Stop speaking' : t.speakVoice}</span>
                </button>
              </div>

              <input
                ref={cameraInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void handlePhotoSelected(f, 'live_camera');
                }}
              />
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void handlePhotoSelected(f, 'gallery_upload');
                }}
              />

              {(busy || photoAnalyzing) && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-900">
                  {photoDetectionNotice || 'Checking photo authenticity & preparing AI suggestions...'}
                </div>
              )}

              {!photoAnalyzing && photoDetectionNotice && (
                <div
                  className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                    aiMeta.hasAiSuggestion
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-950'
                      : 'border-amber-200 bg-amber-50 text-amber-950'
                  }`}
                >
                  {photoDetectionNotice}
                </div>
              )}

              {photoDataUrl && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <img
                    src={photoDataUrl}
                    alt="Issue preview"
                    className="max-h-48 w-full rounded-lg object-cover"
                  />
                  {mediaInfo && (
                    <div className="mt-2 space-y-1 text-xs">
                      <div className="font-semibold text-[#0F2942]">
                        {mediaInfo.notice}
                      </div>
                      <div className="text-slate-600">
                        EXIF timestamp: {mediaInfo.exifTimestamp ? 'Present' : 'Not embedded'} ·
                        C2PA credentials: {mediaInfo.hasC2paManifest ? 'Present' : 'None'}
                      </div>
                      {mediaInfo.reusedComplaintId && (() => {
                        const reusedMatch = existingComplaints.find(
                          (c) => c.id === mediaInfo.reusedComplaintId
                        );
                        const currentUid = auth.currentUser?.uid;
                        const isMine = Boolean(
                          reusedMatch && currentUid && reusedMatch.reporterUid === currentUid
                        );
                        const alreadySupported = Boolean(
                          reusedMatch &&
                            currentUid &&
                            (reusedMatch.upvoterUids || []).includes(currentUid)
                        );
                        return (
                          <div className="mt-2 space-y-2 rounded-lg border-2 border-red-400 bg-red-50 p-3">
                            <div className="font-bold text-red-900">
                              Duplicate Photo Detected — Already Reported Before!
                            </div>
                            <p className="text-xs text-red-900">
                              This exact or visually identical photo is already attached to an
                              active complaint. Instead of filing a duplicate complaint, please
                              upvote the existing issue to increase its priority.
                            </p>
                            {reusedMatch && (
                              <div className="rounded bg-white border border-red-200 p-2 text-xs space-y-1.5">
                                <div className="font-bold text-[#0F2942]">{reusedMatch.title}</div>
                                <div className="text-slate-600">
                                  {reusedMatch.localityName} · Status: {reusedMatch.status} ·{' '}
                                  <strong>{reusedMatch.upvoteCount} upvotes</strong>
                                </div>
                                {isMine || alreadySupported ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      resetDraftForm();
                                      onSubmitted(
                                        isMine
                                          ? 'Opened your existing active report.'
                                          : 'You already supported this existing report.',
                                        reusedMatch.id
                                      );
                                      onClose();
                                    }}
                                    className="w-full rounded-lg bg-[#0F2942] px-3 py-2 text-xs font-bold text-white"
                                  >
                                    {isMine
                                      ? 'View Your Existing Report'
                                      : 'View Supported Existing Report'}
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void handleUpvoteTier1(reusedMatch.id)}
                                    className="w-full rounded-lg bg-[#0F2942] px-3 py-2 text-xs font-bold text-white hover:bg-[#173A5E]"
                                  >
                                    Upvote Existing Complaint Instead (+1 Priority)
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      {mediaInfo.blocked && (
                        <div className="mt-2 space-y-2 rounded-lg border border-red-300 bg-red-50 p-2.5">
                          <div className="font-semibold text-red-900">
                            Blocked as high-confidence AI-generated image.
                          </div>
                          <input
                            type="text"
                            value={appealNote}
                            onChange={(e) => setAppealNote(e.target.value)}
                            placeholder="Appeal: explain why this is a genuine photo..."
                            className="w-full rounded border border-red-300 bg-white px-2.5 py-1.5 text-xs"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Editable AI-assisted fields */}
              <div className="space-y-3 rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Issue details (auto-detected &amp; editable)
                  </span>
                  <div className="flex items-center gap-2">
                    {aiMeta.hasAiSuggestion &&
                      (title !== aiMeta.suggestedTitle ||
                        description !== aiMeta.suggestedDescription) && (
                        <button
                          type="button"
                          onClick={() => {
                            setCategory(aiMeta.suggestedCategory);
                            setSeverity(aiMeta.suggestedSeverity);
                            setTitle(aiMeta.suggestedTitle);
                            setDescription(aiMeta.suggestedDescription);
                            setEnglishTranslation(aiMeta.englishTranslation);
                            userEditedTitleRef.current = false;
                            userEditedDescRef.current = false;
                          }}
                          className="rounded border border-[#0F2942] bg-white px-2 py-0.5 text-[11px] font-bold text-[#0F2942] hover:bg-slate-50"
                        >
                          Use AI description
                        </button>
                      )}
                    {aiMeta.hasAiSuggestion && (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900 border border-amber-200">
                        <Sparkles className="h-3 w-3" />
                        {t.aiSuggestionBadge}
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      Category {aiMeta.hasAiSuggestion ? `(${t.aiSuggestionBadge})` : ''}
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as ComplaintCategory)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-[#0F2942]"
                    >
                      {COMPLAINT_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  {!simpleMode && (
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Urgency {aiMeta.hasAiSuggestion ? `(${t.aiSuggestionBadge})` : ''}
                      </label>
                      <select
                        value={severity}
                        onChange={(e) => setSeverity(e.target.value as SeverityLevel)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-[#0F2942]"
                      >
                        {SEVERITY_LEVELS.map((sev) => (
                          <option key={sev} value={sev}>
                            {sev}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Short title
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => {
                      userEditedTitleRef.current = e.target.value.trim().length > 0;
                      setTitle(e.target.value);
                    }}
                    placeholder="e.g. Deep pothole near bus stop"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Details (in your language or English)
                  </label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(e) => {
                      userEditedDescRef.current = e.target.value.trim().length > 0;
                      setDescription(e.target.value);
                    }}
                    placeholder="Upload a photo to auto-write the description, or describe the issue here..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                {englishTranslation && detectedLang !== 'en' && (
                  <div className="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-700 border border-slate-200">
                    <span className="font-semibold">English translation for office staff:</span>{' '}
                    {englishTranslation}
                  </div>
                )}

                {placeClues && (
                  <div className="rounded-lg bg-blue-50 p-2 text-xs text-blue-900">
                    Voice landmark clue: "{placeClues}" — please verify on the map next.
                  </div>
                )}

                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={retainAudio}
                    onChange={(e) => setRetainAudio(e.target.checked)}
                  />
                  <span>Keep original voice recording (otherwise deleted right after transcription)</span>
                </label>
              </div>

              <button
                type="button"
                onClick={() => setStep(2)}
                className="flex w-full min-h-[52px] items-center justify-center gap-2 rounded-xl bg-[#0F2942] px-5 py-3 text-base font-bold text-white hover:bg-[#173A5E]"
              >
                <span>Next: {t.locationStep}</span>
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          )}

          {/* STEP 2: GPS DRAGGABLE PIN + KARNATAKA SEARCH + AUTOMATIC ROUTING (NO DROPDOWNS!) */}
          {step === 2 && (
            <div className="space-y-3">
              {/* Entire Karnataka Place / Road Search + Prominent GPS Button */}
              <div className="space-y-1.5">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={placeQuery}
                      onChange={(e) => setPlaceQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void handleSearchPlace();
                        }
                      }}
                      placeholder="Search any place in Karnataka (e.g. Mysuru, Hubballi, Indiranagar)..."
                      className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-xs text-[#0F2942]"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={placeSearching || placeQuery.trim().length < 2}
                    onClick={() => void handleSearchPlace()}
                    className="rounded-lg bg-[#0F2942] px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
                  >
                    {placeSearching ? '...' : 'Find'}
                  </button>
                  <button
                    type="button"
                    disabled={gpsBusy}
                    onClick={() => requestGpsLocation(true)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#0F2942] bg-white px-3 py-2 text-xs font-bold text-[#0F2942] hover:bg-slate-50 disabled:opacity-50"
                  >
                    <LocateFixed className={`h-4 w-4 text-[#E67E22] ${gpsBusy ? 'animate-spin' : ''}`} />
                    <span>{gpsBusy ? 'Locating...' : 'Use My GPS'}</span>
                  </button>
                </div>

                {placeResults.length > 0 && (
                  <div className="max-h-32 overflow-y-auto rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
                    {placeResults.map((resItem, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          pinLockedByUserOrExifRef.current = true;
                          setPinLat(Number(resItem.lat.toFixed(6)));
                          setPinLng(Number(resItem.lng.toFixed(6)));
                          setLocalityName(resItem.locality);
                          setAddressLabel(resItem.label);
                          setPlaceResults([]);
                          setGpsAccuracyMeters(null);
                          setGpsStatusKind('idle');
                          setGpsNotice('Pinned searched place. Drag pin if you need finer street accuracy.');
                          setBoundaryFlagDone(false);
                        }}
                        className="w-full px-3 py-2 text-left text-xs text-[#0F2942] hover:bg-amber-50"
                      >
                        {resItem.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {gpsNotice && (
                <div
                  className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                    gpsStatusKind === 'error'
                      ? 'border-red-300 bg-red-50 text-red-900'
                      : gpsStatusKind === 'locked'
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-950'
                        : 'border-amber-200 bg-amber-50 text-amber-950'
                  }`}
                >
                  {gpsNotice}
                </div>
              )}

              <BengaluruMap
                mode="picker"
                pinLat={pinLat}
                pinLng={pinLng}
                heightClass="h-60 sm:h-64"
                constituencies={constituencies}
                onPinChange={(lat, lng) => {
                  pinLockedByUserOrExifRef.current = true;
                  setPinLat(lat);
                  setPinLng(lng);
                  setGpsAccuracyMeters(null);
                  setGpsStatusKind('idle');
                  setBoundaryFlagDone(false);
                }}
              />

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-700 min-w-0">
                    <MapPin className="h-4 w-4 shrink-0 text-[#E67E22]" />
                    <span className="truncate">{addressLabel}</span>
                  </div>
                  <button
                    type="button"
                    disabled={gpsBusy}
                    onClick={() => requestGpsLocation(true)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-bold text-[#0F2942] hover:bg-slate-100 disabled:opacity-50"
                  >
                    <LocateFixed className="h-3 w-3 text-[#E67E22]" />
                    <span>{gpsBusy ? 'Locating...' : 'Re-center GPS'}</span>
                  </button>
                </div>
                <div className="mt-1 font-mono-num text-[11px] text-slate-500">
                  Pin: {pinLat.toFixed(5)}, {pinLng.toFixed(5)}
                  {gpsAccuracyMeters !== null ? ` · Accuracy ±${gpsAccuracyMeters}m` : ''}
                </div>

                {lookup.insideServiceArea && resolvedConstituency ? (
                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center gap-2 font-bold text-[#0F2942]">
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-[#15803D]" />
                      <span>
                        {t.goesToPrefix} {resolvedConstituency.mlaName},{' '}
                        {resolvedConstituency.name}
                      </span>
                    </div>
                    {lookup.nearBoundary && lookup.constituency && (
                      <div className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 border border-amber-200">
                        <span>Pin is near a constituency boundary.</span>
                        {boundaryFlagDone ? (
                          <span className="font-semibold text-[#15803D]">Flagged for review</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleFlagBoundary()}
                            className="inline-flex items-center gap-1 font-bold underline"
                          >
                            <Flag className="h-3.5 w-3.5" />
                            <span>{t.wrongArea}</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-2 flex items-center gap-2 font-bold text-red-700">
                    <ShieldAlert className="h-5 w-5" />
                    <span>{t.outsideBengaluru}</span>
                  </div>
                )}
              </div>

              {/* Immediate Citizen-Layer Duplicate & Cluster Preview right at Location step */}
              {(liveDupResult.tier1Matches.length > 0 || mediaInfo?.reusedComplaintId) && (
                <div className="rounded-xl border-2 border-red-400 bg-red-50 p-3 text-xs text-red-950 space-y-1">
                  <div className="font-bold text-red-900">
                    Duplicate Check Alert: {Math.max(1, liveDupResult.tier1Matches.length)} existing
                    open report(s) matched at this location!
                  </div>
                  {liveDupResult.tier1Matches[0] && (
                    <div>
                      Closest match: <strong>{liveDupResult.tier1Matches[0].title}</strong> (
                      {liveDupResult.tier1Matches[0].distanceMeters}m away ·{' '}
                      {liveDupResult.tier1Matches[0].upvoteCount} citizen supports).{' '}
                      {liveDupResult.tier1Matches[0].matchReason
                        ? `${liveDupResult.tier1Matches[0].matchReason}. `
                        : ''}
                      Please upvote the existing report on the next step instead of duplicating.
                    </div>
                  )}
                </div>
              )}

              {liveDupResult.tier1Matches.length === 0 &&
                liveDupResult.tier2ClusterMatches.length > 0 && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
                    {liveDupResult.tier2ClusterMatches.length} related "{category}" issue(s) exist
                    within 500m — your report will automatically join that area cluster.
                  </div>
                )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="w-1/3 rounded-xl border border-slate-300 py-3 text-sm font-semibold text-slate-700"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={!lookup.insideServiceArea || busy}
                  onClick={() => void goToDuplicateReviewStep()}
                  className="flex flex-1 min-h-[52px] items-center justify-center gap-2 rounded-xl bg-[#0F2942] px-5 py-3 text-base font-bold text-white disabled:opacity-40"
                >
                  <span>Next: Check & Send</span>
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: DUPLICATE CHECK + PRIVACY TOGGLES + SUBMIT */}
          {step === 3 && (() => {
            const currentUid = auth.currentUser?.uid;
            const mergedTier1 = [...(dupResult?.tier1Matches || [])];
            for (const m of liveDupResult.tier1Matches) {
              if (!mergedTier1.some((x) => x.complaintId === m.complaintId)) {
                mergedTier1.push(m);
              }
            }
            if (mediaInfo?.reusedComplaintId) {
              const reusedComp = existingComplaints.find(
                (c) =>
                  c.id === mediaInfo.reusedComplaintId &&
                  c.status !== 'CONFIRMED RESOLVED' &&
                  c.status !== 'Rejected'
              );
              if (
                reusedComp &&
                !mergedTier1.some((x) => x.complaintId === reusedComp.id)
              ) {
                mergedTier1.unshift({
                  complaintId: reusedComp.id,
                  title: reusedComp.title,
                  category: reusedComp.category,
                  status: reusedComp.status,
                  distanceMeters: 0,
                  textSimilarity: 1,
                  imageSimilarity: 1,
                  upvoteCount: reusedComp.upvoteCount,
                  localityName: reusedComp.localityName,
                  photoDataUrl: reusedComp.photoDataUrl,
                  reporterUid: reusedComp.reporterUid,
                  upvoterUids: reusedComp.upvoterUids,
                  matchReason: 'Same photo already submitted on this active complaint',
                  isSamePhoto: true,
                  tier: 'tier1_exact',
                });
              }
            }
            const activeClusterMatches =
              dupResult?.tier2ClusterMatches && dupResult.tier2ClusterMatches.length > 0
                ? dupResult.tier2ClusterMatches
                : liveDupResult.tier2ClusterMatches;
            const aiVerdict = dupResult?.aiDuplicateVerdict;

            const hasHardBlock = mergedTier1.some(
              (m) =>
                m.isSamePhoto ||
                Boolean(
                  currentUid && m.reporterUid === currentUid && m.distanceMeters <= 120
                )
            );
            const hasBlockingDuplicate =
              mergedTier1.length > 0 && (!distinctOverridden || hasHardBlock);

            return (
              <div className="space-y-4">
                {mergedTier1.length > 0 && (!distinctOverridden || hasHardBlock) && (
                  <div className="rounded-xl border-2 border-red-400 bg-red-50 p-4 space-y-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
                      <div>
                        <div className="font-bold text-red-950">
                          Duplicate Complaint Blocked — Already Raised Before!
                        </div>
                        <p className="mt-0.5 text-xs text-red-900">
                          This complaint has already been filed at this location. To prevent
                          duplicate or fake repeat reports, please <strong>upvote</strong> the
                          existing complaint below — high upvotes push it to the top of the Admin
                          Portal!
                        </p>
                      </div>
                    </div>

                    {aiVerdict?.available && aiVerdict.isDuplicate && (
                      <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                        <strong>AI Duplicate Verification:</strong> {aiVerdict.reason}
                      </div>
                    )}

                    <div className="space-y-2.5">
                      {mergedTier1.slice(0, 3).map((match) => {
                        const isMine = Boolean(currentUid && match.reporterUid === currentUid);
                        const alreadySupported = Boolean(
                          currentUid && (match.upvoterUids || []).includes(currentUid)
                        );
                        return (
                          <div
                            key={match.complaintId}
                            className="rounded-lg bg-white p-3 border border-red-200 text-sm space-y-2"
                          >
                            <div className="flex items-start gap-3">
                              {match.photoDataUrl && (
                                <img
                                  src={match.photoDataUrl}
                                  alt={match.title}
                                  className="h-14 w-16 shrink-0 rounded object-cover border border-slate-200"
                                />
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="font-semibold text-[#0F2942]">
                                  {match.title}
                                </div>
                                <div className="text-xs text-slate-600 mt-0.5">
                                  {match.distanceMeters}m away
                                  {match.localityName ? ` · ${match.localityName}` : ''} · Status:{' '}
                                  {match.status} · <strong>{match.upvoteCount} upvotes</strong>
                                </div>
                                {match.matchReason && (
                                  <div className="mt-1 text-[11px] font-semibold text-amber-900">
                                    Why flagged: {match.matchReason}
                                  </div>
                                )}
                              </div>
                            </div>

                            {isMine ? (
                              <div className="space-y-1.5">
                                <div className="text-xs font-semibold text-amber-900">
                                  This is your own active complaint — duplicate re-filing is locked.
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    resetDraftForm();
                                    onSubmitted(
                                      'Opened your existing active report instead of filing a duplicate.',
                                      match.complaintId
                                    );
                                    onClose();
                                  }}
                                  className="w-full rounded-xl bg-[#0F2942] px-4 py-2 text-xs font-bold text-white hover:bg-[#173A5E]"
                                >
                                  Go to Existing Report
                                </button>
                              </div>
                            ) : alreadySupported ? (
                              <div className="space-y-1.5">
                                <div className="text-xs font-semibold text-[#15803D]">
                                  You already upvoted this report! Your voice is already boosting
                                  its priority.
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    resetDraftForm();
                                    onSubmitted(
                                      'Opened the existing report you already upvoted.',
                                      match.complaintId
                                    );
                                    onClose();
                                  }}
                                  className="w-full rounded-xl bg-[#0F2942] px-4 py-2 text-xs font-bold text-white hover:bg-[#173A5E]"
                                >
                                  View Existing Report
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handleUpvoteTier1(match.complaintId)}
                                className="w-full rounded-xl bg-[#0F2942] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#173A5E]"
                              >
                                Upvote &amp; Support Existing Report (+1 Priority Boost)
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {!hasHardBlock ? (
                      <button
                        type="button"
                        onClick={() => setDistinctOverridden(true)}
                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        This is a completely different civic problem here — unlock new report
                      </button>
                    ) : (
                      <div className="text-[11px] font-semibold text-red-900">
                        Same-photo repeats and exact-location repeat filings are locked — please
                        upvote or track the existing complaint above.
                      </div>
                    )}
                  </div>
                )}

                {activeClusterMatches.length > 0 && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
                    Found {activeClusterMatches.length} related "{category}" issue(s)
                    within 500m. Your report will automatically join an area cluster so it can be
                    escalated together.
                  </div>
                )}

              {/* Privacy & Consent controls */}
              <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                <label className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={isAnonymous}
                    onChange={(e) => setIsAnonymous(e.target.checked)}
                    className="mt-1 h-4 w-4"
                  />
                  <span className="font-medium text-[#0F2942]">{t.anonymousToggle}</span>
                </label>

                {!isAnonymous && (
                  <label className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={shareContactConsent}
                      onChange={(e) => setShareContactConsent(e.target.checked)}
                      className="mt-1 h-4 w-4"
                    />
                    <span className="text-xs text-slate-700">
                      Allow the MLA office to see my email/phone for follow-up updates (DPDP
                      consent; otherwise only my name and report are shared).
                    </span>
                  </label>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 p-3 text-xs text-slate-700">
                <div>
                  <span className="font-semibold">Summary:</span> {title || `${category} near ${localityName}`}
                </div>
                <div className="mt-1">
                  <span className="font-semibold">Routed to:</span> {resolvedConstituency?.mlaName} (
                  {resolvedConstituency?.name})
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="w-1/3 rounded-xl border border-slate-300 py-3 text-sm font-semibold text-slate-700"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={busy || hasBlockingDuplicate}
                  onClick={() => void handleFinalSubmit()}
                  className="flex flex-1 min-h-[54px] items-center justify-center gap-2 rounded-xl bg-[#E67E22] px-5 py-3 text-base font-bold text-white hover:bg-[#D36D16] disabled:opacity-50"
                >
                  <span>
                    {busy
                      ? 'Sending...'
                      : hasBlockingDuplicate
                        ? 'Duplicate Blocked — Upvote Above Instead'
                        : t.submitReport}
                  </span>
                </button>
              </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
};
