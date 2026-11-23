import React, { useEffect, useState } from 'react';
import {
  Camera,
  ExternalLink,
  MapPin,
  Send,
  ShieldAlert,
  User,
  X,
} from 'lucide-react';
import { formatSlaCountdown } from '../data/mockCivicData';
import {
  adminReviewContributionAndAwardPoints,
  subscribeComplaintAuditTrail,
  subscribeComplaintContributions,
  subscribeComplaintVerifications,
} from '../services/firestoreService';
import { buildOpenStreetMapExternalUrl } from '../services/mapsClient';
import {
  AuditEntry,
  CivicIncident,
  ComplaintContribution,
  FieldCrew,
  IncidentStatus,
  ResolutionVerification,
  SeverityLevel,
} from '../types/civic';
import { CivicSpotPickerMap } from './CivicLiveMap';
import { CategoryIcon, PriorityText, StatusBadge } from './StatusBadge';

interface IncidentDrawerProps {
  incident: CivicIncident | null;
  crews: FieldCrew[];
  adminUid: string;
  adminName: string;
  onShowToast: (msg: string) => void;
  onClose: () => void;
  onUpdateStatus: (incidentId: string, status: IncidentStatus) => void;
  onAssignCrew: (incidentId: string, crewId: string | null) => void;
  onOverridePriority: (
    incidentId: string,
    overrideTier: SeverityLevel,
    reason: string
  ) => Promise<void>;
  onOpenResolutionVerification: (incident: CivicIncident) => void;
  onAddAuditNote: (incidentId: string, note: string) => void;
}

