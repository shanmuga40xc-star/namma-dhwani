import { computeCivicTextSimilarity, haversineMeters } from './geo.ts';
import type {
  AreaCluster,
  Complaint,
  DuplicateCheckCandidate,
  DuplicateCheckResult,
} from './types.ts';

export interface DuplicateCandidateInput {
  latitude: number;
  longitude: number;
  category: Complaint['category'];
  title: string;
  description: string;
  englishTranslation?: string;
  dHash?: string;
  sha256?: string;
  reusedComplaintId?: string;
}

export type DuplicateComparableComplaint = Pick<
  Complaint,
  | 'id'
  | 'title'
  | 'description'
  | 'category'
  | 'status'
  | 'latitude'
  | 'longitude'
  | 'upvoteCount'
  | 'clusterId'
> & {
  englishTranslation?: string;
  originalText?: string;
  localityName?: string;
  photoDataUrl?: string;
  reporterUid?: string;
  upvoterUids?: string[];
  dHash?: string;
  sha256?: string;
};

export function hammingSimilarityHex64(a: string, b: string): number {
  if (!a || !b || a.length !== 16 || b.length !== 16) return 0;
  let sameBits = 0;
  for (let i = 0; i < 16; i++) {
    const xor = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    for (let bit = 0; bit < 4; bit++) {
      if ((xor & (1 << bit)) === 0) sameBits += 1;
    }
  }
  return Math.round((sameBits / 64) * 1000) / 1000;
}

/**
 * Shared Two-tier Duplicate & Cluster Engine (runs identically in citizen layer & backend):
 * - Tier 1 (<= 120m or identical/reused photo): exact/same issue -> blocks duplicate & prompts upvote.
 * - Tier 2 (120m..500m, same category): nearby related issues -> groups into an area cluster.
 */
export function runDuplicateEngine(
  candidate: DuplicateCandidateInput,
  existingComplaints: DuplicateComparableComplaint[],
  existingClusters: AreaCluster[] = []
): DuplicateCheckResult {
  const tier1Matches: DuplicateCheckCandidate[] = [];
  const tier2ClusterMatches: DuplicateCheckCandidate[] = [];

  const candidateText = `${candidate.title || ''} ${candidate.description || ''} ${
    candidate.englishTranslation || ''
  }`.trim();
  const hasCandidateText = candidateText.replace(/\s+/g, '').length >= 8;

  for (const c of existingComplaints) {
    if (c.status === 'CONFIRMED RESOLVED' || c.status === 'Rejected') continue;

    const dist = haversineMeters(
      candidate.latitude,
      candidate.longitude,
      c.latitude,
      c.longitude
    );

    const exactShaMatch = Boolean(candidate.sha256 && c.sha256 && candidate.sha256 === c.sha256);
    const explicitReusedPhoto = Boolean(candidate.reusedComplaintId && candidate.reusedComplaintId === c.id);
    const imgSim =
      candidate.dHash && c.dHash ? hammingSimilarityHex64(candidate.dHash, c.dHash) : 0;
    const isSamePhoto = exactShaMatch || explicitReusedPhoto || (imgSim >= 0.90 && dist <= 500);

    if (dist > 500 && !exactShaMatch && !explicitReusedPhoto) continue;

    const existingText = `${c.title || ''} ${c.description || ''} ${
      c.englishTranslation || ''
    } ${c.originalText || ''}`.trim();
    const textSim = computeCivicTextSimilarity(candidateText, existingText);
    const sameCategory = c.category === candidate.category;
    const genericCategoryOverlap =
      dist <= 80 &&
      (candidate.category === 'Other civic issue' || c.category === 'Other civic issue');
    const pinOnlyExactSpot = dist <= 40 && !hasCandidateText;
    const closeSpotStrongOverlap = dist <= 120 && (sameCategory || textSim >= 0.22 || imgSim >= 0.85);

    if (isSamePhoto || (dist <= 120 && (closeSpotStrongOverlap || genericCategoryOverlap || pinOnlyExactSpot))) {
      const matchReason = isSamePhoto
        ? 'Identical or reused photo already attached to this active complaint.'
        : sameCategory
          ? `Same "${c.category}" issue reported ${Math.round(dist)}m away.`
          : textSim >= 0.22
            ? `Matching issue description (${Math.round(textSim * 100)}% keyword match) ${Math.round(dist)}m away.`
            : `Existing open civic report at this exact spot (${Math.round(dist)}m away).`;

      tier1Matches.push({
        complaintId: c.id,
        title: c.title,
        category: c.category,
        status: c.status,
        distanceMeters: dist,
        textSimilarity: textSim,
        imageSimilarity: exactShaMatch || explicitReusedPhoto ? 1 : imgSim,
        upvoteCount: c.upvoteCount,
        localityName: c.localityName,
        photoDataUrl: c.photoDataUrl,
        reporterUid: c.reporterUid,
        upvoterUids: c.upvoterUids,
        matchReason,
        isSamePhoto,
        tier: 'tier1_exact',
      });
    } else if (dist > 120 && dist <= 500 && sameCategory) {
      tier2ClusterMatches.push({
        complaintId: c.id,
        title: c.title,
        category: c.category,
        status: c.status,
        distanceMeters: dist,
        textSimilarity: textSim,
        imageSimilarity: imgSim,
        upvoteCount: c.upvoteCount,
        localityName: c.localityName,
        photoDataUrl: c.photoDataUrl,
        reporterUid: c.reporterUid,
        upvoterUids: c.upvoterUids,
        tier: 'tier2_cluster',
      });
    }
  }

  tier1Matches.sort(
    (a, b) =>
      Number(Boolean(b.isSamePhoto)) - Number(Boolean(a.isSamePhoto)) ||
      a.distanceMeters - b.distanceMeters
  );
  tier2ClusterMatches.sort((a, b) => a.distanceMeters - b.distanceMeters);

  let suggestedClusterId: string | undefined;
  for (const cl of existingClusters) {
    if (cl.category !== candidate.category || cl.status === 'resolved') continue;
    const d = haversineMeters(
      candidate.latitude,
      candidate.longitude,
      cl.centroidLat,
      cl.centroidLng
    );
    if (d <= 500) {
      suggestedClusterId = cl.id;
      break;
    }
  }

  return {
    tier1Matches,
    tier2ClusterMatches,
    suggestedClusterId,
  };
}
