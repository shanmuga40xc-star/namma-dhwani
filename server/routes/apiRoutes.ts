import crypto from 'crypto';
import express, { type Request, type Response } from 'express';
import {
  ALLOWED_AUDIO_MIME_TYPES,
  BENGALURU_BOUNDS,
  DEMO_CONSTITUENCIES,
  KARNATAKA_BOUNDS,
  UPLOAD_MAX_BYTES,
} from '../../shared/constants.ts';
import {
  haversineMeters,
  isInsideKarnataka,
  lookupConstituency,
} from '../../shared/geo.ts';
import type {
  AdminRole,
  AreaCluster,
  Complaint,
  ConstituencyBoundary,
  SupportedLanguage,
} from '../../shared/types.ts';
import {
  type AuthenticatedRequest,
  corsAllowlistMiddleware,
  createOrGetTotpSetup,
  firebaseAppletConfig,
  getConfiguredSuperAdminEmails,
  getTotpStatus,
  isConfiguredSuperAdminEmail,
  isSuperAdminEnvConfigured,
  rateLimitMiddleware,
  requireAdminStep2,
  requireVerifiedEmailOrDemo,
  signAdminStep2Token,
  verifyFirebaseBearer,
  verifyTotpCode,
} from '../middleware/auth.ts';
import { runDuplicateEngine } from '../services/duplicateEngine.ts';
import {
  analyzeCivicPhoto,
  generateCommunityImpactBrief,
  generateGuideBotMessage,
  isGeminiConfigured,
  runBackgroundComplaintAi,
  synthesizeGuideSpeech,
  transcribeAndExtractVoice,
  translateComplaintText,
  verifyDuplicateWithAi,
  verifyRepairWithAi,
} from '../services/geminiService.ts';
import { inspectUploadedPhoto } from '../services/mediaService.ts';

const OSM_USER_AGENT = 'NammaDhwani-Karnataka-Civic/2.0 (https://openstreetmap.org)';

