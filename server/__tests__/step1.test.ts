import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import * as OTPAuth from 'otpauth';
import { DEFAULT_POINTS_CONFIG, DEMO_CONSTITUENCIES } from '../../shared/constants.ts';
import { isInsideBengaluru, isInsideKarnataka, lookupConstituency } from '../../shared/geo.ts';
import {
  normalizeAdminDoc,
  normalizeCommunityCommentDoc,
  normalizeComplaintDoc,
  normalizeNotificationDoc,
} from '../../shared/normalizers.ts';
import { computePriorityScore, getCommunityDemandInfo } from '../../shared/priority.ts';
import {
  createOrGetTotpSetup,
  verifyAdminStep2Token,
  verifyTotpCode,
} from '../middleware/auth.ts';
import { runDuplicateEngine } from '../services/duplicateEngine.ts';
import {
  generateCommunityImpactBrief,
  runBackgroundComplaintAi,
  verifyDuplicateWithAi,
  verifyRepairWithAi,
} from '../services/geminiService.ts';
import { inspectUploadedPhoto } from '../services/mediaService.ts';

test('Step 1 Acceptance: Karnataka-wide service area & automatic constituency routing', () => {
  // Vidhana Soudha area (central Bengaluru)
  const center = lookupConstituency(12.9796, 77.5912, DEMO_CONSTITUENCIES);
  assert.equal(center.insideServiceArea, true);
  assert.equal(center.constituency?.id, 'demo-const-5');
  assert.equal(center.constituency?.mlaName, 'Demo Member E');

  // Across Karnataka outside Bengaluru (Mysuru, Hubballi, Mangaluru) -> inside Karnataka service area without snapping to Bengaluru Demo constituency
  assert.equal(isInsideKarnataka(12.2958, 76.6394), true);
  assert.equal(isInsideKarnataka(15.3647, 75.124), true);
  assert.equal(isInsideKarnataka(12.9141, 74.856), true);
  const mysuru = lookupConstituency(12.2958, 76.6394, DEMO_CONSTITUENCIES);
  assert.equal(mysuru.insideServiceArea, true);
  assert.equal(mysuru.constituency, null);

  // Outside Karnataka (Mumbai, Chennai)
  assert.equal(isInsideBengaluru(19.076, 72.8777), false);
  assert.equal(isInsideKarnataka(19.076, 72.8777), false);
  const mumbai = lookupConstituency(19.076, 72.8777, DEMO_CONSTITUENCIES);
  assert.equal(mumbai.insideServiceArea, false);
  assert.equal(mumbai.constituency, null);

  // Near boundary detection (within ~180m of lat 13.040 edge)
  const edge = lookupConstituency(13.0395, 77.600, DEMO_CONSTITUENCIES);
  assert.equal(edge.insideServiceArea, true);
  assert.equal(edge.nearBoundary, true);
});

test('Step 1 Acceptance: Duplicate Engine Tier 1 (<=100m) & Tier 2 (100-500m area cluster)', () => {
  const existing = [
    {
      id: 'cmp-existing-1',
      title: 'Deep pothole near bus shelter',
      description: 'Large crater causing two-wheeler skids',
      category: 'Potholes' as const,
      status: 'Reported' as const,
      latitude: 12.9716,
      longitude: 77.5946,
      upvoteCount: 2,
    },
  ];

  // ~35m away, same category -> Tier 1 auto-upvote match
  const tier1 = runDuplicateEngine(
    {
      latitude: 12.97185,
      longitude: 77.5948,
      category: 'Potholes',
      title: 'Pothole next to bus stand',
      description: 'Deep pothole road hazard',
    },
    existing
  );
  assert.equal(tier1.tier1Matches.length, 1);
  assert.equal(tier1.tier1Matches[0].complaintId, 'cmp-existing-1');

  // ~280m away, same category -> Tier 2 area cluster match (not Tier 1)
  const tier2 = runDuplicateEngine(
    {
      latitude: 12.9741,
      longitude: 77.5946,
      category: 'Potholes',
      title: 'Broken asphalt stretch',
      description: 'Another pothole down the street',
    },
    existing
  );
  assert.equal(tier2.tier1Matches.length, 0);
  assert.equal(tier2.tier2ClusterMatches.length, 1);

  // Different category at 35m with unrelated text -> stays separate
  const diffCat = runDuplicateEngine(
    {
      latitude: 12.97185,
      longitude: 77.5948,
      category: 'Broken streetlights',
      title: 'Dark junction lamp off',
      description: 'Three poles completely dark at night',
    },
    existing
  );
  assert.equal(diffCat.tier1Matches.length, 0);

  // Citizen-layer cross-language duplicate via englishTranslation even across categories
  const crossLang = runDuplicateEngine(
    {
      latitude: 12.9718,
      longitude: 77.5947,
      category: 'Other civic issue',
      title: 'ಹೊಂಡದ ರಸ್ತೆ ಸಮಸ್ಯೆ',
      description: 'ಬಸ್ ನಿಲ್ದಾಣದ ಬಳಿ ದೊಡ್ಡ ಹೊಂಡ',
      englishTranslation: 'Deep pothole near bus shelter causing skids',
    },
    existing
  );
  assert.equal(crossLang.tier1Matches.length, 1);
  assert.equal(crossLang.tier1Matches[0].complaintId, 'cmp-existing-1');
});

