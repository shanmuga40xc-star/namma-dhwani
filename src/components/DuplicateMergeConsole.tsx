import React, { useState } from 'react';
import { GitMerge, RotateCcw, ScanSearch, XCircle } from 'lucide-react';
import { detectDuplicateComplaints } from '../services/aiClient';
import {
  adminConfirmDuplicateMerge,
  adminCreateDuplicateReview,
  adminDismissDuplicateReview,
  adminReverseDuplicateMerge,
} from '../services/firestoreService';
import { CivicIncident, DuplicateReviewRecord } from '../types/civic';

interface DuplicateMergeConsoleProps {
  complaints: CivicIncident[];
  reviews: DuplicateReviewRecord[];
  adminUid: string;
  adminName: string;
  onShowToast: (msg: string) => void;
  onInspectComplaint: (id: string) => void;
}

export const DuplicateMergeConsole: React.FC<DuplicateMergeConsoleProps> = ({
  complaints,
  reviews,
  adminUid,
  adminName,
  onShowToast,
  onInspectComplaint,
}) => {
  const [radiusMeters, setRadiusMeters] = useState<number>(100);
  const [autoGroupPolicy, setAutoGroupPolicy] = useState<boolean>(false);
  const [scanning, setScanning] = useState<boolean>(false);
  const [mergeReasonMap, setMergeReasonMap] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lastScanNotice, setLastScanNotice] = useState<string | null>(null);

  const handleScanAll = async () => {
    const active = complaints.filter((c) => !c.isMergedDuplicate);
    if (active.length < 2) {
      onShowToast('At least 2 unmerged complaints are required to scan for duplicates.');
      return;
    }

    setScanning(true);
    setLastScanNotice(null);
    let createdCount = 0;

    try {
      const existingPairKeys = new Set(
        reviews.flatMap((r) => [
          `${r.originalComplaintId}::${r.candidateComplaintId}`,
          `${r.candidateComplaintId}::${r.originalComplaintId}`,
        ])
      );

      for (let i = 0; i < active.length; i += 1) {
        const candidate = active[i];
        const olderPool = active.filter(
          (other) => other.id !== candidate.id && other.createdAtMs <= candidate.createdAtMs
        );
        if (olderPool.length === 0) continue;

        const resp = await detectDuplicateComplaints({
          new_complaint: {
            id: candidate.id,
            title: candidate.title,
            description: candidate.description,
            category: candidate.confirmedCategory,
            locality: candidate.locality,
            latitude: candidate.latitude,
            longitude: candidate.longitude,
            photo_base64: candidate.photoDataUrl,
          },
          existing_complaints: olderPool.map((o) => ({
            id: o.id,
            title: o.title,
            description: o.description,
            category: o.confirmedCategory,
            locality: o.locality,
            latitude: o.latitude,
            longitude: o.longitude,
            photo_base64: o.photoDataUrl,
          })),
          radius_meters: radiusMeters,
          auto_group_policy_enabled: autoGroupPolicy,
        });

        if (resp.fallback_notice) {
          setLastScanNotice(resp.fallback_notice);
        }

        for (const match of resp.candidates) {
          const key = `${match.original_complaint_id}::${candidate.id}`;
          if (existingPairKeys.has(key)) continue;
          existingPairKeys.add(key);

          await adminCreateDuplicateReview({
            originalComplaintId: match.original_complaint_id,
            candidateComplaintId: candidate.id,
            distanceMeters: match.distance_meters,
            imageSimilarity: match.image_similarity,
            textSimilarity: match.text_similarity,
            categoryMatch: match.category_match,
            duplicateConfidence: match.duplicate_confidence,
            recommendedAction: match.recommended_action,
          });
          createdCount += 1;
        }
      }

      onShowToast(
        createdCount > 0
          ? `Duplicate scan finished: ${createdCount} candidate pair(s) queued for Admin review.`
          : `Duplicate scan finished within ${radiusMeters}m: no new duplicate pairs found.`
      );
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Duplicate scan failed.');
    } finally {
      setScanning(false);
    }
  };

  const handleConfirmMerge = async (review: DuplicateReviewRecord) => {
    const reason =
      mergeReasonMap[review.id]?.trim() ||
      `Confirmed duplicate within ${review.distanceMeters.toFixed(1)}m (${Math.round(
        review.duplicateConfidence * 100
      )}% multimodal confidence).`;
    setBusyId(review.id);
    try {
      await adminConfirmDuplicateMerge({
        review,
        adminUid,
        adminName,
        reason,
      });
      onShowToast(
        `Merged ${review.candidateComplaintId} into master ${review.originalComplaintId}.`
      );
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Failed to merge duplicate.');
    } finally {
      setBusyId(null);
    }
  };

  const handleReverseMerge = async (review: DuplicateReviewRecord) => {
    const reason =
      mergeReasonMap[review.id]?.trim() || 'Reversed by Admin Authority after secondary review.';
    setBusyId(review.id);
    try {
      await adminReverseDuplicateMerge({
        review,
        adminUid,
        adminName,
        reason,
      });
      onShowToast(`Reversed merge for ${review.candidateComplaintId}.`);
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Failed to reverse merge.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDismiss = async (review: DuplicateReviewRecord) => {
    setBusyId(review.id);
    try {
      await adminDismissDuplicateReview({
        reviewId: review.id,
        adminUid,
        reason: mergeReasonMap[review.id]?.trim() || 'Verified distinct field incidents.',
      });
      onShowToast(`Dismissed candidate pair ${review.candidateComplaintId}.`);
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Failed to dismiss candidate.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-[-0.01em] text-[#0A1D2B] sm:text-[32px] sm:leading-[40px]">
            Multimodal Duplicate Detection &amp; Merge Review
          </h1>
          <p className="mt-1 text-sm text-[#43474D]">
            Objective 2: Haversine GPS proximity + OpenCLIP image embeddings + SentenceTransformer
            text embeddings. Merging never deletes original records or citizen support attribution.
          </p>
        </div>

        <button
          type="button"
          disabled={scanning}
          onClick={handleScanAll}
          className="inline-flex h-11 items-center gap-2 rounded bg-[#102A43] px-4 text-xs font-semibold text-white hover:bg-[#0B1D2F] cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
        >
          <ScanSearch className="h-4 w-4" />
          {scanning ? 'Scanning Complaints...' : 'Scan Complaints for Duplicates'}
        </button>
      </div>

      {/* Configurable Radius & Policy Controls */}
      <section className="rounded-lg border border-[#102A43]/10 bg-white p-5 civic-shadow-1">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.04em] text-[#253746]">
              <span>GPS Proximity Filter Radius</span>
              <span className="font-mono-tabular text-sm text-[#102A43]">{radiusMeters} m</span>
            </div>
            <input
              type="range"
              min={25}
              max={500}
              step={25}
              value={radiusMeters}
              onChange={(e) => setRadiusMeters(Number(e.target.value))}
              className="mt-2 w-full accent-[#102A43]"
            />
            <p className="mt-1 text-[11px] text-[#52606D]">
              Default 100m threshold filters candidate pairs before computing CLIP + text similarity.
            </p>
          </div>

          <div className="flex flex-col justify-between rounded border border-[#E2E8F0] bg-[#F5F7FA] p-3.5">
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={autoGroupPolicy}
                onChange={(e) => setAutoGroupPolicy(e.target.checked)}
                className="h-4 w-4 accent-[#102A43]"
              />
              <span className="text-xs font-semibold text-[#0A1D2B]">
                Flag high-confidence matches (&ge; 85%) as Auto-Group Eligible
              </span>
            </label>
            <p className="mt-1 text-[11px] text-[#52606D]">
              All merges remain reversible by Admin Authority and retain original complaint records.
            </p>
          </div>
        </div>

        {lastScanNotice && (
          <div className="mt-3 rounded border border-[#F2A541] bg-[#FEF5E7] px-3 py-2 text-xs text-[#8A5208]">
            {lastScanNotice}
          </div>
        )}
      </section>

      {/* Candidate Pairs Ledger */}
      <section className="rounded-lg border border-[#102A43]/10 bg-white civic-shadow-1">
        <div className="border-b border-[#E2E8F0] px-5 py-4">
          <h2 className="font-display text-lg font-semibold text-[#0A1D2B]">
            Duplicate Review Queue ({reviews.length})
          </h2>
        </div>

        {reviews.length === 0 ? (
          <div className="px-6 py-12 text-center text-xs text-[#52606D]">
            No duplicate candidates queued yet. Submit nearby complaints or click &ldquo;Scan
            Complaints for Duplicates&rdquo; above.
          </div>
        ) : (
          <div className="divide-y divide-[#E2E8F0]">
            {reviews.map((rev) => {
              const orig = complaints.find((c) => c.id === rev.originalComplaintId);
              const cand = complaints.find((c) => c.id === rev.candidateComplaintId);
              const isBusy = busyId === rev.id;

              return (
                <div key={rev.id} className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono-tabular font-bold text-[#102A43]">{rev.id}</span>
                      <span className="rounded border border-[#CBD5E1] bg-[#F5F7FA] px-2 py-0.5 text-[10px] font-bold uppercase text-[#253746]">
                        {rev.status.replace('_', ' ')}
                      </span>
                      <span className="font-semibold text-[#0A1D2B]">{rev.recommendedAction}</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 font-mono-tabular text-xs text-[#253746]">
                      <span>GPS: {rev.distanceMeters.toFixed(1)}m</span>
                      <span>Img Sim: {Math.round(rev.imageSimilarity * 100)}%</span>
                      <span>Text Sim: {Math.round(rev.textSimilarity * 100)}%</span>
                      <span className="font-bold text-[#102A43]">
                        Confidence: {Math.round(rev.duplicateConfidence * 100)}%
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div
                      onClick={() => orig && onInspectComplaint(orig.id)}
                      className="cursor-pointer rounded border border-[#E2E8F0] bg-[#F7F9FF] p-3 hover:border-[#102A43]/40"
                    >
                      <div className="font-mono-tabular text-[11px] font-bold text-[#102A43]">
                        MASTER: {rev.originalComplaintId}
                      </div>
                      <div className="mt-0.5 text-sm font-semibold text-[#0A1D2B]">
                        {orig?.title || 'Complaint record'}
                      </div>
                      <div className="mt-0.5 text-xs text-[#52606D]">
                        {orig
                          ? `${orig.confirmedCategory} · ${orig.address} · ${orig.supportCount} supports`
                          : 'Click to inspect'}
                      </div>
                    </div>

                    <div
                      onClick={() => cand && onInspectComplaint(cand.id)}
                      className="cursor-pointer rounded border border-[#E2E8F0] bg-white p-3 hover:border-[#102A43]/40"
                    >
                      <div className="font-mono-tabular text-[11px] font-bold text-[#8A5208]">
                        CANDIDATE DUPLICATE: {rev.candidateComplaintId}
                      </div>
                      <div className="mt-0.5 text-sm font-semibold text-[#0A1D2B]">
                        {cand?.title || 'Candidate record'}
                      </div>
                      <div className="mt-0.5 text-xs text-[#52606D]">
                        {cand
                          ? `${cand.confirmedCategory} · ${cand.address} · Reporter: ${cand.reporterName}`
                          : 'Click to inspect'}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2.5">
                    <input
                      type="text"
                      value={mergeReasonMap[rev.id] ?? ''}
                      onChange={(e) =>
                        setMergeReasonMap((prev) => ({ ...prev, [rev.id]: e.target.value }))
                      }
                      placeholder="Optional merge / reversal audit reason..."
                      className="civic-input h-10 min-w-[240px] flex-1 rounded border border-[#CBD5E1] px-3 text-xs"
                    />

                    {rev.status === 'pending_review' && (
                      <>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleConfirmMerge(rev)}
                          className="inline-flex h-10 items-center gap-1.5 rounded bg-[#102A43] px-3.5 text-xs font-semibold text-white hover:bg-[#0B1D2F] cursor-pointer"
                        >
                          <GitMerge className="h-3.5 w-3.5" />
                          Confirm Merge
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleDismiss(rev)}
                          className="inline-flex h-10 items-center gap-1.5 rounded border border-[#CBD5E1] bg-white px-3.5 text-xs font-semibold text-[#253746] hover:bg-[#F5F7FA] cursor-pointer"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Keep Separate
                        </button>
                      </>
                    )}

                    {rev.status === 'merged' && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleReverseMerge(rev)}
                        className="inline-flex h-10 items-center gap-1.5 rounded border border-[#BA1A1A] bg-[#FFDAD6] px-3.5 text-xs font-semibold text-[#BA1A1A] cursor-pointer"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Reverse Merge
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
