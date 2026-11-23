import React from 'react';
import { ArrowUpRight, Radio, RotateCcw, Users } from 'lucide-react';
import { formatCurrencyCompact } from '../data/mockCivicData';
import { CivicIncident, FieldCrew, IncidentStatus, WardSummary } from '../types/civic';

interface WardsScreenProps {
  wards: WardSummary[];
  crews: FieldCrew[];
  incidents: CivicIncident[];
  usingSampleData: boolean;
  onUpdateWardBudget: (
    wardNumber: number,
    updates: { allocatedBudgetInr?: number; spentBudgetInr?: number }
  ) => void;
  onApplyDefaultBudgets: () => void;
  onResetWorkspaceData: () => void;
  onReassignCrewWard: (crewId: string, wardNumber: number) => void;
  onUpdateCrewStatus: (crewId: string, status: FieldCrew['status']) => void;
  onViewWardTickets: (wardNumber: number) => void;
}

export const WardsScreen: React.FC<WardsScreenProps> = ({
  wards,
  crews,
  incidents,
  usingSampleData,
  onUpdateWardBudget,
  onApplyDefaultBudgets,
  onResetWorkspaceData,
  onReassignCrewWard,
  onUpdateCrewStatus,
  onViewWardTickets,
}) => {
  const totalAllocated = wards.reduce((sum, w) => sum + w.allocatedBudgetInr, 0);
  const totalSpent = wards.reduce((sum, w) => sum + w.spentBudgetInr, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-[-0.01em] text-[#0A1D2B] sm:text-[32px] sm:leading-[40px]">
            Ward Allocations &amp; Field Crews
          </h1>
          <p className="mt-1 text-sm text-[#43474D]">
            Configure municipal ward budgets in Indian Rupees (₹), monitor SLA compliance, and assign mobile crews across Wards 01–09.
          </p>
        </div>
        <div className="text-xs font-medium text-[#253746] tabular-nums">
          FY26 Infrastructure Allocation (INR):{' '}
          <span className="font-mono-tabular font-bold text-[#102A43]">
            {formatCurrencyCompact(totalSpent)} / {formatCurrencyCompact(totalAllocated)}
          </span>
        </div>
      </div>

      {/* Ward Governance Table */}
      <section className="overflow-hidden rounded-lg border border-[#102A43]/10 bg-white civic-shadow-1">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] px-5 py-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-[#0A1D2B]">
              Municipal Ward Operations Ledger (INR ₹)
            </h2>
            <p className="text-xs text-[#52606D]">
              Enter allocated and utilized budgets in Indian Rupees (₹) for each ward sector.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onApplyDefaultBudgets}
              className="inline-flex h-9 items-center rounded bg-[#102A43] px-3.5 text-xs font-semibold text-white hover:bg-[#0B1D2F] cursor-pointer whitespace-nowrap shrink-0"
            >
              Apply Sample INR Budgets
            </button>
            <button
              type="button"
              onClick={onResetWorkspaceData}
              className="inline-flex h-9 items-center gap-1.5 rounded border border-[#102A43]/30 bg-white px-3.5 text-xs font-semibold text-[#102A43] hover:bg-[#ECF4FF] cursor-pointer whitespace-nowrap shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Clear to New User State
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[#E2E8F0] bg-[#F7F9FF] text-[11px] font-bold uppercase tracking-[0.04em] text-[#43474D]">
                <th className="px-4 py-3 whitespace-nowrap">Ward</th>
                <th className="px-4 py-3 whitespace-nowrap">Council District</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Population</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Allocated Budget (₹)</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Spent Budget (₹)</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Open / Closed</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">SLA Compliance</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Ledger</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0] text-sm">
              {wards.map((ward) => {
                const wardTickets = incidents.filter((i) => i.wardNumber === ward.wardNumber && !i.isMergedDuplicate);
                const isClosed = (s: IncidentStatus) =>
                  s === IncidentStatus.Resolved || s === IncidentStatus.Verified;
                const openCount = wardTickets.filter((i) => !isClosed(i.status)).length;
                const closedCount = wardTickets.filter((i) => isClosed(i.status)).length;

                const budgetPct =
                  ward.allocatedBudgetInr > 0
                    ? Math.round((ward.spentBudgetInr / ward.allocatedBudgetInr) * 100)
                    : 0;

                let liveWardSla: number | null = null;
                if (usingSampleData && ward.slaCompliancePct !== null) {
                  liveWardSla = ward.slaCompliancePct;
                } else if (wardTickets.length > 0) {
                  const onTrack = wardTickets.filter(
                    (i) => isClosed(i.status) || i.slaHoursRemaining >= 0
                  ).length;
                  liveWardSla = (onTrack / wardTickets.length) * 100;
                }
                const slaHealthy = liveWardSla !== null && liveWardSla >= 90;

                return (
                  <tr key={ward.wardNumber} className="hover:bg-[#F7F9FF]">
                    <td className="px-4 py-3.5">
                      <div className="font-mono-tabular text-xs font-bold text-[#102A43]">
                        WARD 0{ward.wardNumber}
                      </div>
                      <div className="font-semibold text-[#0A1D2B]">{ward.name}</div>
                    </td>
                    <td className="px-4 py-3.5 text-xs font-medium text-[#43474D] whitespace-nowrap">
                      {ward.councilDistrict}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono-tabular text-xs text-[#253746] whitespace-nowrap">
                      {ward.population.toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <span className="text-xs font-semibold text-[#52606D]">₹</span>
                        <input
                          type="number"
                          min={0}
                          step={50000}
                          aria-label={`Ward 0${ward.wardNumber} allocated budget in Indian Rupees`}
                          value={ward.allocatedBudgetInr || ''}
                          placeholder="0"
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value) || 0);
                            onUpdateWardBudget(ward.wardNumber, { allocatedBudgetInr: val });
                          }}
                          className="civic-input h-9 w-28 rounded border border-[#CBD5E1] bg-white px-2 text-right font-mono-tabular text-xs font-semibold text-[#0A1D2B]"
                        />
                      </div>
                      <div className="mt-1 font-mono-tabular text-[11px] text-[#52606D]">
                        {formatCurrencyCompact(ward.allocatedBudgetInr)}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <span className="text-xs font-semibold text-[#52606D]">₹</span>
                        <input
                          type="number"
                          min={0}
                          step={25000}
                          aria-label={`Ward 0${ward.wardNumber} spent budget in Indian Rupees`}
                          value={ward.spentBudgetInr || ''}
                          placeholder="0"
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value) || 0);
                            onUpdateWardBudget(ward.wardNumber, { spentBudgetInr: val });
                          }}
                          className="civic-input h-9 w-28 rounded border border-[#CBD5E1] bg-white px-2 text-right font-mono-tabular text-xs font-semibold text-[#0A1D2B]"
                        />
                      </div>
                      <div className="mt-1 flex items-center justify-end gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[#E2E8F0]">
                          <div
                            className={`h-full ${
                              budgetPct > 100 ? 'bg-[#BA1A1A]' : 'bg-[#102A43]'
                            }`}
                            style={{ width: `${Math.min(100, budgetPct)}%` }}
                          />
                        </div>
                        <span className="font-mono-tabular text-[11px] text-[#52606D]">
                          {formatCurrencyCompact(ward.spentBudgetInr)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono-tabular text-xs whitespace-nowrap">
                      <span className="font-bold text-[#0A1D2B]">{openCount}</span>
                      <span className="text-[#74777E]"> / </span>
                      <span className="font-semibold text-[#168B55]">{closedCount}</span>
                    </td>
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      {liveWardSla === null ? (
                        <span className="inline-flex items-center rounded border border-[#CBD5E1] bg-[#F5F7FA] px-2 py-0.5 font-mono-tabular text-[11px] font-bold text-[#52606D]">
                          —
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center rounded border px-2 py-0.5 font-mono-tabular text-[11px] font-bold ${
                            slaHealthy
                              ? 'border-[#168B55] bg-[#E8F5EC] text-[#168B55]'
                              : 'border-[#F2A541] bg-[#F2A541]/12 text-[#8A5208]'
                          }`}
                        >
                          {liveWardSla.toFixed(1)}%
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onViewWardTickets(ward.wardNumber)}
                        className="inline-flex h-9 items-center gap-1 rounded border border-[#102A43]/25 bg-white px-3 text-xs font-semibold text-[#102A43] hover:bg-[#102A43] hover:text-white cursor-pointer"
                      >
                        Tickets
                        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Field Crew Deployment Roster */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-[#0A1D2B]">
            Active Field Crew Roster &amp; Sector Assignment
          </h2>
          <p className="text-xs text-[#52606D]">
            Reassign mobile units across wards or adjust operational readiness status in real time.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {crews.map((crew) => {
            const assignedTicketsCount = incidents.filter(
              (i) =>
                i.assignedCrewId === crew.id &&
                i.status !== IncidentStatus.Resolved &&
                i.status !== IncidentStatus.Verified
            ).length;
            const loadPct = Math.min(100, Math.round((assignedTicketsCount / crew.maxCapacity) * 100));

            return (
              <div
                key={crew.id}
                className="flex flex-col justify-between rounded border border-[#102A43]/10 bg-white p-4 civic-shadow-1"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-mono-tabular text-[11px] font-bold text-[#52606D]">
                        {crew.id} · {crew.division}
                      </div>
                      <h3 className="mt-0.5 font-display text-base font-semibold text-[#0A1D2B]">
                        {crew.name}
                      </h3>
                    </div>
                    <span
                      className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] whitespace-nowrap shrink-0 ${
                        crew.status === 'FIELD_ACTIVE'
                          ? 'border-[#168B55] bg-[#E8F5EC] text-[#168B55]'
                          : crew.status === 'DISPATCHED'
                            ? 'border-[#F2A541] bg-[#F2A541]/12 text-[#8A5208]'
                            : 'border-[#CBD5E1] bg-[#F5F7FA] text-[#253746]'
                      }`}
                    >
                      {crew.status === 'FIELD_ACTIVE'
                        ? 'Field Active'
                        : crew.status === 'DISPATCHED'
                          ? 'Dispatched'
                          : 'Standby'}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs text-[#43474D]">
                    <span className="inline-flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-[#102A43]" aria-hidden="true" />
                      Lead: {crew.leadOfficer}
                    </span>
                    <span className="inline-flex items-center gap-1 font-mono-tabular">
                      <Radio className="h-3.5 w-3.5 text-[#102A43]" aria-hidden="true" />
                      {crew.radioChannel}
                    </span>
                  </div>

                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#52606D]">Active Ticket Load</span>
                      <span className="font-mono-tabular font-semibold text-[#0A1D2B]">
                        {assignedTicketsCount} / {crew.maxCapacity} slots
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[#E2E8F0]">
                      <div
                        className={`h-full transition-all ${
                          assignedTicketsCount >= crew.maxCapacity
                            ? 'bg-[#BA1A1A]'
                            : assignedTicketsCount >= crew.maxCapacity - 1
                              ? 'bg-[#F2A541]'
                              : 'bg-[#168B55]'
                        }`}
                        style={{ width: `${loadPct}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[#E2E8F0] pt-3">
                  <div>
                    <label
                      htmlFor={`ward-${crew.id}`}
                      className="block text-[10px] font-bold uppercase tracking-[0.04em] text-[#52606D]"
                    >
                      Assigned Sector
                    </label>
                    <select
                      id={`ward-${crew.id}`}
                      value={crew.assignedWardNumber}
                      onChange={(e) => onReassignCrewWard(crew.id, Number(e.target.value))}
                      className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] bg-white px-2 text-xs font-medium text-[#0A1D2B]"
                    >
                      {wards.map((w) => (
                        <option key={w.wardNumber} value={w.wardNumber}>
                          Ward 0{w.wardNumber}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor={`status-${crew.id}`}
                      className="block text-[10px] font-bold uppercase tracking-[0.04em] text-[#52606D]"
                    >
                      Unit Status
                    </label>
                    <select
                      id={`status-${crew.id}`}
                      value={crew.status}
                      onChange={(e) =>
                        onUpdateCrewStatus(crew.id, e.target.value as FieldCrew['status'])
                      }
                      className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] bg-white px-2 text-xs font-medium text-[#0A1D2B]"
                    >
                      <option value="FIELD_ACTIVE">Field Active</option>
                      <option value="DISPATCHED">Dispatched</option>
                      <option value="STANDBY">Standby</option>
                    </select>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
