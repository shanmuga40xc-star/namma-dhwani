import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  FileText,
  GraduationCap,
  HeartHandshake,
  IndianRupee,
  MessageSquarePlus,
  ShieldAlert,
  Upload,
  X,
} from 'lucide-react';
import { formatCurrencyCompact } from '../data/mockCivicData';
import {
  citizenSubmitWelfareAppeal,
  submitWelfareApplication,
} from '../services/firestoreService';
import {
  CitizenStats,
  WelfareApplication,
  WelfareApplicationStatus,
  WelfareProgramme,
} from '../types/civic';
import { compressImageFileToDataUrl } from '../utils/imageCompression';

interface WelfarePortalScreenProps {
  uid: string;
  displayName: string;
  wardNumber: number;
  locality: string;
  stats: CitizenStats | null;
  programmes: WelfareProgramme[];
  myApplications: WelfareApplication[];
  onShowToast: (msg: string) => void;
}

const EDUCATIONAL_STATUS_OPTIONS = [
  'School Student (Class 9–12)',
  'Undergraduate / Diploma Student',
  'Postgraduate / Research Student',
  'Vocational / Skill Trainee',
  'Employed / Self-Employed Citizen',
  'Senior Citizen / Unemployed Resident',
];

const INCOME_BRACKET_OPTIONS = [
  'Below ₹1,50,000 / year',
  '₹1,50,000 – ₹3,00,000 / year',
  '₹3,00,001 – ₹6,00,000 / year',
  '₹6,00,001 – ₹10,00,000 / year',
  'Above ₹10,00,000 / year',
];