test('Step 1 Acceptance: Priority scoring invariant (Critical >= High always)', () => {
  const maxHigh = computePriorityScore({
    severity: 'High',
    category: 'Water leakage',
    upvoteCount: 99,
    ageHours: 500,
    isNearSchoolOrHospital: true,
  });

  const minCritical = computePriorityScore({
    severity: 'Critical',
    category: 'Other civic issue',
    upvoteCount: 0,
    ageHours: 0,
    isNearSchoolOrHospital: false,
  });

  assert.ok(
    minCritical.score >= maxHigh.score,
    `Expected Critical (${minCritical.score}) >= High (${maxHigh.score})`
  );
});

test('Step 1 Acceptance: Media upload validation, reuse check, and configurable AI blocking', async () => {
  // 1x1 valid PNG pixel
  const tinyPngBase64 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

  const badMime = await inspectUploadedPhoto({
    imageBase64: tinyPngBase64,
    mimeType: 'image/svg+xml',
    captureSource: 'gallery_upload',
  });
  assert.equal(badMime.ok, false);

  const first = await inspectUploadedPhoto({
    imageBase64: tinyPngBase64,
    mimeType: 'image/png',
    captureSource: 'live_camera',
  });
  assert.equal(first.ok, true);
  assert.ok(first.result?.sha256);

  // Reuse check catches identical photo hash
  const reused = await inspectUploadedPhoto({
    imageBase64: tinyPngBase64,
    mimeType: 'image/png',
    captureSource: 'gallery_upload',
    existingImageHashes: [{ complaintId: 'cmp-prev', sha256: first.result!.sha256 }],
  });
  assert.equal(reused.ok, true);
  assert.equal(reused.result?.authenticityStatus, 'reused_photo');
  assert.equal(reused.result?.reusedComplaintId, 'cmp-prev');

  // Config switch off -> suspicious AI marks needs_review instead of blocking
  process.env.AI_IMAGE_BLOCKING_ENABLED = 'false';
  const unblockedAi = await inspectUploadedPhoto({
    imageBase64: tinyPngBase64,
    mimeType: 'image/png',
    captureSource: 'gallery_upload',
    geminiSuspectedAi: true,
  });
  assert.equal(unblockedAi.result?.blocked, false);
  assert.equal(unblockedAi.result?.authenticityStatus, 'needs_review');
});

test('Step 1 Acceptance: Legacy Firestore document normalizers prevent undefined array/timestamp crashes', () => {
  const legacyComplaint = normalizeComplaintDoc('legacy-doc-1', {
    title: 'Dark junction streetlight',
    description: 'Streetlight out near temple road',
    status: 'SUBMITTED',
    supportCount: 4,
    wardNumber: 102,
    wardName: 'Sriramapuram',
    createdAt: { toDate: () => new Date('2025-11-01T10:00:00.000Z') },
  });

  assert.equal(legacyComplaint.id, 'legacy-doc-1');
  assert.equal(legacyComplaint.status, 'Reported');
  assert.equal(legacyComplaint.upvoteCount, 4);
  assert.deepEqual(legacyComplaint.upvoterUids, []);
  assert.deepEqual(legacyComplaint.timeline, []);
  assert.equal(legacyComplaint.constituencyId, 'legacy-ward-102');
  assert.equal(legacyComplaint.constituencyName, 'Sriramapuram');
  assert.equal(legacyComplaint.createdAt, '2025-11-01T10:00:00.000Z');
  assert.equal(legacyComplaint.updatedAt, '2025-11-01T10:00:00.000Z');

  // Legacy admin docs without Step 1 role must safely return null
  const legacyAdmin = normalizeAdminDoc('uid-legacy', {
    email: 'old-politician@gmail.com',
    isPolitician: true,
  });
  assert.equal(legacyAdmin, null);

  const validAdmin = normalizeAdminDoc('uid-real', {
    uid: 'uid-real',
    email: 'staff@example.com',
    role: 'mla_owner',
    constituencyId: 'demo-const-5',
  });
  assert.equal(validAdmin?.role, 'mla_owner');
  assert.equal(validAdmin?.active, true);
});

