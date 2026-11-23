import React, { useMemo, useState } from 'react';
import {
  Check,
  LayoutGrid,
  List,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { formatSlaCountdown } from '../data/mockCivicData';
import {
  CivicIncident,
  FieldCrew,
  IncidentCategory,
  IncidentStatus,
  WardSummary,
} from '../types/civic';
import { CategoryIcon, PriorityText, StatusBadge } from './StatusBadge';

interface IncidentsScreenProps {
  incidents: CivicIncident[];
  wards: WardSummary[];
  crews: FieldCrew[];
  selectedWard: number | null;
  onSelectWard: (wardNumber: number | null) => void;
  onInspectIncident: (incidentId: string) => void;
  onBulkUpdateStatus: (ids: string[], status: IncidentStatus) => void;
  onOpenNewIncident: () => void;
}

type StatusTab = 'ALL' | IncidentStatus;
type ViewMode = 'TABLE' | 'CARDS';

export const IncidentsScreen: React.FC<IncidentsScreenProps> = ({
  incidents,
  wards,
  crews,
  selectedWard,
  onSelectWard,
  onInspectIncident,
  onBulkUpdateStatus,
  onOpenNewIncident,
}) => {
  const [statusTab, setStatusTab] = useState<StatusTab>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<ViewMode>('TABLE');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  const counts = useMemo(() => {
    return {
      ALL: incidents.length,
      [IncidentStatus.Submitted]: incidents.filter((i) => i.status === IncidentStatus.Submitted).length,
      [IncidentStatus.InProgress]: incidents.filter((i) => i.status === IncidentStatus.InProgress).length,
      [IncidentStatus.Resolved]: incidents.filter((i) => i.status === IncidentStatus.Resolved).length,
      [IncidentStatus.Disputed]: incidents.filter((i) => i.status === IncidentStatus.Disputed).length,
      [IncidentStatus.Verified]: incidents.filter((i) => i.status === IncidentStatus.Verified).length,
    };
  }, [incidents]);

  const filteredIncidents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return incidents
      .filter((inc) => {
        if (statusTab !== 'ALL' && inc.status !== statusTab) return false;
        if (selectedWard !== null && inc.wardNumber !== selectedWard) return false;
        if (categoryFilter !== 'ALL' && inc.confirmedCategory !== categoryFilter) return false;
        if (q.length > 0) {
          const hay = `${inc.id} ${inc.title} ${inc.address} ${inc.wardName} ${inc.reporterName}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.priorityScore - a.priorityScore);
  }, [incidents, statusTab, selectedWard, categoryFilter, searchQuery]);

  const allFilteredSelected =
    filteredIncidents.length > 0 &&
    filteredIncidents.every((inc) => selectedIds.includes(inc.id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredIncidents.map((i) => i.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const resetAllFilters = () => {
    setStatusTab('ALL');
    setSearchQuery('');
    setCategoryFilter('ALL');
    onSelectWard(null);
  };

  const handleBulkAction = (nextStatus: IncidentStatus) => {
    if (selectedIds.length === 0) return;
    onBulkUpdateStatus(selectedIds, nextStatus);
    setSelectedIds([]);
  };

  const isClosed = (s: IncidentStatus) =>
    s === IncidentStatus.Resolved || s === IncidentStatus.Verified;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-[-0.01em] text-[#0A1D2B] sm:text-[32px] sm:leading-[40px]">
            Incident Ledger &amp; ML Triage
          </h1>
          <p className="mt-1 text-sm text-[#43474D]">
            Sorted by Objective 3 priority score (0–100). Inspect any ticket to upload Objective 4
            before/after resolution evidence.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div
            className="inline-flex rounded border border-[#CBD5E1] bg-white p-0.5"
            role="group"
            aria-label="Ledger display mode"
          >
            <button
              type="button"
              onClick={() => setViewMode('TABLE')}
              className={`inline-flex h-9 items-center gap-1.5 rounded-sm px-3 text-xs font-semibold transition-colors cursor-pointer ${
                viewMode === 'TABLE'
                  ? 'bg-[#102A43] text-white'
                  : 'text-[#43474D] hover:text-[#0A1D2B]'
              }`}
            >
              <List className="h-3.5 w-3.5" aria-hidden="true" />
              Table
            </button>
            <button
              type="button"
              onClick={() => setViewMode('CARDS')}
              className={`inline-flex h-9 items-center gap-1.5 rounded-sm px-3 text-xs font-semibold transition-colors cursor-pointer ${
                viewMode === 'CARDS'
                  ? 'bg-[#102A43] text-white'
                  : 'text-[#43474D] hover:text-[#0A1D2B]'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
              Cards
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-[#102A43]/10 bg-white p-4 civic-shadow-1">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div
              className="flex flex-wrap items-center gap-1 rounded border border-[#E2E8F0] bg-[#F5F7FA] p-1"
              role="tablist"
              aria-label="Filter incidents by status"
            >
              {(
                [
                  { key: 'ALL', label: 'All' },
                  { key: IncidentStatus.Submitted, label: 'Submitted' },
                  { key: IncidentStatus.InProgress, label: 'In-Progress' },
                  { key: IncidentStatus.Resolved, label: 'Resolved' },
                  { key: IncidentStatus.Disputed, label: 'Disputed' },
                  { key: IncidentStatus.Verified, label: 'Verified' },
                ] as const
              ).map((tab) => {
                const active = statusTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setStatusTab(tab.key)}
                    className={`inline-flex h-9 items-center gap-2 rounded px-3 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-[#102A43] text-white'
                        : 'text-[#253746] hover:bg-white hover:text-[#0A1D2B]'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`font-mono-tabular text-[11px] ${
                        active ? 'text-[#B0C9E8]' : 'text-[#52606D]'
                      }`}
                    >
                      {counts[tab.key]}
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setFilterSheetOpen(true)}
              className="inline-flex h-10 items-center gap-2 rounded border border-[#CBD5E1] bg-white px-3.5 text-xs font-semibold text-[#102A43] hover:bg-[#F5F7FA] sm:hidden cursor-pointer"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              Filters
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
            <div className="relative sm:col-span-6">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#52606D]"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by ticket ID, street address, title, or citizen..."
                aria-label="Search municipal incidents"
                className="civic-input h-12 w-full rounded border border-[#CBD5E1] bg-white pl-10 pr-3 text-sm text-[#0A1D2B] placeholder:text-[#74777E]"
              />
            </div>

            <div className="hidden sm:col-span-3 sm:block">
              <select
                value={selectedWard === null ? 'ALL' : String(selectedWard)}
                onChange={(e) =>
                  onSelectWard(e.target.value === 'ALL' ? null : Number(e.target.value))
                }
                aria-label="Filter by municipal ward"
                className="civic-input h-12 w-full rounded border border-[#CBD5E1] bg-white px-3 text-sm text-[#0A1D2B]"
              >
                <option value="ALL">All Wards (01–09)</option>
                {wards.map((w) => (
                  <option key={w.wardNumber} value={w.wardNumber}>
                    Ward 0{w.wardNumber} — {w.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="hidden sm:col-span-3 sm:block">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                aria-label="Filter by infrastructure category"
                className="civic-input h-12 w-full rounded border border-[#CBD5E1] bg-white px-3 text-sm text-[#0A1D2B]"
              >
                <option value="ALL">All NAGRIK Categories</option>
                {Object.values(IncidentCategory).map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-[#102A43] bg-[#ECF4FF] px-4 py-3">
          <div className="text-sm font-semibold text-[#102A43] tabular-nums">
            {selectedIds.length} incident{selectedIds.length === 1 ? '' : 's'} selected
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleBulkAction(IncidentStatus.InProgress)}
              className="h-10 rounded bg-[#F2A541] px-3.5 text-xs font-semibold text-[#102A43] hover:bg-[#e59732] cursor-pointer"
            >
              Dispatch Selected (In-Progress)
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="h-10 rounded border border-[#102A43]/30 bg-white px-3 text-xs font-semibold text-[#253746] hover:bg-[#F5F7FA] cursor-pointer"
            >
              Deselect
            </button>
          </div>
        </div>
      )}

      {filteredIncidents.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-[#102A43]/10 bg-white px-6 py-14 text-center civic-shadow-1">
          <h3 className="font-display text-lg font-semibold text-[#0A1D2B]">
            No matching municipal incidents
          </h3>
          <p className="mt-1 max-w-md text-sm text-[#52606D]">
            Adjust your active ward, status, or keyword filters, or log a new field incident into
            Firestore.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={resetAllFilters}
              className="h-12 rounded border border-[#102A43] px-5 text-sm font-semibold text-[#102A43] hover:bg-[#ECF4FF] cursor-pointer"
            >
              Reset Filters
            </button>
            <button
              type="button"
              onClick={onOpenNewIncident}
              className="h-12 rounded bg-[#102A43] px-5 text-sm font-semibold text-white hover:bg-[#0B1D2F] cursor-pointer"
            >
              Log New Incident
            </button>
          </div>
        </div>
      ) : viewMode === 'TABLE' ? (
        <div className="overflow-hidden rounded-lg border border-[#102A43]/10 bg-white civic-shadow-1">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F7F9FF] text-[11px] font-bold uppercase tracking-[0.04em] text-[#43474D]">
                  <th className="w-12 px-2 py-3 text-center">
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      aria-label={allFilteredSelected ? 'Deselect all' : 'Select all'}
                      className="inline-flex h-10 w-10 items-center justify-center rounded hover:bg-[#E1EFFF] cursor-pointer"
                    >
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded border ${
                          allFilteredSelected
                            ? 'border-[#102A43] bg-[#102A43] text-white'
                            : 'border-[#74777E] bg-white'
                        }`}
                      >
                        {allFilteredSelected && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                      </span>
                    </button>
                  </th>
                  <th className="px-3 py-3 whitespace-nowrap">Ticket ID</th>
                  <th className="px-3 py-3">Incident &amp; Location</th>
                  <th className="px-3 py-3 whitespace-nowrap">Ward</th>
                  <th className="px-3 py-3 whitespace-nowrap">Priority</th>
                  <th className="px-3 py-3 whitespace-nowrap">SLA Timer</th>
                  <th className="px-3 py-3 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] text-sm">
                {filteredIncidents.map((inc) => {
                  const isSelected = selectedIds.includes(inc.id);
                  const isOverdue = !isClosed(inc.status) && inc.slaHoursRemaining < 0;
                  const crew = crews.find((c) => c.id === inc.assignedCrewId);

                  return (
                    <tr
                      key={inc.id}
                      onClick={() => onInspectIncident(inc.id)}
                      className={`cursor-pointer transition-colors hover:bg-[#F7F9FF] ${
                        isSelected ? 'bg-[#ECF4FF]/70' : 'bg-white'
                      }`}
                    >
                      <td
                        className="px-2 py-2 text-center"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelectOne(inc.id);
                        }}
                      >
                        <button
                          type="button"
                          aria-label={`Select ${inc.id}`}
                          className="inline-flex h-11 w-11 items-center justify-center rounded hover:bg-[#E1EFFF] cursor-pointer"
                        >
                          <span
                            className={`flex h-5 w-5 items-center justify-center rounded border ${
                              isSelected
                                ? 'border-[#102A43] bg-[#102A43] text-white'
                                : 'border-[#74777E] bg-white'
                            }`}
                          >
                            {isSelected && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                          </span>
                        </button>
                      </td>
                      <td className="px-3 py-3 font-mono-tabular text-xs font-semibold text-[#102A43] whitespace-nowrap">
                        {inc.id}
                        {inc.isMergedDuplicate && (
                          <div className="text-[10px] font-normal text-[#8A5208]">
                            Merged Duplicate
                          </div>
                        )}
                      </td>
                      <td className="max-w-md px-3 py-3">
                        <div className="flex items-start gap-2.5">
                          <span className="mt-0.5 shrink-0 text-[#102A43]">
                            <CategoryIcon category={inc.confirmedCategory} className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-[#0A1D2B]">
                              {inc.title}
                            </div>
                            <div className="truncate text-xs text-[#52606D]">
                              {inc.address} · Area: {inc.locality} · {crew ? crew.name : 'Unassigned'} · {inc.supportCount}{' '}
                              supports
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 font-mono-tabular text-xs font-semibold text-[#253746] whitespace-nowrap">
                        W0{inc.wardNumber}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <PriorityText priority={inc.priority} />
                          <span className="font-mono-tabular text-[11px] font-bold text-[#102A43]">
                            {inc.priorityScore}
                          </span>
                        </div>
                      </td>
                      <td
                        className={`px-3 py-3 font-mono-tabular text-xs font-semibold whitespace-nowrap ${
                          isOverdue ? 'text-[#BA1A1A]' : 'text-[#253746]'
                        }`}
                      >
                        {formatSlaCountdown(inc.slaHoursRemaining, inc.status)}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <StatusBadge status={inc.status} />
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onInspectIncident(inc.id);
                          }}
                          className="h-9 rounded border border-[#102A43]/25 bg-white px-3 text-xs font-semibold text-[#102A43] hover:bg-[#102A43] hover:text-white cursor-pointer"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredIncidents.map((inc) => {
            const crew = crews.find((c) => c.id === inc.assignedCrewId);
            const isOverdue = !isClosed(inc.status) && inc.slaHoursRemaining < 0;

            return (
              <article
                key={inc.id}
                onClick={() => onInspectIncident(inc.id)}
                className="flex cursor-pointer flex-col justify-between rounded border border-[#102A43]/10 bg-white p-4 civic-shadow-1 transition-colors hover:border-[#102A43]/30"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs text-[#52606D]">
                      <span className="font-mono-tabular font-semibold text-[#102A43]">
                        {inc.id}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>Ward 0{inc.wardNumber}</span>
                    </div>
                    <StatusBadge status={inc.status} />
                  </div>

                  <h3 className="mt-2.5 font-display text-base font-semibold leading-snug text-[#0A1D2B]">
                    {inc.title}
                  </h3>
                  <p className="mt-1 truncate text-xs font-medium text-[#102A43]">
                    {inc.address} · {inc.locality}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-[#43474D]">
                    {inc.description}
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-[#E2E8F0] pt-3 text-xs">
                  <div className="flex min-w-0 items-center gap-2 text-[#253746]">
                    <CategoryIcon
                      category={inc.confirmedCategory}
                      className="h-3.5 w-3.5 shrink-0 text-[#102A43]"
                    />
                    <span className="truncate">{crew ? crew.name : 'Unassigned'}</span>
                  </div>
                  <span
                    className={`shrink-0 whitespace-nowrap font-mono-tabular font-semibold ${
                      isOverdue ? 'text-[#BA1A1A]' : 'text-[#253746]'
                    }`}
                  >
                    {formatSlaCountdown(inc.slaHoursRemaining, inc.status)}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {filterSheetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#102A43]/40 sm:hidden"
          onClick={() => setFilterSheetOpen(false)}
        >
          <div
            className="w-full rounded-t-lg bg-white p-5 civic-shadow-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <h2 className="font-display text-lg font-semibold text-[#0A1D2B]">Filter Ledger</h2>
              <button
                type="button"
                onClick={() => setFilterSheetOpen(false)}
                aria-label="Close filter sheet"
                className="flex h-10 w-10 items-center justify-center rounded text-[#253746]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 flex flex-col gap-4">
              <select
                value={selectedWard === null ? 'ALL' : String(selectedWard)}
                onChange={(e) =>
                  onSelectWard(e.target.value === 'ALL' ? null : Number(e.target.value))
                }
                className="civic-input h-12 w-full rounded border border-[#CBD5E1] bg-white px-3 text-sm"
              >
                <option value="ALL">All Wards (01–09)</option>
                {wards.map((w) => (
                  <option key={w.wardNumber} value={w.wardNumber}>
                    Ward 0{w.wardNumber} — {w.name}
                  </option>
                ))}
              </select>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="civic-input h-12 w-full rounded border border-[#CBD5E1] bg-white px-3 text-sm"
              >
                <option value="ALL">All Categories</option>
                {Object.values(IncidentCategory).map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setFilterSheetOpen(false)}
                className="h-12 w-full rounded bg-[#102A43] text-sm font-semibold text-white"
              >
                Apply Filters ({filteredIncidents.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
