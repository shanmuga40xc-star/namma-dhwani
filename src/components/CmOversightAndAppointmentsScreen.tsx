import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  FileCheck2,
  Landmark,
  ShieldAlert,
  UserCheck,
  XCircle,
} from 'lucide-react';
import {
  cmUpdateEscalation,
  createCmEscalation,
  decideAuthorityAppointment,
} from '../services/firestoreService';
import {
  AdminRecord,
  AuthorityAppointment,
  AuthorityTier,
  CivicIncident,
  CmEscalationAlert,
  CmEscalationStatus,
  CmMisuseType,
  IncidentStatus,
  WardSummary,
} from '../types/civic';

interface CmOversightAndAppointmentsScreenProps {
  authorityTier: AuthorityTier;
  actorUid: string;
  actorName: string;
  admins: AdminRecord[];
  wards: WardSummary[];
  complaints: CivicIncident[];
  cmEscalations: CmEscalationAlert[];
  appointments: AuthorityAppointment[];
  onShowToast: (msg: string) => void;
}

export const CmOversightAndAppointmentsScreen: React.FC<
  CmOversightAndAppointmentsScreenProps
> = ({
  authorityTier,
  actorUid,
  actorName,
  admins,
  wards,
  complaints,
  cmEscalations,
  appointments,
  onShowToast,
}) => {
  const [escFilter, setEscFilter] = useState<'all' | 'unread' | 'directives'>('all');
  const [aptFilter, setAptFilter] = useState<
    'all' | 'pending' | 'escalated_to_cm' | 'approved_scheduled'
  >('all');

  // CM directive drafting state keyed by escalation ID
  const [directiveDrafts, setDirectiveDrafts] = useState<Record<string, string>>({});
  const [busyEscId, setBusyEscId] = useState<string | null>(null);

  // Appointment scheduling/permission drafting state
  const [editingAptId, setEditingAptId] = useState<string | null>(null);
  const [aptScheduledSlot, setAptScheduledSlot] = useState('');
  const [aptOfficeVenue, setAptOfficeVenue] = useState('');
  const [aptRemarks, setAptRemarks] = useState('');
  const [busyAptId, setBusyAptId] = useState<string | null>(null);

  // Manual CM Issue Report state
  const [showNewEscForm, setShowNewEscForm] = useState(false);
  const [newEscTitle, setNewEscTitle] = useState('');
  const [newEscType, setNewEscType] = useState<CmMisuseType>('sla_negligence');
  const [newEscRole, setNewEscRole] = useState<'Local MLA' | 'BBMP Official'>('BBMP Official');
  const [newEscOfficial, setNewEscOfficial] = useState('');
  const [newEscWard, setNewEscWard] = useState<number>(1);
  const [newEscComplaintId, setNewEscComplaintId] = useState('');
  const [newEscSeverity, setNewEscSeverity] = useState<'High' | 'Critical'>('Critical');
  const [newEscDesc, setNewEscDesc] = useState('');
  const [submittingNewEsc, setSubmittingNewEsc] = useState(false);

  const unreadAlertsCount = cmEscalations.filter(
    (e) => e.cmStatus === 'unread_alert'
  ).length;
  const pendingAptCount = appointments.filter(
    (a) => a.status === 'pending_permission' || a.status === 'escalated_to_cm'
  ).length;

  const filteredEscalations = useMemo(() => {
    if (escFilter === 'unread') {
      return cmEscalations.filter(
        (e) => e.cmStatus === 'unread_alert' || e.cmStatus === 'under_cm_review'
      );
    }
    if (escFilter === 'directives') {
      return cmEscalations.filter(
        (e) => e.cmStatus === 'directive_issued' || e.cmStatus === 'action_taken'
      );
    }
    return cmEscalations;
  }, [cmEscalations, escFilter]);

  const filteredAppointments = useMemo(() => {
    if (aptFilter === 'pending') {
      return appointments.filter((a) => a.status === 'pending_permission');
    }
    if (aptFilter === 'escalated_to_cm') {
      return appointments.filter(
        (a) => a.status === 'escalated_to_cm' || a.targetAuthority === 'Chief Minister (CM)'
      );
    }
    if (aptFilter === 'approved_scheduled') {
      return appointments.filter((a) => a.status === 'approved_scheduled');
    }
    return appointments;
  }, [appointments, aptFilter]);

  const nonMergedComplaints = useMemo(
    () => complaints.filter((c) => !c.isMergedDuplicate),
    [complaints]
  );

  const handleCmDirective = async (
    esc: CmEscalationAlert,
    nextStatus: CmEscalationStatus
  ) => {
    const note =
      (directiveDrafts[esc.id] || '').trim() ||
      (nextStatus === 'under_cm_review'
        ? 'Chief Minister Vigilance Desk opened formal audit on this ward report.'
        : nextStatus === 'directive_issued'
          ? 'CM Directive issued: Local MLA & BBMP Commissioner must submit verified corrective proof within 24 hours.'
          : 'Corrective disciplinary & remedial action recorded by CM Oversight.');

    setBusyEscId(esc.id);
    try {
      await cmUpdateEscalation({
        escalationId: esc.id,
        cmStatus: nextStatus,
        cmDirectiveNote: note,
        cmUid: actorUid,
        cmName: actorName,
      });
      onShowToast(`CM Oversight updated ${esc.id} -> ${nextStatus.replace(/_/g, ' ')}.`);
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Failed to update CM escalation.');
    } finally {
      setBusyEscId(null);
    }
  };

  const handleCreateCmReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newEscTitle.trim().length < 4 || newEscDesc.trim().length < 6) {
      onShowToast('Enter a title (4+ chars) and issue description (6+ chars) for CM Oversight.');
      return;
    }
    setSubmittingNewEsc(true);
    try {
      const wardObj = wards.find((w) => w.wardNumber === newEscWard);
      const id = await createCmEscalation({
        title: newEscTitle.trim(),
        misuseType: newEscType,
        targetRole: newEscRole,
        targetOfficialName: newEscOfficial.trim() || `${newEscRole} (Ward 0${newEscWard})`,
        wardNumber: newEscWard,
        locality: wardObj?.name || 'Bengaluru',
        relatedComplaintId: newEscComplaintId || undefined,
        description: newEscDesc.trim(),
        evidenceSummary: `Logged by ${actorName} (${authorityTier} Desk).`,
        severity: newEscSeverity,
        reportedByUid: actorUid,
        reportedByName: actorName,
        sourceType: 'citizen_report',
      });
      onShowToast(`CM Oversight alert ${id} created and dispatched.`);
      setNewEscTitle('');
      setNewEscOfficial('');
      setNewEscComplaintId('');
      setNewEscDesc('');
      setShowNewEscForm(false);
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Failed to log CM oversight report.');
    } finally {
      setSubmittingNewEsc(false);
    }
  };

  const openPermissionPanel = (apt: AuthorityAppointment) => {
    setEditingAptId(apt.id);
    setAptScheduledSlot(`${apt.preferredDate} · ${apt.preferredSlot}`);
    setAptOfficeVenue(
      apt.targetAuthority === 'Chief Minister (CM)'
        ? apt.meetingMode === 'Video Hearing'
          ? 'CM Janata Darshan Video Room (Vidhana Soudha)'
          : 'Chief Minister Public Grievance Hall, Vidhana Soudha, Bengaluru'
        : apt.meetingMode === 'Video Hearing'
          ? `Ward 0${apt.wardNumber} MLA Virtual Grievance Desk`
          : `Local MLA Constituency Office — Ward 0${apt.wardNumber} (${apt.locality})`
    );
    setAptRemarks('Permission granted for urgent civic redressal hearing.');
  };

  const handleApproveAppointment = async (apt: AuthorityAppointment) => {
    setBusyAptId(apt.id);
    const prefix = apt.targetAuthority === 'Chief Minister (CM)' ? 'CM-PASS' : 'MLA-PASS';
    const passCode = `${prefix}-${Math.floor(100000 + Math.random() * 900000)}`;
    try {
      await decideAuthorityAppointment({
        appointmentId: apt.id,
        status: 'approved_scheduled',
        targetAuthority: apt.targetAuthority,
        permissionPassCode: passCode,
        scheduledDateTime: aptScheduledSlot.trim() || `${apt.preferredDate} · ${apt.preferredSlot}`,
        officeLocation:
          aptOfficeVenue.trim() ||
          `Bengaluru ${apt.targetAuthority} Grievance Office`,
        authorityRemarks:
          aptRemarks.trim() || 'Appointment permission granted and slot confirmed.',
        decidedByUid: actorUid,
        decidedByName: actorName,
      });
      setEditingAptId(null);
      onShowToast(`Permission Pass ${passCode} issued for ${apt.applicantName}.`);
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Failed to approve appointment.');
    } finally {
      setBusyAptId(null);
    }
  };

  const handleEscalateAptToCm = async (apt: AuthorityAppointment) => {
    setBusyAptId(apt.id);
    try {
      await decideAuthorityAppointment({
        appointmentId: apt.id,
        status: 'escalated_to_cm',
        targetAuthority: 'Chief Minister (CM)',
        authorityRemarks:
          aptRemarks.trim() ||
          'Escalated by Local Authority to Chief Minister Office for executive hearing.',
        decidedByUid: actorUid,
        decidedByName: actorName,
      });
      setEditingAptId(null);
      onShowToast(`Appointment ${apt.id} escalated directly to Chief Minister (CM).`);
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Escalation failed.');
    } finally {
      setBusyAptId(null);
    }
  };

  const handleRejectAppointment = async (apt: AuthorityAppointment) => {
    const reason =
      aptRemarks.trim() || 'Matter addressed via digital civic ticket; in-person hearing declined.';
    setBusyAptId(apt.id);
    try {
      await decideAuthorityAppointment({
        appointmentId: apt.id,
        status: 'rejected',
        authorityRemarks: reason,
        decidedByUid: actorUid,
        decidedByName: actorName,
      });
      setEditingAptId(null);
      onShowToast(`Appointment ${apt.id} updated to rejected.`);
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Failed to update appointment.');
    } finally {
      setBusyAptId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header Summary */}
      <section className="rounded-lg border border-[#102A43]/15 bg-white p-6 civic-shadow-1">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#102A43]">
              NAGRIK State Oversight &amp; Citizen Hearing Governance
            </div>
            <h1 className="mt-1 font-display text-2xl font-semibold text-[#0A1D2B]">
              CM Misuse Oversight &amp; MLA / CM Appointment Permissions
            </h1>
            <p className="mt-1 text-xs text-[#52606D]">
              All Local MLA and BBMP municipal work is transparently audited. Any suspicious closure,
              priority downgrade, SLA neglect, or citizen misuse report notifies the Chief Minister
              (CM) directly.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="rounded border border-[#BA1A1A]/30 bg-[#FFDAD6]/60 px-3 py-2 font-semibold text-[#BA1A1A]">
              Unread CM Alerts:{' '}
              <span className="font-mono-tabular font-bold">{unreadAlertsCount}</span>
            </div>
            <div className="rounded border border-[#102A43]/20 bg-[#ECF4FF] px-3 py-2 font-semibold text-[#102A43]">
              Pending Appointments:{' '}
              <span className="font-mono-tabular font-bold">{pendingAptCount}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Section 1: Chief Minister Direct Misuse & Negligence Escalations */}
      <section className="rounded-lg border border-[#102A43]/15 bg-white civic-shadow-1">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] px-5 py-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-[#BA1A1A]" />
            <div>
              <h2 className="font-display text-lg font-semibold text-[#0A1D2B]">
                Direct Chief Minister (CM) Misuse &amp; Negligence Alerts ({cmEscalations.length})
              </h2>
              <p className="text-[11px] text-[#52606D]">
                Triggered automatically by AI verification anomalies / disputed closures, or filed by
                citizens against Local MLA / BBMP misuse.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => setShowNewEscForm((prev) => !prev)}
              className="h-9 cursor-pointer rounded border border-[#BA1A1A] bg-[#FFDAD6] px-3 font-semibold text-[#BA1A1A] hover:bg-[#fcc9c4]"
            >
              {showNewEscForm ? 'Close Report Form' : '+ Report Misuse Issue to CM'}
            </button>
            {[
              { id: 'all', label: 'All Alerts' },
              { id: 'unread', label: 'Needs CM Review' },
              { id: 'directives', label: 'CM Directives Issued' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setEscFilter(tab.id as typeof escFilter)}
                className={`h-9 cursor-pointer rounded px-3 font-semibold ${
                  escFilter === tab.id
                    ? 'bg-[#102A43] text-white'
                    : 'border border-[#CBD5E1] bg-white text-[#253746]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {showNewEscForm && (
          <form
            onSubmit={handleCreateCmReport}
            className="border-b border-[#E2E8F0] bg-[#FFF9F8] p-5 text-xs"
          >
            <div className="mb-3 font-bold uppercase tracking-[0.04em] text-[#BA1A1A]">
              File Direct CM Misuse / Negligence Alert
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <input
                type="text"
                value={newEscTitle}
                onChange={(e) => setNewEscTitle(e.target.value)}
                placeholder="Alert Subject Title *"
                className="civic-input h-10 rounded border border-[#CBD5E1] bg-white px-3"
              />
              <select
                value={newEscType}
                onChange={(e) => setNewEscType(e.target.value as CmMisuseType)}
                className="civic-input h-10 rounded border border-[#CBD5E1] bg-white px-2.5"
              >
                <option value="sla_negligence">SLA Negligence / Stalled Work</option>
                <option value="suspicious_resolution">False / Suspicious Closure</option>
                <option value="fund_misuse">Municipal Fund Misuse</option>
                <option value="priority_manipulation">Priority Manipulation</option>
                <option value="unresponsive_official">Unresponsive Official</option>
                <option value="citizen_grievance">Urgent Civic Grievance</option>
              </select>
              <select
                value={newEscRole}
                onChange={(e) => setNewEscRole(e.target.value as 'Local MLA' | 'BBMP Official')}
                className="civic-input h-10 rounded border border-[#CBD5E1] bg-white px-2.5"
              >
                <option value="BBMP Official">Target: BBMP Official</option>
                <option value="Local MLA">Target: Local MLA</option>
              </select>
              <input
                type="text"
                value={newEscOfficial}
                onChange={(e) => setNewEscOfficial(e.target.value)}
                placeholder="Official / Office Name"
                className="civic-input h-10 rounded border border-[#CBD5E1] bg-white px-3"
              />
              <select
                value={newEscWard}
                onChange={(e) => setNewEscWard(Number(e.target.value))}
                className="civic-input h-10 rounded border border-[#CBD5E1] bg-white px-2.5"
              >
                {wards.map((w) => (
                  <option key={w.wardNumber} value={w.wardNumber}>
                    Ward 0{w.wardNumber} — {w.name}
                  </option>
                ))}
              </select>
              <select
                value={newEscSeverity}
                onChange={(e) => setNewEscSeverity(e.target.value as 'High' | 'Critical')}
                className="civic-input h-10 rounded border border-[#CBD5E1] bg-white px-2.5"
              >
                <option value="Critical">Severity: Critical</option>
                <option value="High">Severity: High</option>
              </select>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <select
                value={newEscComplaintId}
                onChange={(e) => setNewEscComplaintId(e.target.value)}
                className="civic-input h-10 rounded border border-[#CBD5E1] bg-white px-2.5"
              >
                <option value="">Linked Complaint (Optional)</option>
                {nonMergedComplaints.slice(0, 25).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id} — {c.title.slice(0, 28)}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={newEscDesc}
                onChange={(e) => setNewEscDesc(e.target.value)}
                placeholder="Detailed description of misuse, delay, or negligence *"
                className="civic-input h-10 rounded border border-[#CBD5E1] bg-white px-3 sm:col-span-2"
              />
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="submit"
                disabled={submittingNewEsc}
                className="h-10 cursor-pointer rounded bg-[#BA1A1A] px-4 font-semibold text-white hover:bg-[#991515]"
              >
                {submittingNewEsc ? 'Submitting...' : 'Submit CM Oversight Alert'}
              </button>
            </div>
          </form>
        )}

        {filteredEscalations.length === 0 ? (
          <div className="px-6 py-10 text-center text-xs text-[#52606D]">
            No Chief Minister misuse escalations match this filter.
          </div>
        ) : (
          <div className="divide-y divide-[#E2E8F0]">
            {filteredEscalations.map((esc) => (
              <div key={esc.id} className="flex flex-col gap-3 px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="font-mono-tabular font-bold text-[#102A43]">{esc.id}</span>
                      <span
                        className={`rounded px-2 py-0.5 font-bold uppercase ${
                          esc.severity === 'Critical'
                            ? 'bg-[#FFDAD6] text-[#BA1A1A]'
                            : 'bg-[#FEF5E7] text-[#8A5208]'
                        }`}
                      >
                        {esc.severity}
                      </span>
                      <span className="rounded border border-[#CBD5E1] bg-[#F5F7FA] px-2 py-0.5 font-semibold text-[#253746]">
                        {esc.sourceType === 'auto_system'
                          ? 'Auto-Detected System Alert'
                          : 'Citizen Misuse Report'}
                      </span>
                      <span className="text-[#52606D]">{esc.createdAt}</span>
                    </div>
                    <h3 className="mt-1 font-display text-base font-semibold text-[#0A1D2B]">
                      {esc.title}
                    </h3>
                    <div className="mt-0.5 text-xs text-[#52606D]">
                      Target: <strong className="text-[#0A1D2B]">{esc.targetRole}</strong> (
                      {esc.targetOfficialName}) · Ward 0{esc.wardNumber} ({esc.locality})
                      {esc.relatedComplaintId ? (
                        <>
                          {' '}
                          · Ticket{' '}
                          <span className="font-mono-tabular font-semibold text-[#102A43]">
                            {esc.relatedComplaintId}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <span
                    className={`rounded px-2.5 py-1 font-mono-tabular text-[11px] font-bold uppercase ${
                      esc.cmStatus === 'unread_alert'
                        ? 'bg-[#FFDAD6] text-[#BA1A1A]'
                        : esc.cmStatus === 'under_cm_review'
                          ? 'bg-[#FEF5E7] text-[#8A5208]'
                          : 'bg-[#E8F5EC] text-[#168B55]'
                    }`}
                  >
                    {esc.cmStatus.replace(/_/g, ' ')}
                  </span>
                </div>

                <div className="rounded border border-[#E2E8F0] bg-[#F5F7FA] p-3 text-xs text-[#253746]">
                  <p>{esc.description}</p>
                  <p className="mt-1.5 border-t border-[#E2E8F0] pt-1.5 text-[11px] text-[#52606D]">
                    <strong>Evidence Summary:</strong> {esc.evidenceSummary} · Reported by{' '}
                    {esc.reportedByName}
                  </p>
                </div>

                {esc.cmDirectiveNote && (
                  <div className="rounded border border-[#168B55]/40 bg-[#E8F5EC] px-3 py-2 text-xs text-[#0A1D2B]">
                    <span className="font-bold text-[#168B55]">
                      CM Directive ({esc.reviewedByCmName || 'CM Office'}):{' '}
                    </span>
                    {esc.cmDirectiveNote}
                  </div>
                )}

                {authorityTier === 'CM' ? (
                  <div className="flex flex-col gap-2 rounded border border-[#102A43]/15 bg-[#F7F9FF] p-3 sm:flex-row sm:items-center">
                    <input
                      type="text"
                      value={directiveDrafts[esc.id] ?? ''}
                      onChange={(e) =>
                        setDirectiveDrafts((prev) => ({ ...prev, [esc.id]: e.target.value }))
                      }
                      placeholder="Enter CM executive order / inquiry directive for Local MLA or BBMP Commissioner..."
                      className="civic-input h-10 flex-1 rounded border border-[#CBD5E1] bg-white px-3 text-xs"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busyEscId === esc.id}
                        onClick={() => handleCmDirective(esc, 'under_cm_review')}
                        className="h-10 cursor-pointer rounded border border-[#F2A541] bg-[#FEF5E7] px-3 text-xs font-semibold text-[#8A5208]"
                      >
                        Mark Under CM Review
                      </button>
                      <button
                        type="button"
                        disabled={busyEscId === esc.id}
                        onClick={() => handleCmDirective(esc, 'directive_issued')}
                        className="h-10 cursor-pointer rounded bg-[#102A43] px-3.5 text-xs font-semibold text-white hover:bg-[#0B1D2F]"
                      >
                        Issue CM Directive
                      </button>
                      <button
                        type="button"
                        disabled={busyEscId === esc.id}
                        onClick={() => handleCmDirective(esc, 'action_taken')}
                        className="h-10 cursor-pointer rounded bg-[#168B55] px-3.5 text-xs font-semibold text-white hover:bg-[#127446]"
                      >
                        Action Taken
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] font-medium text-[#8A5208]">
                    <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                    Escalated directly to the Chief Minister (CM) Oversight Office for executive
                    review.
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Section 2: Appointment Permission Queue (Local MLA & Chief Minister) */}
      <section className="rounded-lg border border-[#102A43]/15 bg-white civic-shadow-1">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] px-5 py-4">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-[#102A43]" />
            <div>
              <h2 className="font-display text-lg font-semibold text-[#0A1D2B]">
                Local MLA &amp; CM Appointment Permission Queue ({appointments.length})
              </h2>
              <p className="text-[11px] text-[#52606D]">
                Citizens request formal permission to meet their Local MLA or the Chief Minister
                when civic urgency or misuse grievances arise.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 text-xs">
            {[
              { id: 'all', label: 'All' },
              { id: 'pending', label: 'Pending Permission' },
              { id: 'escalated_to_cm', label: 'CM / Escalated' },
              { id: 'approved_scheduled', label: 'Passes Issued' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setAptFilter(t.id as typeof aptFilter)}
                className={`h-9 cursor-pointer rounded px-3 font-semibold ${
                  aptFilter === t.id
                    ? 'bg-[#102A43] text-white'
                    : 'border border-[#CBD5E1] bg-white text-[#253746]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {filteredAppointments.length === 0 ? (
          <div className="px-6 py-10 text-center text-xs text-[#52606D]">
            No citizen appointment permission requests match this filter.
          </div>
        ) : (
          <div className="divide-y divide-[#E2E8F0]">
            {filteredAppointments.map((apt) => (
              <div key={apt.id} className="flex flex-col gap-3 px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="font-mono-tabular font-bold text-[#102A43]">{apt.id}</span>
                      <span className="rounded bg-[#ECF4FF] px-2 py-0.5 font-bold text-[#102A43]">
                        Target: {apt.targetAuthority}
                      </span>
                      <span className="rounded border border-[#CBD5E1] bg-[#F5F7FA] px-2 py-0.5 font-semibold text-[#253746]">
                        {apt.urgencyReason}
                      </span>
                      <span className="text-[#52606D]">{apt.meetingMode}</span>
                    </div>
                    <h3 className="mt-1 font-display text-base font-semibold text-[#0A1D2B]">
                      {apt.applicantName} · Ward 0{apt.wardNumber} ({apt.locality})
                    </h3>
                    <div className="text-xs text-[#52606D]">
                      Constituency: {apt.constituency} · Requested Slot:{' '}
                      <span className="font-mono-tabular font-semibold text-[#0A1D2B]">
                        {apt.preferredDate} ({apt.preferredSlot})
                      </span>
                      {apt.relatedComplaintId ? ` · Complaint ${apt.relatedComplaintId}` : ''}
                    </div>
                  </div>

                  <span
                    className={`rounded px-2.5 py-1 font-mono-tabular text-[11px] font-bold uppercase ${
                      apt.status === 'approved_scheduled'
                        ? 'bg-[#E8F5EC] text-[#168B55]'
                        : apt.status === 'escalated_to_cm'
                          ? 'bg-[#FFDAD6] text-[#BA1A1A]'
                          : apt.status === 'rejected'
                            ? 'bg-[#E2E8F0] text-[#52606D]'
                            : 'bg-[#FEF5E7] text-[#8A5208]'
                    }`}
                  >
                    {apt.status.replace(/_/g, ' ')}
                  </span>
                </div>

                <p className="rounded border border-[#E2E8F0] bg-[#F5F7FA] p-3 text-xs text-[#253746]">
                  {apt.purpose}
                </p>

                {apt.status === 'approved_scheduled' && apt.permissionPassCode && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-[#168B55]/40 bg-[#E8F5EC] px-3.5 py-2.5 text-xs text-[#0A1D2B]">
                    <div>
                      <FileCheck2 className="mr-1.5 inline h-4 w-4 text-[#168B55]" />
                      <strong>Permission Pass:</strong>{' '}
                      <span className="font-mono-tabular font-bold text-[#168B55]">
                        {apt.permissionPassCode}
                      </span>{' '}
                      · {apt.scheduledDateTime} · {apt.officeLocation}
                    </div>
                    <span className="text-[11px] text-[#52606D]">
                      Approved by {apt.decidedByName || 'Authority'}
                    </span>
                  </div>
                )}

                {apt.status === 'rejected' && apt.authorityRemarks && (
                  <div className="rounded border border-[#CBD5E1] bg-[#F5F7FA] px-3 py-2 text-xs text-[#52606D]">
                    <strong>Remarks:</strong> {apt.authorityRemarks}
                  </div>
                )}

                {(apt.status === 'pending_permission' || apt.status === 'escalated_to_cm') && (
                  <>
                    {editingAptId === apt.id ? (
                      <div className="flex flex-col gap-3 rounded border border-[#102A43]/20 bg-[#F7F9FF] p-3.5 text-xs">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div>
                            <label className="block font-bold uppercase text-[#253746]">
                              Confirmed Date &amp; Time Slot
                            </label>
                            <input
                              type="text"
                              value={aptScheduledSlot}
                              onChange={(e) => setAptScheduledSlot(e.target.value)}
                              className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] bg-white px-3"
                            />
                          </div>
                          <div>
                            <label className="block font-bold uppercase text-[#253746]">
                              Office Location / Video Hearing Room
                            </label>
                            <input
                              type="text"
                              value={aptOfficeVenue}
                              onChange={(e) => setAptOfficeVenue(e.target.value)}
                              className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] bg-white px-3"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block font-bold uppercase text-[#253746]">
                            Permission / Scheduling Remarks
                          </label>
                          <input
                            type="text"
                            value={aptRemarks}
                            onChange={(e) => setAptRemarks(e.target.value)}
                            className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] bg-white px-3"
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={busyAptId === apt.id}
                            onClick={() => handleApproveAppointment(apt)}
                            className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded bg-[#168B55] px-4 font-semibold text-white hover:bg-[#127446]"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Approve Permission &amp; Issue Pass
                          </button>
                          {apt.targetAuthority !== 'Chief Minister (CM)' && (
                            <button
                              type="button"
                              disabled={busyAptId === apt.id}
                              onClick={() => handleEscalateAptToCm(apt)}
                              className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded border border-[#F2A541] bg-[#FEF5E7] px-3 font-semibold text-[#8A5208]"
                            >
                              <Landmark className="h-4 w-4" />
                              Escalate to CM
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={busyAptId === apt.id}
                            onClick={() => handleRejectAppointment(apt)}
                            className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded border border-[#BA1A1A] bg-[#FFDAD6] px-3 font-semibold text-[#BA1A1A]"
                          >
                            <XCircle className="h-4 w-4" />
                            Decline
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingAptId(null)}
                            className="h-10 cursor-pointer rounded border border-[#CBD5E1] bg-white px-3 font-semibold text-[#253746]"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openPermissionPanel(apt)}
                          className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded bg-[#102A43] px-4 text-xs font-semibold text-white hover:bg-[#0B1D2F]"
                        >
                          <UserCheck className="h-3.5 w-3.5" />
                          Review &amp; Grant Appointment Permission
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Section 3: Transparent Local MLA & BBMP Work Ledger */}
      <section className="rounded-lg border border-[#102A43]/15 bg-white civic-shadow-1">
        <div className="border-b border-[#E2E8F0] px-5 py-4">
          <h2 className="font-display text-lg font-semibold text-[#0A1D2B]">
            Transparent Local MLA &amp; BBMP Official Accountability Roster ({admins.length})
          </h2>
          <p className="text-[11px] text-[#52606D]">
            Publicly visible ledger tracking each Local MLA and BBMP official, separate from
            citizens, with live ward ticket closure and CM misuse escalation counts.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#E2E8F0] bg-[#F5F7FA] text-[11px] font-bold uppercase tracking-[0.04em] text-[#52606D]">
              <tr>
                <th className="px-4 py-3">Official / Representative</th>
                <th className="px-4 py-3">Category Tier</th>
                <th className="px-4 py-3">Constituency / Department</th>
                <th className="px-4 py-3 text-right">Ward</th>
                <th className="px-4 py-3 text-right">Ward Verified</th>
                <th className="px-4 py-3 text-right">CM Alerts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {admins.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-[#52606D]">
                    Primary CM Supervisor active. Approved Local MLAs and BBMP officers appear here
                    once approved in Authority Access.
                  </td>
                </tr>
              ) : (
                admins.map((a) => {
                  const wardNum = a.wardJurisdiction || 1;
                  const wardItems = nonMergedComplaints.filter((c) => c.wardNumber === wardNum);
                  const wardVerified = wardItems.filter(
                    (c) => c.status === IncidentStatus.Verified
                  ).length;
                  const wardAlerts = cmEscalations.filter(
                    (e) => e.wardNumber === wardNum
                  ).length;
                  const wardObj = wards.find((w) => w.wardNumber === wardNum);
                  return (
                    <tr key={a.uid}>
                      <td className="px-4 py-3 font-semibold text-[#0A1D2B]">
                        {a.displayName}
                        <div className="font-mono-tabular text-[11px] font-normal text-[#52606D]">
                          {a.badgeId} {a.politicalIdNumber ? `· ${a.politicalIdNumber}` : ''}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-[#102A43]">
                        {a.authorityTier === 'CM'
                          ? 'CM Oversight'
                          : a.authorityTier === 'MLA'
                            ? 'Local MLA'
                            : 'BBMP Official'}
                      </td>
                      <td className="px-4 py-3 text-[#43474D]">
                        {a.politicalRole || a.department}
                        {a.constituency ? ` · ${a.constituency}` : ''}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-tabular">
                        Ward 0{wardNum} {wardObj ? `(${wardObj.name})` : ''}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-tabular font-semibold text-[#168B55]">
                        {wardVerified}/{wardItems.length}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-tabular font-semibold text-[#BA1A1A]">
                        {wardAlerts}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