test('Step 1 Acceptance: Genuine RFC 6238 TOTP 2-Step Admin Verification', async () => {
  const vaultPath = path.resolve(process.cwd(), '.nagrik-totp-vault.json');
  const hadVaultBefore = fs.existsSync(vaultPath);
  const previousVault = hadVaultBefore ? fs.readFileSync(vaultPath, 'utf8') : null;

  try {
    const testUid = `test-admin-${Date.now()}`;
    const setup = await createOrGetTotpSetup(testUid, 'staff@example.com');
    assert.ok(setup.qrDataUrl.startsWith('data:image/png;base64,'));

    const bad = verifyTotpCode(testUid, '000000');
    assert.equal(bad.valid, false);

    const validCode = new OTPAuth.TOTP({
      issuer: 'Namma Dhwani Admin Portal',
      label: 'staff@example.com',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(setup.secretBase32),
    }).generate();

    const ok = verifyTotpCode(testUid, validCode);
    assert.equal(ok.valid, true);
    assert.ok(ok.step2Token);
    assert.equal(verifyAdminStep2Token(ok.step2Token!, testUid), true);
    assert.equal(verifyAdminStep2Token(ok.step2Token!, 'other-uid'), false);
  } finally {
    if (hadVaultBefore && previousVault !== null) {
      fs.writeFileSync(vaultPath, previousVault, 'utf8');
    } else if (fs.existsSync(vaultPath)) {
      fs.unlinkSync(vaultPath);
    }
  }
});

test('Step 2 Acceptance: Notification normalizer, zero-upvote points invariant, and graceful background AI fallback', async () => {
  assert.equal(DEFAULT_POINTS_CONFIG.upvote, 0);

  const notif = normalizeNotificationDoc('notif-1', {
    recipientUid: 'citizen-1',
    complaintId: 'cmp-1',
    title: 'Issue Marked Fixed',
    body: 'Please inspect and verify.',
    type: 'fix_awaiting_confirmation',
    read: false,
    createdAt: { seconds: 1760000000 },
  });
  assert.equal(notif.id, 'notif-1');
  assert.equal(notif.recipientUid, 'citizen-1');
  assert.equal(notif.read, false);
  assert.equal(notif.type, 'fix_awaiting_confirmation');

  const prevKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const fixAi = await verifyRepairWithAi({
      title: 'Pothole near Indiranagar',
      description: 'Deep hole repaired',
      category: 'Potholes',
    });
    assert.equal(fixAi.available, false);
    assert.equal(fixAi.aiSuggestion, true);
    assert.equal(fixAi.verdict, 'unavailable');

    const bgAi = await runBackgroundComplaintAi({
      title: 'Broken streetlight',
      description: 'Lamp dark for 3 nights',
      category: 'Broken streetlights',
      status: 'Reported',
      originalLanguage: 'kn',
      localityName: 'Jayanagar',
      constituencyName: 'Bengaluru South',
    });
    assert.equal(bgAi.available, false);
    assert.equal(bgAi.aiStatus, 'unavailable');

    const commBrief = await generateCommunityImpactBrief({
      title: 'Deep pothole near metro station',
      description: 'Water-filled crater blocking two-wheelers',
      category: 'Potholes',
      localityName: 'Indiranagar 1st Stage',
      constituencyName: 'Eastside Rail Corridor',
      upvoteCount: 6,
      status: 'Reported',
    });
    assert.equal(commBrief.available, false);
    assert.equal(commBrief.aiSuggestion, true);
    assert.equal(commBrief.aiStatus, 'unavailable');

    const withBrief = normalizeComplaintDoc('cmp-brief-1', {
      title: 'Flooded junction',
      status: 'SUBMITTED',
      aiCommunityBrief: '6 residents reported disruption near main bus corridor.',
    });
    assert.equal(withBrief.status, 'Reported');
    assert.equal(
      withBrief.aiCommunityBrief,
      '6 residents reported disruption near main bus corridor.'
    );
  } finally {
    if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
  }
});

