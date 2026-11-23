import React, { useMemo, useState } from 'react';
import { Award, EyeOff, Medal, Trophy } from 'lucide-react';
import { BENGALURU_LOCALITIES } from '../data/mockCivicData';
import {
  AdminRecord,
  CitizenStats,
  CivicIncident,
  IncidentCategory,
  IncidentStatus,
  LeaderboardScope,
  WardSummary,
} from '../types/civic';

interface LeaderboardScreenProps {
  currentUid: string;
  allStats: CitizenStats[];
  wards: WardSummary[];
  complaints?: CivicIncident[];
  admins?: AdminRecord[];
}

interface LeaderboardEntry extends CitizenStats {
  submittedCount: number;
  municipalResolvedCount: number;
  citizenVerifiedCount: number;
}

const SCOPE_OPTIONS: Array<{ id: LeaderboardScope; label: string }> = [
  { id: 'overall', label: 'Bengaluru Overall' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'quarterly', label: 'Quarterly' },
  { id: 'annual', label: 'Annual' },
  { id: 'locality', label: 'Locality-wise' },
  { id: 'ward', label: 'Ward-wise' },
  { id: 'category', label: 'Category-wise' },
];

export const LeaderboardScreen: React.FC<LeaderboardScreenProps> = ({
  currentUid,
  allStats,
  wards,
  complaints = [],
  admins = [],
}) => {
  const [scope, setScope] = useState<LeaderboardScope>('overall');
  const [selectedLocality, setSelectedLocality] = useState<string>(BENGALURU_LOCALITIES[0]);
  const [selectedWard, setSelectedWard] = useState<number>(1);
  const [selectedCategory, setSelectedCategory] = useState<IncidentCategory>(
    IncidentCategory.Potholes
  );

  const adminUidSet = useMemo(() => new Set(admins.map((a) => a.uid)), [admins]);

  const mergedEntries = useMemo<LeaderboardEntry[]>(() => {
    const activityByUid = new Map<
      string,
      {
        reporterName: string;
        wardNumber: number;
        locality: string;
        submittedCount: number;
        municipalResolvedCount: number;
        citizenVerifiedCount: number;
      }
    >();

    complaints.forEach((c) => {
      if (c.isMergedDuplicate || !c.reporterUid || adminUidSet.has(c.reporterUid)) {
        return;
      }
      const prev = activityByUid.get(c.reporterUid) || {
        reporterName: c.reporterName || 'Bengaluru Citizen',
        wardNumber: c.wardNumber || 1,
        locality: c.locality || 'Indiranagar',
        submittedCount: 0,
        municipalResolvedCount: 0,
        citizenVerifiedCount: 0,
      };
      prev.submittedCount += 1;
      if (
        c.status === IncidentStatus.Resolved ||
        c.status === IncidentStatus.Verified
      ) {
        prev.municipalResolvedCount += 1;
      }
      if (c.status === IncidentStatus.Verified) {
        prev.citizenVerifiedCount += 1;
      }
      activityByUid.set(c.reporterUid, prev);
    });

    const entryMap = new Map<string, LeaderboardEntry>();

    allStats.forEach((s) => {
      if (adminUidSet.has(s.uid)) return;
      const act = activityByUid.get(s.uid);
      entryMap.set(s.uid, {
        ...s,
        resolvedCount: Math.max(s.resolvedCount, act?.citizenVerifiedCount ?? 0),
        submittedCount: act?.submittedCount ?? 0,
        municipalResolvedCount: Math.max(
          s.resolvedCount,
          act?.municipalResolvedCount ?? 0
        ),
        citizenVerifiedCount: Math.max(
          s.resolvedCount,
          act?.citizenVerifiedCount ?? 0
        ),
      });
    });

    activityByUid.forEach((act, uid) => {
      if (entryMap.has(uid)) return;
      entryMap.set(uid, {
        uid,
        publicDisplayName: act.reporterName,
        hideDisplayName: false,
        wardNumber: act.wardNumber,
        locality: act.locality,
        totalPoints: 0,
        monthlyPoints: 0,
        quarterlyPoints: 0,
        annualPoints: 0,
        resolvedCount: act.citizenVerifiedCount,
        highSeverityCount: 0,
        criticalSeverityCount: 0,
        independentVerificationsCount: 0,
        validDuplicatesCount: 0,
        acceptedInfoCount: 0,
        activitiesParticipatedCount: 0,
        potholesResolved: 0,
        garbageResolved: 0,
        waterResolved: 0,
        streetlightsResolved: 0,
        achievementLevel: 'Bronze Citizen',
        badges: [],
        updatedAt: 'Live',
        submittedCount: act.submittedCount,
        municipalResolvedCount: act.municipalResolvedCount,
        citizenVerifiedCount: act.citizenVerifiedCount,
      });
    });

    return Array.from(entryMap.values());
  }, [allStats, complaints, adminUidSet]);

  const availableLocalities = useMemo(() => {
    const set = new Set<string>(BENGALURU_LOCALITIES);
    mergedEntries.forEach((s) => {
      if (s.locality) set.add(s.locality);
    });
    return Array.from(set);
  }, [mergedEntries]);

  const verifiedWardsAvailable = useMemo(() => {
    const wardSet = new Set<number>();
    mergedEntries.forEach((s) => {
      if (
        (s.resolvedCount > 0 || s.municipalResolvedCount > 0 || s.submittedCount > 0) &&
        s.wardNumber >= 1
      ) {
        wardSet.add(s.wardNumber);
      }
    });
    return wards.filter((w) => wardSet.has(w.wardNumber));
  }, [mergedEntries, wards]);

  const getMetricScore = (s: LeaderboardEntry): number => {
    switch (scope) {
      case 'monthly':
        return s.monthlyPoints;
      case 'quarterly':
        return s.quarterlyPoints;
      case 'annual':
        return s.annualPoints;
      case 'category':
        if (selectedCategory === IncidentCategory.Potholes) return s.potholesResolved;
        if (selectedCategory === IncidentCategory.GarbageAccumulation) return s.garbageResolved;
        if (selectedCategory === IncidentCategory.WaterLeakage) return s.waterResolved;
        return s.streetlightsResolved;
      default:
        return s.totalPoints;
    }
  };

  const rankedList = useMemo(() => {
    let filtered = [...mergedEntries];
    if (scope === 'locality') {
      filtered = filtered.filter(
        (s) => s.locality.toLowerCase() === selectedLocality.toLowerCase()
      );
    } else if (scope === 'ward') {
      filtered = filtered.filter((s) => s.wardNumber === selectedWard);
    } else if (scope === 'category') {
      filtered = filtered.filter((s) => getMetricScore(s) > 0);
    }

    return filtered.sort((a, b) => {
      const diff = getMetricScore(b) - getMetricScore(a);
      if (diff !== 0) return diff;
      const verDiff = b.citizenVerifiedCount - a.citizenVerifiedCount;
      if (verDiff !== 0) return verDiff;
      const munDiff = b.municipalResolvedCount - a.municipalResolvedCount;
      if (munDiff !== 0) return munDiff;
      return b.submittedCount - a.submittedCount;
    });
  }, [mergedEntries, scope, selectedLocality, selectedWard, selectedCategory]);

  const formatPublicCitizenName = (s: LeaderboardEntry): string => {
    if (s.hideDisplayName) {
      return `Civic Contributor #${s.uid.slice(0, 5).toUpperCase()}`;
    }
    return s.publicDisplayName;
  };

  const metricLabel =
    scope === 'category'
      ? `${selectedCategory} Resolved`
      : scope === 'monthly'
        ? 'Monthly Pts'
        : scope === 'quarterly'
          ? 'Quarterly Pts'
          : scope === 'annual'
            ? 'Annual Pts'
            : 'Verified Pts';

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-[#102A43]/15 bg-white p-6 civic-shadow-1">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#102A43]">
              NAGRIK Public Civic Recognition
            </div>
            <h1 className="mt-1 font-display text-2xl font-semibold text-[#0A1D2B]">
              Bengaluru Citizen Leaderboard
            </h1>
            <p className="mt-1 text-xs text-[#52606D]">
              Rankings combine verified Firestore civic points with citizen-confirmed and municipal
              resolutions. Officials &amp; politicians are excluded.
            </p>
          </div>
          <div className="rounded border border-[#E2E8F0] bg-[#F5F7FA] px-3.5 py-2 text-xs text-[#253746]">
            Active Citizens:{' '}
            <span className="font-mono-tabular font-bold text-[#102A43]">
              {mergedEntries.length}
            </span>
          </div>
        </div>

        {/* 7 Ranking Category Tabs */}
        <div className="mt-5 flex flex-wrap gap-2">
          {SCOPE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setScope(opt.id)}
              className={`h-10 rounded px-3.5 text-xs font-semibold transition-colors cursor-pointer ${
                scope === opt.id
                  ? 'bg-[#102A43] text-white'
                  : 'border border-[#CBD5E1] bg-white text-[#253746] hover:bg-[#ECF4FF]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Sub-filters */}
        {scope === 'locality' && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="text-xs font-bold uppercase text-[#52606D]">
              Select Bengaluru Locality:
            </label>
            <select
              value={selectedLocality}
              onChange={(e) => setSelectedLocality(e.target.value)}
              className="civic-input h-10 rounded border border-[#CBD5E1] bg-white px-3 text-xs font-semibold"
            >
              {availableLocalities.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>
        )}

        {scope === 'ward' && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {verifiedWardsAvailable.length === 0 ? (
              <div className="rounded border border-[#F2A541] bg-[#FEF5E7] px-3 py-2 text-xs text-[#8A5208]">
                Ward-wise ranking activates automatically once ward citizen reports or resolutions
                are recorded.
              </div>
            ) : (
              <>
                <label className="text-xs font-bold uppercase text-[#52606D]">
                  Select Active Ward:
                </label>
                <select
                  value={selectedWard}
                  onChange={(e) => setSelectedWard(Number(e.target.value))}
                  className="civic-input h-10 rounded border border-[#CBD5E1] bg-white px-3 text-xs font-semibold"
                >
                  {verifiedWardsAvailable.map((w) => (
                    <option key={w.wardNumber} value={w.wardNumber}>
                      Ward 0{w.wardNumber} — {w.name}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        )}

        {scope === 'category' && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {Object.values(IncidentCategory).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`h-9 rounded px-3 text-xs font-semibold cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-[#168B55] text-white'
                    : 'border border-[#CBD5E1] bg-[#F5F7FA] text-[#253746]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Top 3 Podium */}
      {rankedList.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {rankedList.slice(0, 3).map((entry, idx) => {
            const isMe = entry.uid === currentUid;
            return (
              <div
                key={entry.uid}
                className={`rounded-lg border p-5 civic-shadow-1 ${
                  idx === 0
                    ? 'border-[#F2A541] bg-[#FFFDF7]'
                    : 'border-[#102A43]/15 bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 font-mono-tabular text-xs font-bold uppercase text-[#102A43]">
                    {idx === 0 ? (
                      <Trophy className="h-4 w-4 text-[#F2A541]" />
                    ) : (
                      <Medal className="h-4 w-4 text-[#52606D]" />
                    )}
                    Rank #{idx + 1}
                  </span>
                  <span className="rounded bg-[#ECF4FF] px-2 py-0.5 text-[11px] font-semibold text-[#102A43]">
                    {entry.achievementLevel}
                  </span>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <span className="font-display text-lg font-bold text-[#0A1D2B]">
                    {formatPublicCitizenName(entry)}
                  </span>
                  {entry.hideDisplayName && (
                    <EyeOff className="h-3.5 w-3.5 text-[#52606D]" aria-label="Anonymous" />
                  )}
                  {isMe && (
                    <span className="rounded bg-[#168B55] px-1.5 py-0.5 text-[10px] font-bold text-white">
                      YOU
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-[#52606D]">
                  {entry.locality} · Ward 0{entry.wardNumber}
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-[#E2E8F0] pt-3">
                  <div>
                    <div className="text-[10px] text-[#52606D]">{metricLabel}</div>
                    <div className="font-mono-tabular text-lg font-bold text-[#168B55]">
                      {getMetricScore(entry)}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-[10px] text-[#52606D]">Submitted</div>
                    <div className="font-mono-tabular text-sm font-bold text-[#102A43]">
                      {entry.submittedCount}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-[#52606D]">Resolved</div>
                    <div className="font-mono-tabular text-sm font-bold text-[#0A1D2B]">
                      {entry.municipalResolvedCount}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full Leaderboard Table */}
      <section className="rounded-lg border border-[#102A43]/15 bg-white civic-shadow-1">
        <div className="border-b border-[#E2E8F0] px-5 py-4">
          <h2 className="font-display text-base font-semibold text-[#0A1D2B]">
            Full Citizen Rankings ({rankedList.length})
          </h2>
        </div>

        {rankedList.length === 0 ? (
          <div className="px-6 py-10 text-center text-xs text-[#52606D]">
            No citizen records match this leaderboard filter yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#E2E8F0] bg-[#F5F7FA] text-[11px] font-bold uppercase tracking-[0.04em] text-[#52606D]">
                <tr>
                  <th className="px-4 py-3">Rank</th>
                  <th className="px-4 py-3">Citizen</th>
                  <th className="px-4 py-3">Locality &amp; Ward</th>
                  <th className="px-4 py-3">Achievement Level</th>
                  <th className="px-4 py-3">Badges</th>
                  <th className="px-4 py-3 text-right">Submitted</th>
                  <th className="px-4 py-3 text-right">Municipal Resolved</th>
                  <th className="px-4 py-3 text-right">Citizen Verified</th>
                  <th className="px-4 py-3 text-right">{metricLabel}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {rankedList.map((entry, idx) => (
                  <tr
                    key={entry.uid}
                    className={entry.uid === currentUid ? 'bg-[#F7F9FF]' : 'bg-white'}
                  >
                    <td className="px-4 py-3 font-mono-tabular font-bold text-[#102A43]">
                      #{idx + 1}
                    </td>
                    <td className="px-4 py-3 font-semibold text-[#0A1D2B]">
                      {formatPublicCitizenName(entry)}
                      {entry.uid === currentUid && (
                        <span className="ml-2 rounded bg-[#168B55] px-1.5 py-0.5 text-[10px] font-bold text-white">
                          YOU
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#43474D]">
                      {entry.locality} (Ward 0{entry.wardNumber})
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 rounded border border-[#CBD5E1] bg-[#F5F7FA] px-2 py-0.5 font-semibold text-[#102A43]">
                        <Award className="h-3 w-3 text-[#F2A541]" />
                        {entry.achievementLevel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#43474D]">
                      {entry.badges.length > 0 ? entry.badges.slice(0, 3).join(', ') : '—'}
                      {entry.badges.length > 3 ? ` +${entry.badges.length - 3}` : ''}
                    </td>
                    <td className="px-4 py-3 text-right font-mono-tabular font-semibold text-[#253746]">
                      {entry.submittedCount}
                    </td>
                    <td className="px-4 py-3 text-right font-mono-tabular font-semibold text-[#102A43]">
                      {entry.municipalResolvedCount}
                    </td>
                    <td className="px-4 py-3 text-right font-mono-tabular font-semibold text-[#0A1D2B]">
                      {entry.citizenVerifiedCount}
                    </td>
                    <td className="px-4 py-3 text-right font-mono-tabular font-bold text-[#168B55]">
                      {getMetricScore(entry)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

