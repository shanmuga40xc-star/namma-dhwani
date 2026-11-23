import React, { useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileText,
  IndianRupee,
  Plus,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { formatCurrencyCompact, WELFARE_PROGRAMME_TYPES } from '../data/mockCivicData';
import {
  officerDecideWelfareAppeal,
  officerUpdateWelfareApplication,
  saveWelfareProgramme,
} from '../services/firestoreService';
import {
  WelfareApplication,
  WelfareAuthorizationStatus,
  WelfareProgramme,
  WelfareProgrammeType,
} from '../types/civic';

interface WelfareOfficerDashboardProps {
  officerUid: string;
  programmes: WelfareProgramme[];
  applications: WelfareApplication[];
  onShowToast: (msg: string) => void;
}

export const WelfareOfficerDashboard: React.FC<WelfareOfficerDashboardProps> = ({
  officerUid,
  programmes,
  applications,
  onShowToast,
}) => {
  const [subTab, setSubTab] = useState<'queue' | 'programmes' | 'beneficiaries'>('queue');

  // Programme creation / edit state
  const [showProgForm, setShowProgForm] = useState(false);
  const [editingProgId, setEditingProgId] = useState<string | undefined>(undefined);
  const [title, setTitle] = useState('');
  const [programmeType, setProgrammeType] = useState<WelfareProgrammeType>(
    WELFARE_PROGRAMME_TYPES[0]
  );
  const [description, setDescription] = useState('');
  const [eligibilityConditions, setEligibilityConditions] = useState('');
  const [minVerifiedPoints, setMinVerifiedPoints] = useState(50);
  const [minResolvedComplaints, setMinResolvedComplaints] = useState(1);
  const [requiresStudentStatus, setRequiresStudentStatus] = useState(true);
  const [requiresFinancialNeedCheck, setRequiresFinancialNeedCheck] = useState(true);
  const [allocatedBudgetInr, setAllocatedBudgetInr] = useState(0);
  const [maxBenefitPerApplicantInr, setMaxBenefitPerApplicantInr] = useState(5000);
  const [authorizationStatus, setAuthorizationStatus] =
    useState<WelfareAuthorizationStatus>('draft_unfunded');
  const [fundingAuthorityNote, setFundingAuthorityNote] = useState(
    'Draft pilot configuration — no municipal or government funds authorized yet'
  );
  const [savingProg, setSavingProg] = useState(false);

  // Application review state
  const [selectedApp, setSelectedApp] = useState<WelfareApplication | null>(null);
  const [nextStatus, setNextStatus] = useState<WelfareApplication['status']>('Under Review');
  const [decisionReason, setDecisionReason] = useState('');
  const [approvedAmountInr, setApprovedAmountInr] = useState<number>(0);
  const [disbursementRef, setDisbursementRef] = useState('');
  const [disbursementNote, setDisbursementNote] = useState('');
  const [updatingApp, setUpdatingApp] = useState(false);

  // Appeal review state
  const [appealNote, setAppealNote] = useState('');
  const [decidingAppeal, setDecidingAppeal] = useState(false);

  const openEditProgramme = (prog: WelfareProgramme) => {
    setEditingProgId(prog.id);
    setTitle(prog.title);
    setProgrammeType(prog.programmeType);
    setDescription(prog.description);
    setEligibilityConditions(prog.eligibilityConditions);
    setMinVerifiedPoints(prog.minVerifiedPoints);
    setMinResolvedComplaints(prog.minResolvedComplaints);
    setRequiresStudentStatus(prog.requiresStudentStatus);
    setRequiresFinancialNeedCheck(prog.requiresFinancialNeedCheck);
    setAllocatedBudgetInr(prog.allocatedBudgetInr);
    setMaxBenefitPerApplicantInr(prog.maxBenefitPerApplicantInr);
    setAuthorizationStatus(prog.authorizationStatus);
    setFundingAuthorityNote(prog.fundingAuthorityNote);
    setShowProgForm(true);
  };

  const resetProgForm = () => {
    setEditingProgId(undefined);
    setTitle('');
    setDescription('');
    setEligibilityConditions('');
    setMinVerifiedPoints(50);
    setMinResolvedComplaints(1);
    setAllocatedBudgetInr(0);
    setMaxBenefitPerApplicantInr(5000);
    setAuthorizationStatus('draft_unfunded');
    setFundingAuthorityNote(
      'Draft pilot configuration — no municipal or government funds authorized yet'
    );
    setShowProgForm(false);
  };

  const handleSaveProgramme = async (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 4 || description.trim().length < 10) {
      onShowToast('Enter a valid programme title and description (min 10 chars).');
      return;
    }
    setSavingProg(true);
    try {
      await saveWelfareProgramme({
        existingId: editingProgId,
        title,
        programmeType,
        description,
        eligibilityConditions:
          eligibilityConditions.trim() ||
          `Minimum ${minVerifiedPoints} verified points and ${minResolvedComplaints} resolved complaint(s).`,
        minVerifiedPoints,
        minResolvedComplaints,
        requiresStudentStatus,
        requiresFinancialNeedCheck,
        allocatedBudgetInr,
        maxBenefitPerApplicantInr,
        authorizationStatus,
        fundingAuthorityNote,
        actorUid: officerUid,
      });
      onShowToast(editingProgId ? 'Welfare programme updated.' : 'Welfare programme published.');
      resetProgForm();
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Failed to save programme.');
    } finally {
      setSavingProg(false);
    }
  };

  const handleUpdateApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApp) return;
    if (decisionReason.trim().length < 5) {
      onShowToast('Provide an official review reason for transparency.');
      return;
    }
    const prog = programmes.find((p) => p.id === selectedApp.programmeId);
    setUpdatingApp(true);
    try {
      await officerUpdateWelfareApplication({
        application: selectedApp,
        programme: prog,
        nextStatus,
        decisionReason,
        officerUid,
        approvedAmountInr: approvedAmountInr > 0 ? approvedAmountInr : undefined,
        disbursementReference: disbursementRef || undefined,
        disbursementNote: disbursementNote || undefined,
      });
      onShowToast(`${selectedApp.id} updated to ${nextStatus}.`);
      setSelectedApp(null);
      setDecisionReason('');
      setDisbursementRef('');
      setDisbursementNote('');
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Failed to update application.');
    } finally {
      setUpdatingApp(false);
    }
  };

  const handleDecideAppeal = async (app: WelfareApplication, decision: 'upheld' | 'denied') => {
    if (appealNote.trim().length < 5) {
      onShowToast('Provide a documented decision note for the appeal.');
      return;
    }
    setDecidingAppeal(true);
    try {
      await officerDecideWelfareAppeal({
        applicationId: app.id,
        decision,
        decisionNote: appealNote,
        officerUid,
      });
      onShowToast(`Appeal on ${app.id} marked ${decision}.`);
      setAppealNote('');
      setSelectedApp(null);
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Appeal update failed.');
    } finally {
      setDecidingAppeal(false);
    }
  };

  const handleExportCsv = () => {
    const header = [
      'ApplicationID',
      'Programme',
      'Applicant',
      'Ward',
      'Locality',
      'VerifiedPoints',
      'ResolvedComplaints',
      'EducationalStatus',
      'IncomeBracket',
      'Status',
      'ApprovedINR',
      'DisbursementRef',
      'AppealStatus',
      'UpdatedAt',
    ];
    const rows = applications.map((a) =>
      [
        a.id,
        a.programmeTitle,
        a.applicantName,
        a.wardNumber,
        a.locality,
        a.verifiedPointsSnapshot,
        a.resolvedComplaintsSnapshot,
        a.educationalStatus,
        a.householdIncomeBracket,
        a.status,
        a.approvedAmountInr ?? 0,
        a.disbursementReference ?? '',
        a.appealStatus,
        a.updatedAt,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    );
    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nagrik-welfare-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onShowToast('Exported NAGRIK welfare & beneficiary CSV report.');
  };

  const totalAllocated = programmes.reduce((acc, p) => acc + p.allocatedBudgetInr, 0);
  const totalDisbursed = programmes.reduce((acc, p) => acc + p.disbursedBudgetInr, 0);
  const pendingCount = applications.filter(
    (a) => a.status === 'Submitted' || a.status === 'Under Review' || a.appealStatus === 'pending'
  ).length;
  const beneficiaries = applications.filter(
    (a) =>
      a.status === 'Approved' ||
      a.status === 'Awaiting Disbursement' ||
      a.status === 'Disbursed'
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-[-0.01em] text-[#0A1D2B] sm:text-[32px] sm:leading-[40px]">
            Welfare Officer Governance Dashboard
          </h1>
          <p className="mt-1 text-sm text-[#43474D]">
            Configure scholarship &amp; recognition programmes, verify supporting documents, review
            appeals, and govern authorized INR disbursements.
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportCsv}
          className="inline-flex h-10 items-center gap-2 rounded border border-[#102A43] bg-white px-4 text-xs font-semibold text-[#102A43] hover:bg-[#ECF4FF] cursor-pointer"
        >
          <Download className="h-4 w-4" />
          Export Welfare Report (CSV)
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg border border-[#102A43]/15 bg-white p-4 civic-shadow-1">
          <div className="text-[11px] font-bold uppercase text-[#52606D]">Programmes</div>
          <div className="mt-1 font-mono-tabular text-2xl font-bold text-[#102A43]">
            {programmes.length}
          </div>
        </div>
        <div className="rounded-lg border border-[#102A43]/15 bg-white p-4 civic-shadow-1">
          <div className="text-[11px] font-bold uppercase text-[#52606D]">
            Pending Reviews / Appeals
          </div>
          <div className="mt-1 font-mono-tabular text-2xl font-bold text-[#F2A541]">
            {pendingCount}
          </div>
        </div>
        <div className="rounded-lg border border-[#102A43]/15 bg-white p-4 civic-shadow-1">
          <div className="text-[11px] font-bold uppercase text-[#52606D]">Allocated INR Budget</div>
          <div className="mt-1 font-mono-tabular text-2xl font-bold text-[#0A1D2B]">
            {formatCurrencyCompact(totalAllocated)}
          </div>
        </div>
        <div className="rounded-lg border border-[#102A43]/15 bg-white p-4 civic-shadow-1">
          <div className="text-[11px] font-bold uppercase text-[#52606D]">Disbursed INR</div>
          <div className="mt-1 font-mono-tabular text-2xl font-bold text-[#168B55]">
            {formatCurrencyCompact(totalDisbursed)}
          </div>
        </div>
      </div>

      {/* Sub-navigation */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['queue', `Applications & Appeals (${applications.length})`],
            ['programmes', `Programmes & INR Budgets (${programmes.length})`],
            ['beneficiaries', `Beneficiary Ledger (${beneficiaries.length})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSubTab(id)}
            className={`h-10 rounded px-4 text-xs font-semibold cursor-pointer ${
              subTab === id
                ? 'bg-[#102A43] text-white'
                : 'border border-[#CBD5E1] bg-white text-[#253746] hover:bg-[#ECF4FF]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Applications & Appeals Queue */}
      {subTab === 'queue' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <section className="rounded-lg border border-[#102A43]/15 bg-white civic-shadow-1 lg:col-span-7">
            <div className="border-b border-[#E2E8F0] px-5 py-4">
              <h2 className="font-display text-base font-semibold text-[#0A1D2B]">
                Applicant Queue
              </h2>
            </div>
            {applications.length === 0 ? (
              <div className="px-6 py-10 text-center text-xs text-[#52606D]">
                No citizen welfare applications submitted yet.
              </div>
            ) : (
              <div className="divide-y divide-[#E2E8F0]">
                {applications.map((app) => (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => {
                      setSelectedApp(app);
                      setNextStatus(app.status);
                      setApprovedAmountInr(app.approvedAmountInr || 0);
                      setDecisionReason(app.officerDecisionReason || '');
                    }}
                    className={`flex w-full cursor-pointer flex-col gap-1.5 px-5 py-4 text-left hover:bg-[#F7F9FF] ${
                      selectedApp?.id === app.id ? 'bg-[#ECF4FF]' : 'bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono-tabular text-xs font-bold text-[#102A43]">
                        {app.id} · {app.applicantName}
                      </span>
                      <span className="rounded border border-[#CBD5E1] bg-[#F5F7FA] px-2 py-0.5 text-[11px] font-bold text-[#0A1D2B]">
                        {app.status}
                        {app.appealStatus === 'pending' ? ' · APPEAL PENDING' : ''}
                      </span>
                    </div>
                    <div className="text-xs font-semibold text-[#253746]">{app.programmeTitle}</div>
                    <div className="text-[11px] text-[#52606D]">
                      {app.locality} (Ward 0{app.wardNumber}) · {app.verifiedPointsSnapshot} pts ·{' '}
                      {app.resolvedComplaintsSnapshot} resolved · {app.educationalStatus}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <aside className="rounded-lg border border-[#102A43]/15 bg-white p-5 civic-shadow-1 lg:col-span-5">
            {!selectedApp ? (
              <div className="py-12 text-center text-xs text-[#52606D]">
                Select an application from the queue to inspect documents, evaluate need &amp;
                eligibility, and record a decision.
              </div>
            ) : (
              <div className="flex flex-col gap-4 text-xs">
                <div>
                  <div className="font-mono-tabular text-[11px] font-bold text-[#102A43]">
                    {selectedApp.id}
                  </div>
                  <h3 className="font-display text-lg font-semibold text-[#0A1D2B]">
                    {selectedApp.applicantName}
                  </h3>
                  <div className="text-[#52606D]">{selectedApp.programmeTitle}</div>
                </div>

                <div className="rounded border border-[#E2E8F0] bg-[#F5F7FA] p-3">
                  <div>
                    <strong>Verified Standing:</strong> {selectedApp.verifiedPointsSnapshot} pts ·{' '}
                    {selectedApp.resolvedComplaintsSnapshot} resolved complaints
                  </div>
                  <div className="mt-1">
                    <strong>Education:</strong> {selectedApp.educationalStatus}
                    {selectedApp.institutionName ? ` (${selectedApp.institutionName})` : ''}
                  </div>
                  <div className="mt-1">
                    <strong>Income Bracket:</strong> {selectedApp.householdIncomeBracket}
                  </div>
                  <div className="mt-1">
                    <strong>Need Statement:</strong> {selectedApp.financialNeedStatement}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 font-semibold text-[#102A43]">
                    <FileText className="h-3.5 w-3.5" />
                    Document: {selectedApp.supportingDocumentName}
                  </div>
                  {selectedApp.supportingDocumentDataUrl && (
                    <img
                      src={selectedApp.supportingDocumentDataUrl}
                      alt="Supporting verification document"
                      className="mt-2 h-36 w-full rounded border border-[#CBD5E1] object-cover"
                    />
                  )}
                </div>

                {/* Appeal Review Block */}
                {selectedApp.appealSubmitted && selectedApp.appealStatus === 'pending' && (
                  <div className="rounded border border-[#F2A541] bg-[#FEF5E7] p-3">
                    <div className="font-bold text-[#8A5208]">Citizen Reconsideration Appeal</div>
                    <p className="mt-1 text-[#253746]">{selectedApp.appealReason}</p>
                    <input
                      type="text"
                      value={appealNote}
                      onChange={(e) => setAppealNote(e.target.value)}
                      placeholder="Officer appeal decision rationale..."
                      className="civic-input mt-2 h-9 w-full rounded border border-[#CBD5E1] bg-white px-2.5 text-xs"
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        disabled={decidingAppeal}
                        onClick={() => handleDecideAppeal(selectedApp, 'upheld')}
                        className="h-8 flex-1 rounded bg-[#168B55] text-[11px] font-semibold text-white cursor-pointer"
                      >
                        Uphold Appeal (Reopen)
                      </button>
                      <button
                        type="button"
                        disabled={decidingAppeal}
                        onClick={() => handleDecideAppeal(selectedApp, 'denied')}
                        className="h-8 flex-1 rounded border border-[#BA1A1A] bg-[#FFDAD6] text-[11px] font-semibold text-[#BA1A1A] cursor-pointer"
                      >
                        Deny Appeal
                      </button>
                    </div>
                  </div>
                )}

                <form onSubmit={handleUpdateApplication} className="flex flex-col gap-3">
                  <div>
                    <label className="block font-bold uppercase text-[#253746]">
                      Workflow Decision Status
                    </label>
                    <select
                      value={nextStatus}
                      onChange={(e) =>
                        setNextStatus(e.target.value as WelfareApplication['status'])
                      }
                      className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] bg-white px-3 text-xs font-semibold"
                    >
                      <option value="Submitted">Submitted</option>
                      <option value="Under Review">Under Review</option>
                      <option value="Approved">Approved</option>
                      <option value="Rejected">Rejected</option>
                      <option value="Awaiting Disbursement">Awaiting Disbursement</option>
                      <option value="Disbursed">Disbursed (Authorized Budget Only)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold uppercase text-[#253746]">
                      Approved Benefit Amount (INR ₹)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={approvedAmountInr}
                      onChange={(e) => setApprovedAmountInr(Number(e.target.value))}
                      className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] px-3 font-mono-tabular text-xs"
                    />
                  </div>

                  {(nextStatus === 'Awaiting Disbursement' || nextStatus === 'Disbursed') && (
                    <>
                      <input
                        type="text"
                        value={disbursementRef}
                        onChange={(e) => setDisbursementRef(e.target.value)}
                        placeholder="Authorized Treasury / Voucher Reference ID"
                        className="civic-input h-9 rounded border border-[#CBD5E1] px-3 text-xs"
                      />
                      <input
                        type="text"
                        value={disbursementNote}
                        onChange={(e) => setDisbursementNote(e.target.value)}
                        placeholder="Disbursement verification note"
                        className="civic-input h-9 rounded border border-[#CBD5E1] px-3 text-xs"
                      />
                    </>
                  )}

                  <div>
                    <label className="block font-bold uppercase text-[#253746]">
                      Official Decision Reason *
                    </label>
                    <textarea
                      rows={2}
                      value={decisionReason}
                      onChange={(e) => setDecisionReason(e.target.value)}
                      placeholder="Document verification findings and rationale..."
                      className="civic-input mt-1 w-full rounded border border-[#CBD5E1] p-2.5 text-xs"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={updatingApp}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded bg-[#102A43] text-xs font-semibold text-white hover:bg-[#0B1D2F] cursor-pointer"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    {updatingApp ? 'Updating Record...' : 'Save Officer Decision'}
                  </button>
                </form>
              </div>
            )}
          </aside>
        </div>
      )}

      {/* Programmes & INR Budget Configuration */}
      {subTab === 'programmes' && (
        <section className="rounded-lg border border-[#102A43]/15 bg-white p-5 civic-shadow-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-base font-semibold text-[#0A1D2B]">
              Welfare &amp; Scholarship Programme Configuration
            </h2>
            <button
              type="button"
              onClick={() => (showProgForm ? resetProgForm() : setShowProgForm(true))}
              className="inline-flex h-10 items-center gap-1.5 rounded bg-[#102A43] px-3.5 text-xs font-semibold text-white cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              {showProgForm ? 'Cancel' : 'Create Welfare Programme'}
            </button>
          </div>

          {showProgForm && (
            <form
              onSubmit={handleSaveProgramme}
              className="mt-4 grid grid-cols-1 gap-3 rounded border border-[#102A43]/20 bg-[#F7F9FF] p-4 text-xs sm:grid-cols-2"
            >
              <div>
                <label className="block font-bold uppercase text-[#253746]">Programme Title *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Bengaluru Civic Student Scholarship"
                  className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] bg-white px-3"
                />
              </div>

              <div>
                <label className="block font-bold uppercase text-[#253746]">Programme Type *</label>
                <select
                  value={programmeType}
                  onChange={(e) => setProgrammeType(e.target.value as WelfareProgrammeType)}
                  className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] bg-white px-3"
                >
                  {WELFARE_PROGRAMME_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold uppercase text-[#253746]">Description *</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe programme scope, intended beneficiaries, and civic recognition goal..."
                  className="civic-input mt-1 w-full rounded border border-[#CBD5E1] bg-white p-2.5"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold uppercase text-[#253746]">
                  Eligibility Conditions
                </label>
                <input
                  type="text"
                  value={eligibilityConditions}
                  onChange={(e) => setEligibilityConditions(e.target.value)}
                  placeholder="e.g., Enrolled student + verified civic contribution + household income check"
                  className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] bg-white px-3"
                />
              </div>

              <div>
                <label className="block font-bold uppercase text-[#253746]">
                  Min Verified Civic Points
                </label>
                <input
                  type="number"
                  min={0}
                  value={minVerifiedPoints}
                  onChange={(e) => setMinVerifiedPoints(Number(e.target.value))}
                  className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] bg-white px-3 font-mono-tabular"
                />
              </div>

              <div>
                <label className="block font-bold uppercase text-[#253746]">
                  Min Resolved Complaints
                </label>
                <input
                  type="number"
                  min={0}
                  value={minResolvedComplaints}
                  onChange={(e) => setMinResolvedComplaints(Number(e.target.value))}
                  className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] bg-white px-3 font-mono-tabular"
                />
              </div>

              <div>
                <label className="block font-bold uppercase text-[#253746]">
                  Allocated Programme Budget (INR ₹)
                </label>
                <input
                  type="number"
                  min={0}
                  value={allocatedBudgetInr}
                  onChange={(e) => setAllocatedBudgetInr(Number(e.target.value))}
                  className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] bg-white px-3 font-mono-tabular"
                />
              </div>

              <div>
                <label className="block font-bold uppercase text-[#253746]">
                  Max Benefit Per Applicant (INR ₹)
                </label>
                <input
                  type="number"
                  min={0}
                  value={maxBenefitPerApplicantInr}
                  onChange={(e) => setMaxBenefitPerApplicantInr(Number(e.target.value))}
                  className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] bg-white px-3 font-mono-tabular"
                />
              </div>

              <div>
                <label className="block font-bold uppercase text-[#253746]">
                  Funding Authorization Status
                </label>
                <select
                  value={authorizationStatus}
                  onChange={(e) =>
                    setAuthorizationStatus(e.target.value as WelfareAuthorizationStatus)
                  }
                  className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] bg-white px-3"
                >
                  <option value="draft_unfunded">
                    draft_unfunded (Pilot / No Authorized Funds)
                  </option>
                  <option value="authorized_active">
                    authorized_active (Officially Authorized &amp; Funded)
                  </option>
                  <option value="paused">paused (Temporarily Suspended)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold uppercase text-[#253746]">
                  Funding Authority Transparency Note
                </label>
                <input
                  type="text"
                  value={fundingAuthorityNote}
                  onChange={(e) => setFundingAuthorityNote(e.target.value)}
                  className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] bg-white px-3"
                />
              </div>

              <div className="flex flex-wrap gap-4 sm:col-span-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={requiresStudentStatus}
                    onChange={(e) => setRequiresStudentStatus(e.target.checked)}
                  />
                  Requires Student Verification
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={requiresFinancialNeedCheck}
                    onChange={(e) => setRequiresFinancialNeedCheck(e.target.checked)}
                  />
                  Requires Financial Need Evaluation
                </label>
              </div>

              <div className="flex justify-end sm:col-span-2">
                <button
                  type="submit"
                  disabled={savingProg}
                  className="h-10 rounded bg-[#168B55] px-5 font-semibold text-white cursor-pointer"
                >
                  {savingProg ? 'Saving...' : editingProgId ? 'Update Programme' : 'Save Programme'}
                </button>
              </div>
            </form>
          )}

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {programmes.map((p) => (
              <div
                key={p.id}
                className="flex flex-col justify-between rounded border border-[#E2E8F0] bg-[#F5F7FA] p-4 text-xs"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-[#102A43]">{p.programmeType}</span>
                    <span className="rounded border border-[#CBD5E1] bg-white px-2 py-0.5 font-mono-tabular text-[10px] font-bold">
                      {p.authorizationStatus}
                    </span>
                  </div>
                  <h3 className="mt-1 font-display text-base font-semibold text-[#0A1D2B]">
                    {p.title}
                  </h3>
                  <p className="mt-1 text-[#43474D]">{p.description}</p>
                  <div className="mt-2 font-mono-tabular text-[11px] text-[#253746]">
                    Budget: {formatCurrencyCompact(p.allocatedBudgetInr)} · Disbursed:{' '}
                    {formatCurrencyCompact(p.disbursedBudgetInr)} · Cap:{' '}
                    {formatCurrencyCompact(p.maxBenefitPerApplicantInr)}
                  </div>
                </div>
                <div className="mt-3 flex justify-end border-t border-[#E2E8F0] pt-2">
                  <button
                    type="button"
                    onClick={() => openEditProgramme(p)}
                    className="rounded border border-[#102A43] bg-white px-3 py-1 font-semibold text-[#102A43] cursor-pointer"
                  >
                    Configure / Edit
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Beneficiaries Ledger */}
      {subTab === 'beneficiaries' && (
        <section className="rounded-lg border border-[#102A43]/15 bg-white civic-shadow-1">
          <div className="flex items-center gap-2 border-b border-[#E2E8F0] px-5 py-4">
            <Users className="h-4 w-4 text-[#102A43]" />
            <h2 className="font-display text-base font-semibold text-[#0A1D2B]">
              Approved &amp; Disbursed Beneficiary Records ({beneficiaries.length})
            </h2>
          </div>
          {beneficiaries.length === 0 ? (
            <div className="px-6 py-8 text-center text-xs text-[#52606D]">
              No approved or disbursed beneficiary records yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#E2E8F0] bg-[#F5F7FA] text-[11px] font-bold uppercase text-[#52606D]">
                  <tr>
                    <th className="px-4 py-3">Application</th>
                    <th className="px-4 py-3">Beneficiary</th>
                    <th className="px-4 py-3">Programme</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Approved (₹)</th>
                    <th className="px-4 py-3">Reference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {beneficiaries.map((b) => (
                    <tr key={b.id}>
                      <td className="px-4 py-3 font-mono-tabular font-bold text-[#102A43]">
                        {b.id}
                      </td>
                      <td className="px-4 py-3 font-semibold text-[#0A1D2B]">
                        {b.applicantName} ({b.locality})
                      </td>
                      <td className="px-4 py-3 text-[#253746]">{b.programmeTitle}</td>
                      <td className="px-4 py-3 font-semibold text-[#168B55]">{b.status}</td>
                      <td className="px-4 py-3 text-right font-mono-tabular font-bold">
                        ₹{(b.approvedAmountInr || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="px-4 py-3 font-mono-tabular text-[#52606D]">
                        {b.disbursementReference || 'Pending'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