test('Step 3 Acceptance: Community upvote auto-prioritization for Admin Portal triage', () => {
  const lowDemand = getCommunityDemandInfo({
    upvoteCount: 1,
    priorityScore: 40,
    severity: 'Medium',
    status: 'Reported',
  });
  assert.equal(lowDemand.tier, 'standard');

  const elevatedDemand = getCommunityDemandInfo({
    upvoteCount: 3,
    priorityScore: 45,
    severity: 'Medium',
    status: 'Reported',
  });
  assert.equal(elevatedDemand.tier, 'elevated');
  assert.ok(elevatedDemand.adminTriageScore > lowDemand.adminTriageScore);

  const seriousDemand = getCommunityDemandInfo({
    upvoteCount: 6,
    priorityScore: 55,
    severity: 'High',
    status: 'Reported',
  });
  assert.equal(seriousDemand.tier, 'serious');
  assert.match(seriousDemand.label, /SERIOUS ISSUE/);
  assert.ok(seriousDemand.adminTriageScore > elevatedDemand.adminTriageScore);

  const closedDemand = getCommunityDemandInfo({
    upvoteCount: 10,
    priorityScore: 70,
    severity: 'High',
    status: 'CONFIRMED RESOLVED',
  });
  assert.ok(closedDemand.adminTriageScore < 0);
});

test('Step 4 Acceptance: Photo reuse duplicate lock, synonym detection, AI duplicate fallback, & comment normalizer', async () => {
  const existing = [
    {
      id: 'cmp-drain-1',
      title: 'Overflowing sewage gutter near market',
      description: 'Choked manhole leaking dirty water onto junction road',
      category: 'Water leakage' as const,
      status: 'Reported' as const,
      latitude: 12.9716,
      longitude: 77.5946,
      upvoteCount: 3,
      sha256: 'hash-abc-123',
      dHash: '1111000011110000',
    },
  ];

  // Exact photo reuse at same location blocks as Tier 1 with isSamePhoto=true
  const samePhoto = runDuplicateEngine(
    {
      latitude: 12.9717,
      longitude: 77.5947,
      category: 'Water leakage',
      title: 'Water on road',
      description: 'Dirty stagnant puddle',
      sha256: 'hash-abc-123',
    },
    existing
  );
  assert.equal(samePhoto.tier1Matches.length, 1);
  assert.equal(samePhoto.tier1Matches[0].isSamePhoto, true);

  // Paraphrased synonym match within 120m (gutter/manhole <-> drain/sewer/clogged)
  const synonymMatch = runDuplicateEngine(
    {
      latitude: 12.9721,
      longitude: 77.5946,
      category: 'Water leakage',
      title: 'Clogged sewer drain flooding road',
      description: 'Drainage overflowing at junction',
    },
    existing
  );
  assert.equal(synonymMatch.tier1Matches.length, 1);
  assert.ok(synonymMatch.tier1Matches[0].matchReason);

  // Comment normalizer handles fallback safely
  const cmt = normalizeCommunityCommentDoc('cmt-1', {
    complaintId: 'cmp-drain-1',
    authorUid: 'citizen-2',
    authorDisplayName: 'Priya',
    text: 'Verified the repair photo — road looks dry!',
    kind: 'fix_check',
    createdAt: { seconds: 1760000100 },
  });
  assert.equal(cmt.kind, 'fix_check');
  assert.equal(cmt.authorDisplayName, 'Priya');

  // AI duplicate check falls back cleanly when API key is missing
  const prevKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const verdict = await verifyDuplicateWithAi(
      {
        title: 'Blocked drain',
        description: 'Sewage water overflowing',
        category: 'Water leakage',
      },
      existing.map((e) => ({ ...e, distanceMeters: 45 }))
    );
    assert.equal(verdict.available, false);
    assert.equal(verdict.isDuplicate, false);
  } finally {
    if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
  }
});