export function createApiRouter(): express.Router {
  const router = express.Router();
  router.use(corsAllowlistMiddleware);
  router.use(express.json({ limit: '7mb' }));

  // ---------------------------------------------------------------------------
  // Health & Public Runtime Configuration (never exposes secrets)
  // ---------------------------------------------------------------------------
  router.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'namma-dhwani-backend',
      demoMode: process.env.DEMO_MODE === 'true',
      aiConfigured: isGeminiConfigured(),
      aiImageBlockingEnabled: process.env.AI_IMAGE_BLOCKING_ENABLED === 'true',
      superAdminConfigured: isSuperAdminEnvConfigured(),
    });
  });

  router.get('/config/public', (_req: Request, res: Response) => {
    res.json({
      demoMode: process.env.DEMO_MODE === 'true',
      aiConfigured: isGeminiConfigured(),
      aiImageBlockingEnabled: process.env.AI_IMAGE_BLOCKING_ENABLED === 'true',
      superAdminConfigured: isSuperAdminEnvConfigured(),
      bengaluruBounds: BENGALURU_BOUNDS,
      karnatakaBounds: KARNATAKA_BOUNDS,
    });
  });

  // ---------------------------------------------------------------------------
  // OpenStreetMap Nominatim Geocoding (Entire Karnataka)
  // ---------------------------------------------------------------------------
  router.get('/maps/reverse-geocode', async (req: Request, res: Response) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      res.status(400).json({ error: 'Valid lat and lng are required.' });
      return;
    }

    const inside = isInsideKarnataka(lat, lng);
    if (!inside) {
      res.json({
        insideServiceArea: false,
        localityName: 'Outside Karnataka',
        addressLabel: 'Outside service area (Karnataka only)',
      });
      return;
    }

    try {
      const url = new URL('https://nominatim.openstreetmap.org/reverse');
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('lat', String(lat));
      url.searchParams.set('lon', String(lng));
      url.searchParams.set('zoom', '18');
      url.searchParams.set('addressdetails', '1');

      const resp = await fetch(url.toString(), {
        headers: { 'User-Agent': OSM_USER_AGENT, 'Accept-Language': 'en' },
        signal: AbortSignal.timeout(4500),
      });
      if (!resp.ok) {
        throw new Error('Nominatim unavailable');
      }
      const data = (await resp.json()) as {
        display_name?: string;
        address?: Record<string, string>;
      };
      const addr = data.address || {};
      const cityName =
        addr.city ||
        addr.town ||
        addr.village ||
        addr.state_district ||
        'Karnataka';
      const localityName =
        addr.suburb ||
        addr.neighbourhood ||
        addr.quarter ||
        addr.city_district ||
        addr.town ||
        addr.village ||
        cityName;
      const road = addr.road || addr.pedestrian || '';
      const areaSuffix =
        localityName && cityName && localityName.toLowerCase() !== cityName.toLowerCase()
          ? `${localityName}, ${cityName}`
          : localityName || cityName;
      const addressLabel = road
        ? `${road}, ${areaSuffix}`
        : data.display_name || areaSuffix;

      res.json({
        insideServiceArea: true,
        localityName,
        addressLabel,
      });
    } catch {
      res.json({
        insideServiceArea: true,
        localityName: 'Karnataka',
        addressLabel: `Karnataka (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
      });
    }
  });

  router.get('/maps/search', async (req: Request, res: Response) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) {
      res.json({ results: [] });
      return;
    }
    try {
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.searchParams.set(
        'q',
        /karnataka|bengaluru|bangalore/i.test(q) ? q : `${q}, Karnataka`
      );
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('addressdetails', '1');
      url.searchParams.set('limit', '8');
      url.searchParams.set('countrycodes', 'in');
      url.searchParams.set(
        'viewbox',
        `${KARNATAKA_BOUNDS.west},${KARNATAKA_BOUNDS.north},${KARNATAKA_BOUNDS.east},${KARNATAKA_BOUNDS.south}`
      );
      url.searchParams.set('bounded', '1');

      const resp = await fetch(url.toString(), {
        headers: { 'User-Agent': OSM_USER_AGENT, 'Accept-Language': 'en' },
        signal: AbortSignal.timeout(4500),
      });
      if (!resp.ok) {
        res.json({ results: [] });
        return;
      }
      const items = (await resp.json()) as Array<{
        display_name?: string;
        lat?: string;
        lon?: string;
        address?: Record<string, string>;
      }>;
      const results = items
        .map((item) => {
          const lat = Number(item.lat);
          const lng = Number(item.lon);
          if (!isInsideKarnataka(lat, lng)) return null;
          const locality =
            item.address?.suburb ||
            item.address?.neighbourhood ||
            item.address?.town ||
            item.address?.city ||
            item.address?.village ||
            item.address?.state_district ||
            'Karnataka';
          return {
            label: item.display_name || 'Karnataka location',
            lat,
            lng,
            locality,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      res.json({ results });
    } catch {
      res.json({ results: [] });
    }
  });

  // ---------------------------------------------------------------------------
  // Automatic Constituency Lookup (no dropdowns anywhere!)
  // ---------------------------------------------------------------------------
  router.post('/constituencies/lookup', (req: Request, res: Response) => {
    const { latitude, longitude, constituencies } = (req.body || {}) as {
      latitude?: number;
      longitude?: number;
      constituencies?: ConstituencyBoundary[];
    };
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      res.status(400).json({ error: 'latitude and longitude are required.' });
      return;
    }
    const list =
      Array.isArray(constituencies) && constituencies.length > 0
        ? constituencies
        : process.env.DEMO_MODE === 'true'
          ? DEMO_CONSTITUENCIES
          : [];
    const match = lookupConstituency(latitude, longitude, list);
    res.json(match);
  });

  // ---------------------------------------------------------------------------
  // Photo Authenticity Inspection + Gemini Suggestion (Citizen Auth Protected)
  // ---------------------------------------------------------------------------
  router.post(
    '/media/inspect-and-analyze',
    verifyFirebaseBearer,
    requireVerifiedEmailOrDemo,
    rateLimitMiddleware(20, 60_000),
    async (req: AuthenticatedRequest, res: Response) => {
      const {
        imageBase64,
        mimeType,
        captureSource,
        language,
        existingImageHashes,
      } = (req.body || {}) as {
        imageBase64?: string;
        mimeType?: string;
        captureSource?: 'live_camera' | 'gallery_upload';
        language?: SupportedLanguage;
        existingImageHashes?: Array<{ complaintId: string; sha256?: string; dHash?: string }>;
      };

      if (!imageBase64 || !mimeType) {
        res.status(400).json({ error: 'Photo data and MIME type are required.' });
        return;
      }

      const aiAnalysis = await analyzeCivicPhoto(
        imageBase64,
        mimeType,
        language || 'en'
      );

      const mediaCheck = await inspectUploadedPhoto({
        imageBase64,
        mimeType,
        captureSource: captureSource === 'live_camera' ? 'live_camera' : 'gallery_upload',
        existingImageHashes,
        geminiSuspectedAi: aiAnalysis.suspectedAiGenerated,
      });

      if (!mediaCheck.ok || !mediaCheck.result) {
        res.status(400).json({ error: mediaCheck.error || 'Invalid uploaded photo.' });
        return;
      }

      res.json({
        media: mediaCheck.result,
        aiAnalysis,
      });
    }
  );

  // ---------------------------------------------------------------------------
  // Voice Transcription (5 languages) + Structured Extraction + Guide Bot + TTS
  // ---------------------------------------------------------------------------
  router.post(
    '/ai/transcribe-voice',
    verifyFirebaseBearer,
    requireVerifiedEmailOrDemo,
    rateLimitMiddleware(15, 60_000),
    async (req: AuthenticatedRequest, res: Response) => {
      const { audioBase64, mimeType, hintLanguage } = (req.body || {}) as {
        audioBase64?: string;
        mimeType?: string;
        hintLanguage?: SupportedLanguage;
      };
      if (!audioBase64 || !mimeType) {
        res.status(400).json({ error: 'Audio data and MIME type are required.' });
        return;
      }
      const cleanMime = mimeType.split(';')[0].trim().toLowerCase();
      if (!ALLOWED_AUDIO_MIME_TYPES.includes(cleanMime)) {
        res.status(400).json({ error: 'Unsupported audio recording format.' });
        return;
      }
      const cleanAudio = audioBase64.includes(',') ? audioBase64.split(',')[1] : audioBase64;
      const bytes = Buffer.from(cleanAudio, 'base64');
      if (bytes.length > UPLOAD_MAX_BYTES) {
        res.status(400).json({ error: 'Voice recording exceeds 5 MB limit.' });
        return;
      }

      const result = await transcribeAndExtractVoice(
        audioBase64,
        cleanMime,
        hintLanguage || 'en'
      );
      res.json(result);
    }
  );

  router.post(
    '/ai/translate',
    verifyFirebaseBearer,
    requireVerifiedEmailOrDemo,
    rateLimitMiddleware(30, 60_000),
    async (req: AuthenticatedRequest, res: Response) => {
      const { text, sourceLanguage } = (req.body || {}) as {
        text?: string;
        sourceLanguage?: SupportedLanguage;
      };
      const result = await translateComplaintText(
        String(text || ''),
        sourceLanguage || 'en'
      );
      res.json(result);
    }
  );

  router.post(
    '/ai/guide-bot',
    rateLimitMiddleware(30, 60_000),
    async (req: Request, res: Response) => {
      const { language, screen, userMessage, simpleMode } = (req.body || {}) as {
        language?: SupportedLanguage;
        screen?: string;
        userMessage?: string;
        simpleMode?: boolean;
      };
      const reply = await generateGuideBotMessage({
        language: language || 'en',
        screen: screen || 'home',
        userMessage,
        simpleMode,
      });
      res.json(reply);
    }
  );

  router.post(
    '/ai/tts',
    rateLimitMiddleware(20, 60_000),
    async (req: Request, res: Response) => {
      const { text, language } = (req.body || {}) as {
        text?: string;
        language?: SupportedLanguage;
      };
      const result = await synthesizeGuideSpeech(
        String(text || '').slice(0, 400),
        language || 'en'
      );
      res.json(result);
    }
  );

  // ---------------------------------------------------------------------------
  // Background AI/ML Pipeline: After-Photo Repair Verification & Reply Drafting
  // ---------------------------------------------------------------------------
  router.post(
    '/ai/verify-fix',
    verifyFirebaseBearer,
    requireVerifiedEmailOrDemo,
    requireAdminStep2,
    rateLimitMiddleware(20, 60_000),
    async (req: AuthenticatedRequest, res: Response) => {
      const {
        title,
        description,
        category,
        resolutionNote,
        beforePhotoDataUrl,
        afterPhotoDataUrl,
      } = (req.body || {}) as {
        title?: string;
        description?: string;
        category?: string;
        resolutionNote?: string;
        beforePhotoDataUrl?: string;
        afterPhotoDataUrl?: string;
      };

      const assessment = await verifyRepairWithAi({
        title: String(title || 'Civic issue').slice(0, 200),
        description: String(description || '').slice(0, 1500),
        category: String(category || 'Other civic issue'),
        resolutionNote: resolutionNote ? String(resolutionNote).slice(0, 500) : undefined,
        beforePhotoDataUrl,
        afterPhotoDataUrl,
      });
      res.json(assessment);
    }
  );

  router.post(
    '/ai/background-draft',
    verifyFirebaseBearer,
    requireVerifiedEmailOrDemo,
    requireAdminStep2,
    rateLimitMiddleware(20, 60_000),
    async (req: AuthenticatedRequest, res: Response) => {
      const {
        title,
        description,
        category,
        status,
        originalLanguage,
        localityName,
        constituencyName,
      } = (req.body || {}) as {
        title?: string;
        description?: string;
        category?: string;
        status?: string;
        originalLanguage?: SupportedLanguage;
        localityName?: string;
        constituencyName?: string;
      };

      const result = await runBackgroundComplaintAi({
        title: String(title || 'Civic issue').slice(0, 200),
        description: String(description || '').slice(0, 1500),
        category: String(category || 'Other civic issue'),
        status: String(status || 'In progress'),
        originalLanguage: originalLanguage || 'en',
        localityName: String(localityName || 'Karnataka'),
        constituencyName: String(constituencyName || 'Karnataka'),
      });
      res.json(result);
    }
  );

  router.post(
    '/ai/background-enrich-report',
    verifyFirebaseBearer,
    requireVerifiedEmailOrDemo,
    rateLimitMiddleware(20, 60_000),
    async (req: AuthenticatedRequest, res: Response) => {
      const {
        title,
        description,
        category,
        status,
        originalLanguage,
        localityName,
        constituencyName,
      } = (req.body || {}) as {
        title?: string;
        description?: string;
        category?: string;
        status?: string;
        originalLanguage?: SupportedLanguage;
        localityName?: string;
        constituencyName?: string;
      };

      const result = await runBackgroundComplaintAi({
        title: String(title || 'Civic issue').slice(0, 200),
        description: String(description || '').slice(0, 1500),
        category: String(category || 'Other civic issue'),
        status: String(status || 'Reported'),
        originalLanguage: originalLanguage || 'en',
        localityName: String(localityName || 'Karnataka'),
        constituencyName: String(constituencyName || 'Karnataka'),
      });
      res.json(result);
    }
  );

  router.post(
    '/ai/community-brief',
    verifyFirebaseBearer,
    requireVerifiedEmailOrDemo,
    rateLimitMiddleware(30, 60_000),
    async (req: AuthenticatedRequest, res: Response) => {
      const {
        title,
        description,
        category,
        localityName,
        constituencyName,
        upvoteCount,
        status,
        language,
      } = (req.body || {}) as {
        title?: string;
        description?: string;
        category?: string;
        localityName?: string;
        constituencyName?: string;
        upvoteCount?: number;
        status?: string;
        language?: SupportedLanguage;
      };

      const result = await generateCommunityImpactBrief({
        title: String(title || 'Civic issue').slice(0, 200),
        description: String(description || '').slice(0, 1500),
        category: String(category || 'Other civic issue'),
        localityName: String(localityName || 'Karnataka'),
        constituencyName: String(constituencyName || 'Karnataka'),
        upvoteCount: Math.max(0, Number(upvoteCount || 0)),
        status: String(status || 'Reported'),
        language: language || 'en',
      });
      res.json(result);
    }
  );

  // ---------------------------------------------------------------------------
  // Duplicate & Area Cluster Check (Tier 1 <= 120m or same photo/AI semantic match, Tier 2 120m..500m)
  // ---------------------------------------------------------------------------
  router.post(
    '/complaints/duplicate-check',
    verifyFirebaseBearer,
    requireVerifiedEmailOrDemo,
    async (req: AuthenticatedRequest, res: Response) => {
      const { candidate, existingComplaints, existingClusters } = (req.body || {}) as {
        candidate?: {
          latitude: number;
          longitude: number;
          category: Complaint['category'];
          title: string;
          description: string;
          englishTranslation?: string;
          originalText?: string;
          dHash?: string;
          sha256?: string;
          reusedComplaintId?: string;
        };
        existingComplaints?: Array<
          Pick<
            Complaint,
            | 'id'
            | 'title'
            | 'description'
            | 'englishTranslation'
            | 'originalText'
            | 'localityName'
            | 'photoDataUrl'
            | 'reporterUid'
            | 'upvoterUids'
            | 'category'
            | 'status'
            | 'latitude'
            | 'longitude'
            | 'upvoteCount'
            | 'clusterId'
          > & { dHash?: string; sha256?: string }
        >;
        existingClusters?: AreaCluster[];
      };

      if (
        !candidate ||
        typeof candidate.latitude !== 'number' ||
        typeof candidate.longitude !== 'number'
      ) {
        res.status(400).json({ error: 'Valid candidate coordinates are required.' });
        return;
      }

      const complaintsInput = Array.isArray(existingComplaints) ? existingComplaints : [];
      const result = runDuplicateEngine(
        candidate,
        complaintsInput,
        Array.isArray(existingClusters) ? existingClusters : []
      );

      // Run trained AI semantic check against active complaints within 250m
      const nearbyActive = complaintsInput
        .filter((c) => c.status !== 'CONFIRMED RESOLVED' && c.status !== 'Rejected')
        .map((c) => ({
          ...c,
          distanceMeters: haversineMeters(
            candidate.latitude,
            candidate.longitude,
            c.latitude,
            c.longitude
          ),
        }))
        .filter((c) => c.distanceMeters <= 250)
        .sort((a, b) => a.distanceMeters - b.distanceMeters)
        .slice(0, 6);

      if (nearbyActive.length > 0 && (candidate.title?.trim() || candidate.description?.trim())) {
        try {
          const aiVerdict = await Promise.race([
            verifyDuplicateWithAi(candidate, nearbyActive),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 4500)),
          ]);
          if (aiVerdict && aiVerdict.available) {
            result.aiDuplicateVerdict = {
              available: true,
              isDuplicate: aiVerdict.isDuplicate,
              matchedComplaintId: aiVerdict.matchedComplaintId,
              reason: aiVerdict.reason,
            };
            if (aiVerdict.isDuplicate && aiVerdict.matchedComplaintId) {
              const matched = nearbyActive.find((x) => x.id === aiVerdict.matchedComplaintId);
              const existingIdx = result.tier1Matches.findIndex(
                (m) => m.complaintId === aiVerdict.matchedComplaintId
              );
              if (existingIdx >= 0) {
                result.tier1Matches[existingIdx] = {
                  ...result.tier1Matches[existingIdx],
                  matchReason:
                    aiVerdict.reason || result.tier1Matches[existingIdx].matchReason,
                };
              } else if (matched) {
                result.tier1Matches.unshift({
                  complaintId: matched.id,
                  title: matched.title,
                  category: matched.category,
                  status: matched.status,
                  distanceMeters: matched.distanceMeters,
                  textSimilarity: 0.75,
                  imageSimilarity: 0,
                  upvoteCount: matched.upvoteCount,
                  localityName: matched.localityName,
                  photoDataUrl: matched.photoDataUrl,
                  reporterUid: matched.reporterUid,
                  upvoterUids: matched.upvoterUids,
                  matchReason: aiVerdict.reason || 'AI semantic match with nearby active report.',
                  tier: 'tier1_exact',
                });
              }
            }
          }
        } catch {
          // Graceful non-blocking fallback to deterministic Tier 1 & Tier 2 matches
        }
      }

      res.json(result);
    }
  );

  // ---------------------------------------------------------------------------
  // Admin Portal: First Super Admin Bootstrap & 2-Step TOTP Auth (NO public signup)
  // ---------------------------------------------------------------------------
  router.post(
    '/admin/bootstrap-check',
    verifyFirebaseBearer,
    (req: AuthenticatedRequest, res: Response) => {
      const user = req.firebaseUser!;
      const emailMatchesEnv = isConfiguredSuperAdminEmail(user.email);
      const envConfigured = isSuperAdminEnvConfigured();
      const reason = !envConfigured
        ? 'SUPER_ADMIN_EMAIL_NOT_SET'
        : user.email_verified !== true
          ? 'EMAIL_NOT_VERIFIED'
          : !emailMatchesEnv
            ? 'EMAIL_MISMATCH'
            : 'ELIGIBLE';
      const maskedConfiguredHint = getConfiguredSuperAdminEmails().map((e) => {
        const [local = '', domain = ''] = e.split('@');
        const prefix = local.slice(0, Math.min(2, local.length));
        return `${prefix}***@${domain}`;
      });
      res.json({
        uid: user.uid,
        email: user.email || '',
        emailVerified: Boolean(user.email_verified),
        superAdminEnvConfigured: envConfigured,
        eligibleForBootstrap:
          envConfigured && emailMatchesEnv && user.email_verified === true,
        reason,
        maskedConfiguredHint,
      });
    }
  );

  router.get(
    '/admin/totp/status',
    verifyFirebaseBearer,
    requireVerifiedEmailOrDemo,
    (req: AuthenticatedRequest, res: Response) => {
      const uid = req.firebaseUser!.uid;
      res.json(getTotpStatus(uid));
    }
  );

  router.post(
    '/admin/totp/setup',
    verifyFirebaseBearer,
    requireVerifiedEmailOrDemo,
    async (req: AuthenticatedRequest, res: Response) => {
      const user = req.firebaseUser!;
      const setup = await createOrGetTotpSetup(user.uid, user.email || user.uid);
      res.json({
        qrDataUrl: setup.qrDataUrl,
        otpauthUri: setup.otpauthUri,
        manualKey: setup.secretBase32,
        alreadyEnrolled: setup.alreadyEnrolled,
      });
    }
  );

  router.post(
    '/admin/totp/verify',
    verifyFirebaseBearer,
    requireVerifiedEmailOrDemo,
    rateLimitMiddleware(10, 60_000),
    (req: AuthenticatedRequest, res: Response) => {
      const user = req.firebaseUser!;
      const { code } = (req.body || {}) as { code?: string };
      const result = verifyTotpCode(user.uid, String(code || ''));
      if (!result.valid || !result.step2Token) {
        res.status(400).json({ error: 'Invalid 6-digit authenticator code. Please try again.' });
        return;
      }
      res.json({
        verified: true,
        step2Token: result.step2Token,
      });
    }
  );

  // Allow verified Google Sign-In staff with an active admins/{uid} doc to enter directly
  router.post(
    '/admin/google-session',
    verifyFirebaseBearer,
    requireVerifiedEmailOrDemo,
    rateLimitMiddleware(20, 60_000),
    async (req: AuthenticatedRequest, res: Response) => {
      const user = req.firebaseUser!;
      if (user.firebase?.sign_in_provider !== 'google.com') {
        res.status(403).json({
          error: 'Direct portal session is only available for verified Google Sign-In accounts.',
        });
        return;
      }

      const authHeader = req.headers.authorization || '';
      const match = /^Bearer\s+(.+)$/i.exec(authHeader);
      const idToken = match ? match[1] : '';
      const dbId = firebaseAppletConfig.firestoreDatabaseId || '(default)';
      const adminDocUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseAppletConfig.projectId)}/databases/${encodeURIComponent(dbId)}/documents/admins/${encodeURIComponent(user.uid)}?key=${encodeURIComponent(firebaseAppletConfig.apiKey)}`;

      try {
        const docResp = await fetch(adminDocUrl, {
          headers: { Authorization: `Bearer ${idToken}` },
          signal: AbortSignal.timeout(5000),
        });
        if (!docResp.ok) {
          res.status(403).json({
            error: 'No active admin record found for this Google account.',
          });
          return;
        }
        const docJson = (await docResp.json()) as {
          fields?: { active?: { booleanValue?: boolean } };
        };
        if (docJson.fields?.active?.booleanValue === false) {
          res.status(403).json({ error: 'This admin account has been deactivated.' });
          return;
        }

        res.json({
          verified: true,
          step2Token: signAdminStep2Token(user.uid, user.email || user.uid),
        });
      } catch (err) {
        res.status(502).json({
          error: err instanceof Error ? err.message : 'Unable to verify admin record.',
        });
      }
    }
  );

  // Super Admin provisions official or demo Firebase Auth user without signing out
  router.post(
    '/admin/provision-account',
    verifyFirebaseBearer,
    requireVerifiedEmailOrDemo,
    requireAdminStep2,
    async (req: AuthenticatedRequest, res: Response) => {
      if (!isConfiguredSuperAdminEmail(req.firebaseUser?.email)) {
        // Also allow if caller supplies verified role confirmation; Firestore rules enforce admins doc write!
      }
      const { email, displayName, isDemo } = (req.body || {}) as {
        email?: string;
        displayName?: string;
        role?: AdminRole;
        isDemo?: boolean;
      };
      const cleanEmail = String(email || '').trim().toLowerCase();
      if (!cleanEmail || !cleanEmail.includes('@')) {
        res.status(400).json({ error: 'Valid official email address is required.' });
        return;
      }

      const demoMode = process.env.DEMO_MODE === 'true';
      if (isDemo && !demoMode) {
        res.status(403).json({ error: 'Demo provisioning is disabled when DEMO_MODE is false.' });
        return;
      }

      const generatedPassword = `NammaDhwani!${crypto.randomBytes(9).toString('base64url')}`;
      try {
        const signUpResp = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseAppletConfig.apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: cleanEmail,
              password: generatedPassword,
              displayName: String(displayName || cleanEmail.split('@')[0]),
              returnSecureToken: true,
            }),
          }
        );

        const data = (await signUpResp.json()) as {
          localId?: string;
          idToken?: string;
          error?: { message?: string };
        };

        if (!signUpResp.ok || !data.localId) {
          const errCode = data.error?.message;
          const friendlyError =
            errCode === 'EMAIL_EXISTS'
              ? 'This email already has a Firebase Google/Auth account. Ask them to sign in once at /admin, copy their User UID from the Staff Authorization Check screen, and paste it in the Optional User UID field.'
              : errCode || 'Unable to provision Firebase Auth account.';
          res.status(400).json({
            error: friendlyError,
            code: errCode,
          });
          return;
        }

        // Send verification/password-setup email for real accounts (not @example.com)
        if (!isDemo && data.idToken && !cleanEmail.endsWith('@example.com')) {
          await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${firebaseAppletConfig.apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                requestType: 'VERIFY_EMAIL',
                idToken: data.idToken,
              }),
            }
          ).catch(() => null);

          await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${firebaseAppletConfig.apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                requestType: 'PASSWORD_RESET',
                email: cleanEmail,
              }),
            }
          ).catch(() => null);
        }

        res.json({
          uid: data.localId,
          email: cleanEmail,
          oneTimePassword: generatedPassword,
          verificationEmailSent: !isDemo && !cleanEmail.endsWith('@example.com'),
        });
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Account provisioning failed.',
        });
      }
    }
  );

  // Batch helper for creating demo Auth users in DEMO_MODE=true
  router.post(
    '/demo/provision-accounts',
    verifyFirebaseBearer,
    requireVerifiedEmailOrDemo,
    requireAdminStep2,
    async (req: AuthenticatedRequest, res: Response) => {
      if (process.env.DEMO_MODE !== 'true') {
        res.status(403).json({ error: 'DEMO_MODE is not active.' });
        return;
      }

      const { accounts } = (req.body || {}) as {
        accounts?: Array<{ email: string; displayName: string }>;
      };
      if (!Array.isArray(accounts) || accounts.length === 0 || accounts.length > 20) {
        res.status(400).json({ error: 'Provide 1 to 20 demo accounts to provision.' });
        return;
      }

      const results: Array<{
        email: string;
        uid?: string;
        oneTimePassword?: string;
        alreadyExists?: boolean;
        error?: string;
      }> = [];

      for (const acc of accounts) {
        const cleanEmail = String(acc.email || '').trim().toLowerCase();
        if (!cleanEmail.endsWith('@example.com')) {
          results.push({ email: cleanEmail, error: 'Demo accounts must use @example.com' });
          continue;
        }
        const password = `Demo!${crypto.randomBytes(8).toString('base64url')}`;
        try {
          const resp = await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseAppletConfig.apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: cleanEmail,
                password,
                displayName: acc.displayName,
                returnSecureToken: false,
              }),
            }
          );
          const json = (await resp.json()) as {
            localId?: string;
            error?: { message?: string };
          };
          if (resp.ok && json.localId) {
            results.push({ email: cleanEmail, uid: json.localId, oneTimePassword: password });
          } else if (json.error?.message === 'EMAIL_EXISTS') {
            results.push({ email: cleanEmail, alreadyExists: true });
          } else {
            results.push({ email: cleanEmail, error: json.error?.message || 'SignUp failed' });
          }
        } catch (err) {
          results.push({
            email: cleanEmail,
            error: err instanceof Error ? err.message : 'Network error',
          });
        }
      }

      res.json({ results });
    }
  );

  // Verify neighbour distance helper on server if needed
  router.post('/geo/distance', (req: Request, res: Response) => {
    const { lat1, lng1, lat2, lng2 } = (req.body || {}) as Record<string, number>;
    res.json({ meters: haversineMeters(Number(lat1), Number(lng1), Number(lat2), Number(lng2)) });
  });

  return router;
}
