import React, { useState } from 'react';
import { CheckCircle2, HeartHandshake, ShieldCheck, XCircle } from 'lucide-react';
import { decideAdminRequest, grantWelfareOfficerRole } from '../services/firestoreService';
import { AdminRecord, AdminRequest, WelfareOfficerRecord } from '../types/civic';

interface AdminAccessScreenProps {
  requests: AdminRequest[];
  admins: AdminRecord[];
  welfareOfficers: WelfareOfficerRecord[];
  onShowToast: (msg: string) => void;
}

export const AdminAccessScreen: React.FC<AdminAccessScreenProps> = ({
  requests,
  admins,
  welfareOfficers,
  onShowToast,
}) => {
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [woUid, setWoUid] = useState('');
  const [woName, setWoName] = useState('');
  const [woDept, setWoDept] = useState('NAGRIK Social Welfare & Scholarships');
  const [woBadge, setWoBadge] = useState('');
  const [grantingWo, setGrantingWo] = useState(false);

  const handleDecision = async (req: AdminRequest, decision: 'approved' | 'rejected') => {
    setBusyUid(req.uid);
    try {
      await decideAdminRequest(req, decision);
      onShowToast(
        decision === 'approved'
          ? `Approved Admin Authority access for ${req.displayName}.`
          : `Rejected Admin Authority request for ${req.displayName}.`
      );
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Failed to process request.');
    } finally {
      setBusyUid(null);
    }
  };

  const handleGrantWelfareOfficer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!woUid.trim() || !woName.trim() || !woBadge.trim()) {
      onShowToast('Enter the verified user UID, officer name, and badge ID.');
      return;
    }
    setGrantingWo(true);
    try {
      await grantWelfareOfficerRole({
        uid: woUid.trim(),
        displayName: woName.trim(),
        department: woDept.trim() || 'Welfare Governance',
        badgeId: woBadge.trim(),
      });
      onShowToast(`Granted Welfare Officer role to ${woName.trim()}.`);
      setWoUid('');
      setWoName('');
      setWoBadge('');
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Failed to grant Welfare Officer role.');
    } finally {
      setGrantingWo(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-[-0.01em] text-[#0A1D2B] sm:text-[32px] sm:leading-[40px]">
          Admin Authority &amp; Welfare Officer Governance
        </h1>
        <p className="mt-1 text-sm text-[#43474D]">
          Approve department officer requests, designate Welfare Officers for the NAGRIK Citizen
          Impact &amp; Welfare Portal, and audit authority rosters.
        </p>
      </div>

      <section className="rounded-lg border border-[#102A43]/10 bg-white civic-shadow-1">
        <div className="border-b border-[#E2E8F0] px-5 py-4">
          <h2 className="font-display text-lg font-semibold text-[#0A1D2B]">
            Credential Approval Requests ({requests.length})
          </h2>
        </div>

        {requests.length === 0 ? (
          <div className="px-6 py-10 text-center text-xs text-[#52606D]">
            No pending or historical authority access requests.
          </div>
        ) : (
          <div className="divide-y divide-[#E2E8F0]">
            {requests.map((r) => (
              <div
                key={r.uid}
                className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[#0A1D2B]">{r.displayName}</span>
                    {r.authorityTier && (
                      <span
                        className={`rounded px-2 py-0.5 font-mono-tabular text-[10px] font-bold uppercase ${
                          r.authorityTier === 'CM'
                            ? 'bg-[#BA1A1A] text-white'
                            : r.authorityTier === 'MLA'
                              ? 'bg-[#102A43] text-[#F2A541]'
                              : 'bg-[#ECF4FF] text-[#102A43]'
                        }`}
                      >
                        {r.authorityTier === 'CM'
                          ? 'CM Oversight'
                          : r.authorityTier === 'MLA'
                            ? 'Local MLA'
                            : 'BBMP Official'}
                      </span>
                    )}
                    <span className="rounded border border-[#CBD5E1] bg-[#F5F7FA] px-2 py-0.5 font-mono-tabular text-[10px] font-bold uppercase text-[#253746]">
                      {r.status}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-[#52606D]">
                    {r.politicalRole ? (
                      <>
                        <span className="font-semibold text-[#102A43]">{r.politicalRole}</span> ·{' '}
                        Political ID:{' '}
                        <span className="font-mono-tabular font-semibold text-[#0A1D2B]">
                          {r.politicalIdNumber || 'N/A'}
                        </span>{' '}
                        · {r.constituency || 'Constituency N/A'} ({r.partyOrBody || 'Body N/A'})
                        <br />
                      </>
                    ) : null}
                    {r.department} · Badge ID:{' '}
                    <span className="font-mono-tabular font-semibold">{r.badgeId}</span> · Ward 0
                    {r.wardJurisdiction}
                    {r.aadhaarLast4 ? (
                      <>
                        {' '}
                        · Aadhaar KYC:{' '}
                        <span className="font-mono-tabular font-semibold text-[#168B55]">
                          XXXX-{r.aadhaarLast4}
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>

                {r.status === 'pending' && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busyUid === r.uid}
                      onClick={() => handleDecision(r, 'approved')}
                      className="inline-flex h-10 items-center gap-1.5 rounded bg-[#168B55] px-3.5 text-xs font-semibold text-white hover:bg-[#127446] cursor-pointer"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Approve Authority
                    </button>
                    <button
                      type="button"
                      disabled={busyUid === r.uid}
                      onClick={() => handleDecision(r, 'rejected')}
                      className="inline-flex h-10 items-center gap-1.5 rounded border border-[#BA1A1A] bg-[#FFDAD6] px-3.5 text-xs font-semibold text-[#BA1A1A] cursor-pointer"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Designate Welfare Officers */}
      <section className="rounded-lg border border-[#102A43]/10 bg-white p-5 civic-shadow-1">
        <div className="flex items-center gap-2">
          <HeartHandshake className="h-5 w-5 text-[#102A43]" />
          <h2 className="font-display text-lg font-semibold text-[#0A1D2B]">
            Welfare Officers Registry ({welfareOfficers.length})
          </h2>
        </div>
        <p className="mt-1 text-xs text-[#52606D]">
          Designated Welfare Officers can configure welfare programmes, evaluate applications, and
          record authorized disbursements (Admin Authority accounts already have full access).
        </p>

        <form
          onSubmit={handleGrantWelfareOfficer}
          className="mt-4 grid grid-cols-1 gap-3 rounded border border-[#E2E8F0] bg-[#F5F7FA] p-4 text-xs sm:grid-cols-4"
        >
          <input
            type="text"
            value={woUid}
            onChange={(e) => setWoUid(e.target.value)}
            placeholder="Verified Firebase User UID *"
            className="civic-input h-10 rounded border border-[#CBD5E1] bg-white px-3 font-mono-tabular"
          />
          <input
            type="text"
            value={woName}
            onChange={(e) => setWoName(e.target.value)}
            placeholder="Officer Full Name *"
            className="civic-input h-10 rounded border border-[#CBD5E1] bg-white px-3"
          />
          <input
            type="text"
            value={woBadge}
            onChange={(e) => setWoBadge(e.target.value)}
            placeholder="Badge / Officer ID *"
            className="civic-input h-10 rounded border border-[#CBD5E1] bg-white px-3"
          />
          <button
            type="submit"
            disabled={grantingWo}
            className="h-10 rounded bg-[#102A43] px-4 font-semibold text-white cursor-pointer"
          >
            {grantingWo ? 'Assigning...' : 'Grant Welfare Officer'}
          </button>
          <input
            type="text"
            value={woDept}
            onChange={(e) => setWoDept(e.target.value)}
            placeholder="Department"
            className="civic-input h-9 rounded border border-[#CBD5E1] bg-white px-3 sm:col-span-4"
          />
        </form>

        {welfareOfficers.length > 0 && (
          <div className="mt-3 divide-y divide-[#E2E8F0] rounded border border-[#E2E8F0]">
            {welfareOfficers.map((wo) => (
              <div key={wo.uid} className="flex items-center justify-between px-4 py-3 text-xs">
                <div>
                  <div className="font-semibold text-[#0A1D2B]">{wo.displayName}</div>
                  <div className="text-[#52606D]">
                    {wo.department} · Badge <span className="font-mono-tabular">{wo.badgeId}</span>{' '}
                    · UID <span className="font-mono-tabular">{wo.uid}</span>
                  </div>
                </div>
                <span className="font-mono-tabular text-[#52606D]">{wo.createdAt}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-[#102A43]/10 bg-white civic-shadow-1">
        <div className="border-b border-[#E2E8F0] px-5 py-4">
          <h2 className="font-display text-lg font-semibold text-[#0A1D2B]">
            Approved Authority Officers ({admins.length})
          </h2>
        </div>
        {admins.length === 0 ? (
          <div className="px-6 py-8 text-center text-xs text-[#52606D]">
            Only primary supervisor bootstrap credentials are currently active.
          </div>
        ) : (
          <div className="divide-y divide-[#E2E8F0]">
            {admins.map((a) => (
              <div key={a.uid} className="flex items-center justify-between px-5 py-3.5 text-xs">
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="h-4 w-4 text-[#168B55]" />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-[#0A1D2B]">{a.displayName}</span>
                      <span
                        className={`rounded px-2 py-0.5 font-mono-tabular text-[10px] font-bold uppercase ${
                          a.authorityTier === 'CM'
                            ? 'bg-[#BA1A1A] text-white'
                            : a.authorityTier === 'MLA'
                              ? 'bg-[#102A43] text-[#F2A541]'
                              : 'bg-[#ECF4FF] text-[#102A43]'
                        }`}
                      >
                        {a.authorityTier || 'BBMP'}
                      </span>
                    </div>
                    <div className="text-[#52606D]">
                      {a.politicalRole ? `${a.politicalRole} (${a.politicalIdNumber || ''}) · ` : ''}
                      {a.department} · Badge <span className="font-mono-tabular">{a.badgeId}</span>
                      {a.constituency ? ` · ${a.constituency}` : ''}
                      {a.wardJurisdiction ? ` · Ward 0${a.wardJurisdiction}` : ''}
                    </div>
                  </div>
                </div>
                <span className="font-mono-tabular text-[#52606D]">{a.createdAt}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

