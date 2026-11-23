import React, { useState } from 'react';
import { ArrowRight, FilterX, Globe2, Grid } from 'lucide-react';
import { formatSlaCountdown } from '../data/mockCivicData';
import {
  CivicIncident,
  FieldCrew,
  IncidentPriority,
  IncidentStatus,
  WardSummary,
} from '../types/civic';
import { CivicIncidentsLiveMap } from './CivicLiveMap';
import { CategoryIcon, PriorityText, StatusBadge } from './StatusBadge';
import { WardSchematicMap } from './WardSchematicMap';

interface OverviewScreenProps {
  incidents: CivicIncident[];
  wards: WardSummary[];
  crews: FieldCrew[];
  selectedWard: number | null;
  onSelectWard: (wardNumber: number | null) => void;
  onInspectIncident: (incidentId: string) => void;
  onNavigateIncidents: () => void;
  onNavigateWards: () => void;
  onOpenNewIncident: () => void;
}

export const OverviewScreen: React.FC<OverviewScreenProps> = ({
  incidents,
  wards,
  crews,
  selectedWard,
  onSelectWard,
  onInspectIncident,
  onNavigateIncidents,
  onNavigateWards,
  onOpenNewIncident,
}) => {
  const [mapMode, setMapMode] = useState<'LIVE_GEO' | 'WARD_SCHEMATIC'>('LIVE_GEO');
  const unmerged = incidents.filter((i) => !i.isMergedDuplicate);
  const isClosed = (s: IncidentStatus) =>
    s === IncidentStatus.Resolved || s === IncidentStatus.Verified;

  const activeIncidents = unmerged.filter((i) => !isClosed(i.status));
  const resolvedIncidents = unmerged.filter((i) => isClosed(i.status));
  const criticalActiveCount = activeIncidents.filter(
    (i) => i.priority === IncidentPriority.Critical
  ).length;
  const atRiskCount = activeIncidents.filter((i) => i.slaHoursRemaining <= 4).length;

  const compliantIncidentsCount = unmerged.filter(
    (i) => isClosed(i.status) || i.slaHoursRemaining >= 0
  ).length;
  const liveSlaCompliance =
    unmerged.length === 0 ? null : (compliantIncidentsCount / unmerged.length) * 100;

  const activeCrewsCount = crews.filter((c) => c.status !== 'STANDBY').length;

  const filteredQueue = activeIncidents
    .filter((i) => (selectedWard === null ? true : i.wardNumber === selectedWard))
    .sort((a, b) => b.priorityScore - a.priorityScore || a.slaHoursRemaining - b.slaHoursRemaining);

  const todaySubmitted = unmerged.length;
  const todayClosed = resolvedIncidents.length;
  const cadenceSeries = [
    { day: 'D-6', submitted: 0, resolved: 0, compliancePct: null as number | null },
    { day: 'D-5', submitted: 0, resolved: 0, compliancePct: null as number | null },
    { day: 'D-4', submitted: 0, resolved: 0, compliancePct: null as number | null },
    { day: 'D-3', submitted: 0, resolved: 0, compliancePct: null as number | null },
    { day: 'D-2', submitted: 0, resolved: 0, compliancePct: null as number | null },
    { day: 'D-1', submitted: 0, resolved: 0, compliancePct: null as number | null },
    {
      day: 'Live',
      submitted: todaySubmitted,
      resolved: todayClosed,
      compliancePct: liveSlaCompliance !== null ? Math.round(liveSlaCompliance) : null,
    },
  ];

  const maxCadenceValue = Math.max(
    1,
    ...cadenceSeries.flatMap((d) => [d.submitted, d.resolved])
  );
  const netBacklog = todaySubmitted - todayClosed;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-[-0.01em] text-[#0A1D2B] sm:text-[32px] sm:leading-[40px]">
            Municipal Operations Overview
          </h1>
          <p className="mt-1 text-sm text-[#43474D]">
            Live Firestore civic intake, ML priority scoring (0–100), ward SLA adherence, and
            citizen-verified closures.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onNavigateWards}
            className="inline-flex h-10 items-center gap-2 rounded border border-[#102A43] bg-transparent px-4 text-sm font-semibold text-[#102A43] transition-colors hover:bg-[#ECF4FF] whitespace-nowrap shrink-0 cursor-pointer"
          >
            Ward Allocations
          </button>
        </div>
      </div>

      {/* 4-Column KPI Summary Strip */}
      <section aria-label="Operational Metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded border border-[#102A43]/10 bg-white p-4 civic-shadow-1">
          <p className="text-xs font-semibold uppercase tracking-[0.04em] text-[#52606D]">
            Active Municipal Tickets
          </p>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="font-display text-3xl font-bold text-[#0A1D2B] tabular-nums">
              {activeIncidents.length}
            </span>
            <span className="text-xs font-medium text-[#253746] tabular-nums">
              {criticalActiveCount} critical
            </span>
          </div>
          <p className="mt-2 border-t border-[#E2E8F0] pt-2 text-xs text-[#52606D]">
            {unmerged.length === 0
              ? 'Clean workspace · 9 wards ready'
              : `Across 9 municipal wards · ${incidents.length - unmerged.length} merged duplicates`}
          </p>
        </div>

        <div className="rounded border border-[#102A43]/10 bg-white p-4 civic-shadow-1">
          <p className="text-xs font-semibold uppercase tracking-[0.04em] text-[#52606D]">
            Live SLA Compliance
          </p>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span
              className={`font-display text-3xl font-bold tabular-nums ${
                liveSlaCompliance === null
                  ? 'text-[#0A1D2B]'
                  : liveSlaCompliance >= 90
                    ? 'text-[#168B55]'
                    : 'text-[#8A5208]'
              }`}
            >
              {liveSlaCompliance === null ? '—' : `${liveSlaCompliance.toFixed(1)}%`}
            </span>
            <span className="text-xs font-semibold text-[#168B55] tabular-nums">
              Target ≥ 90.0%
            </span>
          </div>
          <p className="mt-2 border-t border-[#E2E8F0] pt-2 text-xs text-[#52606D]">
            {unmerged.length === 0
              ? 'Awaiting first citizen or admin incident'
              : 'Statutory response & closure window'}
          </p>
        </div>

        <div className="rounded border border-[#102A43]/10 bg-white p-4 civic-shadow-1">
          <p className="text-xs font-semibold uppercase tracking-[0.04em] text-[#52606D]">
            SLA Escalation Watch
          </p>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span
              className={`font-display text-3xl font-bold tabular-nums ${
                atRiskCount === 0 ? 'text-[#0A1D2B]' : 'text-[#8A5208]'
              }`}
            >
              {atRiskCount}
            </span>
            <span className="text-xs font-semibold text-[#8A5208] tabular-nums">
              ≤ 4.0h remaining
            </span>
          </div>
          <p className="mt-2 border-t border-[#E2E8F0] pt-2 text-xs text-[#52606D]">
            {atRiskCount === 0
              ? 'No overdue or at-risk tickets'
              : 'Requires priority supervisor review'}
          </p>
        </div>

        <div className="rounded border border-[#102A43]/10 bg-white p-4 civic-shadow-1">
          <p className="text-xs font-semibold uppercase tracking-[0.04em] text-[#52606D]">
            Verified &amp; Resolved
          </p>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="font-display text-3xl font-bold text-[#0A1D2B] tabular-nums">
              {resolvedIncidents.length}
            </span>
            <span className="text-xs font-medium text-[#253746] tabular-nums">
              {activeCrewsCount}/{crews.length} crews deployed
            </span>
          </div>
          <p className="mt-2 border-t border-[#E2E8F0] pt-2 text-xs text-[#52606D]">
            {resolvedIncidents.length === 0
              ? 'All field units on standby'
              : 'Backed by AI photo & GPS checks'}
          </p>
        </div>
      </section>

      {/* Main Split: Live Geographical Incident Map + 7-Day SLA Cadence */}
      <section className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12">
        <div className="flex flex-col justify-between rounded-lg border border-[#102A43]/10 bg-white p-5 civic-shadow-1 lg:col-span-7">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-semibold text-[#0A1D2B]">
                {mapMode === 'LIVE_GEO'
                  ? 'Live Geographical Incident Map (Bengaluru)'
                  : 'Ward Sector Density & Active Load'}
              </h2>
              <p className="text-xs text-[#52606D]">
                {mapMode === 'LIVE_GEO'
                  ? 'Interactive map of exact reported spots, areas, and severity pins. Click any pin to inspect.'
                  : 'Select a municipal ward to filter the priority dispatch queue below.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded border border-[#CBD5E1] bg-[#F5F7FA] p-0.5">
                <button
                  type="button"
                  onClick={() => setMapMode('LIVE_GEO')}
                  className={`inline-flex h-7 cursor-pointer items-center gap-1 rounded-sm px-2.5 text-[11px] font-semibold ${
                    mapMode === 'LIVE_GEO'
                      ? 'bg-[#102A43] text-white'
                      : 'text-[#43474D] hover:text-[#0A1D2B]'
                  }`}
                >
                  <Globe2 className="h-3 w-3" />
                  Live Map
                </button>
                <button
                  type="button"
                  onClick={() => setMapMode('WARD_SCHEMATIC')}
                  className={`inline-flex h-7 cursor-pointer items-center gap-1 rounded-sm px-2.5 text-[11px] font-semibold ${
                    mapMode === 'WARD_SCHEMATIC'
                      ? 'bg-[#102A43] text-white'
                      : 'text-[#43474D] hover:text-[#0A1D2B]'
                  }`}
                >
                  <Grid className="h-3 w-3" />
                  Ward Sectors
                </button>
              </div>
              {selectedWard !== null && (
                <button
                  type="button"
                  onClick={() => onSelectWard(null)}
                  className="inline-flex h-8 items-center gap-1.5 rounded border border-[#102A43]/20 bg-[#ECF4FF] px-3 text-xs font-semibold text-[#102A43] transition-colors hover:bg-[#D7EAFE] cursor-pointer"
                >
                  <FilterX className="h-3.5 w-3.5" aria-hidden="true" />
                  Clear Ward 0{selectedWard}
                </button>
              )}
            </div>
          </div>

          {mapMode === 'LIVE_GEO' ? (
            <CivicIncidentsLiveMap
              incidents={incidents}
              selectedWard={selectedWard}
              onSelectIncident={(inc) => onInspectIncident(inc.id)}
              heightClass="h-[340px]"
            />
          ) : (
            <WardSchematicMap
              wards={wards}
              incidents={incidents}
              selectedWard={selectedWard}
              onSelectWard={onSelectWard}
            />
          )}
        </div>

        <div className="flex flex-col justify-between rounded-lg border border-[#102A43]/10 bg-white p-5 civic-shadow-1 lg:col-span-5">
          <div>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="font-display text-lg font-semibold text-[#0A1D2B]">
                  Intake vs. Verified Resolution
                </h2>
                <p className="text-xs text-[#52606D]">
                  Live municipal intake volume paired with verified closures.
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs text-[#43474D]">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-[#102A43]" />
                  Intake
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-[#168B55]" />
                  Resolved
                </span>
              </div>
            </div>

            <div className="mt-6 flex h-48 items-end justify-between gap-2 border-b border-[#E2E8F0] px-1 pb-3">
              {cadenceSeries.map((entry) => {
                const subHeight =
                  entry.submitted === 0
                    ? 2
                    : Math.max(6, Math.round((entry.submitted / maxCadenceValue) * 144));
                const resHeight =
                  entry.resolved === 0
                    ? 2
                    : Math.max(6, Math.round((entry.resolved / maxCadenceValue) * 144));
                return (
                  <div key={entry.day} className="flex flex-1 flex-col items-center gap-2">
                    <div className="flex h-36 items-end gap-1">
                      <div
                        className={`w-3 rounded-t-sm transition-all sm:w-3.5 ${
                          entry.submitted === 0 ? 'bg-[#E2E8F0]' : 'bg-[#102A43]'
                        }`}
                        style={{ height: `${subHeight}px` }}
                      />
                      <div
                        className={`w-3 rounded-t-sm transition-all sm:w-3.5 ${
                          entry.resolved === 0 ? 'bg-[#E2E8F0]' : 'bg-[#168B55]'
                        }`}
                        style={{ height: `${resHeight}px` }}
                      />
                    </div>
                    <div className="text-center">
                      <div className="text-xs font-semibold text-[#253746]">{entry.day}</div>
                      <div className="font-mono-tabular text-[11px] text-[#52606D]">
                        {entry.compliancePct === null ? '—' : `${entry.compliancePct}%`}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 divide-x divide-[#E2E8F0] pt-1 text-center">
            <div className="px-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#52606D]">
                Intake
              </div>
              <div className="mt-0.5 font-mono-tabular text-base font-bold text-[#0A1D2B]">
                {todaySubmitted}
              </div>
            </div>
            <div className="px-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#52606D]">
                Closed
              </div>
              <div className="mt-0.5 font-mono-tabular text-base font-bold text-[#168B55]">
                {todayClosed}
              </div>
            </div>
            <div className="px-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#52606D]">
                Net Open
              </div>
              <div className="mt-0.5 font-mono-tabular text-base font-bold text-[#102A43]">
                {netBacklog}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Priority Dispatch Queue */}
      <section className="rounded-lg border border-[#102A43]/10 bg-white civic-shadow-1">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] px-5 py-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-[#0A1D2B]">
              Priority Dispatch Queue (ML Ranked 0–100)
              {selectedWard !== null ? ` — Ward 0${selectedWard}` : ''}
            </h2>
            <p className="text-xs text-[#52606D]">
              Active civic reports ordered by Objective 3 priority score and remaining SLA window.
            </p>
          </div>
          <button
            type="button"
            onClick={onNavigateIncidents}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#102A43] hover:underline cursor-pointer whitespace-nowrap shrink-0"
          >
            Open Full Incident Ledger
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {filteredQueue.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
            <p className="text-sm font-semibold text-[#0A1D2B]">
              {selectedWard !== null
                ? `No active incidents pending in Ward 0${selectedWard}.`
                : 'Your municipal dispatch queue is currently clear.'}
            </p>
            <p className="mt-1 max-w-md text-xs text-[#52606D]">
              Citizens can submit photo-classified complaints from the Citizen Portal, or you can
              register an administrative ticket directly.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              {selectedWard !== null ? (
                <button
                  type="button"
                  onClick={() => onSelectWard(null)}
                  className="h-10 rounded border border-[#102A43] px-4 text-xs font-semibold text-[#102A43] hover:bg-[#ECF4FF] cursor-pointer"
                >
                  Show All Wards
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onOpenNewIncident}
                  className="h-10 rounded bg-[#102A43] px-4 text-xs font-semibold text-white hover:bg-[#0B1D2F] cursor-pointer"
                >
                  Log First Incident
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="divide-y divide-[#E2E8F0]">
            {filteredQueue.slice(0, 6).map((ticket) => {
              const isOverdue = ticket.slaHoursRemaining < 0;
              const isUrgent = ticket.slaHoursRemaining >= 0 && ticket.slaHoursRemaining <= 4;
              const assignedCrew = crews.find((c) => c.id === ticket.assignedCrewId);

              return (
                <div
                  key={ticket.id}
                  onClick={() => onInspectIncident(ticket.id)}
                  className="flex cursor-pointer flex-col gap-3 px-5 py-3.5 transition-colors hover:bg-[#F7F9FF] sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-start gap-3.5">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded border border-[#102A43]/10 bg-[#F5F7FA] text-[#102A43]">
                      <CategoryIcon category={ticket.confirmedCategory} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[#52606D]">
                        <span className="font-mono-tabular font-semibold text-[#102A43]">
                          {ticket.id}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>Ward 0{ticket.wardNumber}</span>
                        <span aria-hidden="true">·</span>
                        <span>{ticket.confirmedCategory}</span>
                        <span aria-hidden="true">·</span>
                        <PriorityText priority={ticket.priority} />
                        <span className="font-mono-tabular font-bold text-[#102A43]">
                          ({ticket.priorityScore}/100)
                        </span>
                      </div>
                      <h3 className="mt-0.5 truncate text-sm font-semibold text-[#0A1D2B]">
                        {ticket.title}
                      </h3>
                      <p className="mt-0.5 truncate text-xs text-[#43474D]">
                        {ticket.address} · Area: {ticket.locality} ·{' '}
                        {assignedCrew ? `Assigned: ${assignedCrew.name}` : 'Unassigned — awaiting dispatch'}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center justify-between gap-4 sm:justify-end">
                    <div className="text-right">
                      <div
                        className={`font-mono-tabular text-xs font-semibold ${
                          isOverdue
                            ? 'text-[#BA1A1A]'
                            : isUrgent
                              ? 'text-[#8A5208]'
                              : 'text-[#253746]'
                        }`}
                      >
                        {formatSlaCountdown(ticket.slaHoursRemaining, ticket.status)}
                      </div>
                      <div className="text-[11px] text-[#52606D] tabular-nums">
                        {ticket.supportCount} supports · SLA {ticket.slaTargetHours}h
                      </div>
                    </div>

                    <StatusBadge status={ticket.status} />

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onInspectIncident(ticket.id);
                      }}
                      className="h-9 shrink-0 whitespace-nowrap rounded border border-[#102A43]/25 bg-white px-3 text-xs font-semibold text-[#102A43] transition-colors hover:bg-[#102A43] hover:text-white cursor-pointer"
                    >
                      Inspect
                    </button>
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