export const IncidentDrawer: React.FC<IncidentDrawerProps> = ({
  incident,
  crews,
  adminUid,
  adminName,
  onShowToast,
  onClose,
  onUpdateStatus,
  onAssignCrew,
  onOverridePriority,
  onOpenResolutionVerification,
  onAddAuditNote,
}) => {
  const [noteInput, setNoteInput] = useState('');
  const [noteError, setNoteError] = useState('');
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [verifications, setVerifications] = useState<ResolutionVerification[]>([]);
  const [contributions, setContributions] = useState<ComplaintContribution[]>([]);
  const [reviewingContribId, setReviewingContribId] = useState<string | null>(null);
  const [overrideTier, setOverrideTier] = useState<SeverityLevel>('Critical');
  const [overrideReason, setOverrideReason] = useState('');
  const [savingOverride, setSavingOverride] = useState(false);

  useEffect(() => {
    if (!incident) {
      setAuditEntries([]);
      setVerifications([]);
      setContributions([]);
      return;
    }
    const unsubAudit = subscribeComplaintAuditTrail(incident.id, setAuditEntries);
    const unsubVer = subscribeComplaintVerifications(incident.id, setVerifications);
    const unsubContrib = subscribeComplaintContributions(incident.id, setContributions);
    return () => {
      unsubAudit();
      unsubVer();
      unsubContrib();
    };
  }, [incident?.id]);

  if (!incident) return null;

  const handleReviewContribution = async (
    contrib: ComplaintContribution,
    decision: 'accepted' | 'rejected'
  ) => {
    setReviewingContribId(contrib.id);
    try {
      const awarded = await adminReviewContributionAndAwardPoints({
        complaint: incident,
        contribution: contrib,
        decision,
        adminUid,
        adminName,
        reviewNote:
          decision === 'accepted'
            ? 'Verified by Admin Authority'
            : 'Insufficient or duplicate evidence',
      });
      onShowToast(
        decision === 'accepted'
          ? `Contribution accepted (+${awarded} pts awarded to ${contrib.contributorName}).`
          : `Contribution marked rejected.`
      );
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Review action failed.');
    } finally {
      setReviewingContribId(null);
    }
  };

  const isClosed =
    incident.status === IncidentStatus.Resolved ||
    incident.status === IncidentStatus.Verified;
  const isOverdue = !isClosed && incident.slaHoursRemaining < 0;

  const handlePostNote = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = noteInput.trim();
    if (!trimmed) {
      setNoteError('Enter a field inspection note or supervisor directive before logging.');
      return;
    }
    setNoteError('');
    onAddAuditNote(incident.id, trimmed);
    setNoteInput('');
  };

  const handleApplyPriorityOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (overrideReason.trim().length < 4) {
      setNoteError('Provide a documented reason for overriding the ML priority prediction.');
      return;
    }
    setSavingOverride(true);
    try {
      await onOverridePriority(incident.id, overrideTier, overrideReason.trim());
      setOverrideReason('');
    } finally {
      setSavingOverride(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[#102A43]/40"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-ticket-title"
    >
      <div
        className="flex h-full w-full max-w-2xl flex-col bg-white civic-shadow-2"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[#E2E8F0] bg-[#F7F9FF] px-6 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-mono-tabular text-xs font-bold text-[#102A43]">
                {incident.id}
              </span>
              <StatusBadge status={incident.status} />
              <PriorityText priority={incident.priority} />
              <span className="font-mono-tabular text-xs font-bold text-[#102A43]">
                ML Score {incident.priorityScore}/100
              </span>
            </div>
            <h2
              id="drawer-ticket-title"
              className="mt-2 font-display text-xl font-semibold leading-snug text-[#0A1D2B]"
            >
              {incident.title}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close incident inspector"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-[#CBD5E1] bg-white text-[#253746] hover:bg-[#F5F7FA] cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="flex flex-col gap-6">
            {incident.photoDataUrl && (
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#52606D]">
                  Citizen Evidence Photograph
                </div>
                <img
                  src={incident.photoDataUrl}
                  alt={incident.title}
                  className="mt-1.5 h-48 w-full rounded border border-[#E2E8F0] object-cover"
                />
              </div>
            )}

            {/* Key Metadata Grid */}
            <div className="grid grid-cols-1 gap-4 rounded border border-[#102A43]/10 bg-[#F5F7FA] p-4 sm:grid-cols-2">
              <div className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#102A43]" aria-hidden="true" />
                <div className="min-w-0">
                  <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#52606D]">
                    Complete Spot, Area &amp; Ward
                  </div>
                  <div className="text-sm font-semibold text-[#0A1D2B]">{incident.address}</div>
                  <div className="text-xs font-medium text-[#253746]">
                    Area: {incident.locality} · Ward 0{incident.wardNumber} ({incident.wardName})
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 font-mono-tabular text-[11px] text-[#52606D]">
                    <span>{incident.coordinates}</span>
                    <a
                      href={buildOpenStreetMapExternalUrl(incident.latitude, incident.longitude)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-sans font-semibold text-[#102A43] hover:underline"
                    >
                      Open Map
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <div className="mt-0.5 shrink-0 text-[#102A43]">
                  <CategoryIcon category={incident.confirmedCategory} className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#52606D]">
                    Confirmed Category &amp; SLA
                  </div>
                  <div className="text-sm font-semibold text-[#0A1D2B]">
                    {incident.confirmedCategory}
                  </div>
                  <div
                    className={`font-mono-tabular text-xs font-semibold ${
                      isOverdue ? 'text-[#BA1A1A]' : 'text-[#253746]'
                    }`}
                  >
                    {formatSlaCountdown(incident.slaHoursRemaining, incident.status)} (Target{' '}
                    {incident.slaTargetHours}h)
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <User className="mt-0.5 h-4 w-4 shrink-0 text-[#102A43]" aria-hidden="true" />
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#52606D]">
                    Reporter &amp; Community Support
                  </div>
                  <div className="text-sm font-medium text-[#0A1D2B]">{incident.reporterName}</div>
                  <div className="font-mono-tabular text-xs text-[#43474D]">
                    {incident.supportCount} unique citizen supports · {incident.duplicateReportCount}{' '}
                    merged duplicates
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#102A43]" aria-hidden="true" />
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#52606D]">
                    Objective 1 AI vs. Human Review
                  </div>
                  <div className="text-xs text-[#0A1D2B]">
                    AI: {incident.aiPredictedCategory} (
                    {Math.round(incident.aiCategoryConfidence * 100)}%) ·{' '}
                    {incident.aiPredictedSeverity}
                  </div>
                  <div className="text-[11px] text-[#52606D]">
                    {incident.categoryCorrectedByCitizen || incident.severityCorrectedByHuman
                      ? 'Human correction recorded'
                      : `Confirmed as suggested (${incident.aiSource})`}
                  </div>
                </div>
              </div>
            </div>

            {/* Live Geographical Spot Map */}
            <div>
              <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.04em] text-[#52606D]">
                Live Geographical Pin &amp; Nearby Landmarks
              </div>
              <CivicSpotPickerMap
                latitude={incident.latitude}
                longitude={incident.longitude}
                readOnly
                showSearch={false}
                heightClass="h-[230px]"
                pinLabel={`${incident.id} — ${incident.address}`}
              />
            </div>

            {/* Description */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-[0.04em] text-[#43474D]">
                Field Summary
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[#253746]">
                {incident.description}
              </p>
            </div>

            {/* Objective 3 ML Priority Breakdown & Admin Override */}
            <div className="rounded border border-[#102A43]/15 bg-[#F7F9FF] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-[0.04em] text-[#102A43]">
                  Objective 3 Priority Scoring ({incident.priorityScore}/100 · {incident.priorityTier})
                </span>
                <span className="font-mono-tabular text-[11px] text-[#52606D]">
                  Source: {incident.prioritySource}
                </span>
              </div>
              {incident.priorityFactors.length > 0 && (
                <ul className="mt-2 list-disc pl-4 text-xs text-[#253746]">
                  {incident.priorityFactors.map((f, idx) => (
                    <li key={idx}>{f}</li>
                  ))}
                </ul>
              )}
              {incident.adminPriorityOverride && (
                <div className="mt-2 rounded border border-[#F2A541] bg-[#FEF5E7] px-3 py-2 text-xs text-[#8A5208]">
                  <strong>Admin Override Active:</strong> {incident.adminPriorityOverride} —{' '}
                  {incident.overrideReason}
                </div>
              )}

              <form
                onSubmit={handleApplyPriorityOverride}
                className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-12"
              >
                <select
                  value={overrideTier}
                  onChange={(e) => setOverrideTier(e.target.value as SeverityLevel)}
                  className="civic-input h-10 rounded border border-[#CBD5E1] bg-white px-2 text-xs font-semibold sm:col-span-3"
                >
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
                <input
                  type="text"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Required override reason (preserves ML score)..."
                  className="civic-input h-10 rounded border border-[#CBD5E1] bg-white px-3 text-xs sm:col-span-6"
                />
                <button
                  type="submit"
                  disabled={savingOverride}
                  className="h-10 rounded bg-[#F2A541] px-3 text-xs font-semibold text-[#102A43] hover:bg-[#e59732] cursor-pointer sm:col-span-3"
                >
                  Override Priority
                </button>
              </form>
            </div>

            {/* Dispatch & Workflow Controls */}
            <div className="flex flex-col gap-4 border-y border-[#E2E8F0] py-5">
              <div>
                <label
                  htmlFor="drawer-crew-select"
                  className="block text-xs font-bold uppercase tracking-[0.04em] text-[#43474D]"
                >
                  Assigned Municipal Field Crew
                </label>
                <select
                  id="drawer-crew-select"
                  value={incident.assignedCrewId ?? ''}
                  onChange={(e) => onAssignCrew(incident.id, e.target.value || null)}
                  className="civic-input mt-1.5 h-12 w-full rounded border border-[#CBD5E1] bg-white px-3 text-sm font-medium text-[#0A1D2B]"
                >
                  <option value="">Unassigned — Hold in Central Queue</option>
                  {crews.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.division} · Ward 0{c.assignedWardNumber} · {c.leadOfficer})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {(incident.status === IncidentStatus.Submitted ||
                  incident.status === IncidentStatus.Disputed) && (
                  <button
                    type="button"
                    onClick={() => onUpdateStatus(incident.id, IncidentStatus.InProgress)}
                    className="inline-flex h-12 items-center gap-2 rounded bg-[#102A43] px-5 text-sm font-semibold text-white hover:bg-[#0B1D2F] cursor-pointer"
                  >
                    Start Investigation / Dispatch
                  </button>
                )}

                {incident.status !== IncidentStatus.Verified && (
                  <button
                    type="button"
                    onClick={() => onOpenResolutionVerification(incident)}
                    className="inline-flex h-12 items-center gap-2 rounded bg-[#168B55] px-5 text-sm font-semibold text-white hover:bg-[#127446] cursor-pointer"
                  >
                    <Camera className="h-4 w-4" aria-hidden="true" />
                    Submit Resolution Photo &amp; GPS Verification
                  </button>
                )}

                {isClosed && (
                  <button
                    type="button"
                    onClick={() => onUpdateStatus(incident.id, IncidentStatus.InProgress)}
                    className="inline-flex h-12 items-center gap-2 rounded border-2 border-[#102A43] bg-white px-5 text-sm font-semibold text-[#102A43] hover:bg-[#F5F7FA] cursor-pointer"
                  >
                    Reopen to In-Progress
                  </button>
                )}
              </div>
            </div>

            {/* Objective 4 Submitted Verification History */}
            {verifications.length > 0 && (
              <div>
                <h3 className="text-xs font-bold uppercase tracking-[0.04em] text-[#43474D]">
                  Resolution Verification History ({verifications.length})
                </h3>
                <div className="mt-2 flex flex-col gap-3">
                  {verifications.map((ver) => (
                    <div
                      key={ver.id}
                      className="rounded border border-[#168B55]/30 bg-[#F7F9FF] p-3 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 font-semibold text-[#0A1D2B]">
                        <span>
                          AI Check: {ver.aiRecommendation} · Citizen Decision:{' '}
                          <span className="uppercase">{ver.citizenDecision}</span>
                        </span>
                        <span className="font-mono-tabular text-[#52606D]">
                          {ver.gpsDistanceMeters.toFixed(1)}m GPS delta
                        </span>
                      </div>
                      <p className="mt-1 text-[#253746]">{ver.resolutionNotes}</p>
                      <img
                        src={ver.afterPhotoDataUrl}
                        alt="Submitted resolution proof"
                        className="mt-2 h-32 w-full rounded object-cover"
                      />
                      {ver.citizenNote && (
                        <div className="mt-2 rounded bg-white p-2 text-[#0A1D2B]">
                          <strong>Citizen Note:</strong> {ver.citizenNote}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Citizen Participation Contributions Review */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-[0.04em] text-[#43474D]">
                Citizen Participation Contributions ({contributions.length})
              </h3>
              {contributions.length === 0 ? (
                <p className="mt-1.5 text-xs text-[#52606D]">
                  No citizen additional info, duplicate flags, or independent verifications submitted
                  on this complaint yet.
                </p>
              ) : (
                <div className="mt-2 flex flex-col gap-2.5">
                  {contributions.map((c) => (
                    <div
                      key={c.id}
                      className="rounded border border-[#E2E8F0] bg-[#F5F7FA] p-3 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-[#102A43]">
                          {c.type.replace('_', ' ').toUpperCase()} — {c.contributorName}
                        </span>
                        <span className="rounded border border-[#CBD5E1] bg-white px-2 py-0.5 font-mono-tabular text-[10px] font-bold uppercase">
                          {c.status}
                          {c.pointsAwarded > 0 ? ` (+${c.pointsAwarded} pts)` : ''}
                        </span>
                      </div>
                      <p className="mt-1 text-[#253746]">{c.note}</p>
                      {c.relatedComplaintId && (
                        <div className="mt-1 font-mono-tabular text-[11px] text-[#52606D]">
                          Related Complaint: {c.relatedComplaintId}
                        </div>
                      )}
                      {c.verificationOutcome && (
                        <div className="mt-1 text-[11px] font-semibold text-[#102A43]">
                          Citizen Check Outcome: {c.verificationOutcome.replace('_', ' ')}
                        </div>
                      )}
                      {c.photoDataUrl && (
                        <img
                          src={c.photoDataUrl}
                          alt="Citizen contribution evidence"
                          className="mt-2 h-28 w-full rounded object-cover"
                        />
                      )}
                      {c.status === 'pending' && (
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            disabled={reviewingContribId === c.id}
                            onClick={() => handleReviewContribution(c, 'accepted')}
                            className="rounded bg-[#168B55] px-3 py-1.5 text-[11px] font-semibold text-white cursor-pointer"
                          >
                            Accept &amp; Award Points
                          </button>
                          <button
                            type="button"
                            disabled={reviewingContribId === c.id}
                            onClick={() => handleReviewContribution(c, 'rejected')}
                            className="rounded border border-[#BA1A1A] bg-[#FFDAD6] px-3 py-1.5 text-[11px] font-semibold text-[#BA1A1A] cursor-pointer"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Official Audit Trail */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-[0.04em] text-[#43474D]">
                Procedural Audit Trail ({auditEntries.length})
              </h3>

              <ol className="mt-3 flex flex-col divide-y divide-[#E2E8F0] rounded border border-[#E2E8F0]">
                {auditEntries.map((entry) => (
                  <li key={entry.id} className="bg-white px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-[#102A43]">
                        {entry.action} — {entry.actorName}{' '}
                        <span className="font-normal text-[#52606D]">({entry.role})</span>
                      </span>
                      <span className="font-mono-tabular text-[#52606D]">{entry.timestamp}</span>
                    </div>
                    <p className="mt-1 text-xs text-[#253746]">{entry.note}</p>
                  </li>
                ))}
              </ol>

              {/* Append Audit Note Form */}
              <form onSubmit={handlePostNote} className="mt-4 flex flex-col gap-2">
                <label
                  htmlFor="audit-note-input"
                  className="text-xs font-semibold text-[#253746]"
                >
                  Append Official Field or Dispatch Note
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    id="audit-note-input"
                    type="text"
                    value={noteInput}
                    onChange={(e) => {
                      setNoteInput(e.target.value);
                      if (noteError) setNoteError('');
                    }}
                    placeholder="Record crew arrival, valve shutoff, or citizen callback..."
                    className={`civic-input h-12 flex-1 rounded border border-[#CBD5E1] bg-white px-3 text-sm text-[#0A1D2B] placeholder:text-[#74777E] ${
                      noteError ? 'civic-input-error' : ''
                    }`}
                  />
                  <button
                    type="submit"
                    className="inline-flex h-12 items-center justify-center gap-2 rounded bg-[#102A43] px-5 text-sm font-semibold text-white hover:bg-[#0B1D2F] cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Send className="h-4 w-4" aria-hidden="true" />
                    Log Entry
                  </button>
                </div>
                {noteError && (
                  <p className="text-xs font-medium text-[#BA1A1A]">{noteError}</p>
                )}
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