export const WelfarePortalScreen: React.FC<WelfarePortalScreenProps> = ({
  uid,
  displayName,
  wardNumber,
  locality,
  stats,
  programmes,
  myApplications,
  onShowToast,
}) => {
  const [applyingProgramme, setApplyingProgramme] = useState<WelfareProgramme | null>(null);
  const [educationalStatus, setEducationalStatus] = useState(EDUCATIONAL_STATUS_OPTIONS[1]);
  const [institutionName, setInstitutionName] = useState('');
  const [incomeBracket, setIncomeBracket] = useState(INCOME_BRACKET_OPTIONS[1]);
  const [needStatement, setNeedStatement] = useState('');
  const [docName, setDocName] = useState('');
  const [docDataUrl, setDocDataUrl] = useState('');
  const [submittingApp, setSubmittingApp] = useState(false);

  const [appealingApp, setAppealingApp] = useState<WelfareApplication | null>(null);
  const [appealReason, setAppealReason] = useState('');
  const [submittingAppeal, setSubmittingAppeal] = useState(false);

  const myPoints = stats?.totalPoints ?? 0;
  const myResolved = stats?.resolvedCount ?? 0;

  const applicationByProgrammeId = useMemo(() => {
    const map = new Map<string, WelfareApplication>();
    myApplications.forEach((a) => {
      if (!map.has(a.programmeId)) map.set(a.programmeId, a);
    });
    return map;
  }, [myApplications]);

  const computeProgrammeStatusForCitizen = (
    prog: WelfareProgramme
  ): {
    displayStatus: WelfareApplicationStatus;
    reasons: string[];
    canApply: boolean;
  } => {
    const existing = applicationByProgrammeId.get(prog.id);
    if (existing) {
      return {
        displayStatus: existing.status,
        reasons: [`Existing application ${existing.id}`],
        canApply: false,
      };
    }

    const gaps: string[] = [];
    if (myPoints < prog.minVerifiedPoints) {
      gaps.push(`Requires ${prog.minVerifiedPoints} verified points (you have ${myPoints})`);
    }
    if (myResolved < prog.minResolvedComplaints) {
      gaps.push(
        `Requires ${prog.minResolvedComplaints} verified resolved complaints (you have ${myResolved})`
      );
    }
    if (prog.authorizationStatus === 'paused') {
      gaps.push('Programme is currently paused by Welfare Administration');
    }

    if (gaps.length > 0) {
      return {
        displayStatus: 'Not Eligible',
        reasons: gaps,
        canApply: false,
      };
    }

    return {
      displayStatus: 'Eligible',
      reasons: ['Meets verified civic threshold; subject to Officer document & need review.'],
      canApply: true,
    };
  };

  const handleUploadSupportingDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDocName(file.name);
    if (file.type.startsWith('image/')) {
      try {
        const compressed = await compressImageFileToDataUrl(file);
        setDocDataUrl(compressed);
      } catch {
        setDocDataUrl('');
      }
    } else {
      setDocDataUrl('');
    }
  };

  const handleSubmitApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!applyingProgramme) return;
    if (needStatement.trim().length < 10) {
      onShowToast('Please provide a clear financial or educational need statement (min 10 chars).');
      return;
    }
    if (!docName.trim()) {
      onShowToast('Please attach or specify a supporting verification document.');
      return;
    }

    setSubmittingApp(true);
    try {
      const appId = await submitWelfareApplication({
        programme: applyingProgramme,
        applicantUid: uid,
        applicantName: stats?.publicDisplayName || displayName,
        wardNumber: stats?.wardNumber || wardNumber,
        locality: stats?.locality || locality,
        verifiedPointsSnapshot: myPoints,
        resolvedComplaintsSnapshot: myResolved,
        educationalStatus,
        institutionName: institutionName.trim() || undefined,
        householdIncomeBracket: incomeBracket,
        financialNeedStatement: needStatement,
        supportingDocumentName: docName,
        supportingDocumentDataUrl: docDataUrl || undefined,
      });
      onShowToast(`Application ${appId} submitted to Welfare Officer queue.`);
      setApplyingProgramme(null);
      setNeedStatement('');
      setInstitutionName('');
      setDocName('');
      setDocDataUrl('');
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Failed to submit welfare application.');
    } finally {
      setSubmittingApp(false);
    }
  };

  const handleSubmitAppeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appealingApp) return;
    if (appealReason.trim().length < 8) {
      onShowToast('Provide an explanation or new supporting context for your appeal.');
      return;
    }
    setSubmittingAppeal(true);
    try {
      await citizenSubmitWelfareAppeal({
        applicationId: appealingApp.id,
        appealReason,
      });
      onShowToast(`Reconsideration appeal submitted for ${appealingApp.id}.`);
      setAppealingApp(null);
      setAppealReason('');
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Appeal submission failed.');
    } finally {
      setSubmittingAppeal(false);
    }
  };

  const statusBadgeStyle = (status: WelfareApplicationStatus) => {
    switch (status) {
      case 'Disbursed':
      case 'Approved':
      case 'Eligible':
        return 'border-[#168B55] bg-[#E8F5EC] text-[#168B55]';
      case 'Awaiting Disbursement':
      case 'Under Review':
      case 'Submitted':
        return 'border-[#102A43]/30 bg-[#ECF4FF] text-[#102A43]';
      case 'Rejected':
        return 'border-[#BA1A1A] bg-[#FFDAD6] text-[#BA1A1A]';
      default:
        return 'border-[#CBD5E1] bg-[#F5F7FA] text-[#52606D]';
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Portal Header & Fairness Safeguard Banner */}
      <section className="rounded-lg border border-[#102A43]/15 bg-white p-6 civic-shadow-1">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#102A43]">
              NAGRIK Civic Recognition &amp; Social Support
            </div>
            <h1 className="mt-1 font-display text-2xl font-semibold text-[#0A1D2B]">
              NAGRIK Citizen Impact and Welfare Portal
            </h1>
            <p className="mt-1 text-xs text-[#52606D]">
              Apply for scholarships, student welfare support, community development grants, or civic
              recognition programmes configured by authorized Welfare Officers.
            </p>
          </div>
          <div className="rounded border border-[#102A43]/15 bg-[#F7F9FF] px-4 py-2.5 text-xs">
            <div className="text-[11px] font-bold uppercase text-[#52606D]">
              Your Verified Standing
            </div>
            <div className="mt-0.5 font-mono-tabular font-bold text-[#102A43]">
              {myPoints} Verified Pts · {myResolved} Resolved Complaints
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-3 rounded border border-[#F2A541] bg-[#FEF5E7] p-3.5 text-xs text-[#8A5208]">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <strong>Fairness &amp; Governance Disclosure:</strong> Civic Contribution Score points do{' '}
            <strong>not</strong> automatically guarantee financial assistance. Every application is
            reviewed by a Welfare Officer evaluating verified civic contributions, educational
            status, documented financial need, programme eligibility conditions, and available
            budget. Unfunded draft programmes are clearly labeled and do not disburse funds unless
            officially authorized.
          </div>
        </div>
      </section>

      {/* Available Programmes */}
      <section className="rounded-lg border border-[#102A43]/15 bg-white p-5 civic-shadow-1">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-[#102A43]" />
          <h2 className="font-display text-lg font-semibold text-[#0A1D2B]">
            Configured Welfare &amp; Recognition Programmes ({programmes.length})
          </h2>
        </div>

        {programmes.length === 0 ? (
          <div className="mt-4 rounded border border-[#E2E8F0] bg-[#F5F7FA] p-8 text-center text-xs text-[#52606D]">
            No welfare or scholarship programmes have been published by a Welfare Officer yet.
            Welfare Officers and Administrators can configure programmes in the Welfare Officer
            Dashboard.
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {programmes.map((prog) => {
              const evalResult = computeProgrammeStatusForCitizen(prog);
              const remainingInr = Math.max(0, prog.allocatedBudgetInr - prog.disbursedBudgetInr);
              return (
                <article
                  key={prog.id}
                  className="flex flex-col justify-between rounded-lg border border-[#E2E8F0] bg-[#F5F7FA] p-4"
                >
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="rounded bg-white px-2 py-0.5 text-[11px] font-bold text-[#102A43] border border-[#CBD5E1]">
                        {prog.programmeType}
                      </span>
                      <span
                        className={`rounded border px-2 py-0.5 text-[11px] font-bold ${statusBadgeStyle(
                          evalResult.displayStatus
                        )}`}
                      >
                        {evalResult.displayStatus}
                      </span>
                    </div>

                    <h3 className="mt-2 font-display text-base font-semibold text-[#0A1D2B]">
                      {prog.title}
                    </h3>
                    <p className="mt-1 text-xs text-[#43474D]">{prog.description}</p>

                    <div className="mt-3 rounded border border-[#E2E8F0] bg-white p-3 text-[11px] text-[#253746]">
                      <div>
                        <strong>Eligibility Rules:</strong> {prog.eligibilityConditions}
                      </div>
                      <div className="mt-1 font-mono-tabular text-[#52606D]">
                        Min Points: {prog.minVerifiedPoints} · Min Resolved:{' '}
                        {prog.minResolvedComplaints} · Max Benefit:{' '}
                        {formatCurrencyCompact(prog.maxBenefitPerApplicantInr)}
                      </div>
                      <div className="mt-1 flex items-center justify-between border-t border-[#E2E8F0] pt-1.5">
                        <span>
                          Authorization:{' '}
                          <strong
                            className={
                              prog.authorizationStatus === 'authorized_active'
                                ? 'text-[#168B55]'
                                : 'text-[#8A5208]'
                            }
                          >
                            {prog.authorizationStatus === 'authorized_active'
                              ? 'Authorized & Funded'
                              : prog.authorizationStatus === 'paused'
                                ? 'Paused'
                                : 'Draft / Unfunded Pilot'}
                          </strong>
                        </span>
                        <span className="font-mono-tabular">
                          Remaining Budget: {formatCurrencyCompact(remainingInr)}
                        </span>
                      </div>
                      <div className="mt-1 text-[#52606D]">{prog.fundingAuthorityNote}</div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#E2E8F0] pt-3">
                    <span className="text-[11px] text-[#52606D]">{evalResult.reasons[0]}</span>
                    {evalResult.canApply && (
                      <button
                        type="button"
                        onClick={() => setApplyingProgramme(prog)}
                        className="inline-flex h-9 items-center gap-1.5 rounded bg-[#102A43] px-3.5 text-xs font-semibold text-white hover:bg-[#0B1D2F] cursor-pointer"
                      >
                        <HeartHandshake className="h-3.5 w-3.5" />
                        Apply for Programme
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Citizen Applications & Notifications */}
      <section className="rounded-lg border border-[#102A43]/15 bg-white p-5 civic-shadow-1">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-[#102A43]" />
          <h2 className="font-display text-lg font-semibold text-[#0A1D2B]">
            My Welfare Applications, Status Tracking &amp; Appeals ({myApplications.length})
          </h2>
        </div>

        {myApplications.length === 0 ? (
          <div className="mt-4 rounded border border-[#E2E8F0] bg-[#F5F7FA] p-6 text-center text-xs text-[#52606D]">
            You have not submitted any welfare or scholarship applications yet.
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            {myApplications.map((app) => (
              <div
                key={app.id}
                className="rounded-lg border border-[#E2E8F0] bg-[#F5F7FA] p-4 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-mono-tabular font-bold text-[#102A43]">{app.id}</span>
                    <span className="mx-2 text-[#CBD5E1]">|</span>
                    <span className="font-display text-sm font-semibold text-[#0A1D2B]">
                      {app.programmeTitle}
                    </span>
                  </div>
                  <span
                    className={`rounded border px-2.5 py-0.5 text-[11px] font-bold ${statusBadgeStyle(
                      app.status
                    )}`}
                  >
                    {app.status}
                  </span>
                </div>

                <div className="mt-2 rounded border border-[#102A43]/15 bg-white px-3 py-2 text-[#253746]">
                  <strong>Latest Update:</strong> {app.notificationMessage}
                </div>

                <div className="mt-2 grid grid-cols-1 gap-2 text-[11px] text-[#43474D] sm:grid-cols-3">
                  <div>Education: {app.educationalStatus}</div>
                  <div>Income Bracket: {app.householdIncomeBracket}</div>
                  <div>Document: {app.supportingDocumentName}</div>
                </div>

                {app.officerDecisionReason && (
                  <div className="mt-2 text-[11px] text-[#0A1D2B]">
                    <strong>Welfare Officer Note:</strong> {app.officerDecisionReason}
                  </div>
                )}

                {typeof app.approvedAmountInr === 'number' && app.approvedAmountInr > 0 && (
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded bg-[#E8F5EC] px-2.5 py-1 font-mono-tabular font-bold text-[#168B55]">
                    <IndianRupee className="h-3.5 w-3.5" />
                    Approved Benefit: ₹{app.approvedAmountInr.toLocaleString('en-IN')}
                    {app.disbursementReference && ` · Ref: ${app.disbursementReference}`}
                  </div>
                )}

                {app.status === 'Rejected' && !app.appealSubmitted && (
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setAppealingApp(app)}
                      className="inline-flex h-9 items-center gap-1.5 rounded border border-[#102A43] bg-white px-3 text-xs font-semibold text-[#102A43] hover:bg-[#ECF4FF] cursor-pointer"
                    >
                      <MessageSquarePlus className="h-3.5 w-3.5" />
                      Appeal / Request Reconsideration
                    </button>
                  </div>
                )}

                {app.appealSubmitted && (
                  <div className="mt-2 rounded border border-[#CBD5E1] bg-white px-3 py-2 text-[11px]">
                    <strong>Appeal Status ({app.appealStatus}):</strong> {app.appealReason}
                    {app.appealDecisionNote && (
                      <div className="mt-1 text-[#102A43]">
                        Officer Appeal Response: {app.appealDecisionNote}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Application Modal */}
      {applyingProgramme && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#102A43]/50 p-4"
          onClick={() => setApplyingProgramme(null)}
        >
          <form
            onSubmit={handleSubmitApplication}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white p-6 civic-shadow-2"
          >
            <div className="flex items-start justify-between border-b border-[#E2E8F0] pb-3">
              <div>
                <div className="text-[11px] font-bold uppercase text-[#168B55]">
                  {applyingProgramme.programmeType}
                </div>
                <h3 className="font-display text-lg font-semibold text-[#0A1D2B]">
                  Apply: {applyingProgramme.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setApplyingProgramme(null)}
                className="rounded p-1 text-[#52606D] hover:bg-[#F5F7FA] cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-3 text-xs">
              <div>
                <label className="block font-bold uppercase text-[#253746]">
                  Educational / Citizen Status *
                </label>
                <select
                  value={educationalStatus}
                  onChange={(e) => setEducationalStatus(e.target.value)}
                  className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] bg-white px-3 text-xs"
                >
                  {EDUCATIONAL_STATUS_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold uppercase text-[#253746]">
                  School / College / Institution Name (if applicable)
                </label>
                <input
                  type="text"
                  value={institutionName}
                  onChange={(e) => setInstitutionName(e.target.value)}
                  placeholder="e.g., Bengaluru City University / Government PU College"
                  className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] px-3 text-xs"
                />
              </div>

              <div>
                <label className="block font-bold uppercase text-[#253746]">
                  Household Annual Income Bracket (INR) *
                </label>
                <select
                  value={incomeBracket}
                  onChange={(e) => setIncomeBracket(e.target.value)}
                  className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] bg-white px-3 text-xs"
                >
                  {INCOME_BRACKET_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold uppercase text-[#253746]">
                  Need &amp; Purpose Statement *
                </label>
                <textarea
                  rows={3}
                  value={needStatement}
                  onChange={(e) => setNeedStatement(e.target.value)}
                  placeholder="Explain your educational/welfare need and civic participation context..."
                  className="civic-input mt-1 w-full rounded border border-[#CBD5E1] p-2.5 text-xs"
                />
              </div>

              <div>
                <label className="block font-bold uppercase text-[#253746]">
                  Supporting Document (Student ID / Income Certificate / Ward Verification) *
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded border border-[#102A43] px-3 font-semibold text-[#102A43] hover:bg-[#ECF4FF]">
                    <Upload className="h-3.5 w-3.5" />
                    Select File
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={handleUploadSupportingDoc}
                      className="hidden"
                    />
                  </label>
                  <span className="truncate text-[#52606D]">
                    {docName || 'No supporting document selected'}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2 border-t border-[#E2E8F0] pt-4">
              <button
                type="button"
                onClick={() => setApplyingProgramme(null)}
                className="h-10 rounded border border-[#CBD5E1] px-4 text-xs font-semibold text-[#253746] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingApp}
                className="inline-flex h-10 items-center gap-1.5 rounded bg-[#168B55] px-5 text-xs font-semibold text-white hover:bg-[#127446] cursor-pointer disabled:opacity-60"
              >
                <CheckCircle2 className="h-4 w-4" />
                {submittingApp ? 'Submitting...' : 'Submit Application'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Appeal Modal */}
      {appealingApp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#102A43]/50 p-4"
          onClick={() => setAppealingApp(null)}
        >
          <form
            onSubmit={handleSubmitAppeal}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-lg bg-white p-6 civic-shadow-2"
          >
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <h3 className="font-display text-lg font-semibold text-[#0A1D2B]">
                Submit Appeal — {appealingApp.id}
              </h3>
              <button
                type="button"
                onClick={() => setAppealingApp(null)}
                className="rounded p-1 text-[#52606D] cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-3 text-xs text-[#43474D]">
              Provide clarification or additional verification context for the Welfare Officer to
              reconsider your application.
            </p>
            <textarea
              rows={4}
              value={appealReason}
              onChange={(e) => setAppealReason(e.target.value)}
              placeholder="Explain why your application merits reconsideration..."
              className="civic-input mt-3 w-full rounded border border-[#CBD5E1] p-3 text-xs"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAppealingApp(null)}
                className="h-10 rounded border border-[#CBD5E1] px-4 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingAppeal}
                className="h-10 rounded bg-[#102A43] px-5 text-xs font-semibold text-white cursor-pointer"
              >
                {submittingAppeal ? 'Submitting Appeal...' : 'Submit Appeal'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
