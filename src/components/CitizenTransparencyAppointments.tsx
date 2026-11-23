import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  FileCheck2,
  Landmark,
  ShieldAlert,
  UserCheck,
} from 'lucide-react';
import {
  citizenEscalateAppointmentToCm,
  createAuthorityAppointment,
  createCmEscalation,
} from '../services/firestoreService';
import {
  AdminRecord,
  AppointmentTargetAuthority,
  AppointmentUrgencyReason,
  AuthorityAppointment,
  CivicIncident,
  CmEscalationAlert,
  CmMisuseType,
  IncidentStatus,
  WardSummary,
} from '../types/civic';

interface CitizenTransparencyAppointmentsProps {
  uid: string;
  displayName: string;
  defaultWardNumber: number;
  defaultLocality: string;
  admins: AdminRecord[];
  wards: WardSummary[];
  complaints: CivicIncident[];
  cmEscalations: CmEscalationAlert[];
  myAppointments: AuthorityAppointment[];
  onShowToast: (msg: string) => void;
}

export const CitizenTransparencyAppointments: React.FC<
  CitizenTransparencyAppointmentsProps
> = ({
  uid,
  displayName,
  defaultWardNumber,
  defaultLocality,
  admins,
  wards,
  complaints,
  cmEscalations,
  myAppointments,
  onShowToast,
}) => {
  // Appointment Request Form State
  const [targetAuthority, setTargetAuthority] =
    useState<AppointmentTargetAuthority>('Local MLA');
  const [aptWard, setAptWard] = useState<number>(defaultWardNumber || 1);
  const [aptLocality, setAptLocality] = useState<string>(defaultLocality || 'Indiranagar');
  const [constituency, setConstituency] = useState('Bengaluru Central / Ward Civic Desk');
  const [urgencyReason, setUrgencyReason] = useState<AppointmentUrgencyReason>(
    'Critical Unresolved Hazard'
  );
  const [relatedComplaintId, setRelatedComplaintId] = useState('');
  const [preferredDate, setPreferredDate] = useState(() => {
    const d = new Date(Date.now() + 86400000 * 2);
    return d.toISOString().slice(0, 10);
  });
  const [preferredSlot, setPreferredSlot] = useState('09:30 AM - 11:00 AM');
  const [meetingMode, setMeetingMode] = useState<'In-Person Office' | 'Video Hearing'>(
    'In-Person Office'
  );
  const [purpose, setPurpose] = useState('');
  const [submittingApt, setSubmittingApt] = useState(false);

  // Direct CM Misuse Report Form State
  const [escTitle, setEscTitle] = useState('');
  const [misuseType, setMisuseType] = useState<CmMisuseType>('sla_negligence');
  const [targetRole, setTargetRole] = useState<'Local MLA' | 'BBMP Official'>('BBMP Official');
  const [targetOfficialName, setTargetOfficialName] = useState('');
  const [escWard, setEscWard] = useState<number>(defaultWardNumber || 1);
  const [escComplaintId, setEscComplaintId] = useState('');
  const [severity, setSeverity] = useState<'High' | 'Critical'>('Critical');
  const [evidenceSummary, setEvidenceSummary] = useState('');
  const [escDescription, setEscDescription] = useState('');
  const [submittingEsc, setSubmittingEsc] = useState(false);

  const [escalatingAptId, setEscalatingAptId] = useState<string | null>(null);

  const nonMerged = useMemo(
    () => complaints.filter((c) => !c.isMergedDuplicate),
    [complaints]
  );

  const localMlaAndBbmpOfficials = useMemo(
    () => admins.filter((a) => a.authorityTier !== 'CM'),
    [admins]
  );

  const handleRequestAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (purpose.trim().length < 10) {
      onShowToast('Describe why an appointment with the Local MLA or CM is required.');
      return;
    }
    setSubmittingApt(true);
    try {
      const id = await createAuthorityAppointment({
        applicantUid: uid,
        applicantName: displayName,
        targetAuthority,
        wardNumber: aptWard,
        locality: aptLocality,
        constituency: constituency.trim() || `Ward 0${aptWard} Constituency`,
        relatedComplaintId: relatedComplaintId || undefined,
        urgencyReason,
        purpose,
        preferredDate,
        preferredSlot,
        meetingMode,
      });
      onShowToast(
        `Appointment permission request ${id} submitted to ${targetAuthority} office.`
      );
      setPurpose('');
      setRelatedComplaintId('');
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Failed to request appointment.');
    } finally {
      setSubmittingApt(false);
    }
  };

  const [escFormError, setEscFormError] = useState<string | null>(null);

  const handleSubmitMisuseToCm = async (e: React.FormEvent) => {
    e.preventDefault();
    setEscFormError(null);
    const cleanTitle = escTitle.trim();
    const cleanDesc = escDescription.trim() || evidenceSummary.trim();
    const cleanEvidence =
      evidenceSummary.trim().length >= 4
        ? evidenceSummary.trim()
        : cleanDesc.slice(0, 200);

    if (cleanTitle.length < 4) {
      const msg = 'Enter a subject title (at least 4 characters) for the Chief Minister alert.';
      setEscFormError(msg);
      onShowToast(msg);
      return;
    }
    if (cleanDesc.length < 6) {
      const msg =
        'Enter details describing the Local MLA or BBMP misuse/negligence (at least 6 characters).';
      setEscFormError(msg);
      onShowToast(msg);
      return;
    }

    setSubmittingEsc(true);
    try {
      const wardObj = wards.find((w) => w.wardNumber === escWard);
      const id = await createCmEscalation({
        title: cleanTitle,
        misuseType,
        targetRole,
        targetOfficialName: targetOfficialName.trim() || `${targetRole} (Ward 0${escWard})`,
        wardNumber: escWard,
        locality: wardObj?.name || defaultLocality || 'Bengaluru',
        relatedComplaintId: escComplaintId || undefined,
        description: cleanDesc,
        evidenceSummary: cleanEvidence,
        severity,
        reportedByUid: uid,
        reportedByName: displayName,
        sourceType: 'citizen_report',
      });
      onShowToast(
        `Misuse alert ${id} dispatched directly to the Chief Minister (CM) Oversight Desk.`
      );
      setEscTitle('');
      setTargetOfficialName('');
      setEscComplaintId('');
      setEvidenceSummary('');
      setEscDescription('');
      setEscFormError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send alert to CM.';
      setEscFormError(msg);
      onShowToast(msg);
    } finally {
      setSubmittingEsc(false);
    }
  };

  const handleEscalateMyAppointment = async (aptId: string) => {
    setEscalatingAptId(aptId);
    try {
      await citizenEscalateAppointmentToCm(aptId);
      onShowToast(`Appointment ${aptId} escalated to Chief Minister (CM) Office.`);
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Escalation failed.');
    } finally {
      setEscalatingAptId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Banner */}
      <section className="rounded-lg border border-[#102A43]/15 bg-white p-6 civic-shadow-1">
        <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#102A43]">
          NAGRIK Democratic Oversight &amp; Citizen Hearing Access
        </div>
        <h1 className="mt-1 font-display text-2xl font-semibold text-[#0A1D2B]">
          Local MLA / BBMP Transparency, CM Misuse Desk &amp; Appointment Permissions
        </h1>
        <p className="mt-1 text-xs text-[#52606D]">
          Politicians (Local MLA) and municipal BBMP officers are strictly separated from citizens.
          Review their ward performance transparently, notify the Chief Minister directly if work is
          misused, or apply for permission to meet your Local MLA or the Chief Minister.
        </p>
      </section>

      {/* Top Two-Column Forms: Appointment Permission + Direct CM Misuse Alert */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Request Appointment Permission */}
        <form
          onSubmit={handleRequestAppointment}
          className="flex flex-col gap-4 rounded-lg border border-[#102A43]/15 bg-white p-6 civic-shadow-1 lg:col-span-6"
        >
          <div className="flex items-center gap-2 border-b border-[#E2E8F0] pb-3">
            <CalendarClock className="h-5 w-5 text-[#102A43]" />
            <div>
              <h2 className="font-display text-base font-semibold text-[#0A1D2B]">
                Request Appointment Permission (Local MLA / CM)
              </h2>
              <p className="text-[11px] text-[#52606D]">
                Apply for an official meeting pass when urgent civic escalation requires direct
                hearing.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {(['Local MLA', 'Chief Minister (CM)'] as const).map((authTarget) => (
              <button
                key={authTarget}
                type="button"
                onClick={() => setTargetAuthority(authTarget)}
                className={`flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded text-xs font-semibold transition-colors ${
                  targetAuthority === authTarget
                    ? 'bg-[#102A43] text-white'
                    : 'border border-[#CBD5E1] bg-[#F5F7FA] text-[#253746]'
                }`}
              >
                {authTarget === 'Chief Minister (CM)' ? (
                  <Landmark className="h-4 w-4 text-[#F2A541]" />
                ) : (
                  <UserCheck className="h-4 w-4" />
                )}
                Meet {authTarget}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-bold uppercase text-[#253746]">
                Situation / Urgency Reason
              </label>
              <select
                value={urgencyReason}
                onChange={(e) => setUrgencyReason(e.target.value as AppointmentUrgencyReason)}
                className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] bg-white px-2.5 text-xs"
              >
                <option value="Critical Unresolved Hazard">Critical Unresolved Hazard</option>
                <option value="MLA/BBMP Misuse Grievance">MLA/BBMP Misuse Grievance</option>
                <option value="Ward Infrastructure Petition">Ward Infrastructure Petition</option>
                <option value="Welfare / Community Delegation">Welfare / Community Delegation</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase text-[#253746]">
                Linked Complaint (Optional)
              </label>
              <select
                value={relatedComplaintId}
                onChange={(e) => setRelatedComplaintId(e.target.value)}
                className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] bg-white px-2.5 text-xs"
              >
                <option value="">None / General Petition</option>
                {nonMerged.slice(0, 25).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id} — {c.title.slice(0, 32)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-[11px] font-bold uppercase text-[#253746]">
                Ward
              </label>
              <select
                value={aptWard}
                onChange={(e) => {
                  const num = Number(e.target.value);
                  setAptWard(num);
                  const w = wards.find((x) => x.wardNumber === num);
                  if (w) setAptLocality(w.name);
                }}
                className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] bg-white px-2 text-xs"
              >
                {wards.map((w) => (
                  <option key={w.wardNumber} value={w.wardNumber}>
                    Ward 0{w.wardNumber} — {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase text-[#253746]">
                Preferred Date
              </label>
              <input
                type="date"
                value={preferredDate}
                onChange={(e) => setPreferredDate(e.target.value)}
                className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] bg-white px-2.5 font-mono-tabular text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase text-[#253746]">
                Meeting Mode
              </label>
              <select
                value={meetingMode}
                onChange={(e) =>
                  setMeetingMode(e.target.value as 'In-Person Office' | 'Video Hearing')
                }
                className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] bg-white px-2 text-xs"
              >
                <option value="In-Person Office">In-Person Office</option>
                <option value="Video Hearing">Video Hearing</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-bold uppercase text-[#253746]">
                Preferred Time Slot
              </label>
              <select
                value={preferredSlot}
                onChange={(e) => setPreferredSlot(e.target.value)}
                className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] bg-white px-2.5 text-xs"
              >
                <option value="09:30 AM - 11:00 AM">09:30 AM - 11:00 AM</option>
                <option value="11:30 AM - 01:00 PM">11:30 AM - 01:00 PM</option>
                <option value="03:00 PM - 05:00 PM">03:00 PM - 05:00 PM</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase text-[#253746]">
                Constituency / Area
              </label>
              <input
                type="text"
                value={constituency}
                onChange={(e) => setConstituency(e.target.value)}
                className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] bg-white px-3 text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase text-[#253746]">
              Purpose &amp; Justification for Appointment Permission *
            </label>
            <textarea
              rows={3}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="Explain the unresolved civic hazard, SLA failure, or community petition needing MLA/CM hearing..."
              className="civic-input mt-1 w-full rounded border border-[#CBD5E1] p-3 text-xs"
            />
          </div>

          <button
            type="submit"
            disabled={submittingApt}
            className="h-11 w-full cursor-pointer rounded bg-[#102A43] px-4 text-xs font-semibold text-white hover:bg-[#0B1D2F] disabled:opacity-60"
          >
            {submittingApt
              ? 'Submitting Request...'
              : `Apply for ${targetAuthority} Appointment Permission`}
          </button>
        </form>

        {/* Direct CM Misuse Report Form */}
        <form
          onSubmit={handleSubmitMisuseToCm}
          className="flex flex-col gap-4 rounded-lg border border-[#BA1A1A]/30 bg-white p-6 civic-shadow-1 lg:col-span-6"
        >
          <div className="flex items-center gap-2 border-b border-[#E2E8F0] pb-3">
            <ShieldAlert className="h-5 w-5 text-[#BA1A1A]" />
            <div>
              <h2 className="font-display text-base font-semibold text-[#0A1D2B]">
                Notify Chief Minister (CM) on MLA / BBMP Misuse
              </h2>
              <p className="text-[11px] text-[#52606D]">
                Directly escalate negligence, false ticket closures, fund misuse, or SLA stalling to
                the CM Oversight Command.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-bold uppercase text-[#253746]">
                Subject / Misuse Alert Title *
              </label>
              <input
                type="text"
                value={escTitle}
                onChange={(e) => setEscTitle(e.target.value)}
                placeholder="e.g., Ward 02 road budget unused despite hazard"
                className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] bg-white px-3 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase text-[#253746]">
                Misuse Category
              </label>
              <select
                value={misuseType}
                onChange={(e) => setMisuseType(e.target.value as CmMisuseType)}
                className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] bg-white px-2.5 text-xs"
              >
                <option value="sla_negligence">SLA Negligence / Stalled Work</option>
                <option value="suspicious_resolution">False / Suspicious Closure</option>
                <option value="fund_misuse">Municipal Fund / Budget Misuse</option>
                <option value="priority_manipulation">Priority Downgrade Manipulation</option>
                <option value="unresponsive_official">Unresponsive Local MLA / BBMP</option>
                <option value="citizen_grievance">Serious Citizen Grievance</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-[11px] font-bold uppercase text-[#253746]">
                Authority Involved
              </label>
              <select
                value={targetRole}
                onChange={(e) =>
                  setTargetRole(e.target.value as 'Local MLA' | 'BBMP Official')
                }
                className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] bg-white px-2 text-xs"
              >
                <option value="BBMP Official">BBMP Official</option>
                <option value="Local MLA">Local MLA</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase text-[#253746]">
                Official / Office Name
              </label>
              <input
                type="text"
                value={targetOfficialName}
                onChange={(e) => setTargetOfficialName(e.target.value)}
                placeholder="e.g., Ward Engineer / MLA"
                className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] bg-white px-3 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase text-[#253746]">
                Ward
              </label>
              <select
                value={escWard}
                onChange={(e) => setEscWard(Number(e.target.value))}
                className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] bg-white px-2 text-xs"
              >
                {wards.map((w) => (
                  <option key={w.wardNumber} value={w.wardNumber}>
                    Ward 0{w.wardNumber} — {w.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-bold uppercase text-[#253746]">
                Related Complaint ID (Optional)
              </label>
              <select
                value={escComplaintId}
                onChange={(e) => setEscComplaintId(e.target.value)}
                className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] bg-white px-2.5 text-xs"
              >
                <option value="">None / General Ward Misuse</option>
                {nonMerged.slice(0, 25).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id} — {c.title.slice(0, 32)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase text-[#253746]">
                Severity
              </label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as 'High' | 'Critical')}
                className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] bg-white px-2.5 text-xs"
              >
                <option value="Critical">Critical (Immediate CM Alert)</option>
                <option value="High">High Priority Audit</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase text-[#253746]">
              Detailed Misuse / Negligence Description for CM *
            </label>
            <textarea
              rows={3}
              value={escDescription}
              onChange={(e) => {
                setEscDescription(e.target.value);
                if (escFormError) setEscFormError(null);
              }}
              placeholder="Describe how Local MLA or BBMP authority misused power, stalled work, or falsified closure (min 6 chars)..."
              className="civic-input mt-1 w-full rounded border border-[#CBD5E1] p-3 text-xs"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase text-[#253746]">
              Supporting Evidence / SLA Gap Summary (Optional)
            </label>
            <input
              type="text"
              value={evidenceSummary}
              onChange={(e) => setEvidenceSummary(e.target.value)}
              placeholder="Key facts: SLA hours overdue, suspicious before/after proof, or budget gap"
              className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] bg-white px-3 text-xs"
            />
          </div>

          {escFormError && (
            <div className="rounded border border-[#BA1A1A] bg-[#FFDAD6] px-3 py-2 text-xs font-semibold text-[#BA1A1A]">
              {escFormError}
            </div>
          )}

          <button
            type="submit"
            disabled={submittingEsc}
            className="h-11 w-full cursor-pointer rounded bg-[#BA1A1A] px-4 text-xs font-semibold text-white hover:bg-[#991414] disabled:opacity-60"
          >
            {submittingEsc ? 'Dispatching to CM Office...' : 'Notify Chief Minister (CM) Directly'}
          </button>
        </form>
      </div>

      {/* My Appointment Permission Requests & Entry Passes */}
      <section className="rounded-lg border border-[#102A43]/15 bg-white civic-shadow-1">
        <div className="border-b border-[#E2E8F0] px-5 py-4">
          <h2 className="font-display text-lg font-semibold text-[#0A1D2B]">
            My Appointment Permissions &amp; Passes ({myAppointments.length})
          </h2>
        </div>

        {myAppointments.length === 0 ? (
          <div className="px-6 py-8 text-center text-xs text-[#52606D]">
            You have not submitted any Local MLA or Chief Minister appointment requests yet.
          </div>
        ) : (
          <div className="divide-y divide-[#E2E8F0]">
            {myAppointments.map((apt) => (
              <div key={apt.id} className="flex flex-col gap-3 px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="font-mono-tabular font-bold text-[#102A43]">{apt.id}</span>
                      <span className="rounded bg-[#ECF4FF] px-2 py-0.5 font-bold text-[#102A43]">
                        {apt.targetAuthority}
                      </span>
                      <span className="text-[#52606D]">{apt.meetingMode}</span>
                    </div>
                    <div className="mt-1 font-semibold text-[#0A1D2B]">
                      {apt.urgencyReason} · Ward 0{apt.wardNumber} ({apt.locality})
                    </div>
                    <div className="text-xs text-[#52606D]">
                      Requested: {apt.preferredDate} ({apt.preferredSlot})
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

                <p className="text-xs text-[#253746]">{apt.purpose}</p>

                {apt.status === 'approved_scheduled' && apt.permissionPassCode && (
                  <div className="rounded border border-[#168B55] bg-[#E8F5EC] p-3.5 text-xs text-[#0A1D2B]">
                    <div className="flex flex-wrap items-center justify-between gap-2 font-bold text-[#168B55]">
                      <span className="inline-flex items-center gap-1.5">
                        <FileCheck2 className="h-4 w-4" />
                        OFFICIAL APPOINTMENT PERMISSION GRANTED
                      </span>
                      <span className="font-mono-tabular text-sm">{apt.permissionPassCode}</span>
                    </div>
                    <div className="mt-1.5 text-[#253746]">
                      <strong>Confirmed Slot:</strong> {apt.scheduledDateTime} ·{' '}
                      <strong>Venue:</strong> {apt.officeLocation}
                    </div>
                    {apt.authorityRemarks && (
                      <div className="mt-1 text-[11px] text-[#52606D]">
                        Remarks: {apt.authorityRemarks} ({apt.decidedByName || 'Authority Office'})
                      </div>
                    )}
                  </div>
                )}

                {apt.status === 'pending_permission' && apt.targetAuthority === 'Local MLA' && (
                  <div>
                    <button
                      type="button"
                      disabled={escalatingAptId === apt.id}
                      onClick={() => handleEscalateMyAppointment(apt.id)}
                      className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded border border-[#BA1A1A] bg-[#FFDAD6] px-3 text-xs font-semibold text-[#BA1A1A]"
                    >
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {escalatingAptId === apt.id
                        ? 'Escalating...'
                        : 'No Response / Urgent Situation? Escalate to CM'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Transparent Local MLA & BBMP Official Work + Public CM Oversight Ledger */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="rounded-lg border border-[#102A43]/15 bg-white civic-shadow-1 lg:col-span-6">
          <div className="border-b border-[#E2E8F0] px-5 py-4">
            <h2 className="font-display text-base font-semibold text-[#0A1D2B]">
              Transparent Local MLA &amp; BBMP Work Roster ({localMlaAndBbmpOfficials.length})
            </h2>
          </div>
          {localMlaAndBbmpOfficials.length === 0 ? (
            <div className="px-5 py-8 text-center text-xs text-[#52606D]">
              All municipal wards are currently monitored by Primary CM Oversight. Newly approved
              Local MLAs &amp; BBMP officers appear here with live metrics.
            </div>
          ) : (
            <div className="divide-y divide-[#E2E8F0]">
              {localMlaAndBbmpOfficials.map((off) => {
                const wardNum = off.wardJurisdiction || 1;
                const wardItems = nonMerged.filter((c) => c.wardNumber === wardNum);
                const verified = wardItems.filter(
                  (c) => c.status === IncidentStatus.Verified
                ).length;
                return (
                  <div key={off.uid} className="flex items-center justify-between px-5 py-3.5 text-xs">
                    <div>
                      <div className="font-semibold text-[#0A1D2B]">{off.displayName}</div>
                      <div className="text-[#52606D]">
                        {off.authorityTier === 'MLA' ? 'Local MLA' : 'BBMP Official'} ·{' '}
                        {off.politicalRole || off.department} · Ward 0{wardNum}
                      </div>
                    </div>
                    <div className="text-right font-mono-tabular">
                      <div className="font-bold text-[#168B55]">
                        {verified}/{wardItems.length} Verified
                      </div>
                      <div className="text-[11px] text-[#52606D]">{off.badgeId}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-[#102A43]/15 bg-white civic-shadow-1 lg:col-span-6">
          <div className="border-b border-[#E2E8F0] px-5 py-4">
            <h2 className="font-display text-base font-semibold text-[#0A1D2B]">
              Live CM Misuse Notifications &amp; Directives ({cmEscalations.length})
            </h2>
          </div>
          {cmEscalations.length === 0 ? (
            <div className="px-5 py-8 text-center text-xs text-[#52606D]">
              <CheckCircle2 className="mx-auto mb-2 h-5 w-5 text-[#168B55]" />
              No active MLA/BBMP misuse alerts escalated to the Chief Minister.
            </div>
          ) : (
            <div className="divide-y divide-[#E2E8F0]">
              {cmEscalations.slice(0, 8).map((esc) => (
                <div key={esc.id} className="px-5 py-3.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[#0A1D2B]">{esc.title}</span>
                    <span className="rounded bg-[#F5F7FA] px-2 py-0.5 font-mono-tabular text-[10px] font-bold uppercase text-[#102A43]">
                      {esc.cmStatus.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-[#52606D]">
                    {esc.targetRole} ({esc.targetOfficialName}) · Ward 0{esc.wardNumber}
                  </div>
                  {esc.cmDirectiveNote && (
                    <div className="mt-1.5 rounded bg-[#E8F5EC] px-2.5 py-1.5 text-[11px] text-[#168B55]">
                      <strong>CM Directive:</strong> {esc.cmDirectiveNote}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
