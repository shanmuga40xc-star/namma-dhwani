import React, { useMemo } from 'react';
import { BarChart3, CheckCircle2, IndianRupee, ShieldAlert, ShieldCheck, Users } from 'lucide-react';
import { formatCurrencyCompact } from '../data/mockCivicData';
import {
  AdminRecord,
  CitizenStats,
  CivicActivity,
  CivicIncident,
  CmEscalationAlert,
  IncidentCategory,
  IncidentStatus,
  WardSummary,
} from '../types/civic';

interface PublicAccountabilityDashboardProps {
  complaints: CivicIncident[];
  wards: WardSummary[];
  allStats: CitizenStats[];
  activities: CivicActivity[];
  admins?: AdminRecord[];
  cmEscalations?: CmEscalationAlert[];
}

export const PublicAccountabilityDashboard: React.FC<PublicAccountabilityDashboardProps> = ({
  complaints,
  wards,
  allStats,
  activities,
  admins = [],
  cmEscalations = [],
}) => {
  const nonMerged = useMemo(
    () => complaints.filter((c) => !c.isMergedDuplicate),
    [complaints]
  );

  const verifiedCount = nonMerged.filter((c) => c.status === IncidentStatus.Verified).length;
  const resolvedAwaitingCitizen = nonMerged.filter(
    (c) => c.status === IncidentStatus.Resolved
  ).length;
  const activeOpenCount = nonMerged.filter(
    (c) =>
      c.status === IncidentStatus.Submitted ||
      c.status === IncidentStatus.InProgress ||
      c.status === IncidentStatus.Disputed
  ).length;

  const totalAllocatedInr = wards.reduce((acc, w) => acc + w.allocatedBudgetInr, 0);
  const totalSpentInr = wards.reduce((acc, w) => acc + w.spentBudgetInr, 0);
  const totalVerifiedCivicPoints = allStats.reduce((acc, s) => acc + s.totalPoints, 0);

  const categoryBreakdown = Object.values(IncidentCategory).map((cat) => {
    const items = nonMerged.filter((c) => c.confirmedCategory === cat);
    const verified = items.filter((c) => c.status === IncidentStatus.Verified).length;
    const avgPriority =
      items.length > 0
        ? Math.round(items.reduce((sum, i) => sum + i.priorityScore, 0) / items.length)
        : 0;
    return {
      category: cat,
      total: items.length,
      verified,
      open: items.filter(
        (c) => c.status !== IncidentStatus.Verified && c.status !== IncidentStatus.Resolved
      ).length,
      avgPriority,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-[#102A43]/15 bg-white p-6 civic-shadow-1">
        <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#102A43]">
          Bengaluru Civic Transparency Ledger
        </div>
        <h1 className="mt-1 font-display text-2xl font-semibold text-[#0A1D2B]">
          NAGRIK Public Accountability Dashboard
        </h1>
        <p className="mt-1 text-xs text-[#52606D]">
          Real-time transparency metrics computed strictly from verified Cloud Firestore civic
          complaints, ward INR budgets, and citizen participation records.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded border border-[#102A43]/15 bg-[#F5F7FA] p-4">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase text-[#52606D]">
              <span>Verified Closures</span>
              <CheckCircle2 className="h-4 w-4 text-[#168B55]" />
            </div>
            <div className="mt-1 font-mono-tabular text-2xl font-bold text-[#168B55]">
              {verifiedCount} / {nonMerged.length}
            </div>
            <div className="mt-1 text-[11px] text-[#52606D]">
              {resolvedAwaitingCitizen} awaiting citizen sign-off · {activeOpenCount} active
            </div>
          </div>

          <div className="rounded border border-[#102A43]/15 bg-[#F5F7FA] p-4">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase text-[#52606D]">
              <span>Ward Budgets (INR)</span>
              <IndianRupee className="h-4 w-4 text-[#102A43]" />
            </div>
            <div className="mt-1 font-mono-tabular text-2xl font-bold text-[#102A43]">
              {formatCurrencyCompact(totalAllocatedInr)}
            </div>
            <div className="mt-1 text-[11px] text-[#52606D]">
              Spent: {formatCurrencyCompact(totalSpentInr)}
            </div>
          </div>

          <div className="rounded border border-[#102A43]/15 bg-[#F5F7FA] p-4">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase text-[#52606D]">
              <span>Active Citizens</span>
              <Users className="h-4 w-4 text-[#102A43]" />
            </div>
            <div className="mt-1 font-mono-tabular text-2xl font-bold text-[#0A1D2B]">
              {allStats.length}
            </div>
            <div className="mt-1 text-[11px] text-[#52606D]">
              {totalVerifiedCivicPoints.toLocaleString('en-IN')} verified civic points
            </div>
          </div>

          <div className="rounded border border-[#102A43]/15 bg-[#F5F7FA] p-4">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase text-[#52606D]">
              <span>Locality Civic Drives</span>
              <ShieldCheck className="h-4 w-4 text-[#168B55]" />
            </div>
            <div className="mt-1 font-mono-tabular text-2xl font-bold text-[#0A1D2B]">
              {activities.length}
            </div>
            <div className="mt-1 text-[11px] text-[#52606D]">
              {activities.reduce((sum, a) => sum + a.participantCount, 0)} citizen signups
            </div>
          </div>
        </div>
      </div>

      {/* Category Resolution & Ward Ledger */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="rounded-lg border border-[#102A43]/15 bg-white p-5 civic-shadow-1 lg:col-span-5">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-[#102A43]" />
            <h2 className="font-display text-base font-semibold text-[#0A1D2B]">
              Category Resolution Accountability
            </h2>
          </div>
          <div className="mt-4 flex flex-col gap-3">
            {categoryBreakdown.map((row) => {
              const pct = row.total > 0 ? Math.round((row.verified / row.total) * 100) : 0;
              return (
                <div key={row.category} className="rounded border border-[#E2E8F0] p-3 text-xs">
                  <div className="flex items-center justify-between font-semibold text-[#0A1D2B]">
                    <span>{row.category}</span>
                    <span className="font-mono-tabular text-[#102A43]">
                      {row.verified}/{row.total} verified ({pct}%)
                    </span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#E2E8F0]">
                    <div
                      className="h-full rounded-full bg-[#168B55]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex justify-between text-[11px] text-[#52606D]">
                    <span>Active Open: {row.open}</span>
                    <span>Mean ML Priority: {row.avgPriority}/100</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-lg border border-[#102A43]/15 bg-white civic-shadow-1 lg:col-span-7">
          <div className="border-b border-[#E2E8F0] px-5 py-4">
            <h2 className="font-display text-base font-semibold text-[#0A1D2B]">
              Ward-by-Ward Accountability &amp; Budget Ledger
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#E2E8F0] bg-[#F5F7FA] text-[11px] font-bold uppercase tracking-[0.04em] text-[#52606D]">
                <tr>
                  <th className="px-4 py-3">Ward</th>
                  <th className="px-4 py-3 text-right">Reports</th>
                  <th className="px-4 py-3 text-right">Verified</th>
                  <th className="px-4 py-3 text-right">Allocated (₹)</th>
                  <th className="px-4 py-3 text-right">Spent (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {wards.map((w) => {
                  const wardItems = nonMerged.filter((c) => c.wardNumber === w.wardNumber);
                  const wardVerified = wardItems.filter(
                    (c) => c.status === IncidentStatus.Verified
                  ).length;
                  return (
                    <tr key={w.wardNumber}>
                      <td className="px-4 py-2.5 font-semibold text-[#0A1D2B]">
                        Ward 0{w.wardNumber} — {w.name}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono-tabular">
                        {wardItems.length}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono-tabular font-semibold text-[#168B55]">
                        {wardVerified}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono-tabular">
                        {formatCurrencyCompact(w.allocatedBudgetInr)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono-tabular">
                        {formatCurrencyCompact(w.spentBudgetInr)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Transparent Local MLA & BBMP Performance + Direct CM Misuse Watch */}
      <section className="rounded-lg border border-[#102A43]/15 bg-white civic-shadow-1">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] px-5 py-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-[#BA1A1A]" />
            <h2 className="font-display text-base font-semibold text-[#0A1D2B]">
              Local MLA &amp; BBMP Work Transparency + Direct CM Escalation Ledger
            </h2>
          </div>
          <span className="font-mono-tabular text-xs font-semibold text-[#52606D]">
            Active CM Alerts: {cmEscalations.filter((e) => e.cmStatus !== 'action_taken').length} ·
            Registered Officials: {admins.length}
          </span>
        </div>

        <div className="grid grid-cols-1 divide-y divide-[#E2E8F0] lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          <div className="p-5">
            <h3 className="text-xs font-bold uppercase tracking-[0.04em] text-[#52606D]">
              Categorized Local MLA &amp; BBMP Roster (Strictly Separate From Citizens)
            </h3>
            {admins.length === 0 ? (
              <p className="mt-3 text-xs text-[#52606D]">
                Primary Chief Minister Oversight active. Approved Local MLAs and BBMP officers
                appear here with public accountability metrics.
              </p>
            ) : (
              <div className="mt-3 flex flex-col gap-2">
                {admins.map((a) => {
                  const wardNum = a.wardJurisdiction || 1;
                  const wardItems = nonMerged.filter((c) => c.wardNumber === wardNum);
                  const verified = wardItems.filter(
                    (c) => c.status === IncidentStatus.Verified
                  ).length;
                  const overdue = wardItems.filter(
                    (c) =>
                      c.status !== IncidentStatus.Verified &&
                      c.status !== IncidentStatus.Resolved &&
                      c.slaHoursRemaining < 0
                  ).length;
                  return (
                    <div
                      key={a.uid}
                      className="flex items-center justify-between rounded border border-[#E2E8F0] bg-[#F5F7FA] px-3 py-2.5 text-xs"
                    >
                      <div>
                        <div className="font-semibold text-[#0A1D2B]">
                          {a.displayName}{' '}
                          <span className="text-[11px] font-bold text-[#102A43]">
                            ({a.authorityTier || 'BBMP'})
                          </span>
                        </div>
                        <div className="text-[11px] text-[#52606D]">
                          {a.politicalRole || a.department} · Ward 0{wardNum}
                        </div>
                      </div>
                      <div className="text-right font-mono-tabular">
                        <div className="font-bold text-[#168B55]">
                          {verified}/{wardItems.length} verified
                        </div>
                        {overdue > 0 && (
                          <div className="text-[11px] font-semibold text-[#BA1A1A]">
                            {overdue} SLA breached
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="p-5">
            <h3 className="text-xs font-bold uppercase tracking-[0.04em] text-[#52606D]">
              Recent Direct CM Misuse Alerts &amp; Executive Directives
            </h3>
            {cmEscalations.length === 0 ? (
              <p className="mt-3 text-xs text-[#52606D]">
                No misuse or negligence alerts currently escalated to the Chief Minister.
              </p>
            ) : (
              <div className="mt-3 flex flex-col gap-2">
                {cmEscalations.slice(0, 5).map((esc) => (
                  <div
                    key={esc.id}
                    className="rounded border border-[#E2E8F0] bg-[#F5F7FA] px-3 py-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[#0A1D2B]">{esc.title}</span>
                      <span className="font-mono-tabular text-[10px] font-bold uppercase text-[#BA1A1A]">
                        {esc.cmStatus.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-[#52606D]">
                      Target: {esc.targetRole} ({esc.targetOfficialName}) · Ward 0{esc.wardNumber}
                    </div>
                    {esc.cmDirectiveNote && (
                      <div className="mt-1 text-[11px] font-medium text-[#168B55]">
                        CM Directive: {esc.cmDirectiveNote}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
