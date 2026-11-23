import React, { useEffect, useState } from 'react';
import {
  Award,
  Calendar,
  CheckCircle2,
  Eye,
  EyeOff,
  History,
  Lock,
  MapPin,
  Plus,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import {
  ACHIEVEMENT_LEVEL_META,
  BENGALURU_LOCALITIES,
  NAGRIK_BADGE_CATALOG,
  NAGRIK_POINTS_SCHEDULE,
} from '../data/mockCivicData';
import {
  adminVerifyActivityAttendance,
  createCivicActivity,
  getUserActivityParticipation,
  joinCivicActivity,
  subscribeActivityParticipants,
  updateCitizenPrivacyToggle,
} from '../services/firestoreService';
import {
  CitizenStats,
  CivicActivity,
  CivicActivityParticipant,
  PointTransaction,
  WardSummary,
} from '../types/civic';

interface CitizenProfileParticipationProps {
  uid: string;
  displayName: string;
  isAdmin: boolean;
  stats: CitizenStats | null;
  transactions: PointTransaction[];
  activities: CivicActivity[];
  wards: WardSummary[];
  onShowToast: (msg: string) => void;
}

export const CitizenProfileParticipation: React.FC<CitizenProfileParticipationProps> = ({
  uid,
  displayName,
  isAdmin,
  stats,
  transactions,
  activities,
  wards,
  onShowToast,
}) => {
  const [hideName, setHideName] = useState<boolean>(stats?.hideDisplayName ?? false);
  const [publicName, setPublicName] = useState<string>(stats?.publicDisplayName || displayName);
  const [selectedWard, setSelectedWard] = useState<number>(stats?.wardNumber || 1);
  const [selectedLocality, setSelectedLocality] = useState<string>(
    stats?.locality || BENGALURU_LOCALITIES[0]
  );
  const [savingPrivacy, setSavingPrivacy] = useState(false);

  // Activity participation state
  const [myParticipations, setMyParticipations] = useState<
    Record<string, CivicActivityParticipant | null>
  >({});
  const [joiningId, setJoiningId] = useState<string | null>(null);

  // Admin: Create activity & inspect roster
  const [showCreateAct, setShowCreateAct] = useState(false);
  const [actTitle, setActTitle] = useState('');
  const [actDesc, setActDesc] = useState('');
  const [actWard, setActWard] = useState<number>(1);
  const [actLocality, setActLocality] = useState<string>(BENGALURU_LOCALITIES[0]);
  const [actDate, setActDate] = useState<string>('');
  const [creatingAct, setCreatingAct] = useState(false);

  const [rosterActivity, setRosterActivity] = useState<CivicActivity | null>(null);
  const [rosterParticipants, setRosterParticipants] = useState<CivicActivityParticipant[]>([]);
  const [verifyingUid, setVerifyingUid] = useState<string | null>(null);

  useEffect(() => {
    if (stats) {
      setHideName(stats.hideDisplayName);
      setPublicName(stats.publicDisplayName);
      setSelectedWard(stats.wardNumber);
      setSelectedLocality(stats.locality);
    }
  }, [stats]);

  useEffect(() => {
    let active = true;
    const loadRsvps = async () => {
      const map: Record<string, CivicActivityParticipant | null> = {};
      await Promise.all(
        activities.slice(0, 25).map(async (act) => {
          map[act.id] = await getUserActivityParticipation(act.id, uid);
        })
      );
      if (active) setMyParticipations(map);
    };
    if (activities.length > 0) {
      loadRsvps();
    }
    return () => {
      active = false;
    };
  }, [activities, uid]);

  useEffect(() => {
    if (!rosterActivity || !isAdmin) {
      setRosterParticipants([]);
      return;
    }
    const unsub = subscribeActivityParticipants(rosterActivity.id, setRosterParticipants);
    return () => unsub();
  }, [rosterActivity, isAdmin]);

  const totalPoints = stats?.totalPoints ?? 0;
  const currentTier =
    ACHIEVEMENT_LEVEL_META.find(
      (t) => totalPoints >= t.minPoints && (t.maxPoints === null || totalPoints <= t.maxPoints)
    ) ?? ACHIEVEMENT_LEVEL_META[0];
  const nextTier = ACHIEVEMENT_LEVEL_META.find((t) => t.minPoints > totalPoints) ?? null;
  const progressPct = nextTier
    ? Math.min(
        100,
        Math.round(
          ((totalPoints - currentTier.minPoints) /
            Math.max(1, nextTier.minPoints - currentTier.minPoints)) *
            100
        )
      )
    : 100;

  const earnedBadges = new Set(stats?.badges ?? []);

  const handleSaveProfilePrivacy = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPrivacy(true);
    try {
      await updateCitizenPrivacyToggle({
        uid,
        hideDisplayName: hideName,
        publicDisplayName: publicName,
        wardNumber: selectedWard,
        locality: selectedLocality,
      });
      onShowToast('Civic profile & leaderboard privacy preferences saved.');
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Failed to update privacy settings.');
    } finally {
      setSavingPrivacy(false);
    }
  };

  const handleJoinActivity = async (act: CivicActivity) => {
    setJoiningId(act.id);
    try {
      await joinCivicActivity({
        activityId: act.id,
        uid,
        displayName: publicName || displayName,
      });
      const updated = await getUserActivityParticipation(act.id, uid);
      setMyParticipations((prev) => ({ ...prev, [act.id]: updated }));
      onShowToast(`Registered for "${act.title}" (${act.locality}).`);
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Could not join civic activity.');
    } finally {
      setJoiningId(null);
    }
  };

  const handleCreateActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (actTitle.trim().length < 4 || actDesc.trim().length < 6 || !actDate.trim()) {
      onShowToast('Enter a title, description, and scheduled date for the Bengaluru drive.');
      return;
    }
    setCreatingAct(true);
    try {
      await createCivicActivity({
        title: actTitle,
        description: actDesc,
        wardNumber: actWard,
        locality: actLocality,
        scheduledDate: actDate,
        createdByUid: uid,
      });
      setActTitle('');
      setActDesc('');
      setActDate('');
      setShowCreateAct(false);
      onShowToast('Bengaluru locality civic drive published.');
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Failed to create activity.');
    } finally {
      setCreatingAct(false);
    }
  };

  const handleVerifyAttendance = async (participant: CivicActivityParticipant) => {
    if (!rosterActivity) return;
    setVerifyingUid(participant.uid);
    try {
      await adminVerifyActivityAttendance({
        activity: rosterActivity,
        participant,
        adminUid: uid,
      });
      onShowToast(
        `Verified attendance for ${participant.displayName} (+${NAGRIK_POINTS_SCHEDULE.CIVIC_ACTIVITY_VERIFIED} pts).`
      );
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Attendance verification failed.');
    } finally {
      setVerifyingUid(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header Banner */}
      <section className="rounded-lg border border-[#102A43]/15 bg-white p-6 civic-shadow-1">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#168B55]">
              NAGRIK Citizen Participation &amp; Civic Recognition
            </div>
            <h1 className="mt-1 font-display text-2xl font-semibold text-[#0A1D2B]">
              {stats?.publicDisplayName || displayName} — Verified Civic Profile
            </h1>
            <p className="mt-1 text-xs text-[#52606D]">
              Bengaluru Ward 0{stats?.wardNumber || 1} · {stats?.locality || 'Indiranagar'} · Points
              are awarded exclusively after verification conditions are met.
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-[#102A43]/15 bg-[#F7F9FF] px-4 py-3">
            <Award className="h-8 w-8 text-[#F2A541]" />
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#52606D]">
                Current Achievement Tier
              </div>
              <div className="font-display text-lg font-bold text-[#102A43]">
                {currentTier.level}
              </div>
            </div>
          </div>
        </div>

        {/* Score Metrics Grid */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded border border-[#102A43]/15 bg-[#F5F7FA] p-3.5">
            <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#52606D]">
              Verified Total Score
            </div>
            <div className="mt-1 font-mono-tabular text-2xl font-bold text-[#102A43]">
              {stats?.totalPoints ?? 0} pts
            </div>
          </div>
          <div className="rounded border border-[#E2E8F0] bg-white p-3.5">
            <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#52606D]">
              Monthly / Quarterly / Annual
            </div>
            <div className="mt-1 font-mono-tabular text-sm font-bold text-[#0A1D2B]">
              {stats?.monthlyPoints ?? 0} / {stats?.quarterlyPoints ?? 0} /{' '}
              {stats?.annualPoints ?? 0}
            </div>
          </div>
          <div className="rounded border border-[#E2E8F0] bg-white p-3.5">
            <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#52606D]">
              Verified Resolutions
            </div>
            <div className="mt-1 font-mono-tabular text-2xl font-bold text-[#168B55]">
              {stats?.resolvedCount ?? 0}
            </div>
          </div>
          <div className="rounded border border-[#E2E8F0] bg-white p-3.5">
            <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#52606D]">
              Community Reviews &amp; Drives
            </div>
            <div className="mt-1 font-mono-tabular text-sm font-bold text-[#0A1D2B]">
              {stats?.independentVerificationsCount ?? 0} verif ·{' '}
              {stats?.validDuplicatesCount ?? 0} dup · {stats?.acceptedInfoCount ?? 0} info ·{' '}
              {stats?.activitiesParticipatedCount ?? 0} drives
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-[#253746]">{currentTier.summary}</span>
            <span className="font-mono-tabular font-semibold text-[#102A43]">
              {nextTier
                ? `${nextTier.minPoints - totalPoints} pts to ${nextTier.level}`
                : 'Maximum Platinum Civic Tier Reached'}
            </span>
          </div>
          <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-[#E2E8F0]">
            <div
              className="h-full rounded-full bg-[#168B55] transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </section>

      {/* Achievement Levels + Points Schedule */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="rounded-lg border border-[#102A43]/15 bg-white p-5 civic-shadow-1 lg:col-span-6">
          <h2 className="font-display text-base font-semibold text-[#0A1D2B]">
            Verified Civic Contribution Points Schedule
          </h2>
          <p className="mt-1 text-xs text-[#52606D]">
            Anti-abuse safeguards: duplicate claims, self-support, self-independent verification, and
            merged/duplicate complaint rewards are blocked at database rule level.
          </p>
          <div className="mt-3 divide-y divide-[#E2E8F0] rounded border border-[#E2E8F0] text-xs">
            {[
              ['Successfully resolved & verified complaint', `+${NAGRIK_POINTS_SCHEDULE.RESOLVED_COMPLAINT} pts`],
              ['High-severity verified complaint bonus', `+${NAGRIK_POINTS_SCHEDULE.HIGH_SEVERITY_BONUS} pts`],
              ['Critical-severity verified complaint bonus', `+${NAGRIK_POINTS_SCHEDULE.CRITICAL_SEVERITY_BONUS} pts`],
              ['Independent resolution verification (non-reporter)', `+${NAGRIK_POINTS_SCHEDULE.INDEPENDENT_VERIFICATION} pts`],
              ['Valid duplicate identification (admin confirmed)', `+${NAGRIK_POINTS_SCHEDULE.VALID_DUPLICATE} pts`],
              ['Useful additional information accepted by Admin', `+${NAGRIK_POINTS_SCHEDULE.ACCEPTED_ADDITIONAL_INFO} pts`],
              ['Verified Bengaluru locality activity attendance', `+${NAGRIK_POINTS_SCHEDULE.CIVIC_ACTIVITY_VERIFIED} pts`],
            ].map(([label, pts]) => (
              <div key={label} className="flex items-center justify-between px-3 py-2.5">
                <span className="text-[#253746]">{label}</span>
                <span className="font-mono-tabular font-bold text-[#168B55]">{pts}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Leaderboard Privacy & Locality Preferences */}
        <section className="rounded-lg border border-[#102A43]/15 bg-white p-5 civic-shadow-1 lg:col-span-6">
          <h2 className="font-display text-base font-semibold text-[#0A1D2B]">
            Civic Identity &amp; Leaderboard Privacy Settings
          </h2>
          <form onSubmit={handleSaveProfilePrivacy} className="mt-3 flex flex-col gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-[0.04em] text-[#253746]">
                Public Display Name
              </label>
              <input
                type="text"
                value={publicName}
                onChange={(e) => setPublicName(e.target.value)}
                className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] px-3 text-sm"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-[0.04em] text-[#253746]">
                  Bengaluru Locality
                </label>
                <select
                  value={selectedLocality}
                  onChange={(e) => setSelectedLocality(e.target.value)}
                  className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] bg-white px-3 text-sm"
                >
                  {BENGALURU_LOCALITIES.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-[0.04em] text-[#253746]">
                  Municipal Ward
                </label>
                <select
                  value={selectedWard}
                  onChange={(e) => setSelectedWard(Number(e.target.value))}
                  className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] bg-white px-3 text-sm"
                >
                  {wards.map((w) => (
                    <option key={w.wardNumber} value={w.wardNumber}>
                      Ward 0{w.wardNumber} — {w.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="mt-1 flex cursor-pointer items-center justify-between rounded border border-[#E2E8F0] bg-[#F5F7FA] px-3 py-2.5 text-xs">
              <span className="flex items-center gap-2 font-semibold text-[#0A1D2B]">
                {hideName ? <EyeOff className="h-4 w-4 text-[#102A43]" /> : <Eye className="h-4 w-4 text-[#168B55]" />}
                Hide my public display name on Leaderboard (appear anonymized)
              </span>
              <input
                type="checkbox"
                checked={hideName}
                onChange={(e) => setHideName(e.target.checked)}
                className="h-4 w-4 accent-[#102A43]"
              />
            </label>

            <button
              type="submit"
              disabled={savingPrivacy}
              className="mt-1 inline-flex h-10 items-center justify-center rounded bg-[#102A43] px-4 text-xs font-semibold text-white hover:bg-[#0B1D2F] cursor-pointer disabled:opacity-60"
            >
              {savingPrivacy ? 'Saving Settings...' : 'Save Civic Profile & Privacy'}
            </button>
          </form>
        </section>
      </div>

      {/* 8 Civic Badges + 4 Achievement Tiers */}
      <section className="rounded-lg border border-[#102A43]/15 bg-white p-5 civic-shadow-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base font-semibold text-[#0A1D2B]">
            Achievement Levels &amp; Bengaluru Civic Badges ({earnedBadges.size}/8 Earned)
          </h2>
          <div className="flex flex-wrap gap-2 text-[11px]">
            {ACHIEVEMENT_LEVEL_META.map((tier) => (
              <span
                key={tier.level}
                className={`rounded border px-2.5 py-1 font-semibold ${
                  currentTier.level === tier.level
                    ? 'border-[#102A43] bg-[#102A43] text-white'
                    : 'border-[#CBD5E1] bg-[#F5F7FA] text-[#52606D]'
                }`}
              >
                {tier.level} ({tier.minPoints}
                {tier.maxPoints !== null ? `–${tier.maxPoints}` : '+'})
              </span>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {NAGRIK_BADGE_CATALOG.map((item) => {
            const isEarned = earnedBadges.has(item.badge);
            return (
              <div
                key={item.badge}
                className={`rounded border p-3.5 ${
                  isEarned
                    ? 'border-[#168B55]/50 bg-[#E8F5EC]'
                    : 'border-[#E2E8F0] bg-[#F5F7FA] opacity-80'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#0A1D2B]">{item.badge}</span>
                  {isEarned ? (
                    <Sparkles className="h-4 w-4 text-[#168B55]" />
                  ) : (
                    <Lock className="h-3.5 w-3.5 text-[#74777E]" />
                  )}
                </div>
                <p className="mt-1.5 text-[11px] leading-snug text-[#43474D]">{item.criteria}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Bengaluru Locality Civic Improvement Activities */}
      <section className="rounded-lg border border-[#102A43]/15 bg-white p-5 civic-shadow-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-[#0A1D2B]">
              Bengaluru Locality Civic Improvement Activities ({activities.length})
            </h2>
            <p className="text-xs text-[#52606D]">
              Join neighborhood cleanups, footpath audits, and lake/drain restoration drives.
            </p>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowCreateAct((v) => !v)}
              className="inline-flex h-10 items-center gap-1.5 rounded bg-[#102A43] px-3.5 text-xs font-semibold text-white hover:bg-[#0B1D2F] cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              {showCreateAct ? 'Close Form' : 'Publish Civic Activity'}
            </button>
          )}
        </div>

        {isAdmin && showCreateAct && (
          <form
            onSubmit={handleCreateActivity}
            className="mt-4 grid grid-cols-1 gap-3 rounded border border-[#102A43]/15 bg-[#F7F9FF] p-4 sm:grid-cols-3"
          >
            <input
              type="text"
              value={actTitle}
              onChange={(e) => setActTitle(e.target.value)}
              placeholder="Activity title (e.g., Indiranagar 100ft Rd Footpath Audit)"
              className="civic-input h-10 rounded border border-[#CBD5E1] bg-white px-3 text-xs sm:col-span-2"
            />
            <input
              type="date"
              value={actDate}
              onChange={(e) => setActDate(e.target.value)}
              className="civic-input h-10 rounded border border-[#CBD5E1] bg-white px-3 text-xs"
            />
            <select
              value={actLocality}
              onChange={(e) => setActLocality(e.target.value)}
              className="civic-input h-10 rounded border border-[#CBD5E1] bg-white px-3 text-xs"
            >
              {BENGALURU_LOCALITIES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <select
              value={actWard}
              onChange={(e) => setActWard(Number(e.target.value))}
              className="civic-input h-10 rounded border border-[#CBD5E1] bg-white px-3 text-xs"
            >
              {wards.map((w) => (
                <option key={w.wardNumber} value={w.wardNumber}>
                  Ward 0{w.wardNumber} — {w.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={creatingAct}
              className="h-10 rounded bg-[#168B55] px-4 text-xs font-semibold text-white hover:bg-[#127446] cursor-pointer"
            >
              {creatingAct ? 'Publishing...' : 'Create Bengaluru Drive'}
            </button>
            <textarea
              rows={2}
              value={actDesc}
              onChange={(e) => setActDesc(e.target.value)}
              placeholder="Describe meeting spot, civic objectives, and safety gear..."
              className="civic-input rounded border border-[#CBD5E1] bg-white p-2.5 text-xs sm:col-span-3"
            />
          </form>
        )}

        {activities.length === 0 ? (
          <div className="mt-4 rounded border border-[#E2E8F0] bg-[#F5F7FA] p-6 text-center text-xs text-[#52606D]">
            No locality improvement drives are currently scheduled. Municipal authorities can publish
            upcoming Bengaluru neighborhood drives here.
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            {activities.map((act) => {
              const myRsvp = myParticipations[act.id];
              return (
                <div
                  key={act.id}
                  className="flex flex-col justify-between rounded border border-[#E2E8F0] bg-[#F5F7FA] p-4"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 text-[11px] font-bold uppercase text-[#102A43]">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {act.locality} (Ward 0{act.wardNumber})
                      </span>
                      <span className="inline-flex items-center gap-1 font-mono-tabular text-[#52606D]">
                        <Calendar className="h-3.5 w-3.5" />
                        {act.scheduledDate}
                      </span>
                    </div>
                    <h3 className="mt-1.5 font-display text-sm font-semibold text-[#0A1D2B]">
                      {act.title}
                    </h3>
                    <p className="mt-1 text-xs text-[#43474D]">{act.description}</p>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#E2E8F0] pt-3">
                    <span className="inline-flex items-center gap-1 font-mono-tabular text-xs font-semibold text-[#253746]">
                      <Users className="h-3.5 w-3.5" />
                      {act.participantCount} joined
                    </span>

                    <div className="flex items-center gap-2">
                      {myRsvp ? (
                        <span
                          className={`inline-flex h-8 items-center gap-1 rounded px-2.5 text-[11px] font-semibold ${
                            myRsvp.attendanceVerified
                              ? 'bg-[#E8F5EC] text-[#168B55]'
                              : 'bg-white text-[#102A43] border border-[#CBD5E1]'
                          }`}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {myRsvp.attendanceVerified ? 'Attendance Verified (+10 pts)' : 'Registered'}
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={joiningId === act.id || act.status !== 'upcoming'}
                          onClick={() => handleJoinActivity(act)}
                          className="inline-flex h-8 items-center rounded bg-[#102A43] px-3 text-xs font-semibold text-white hover:bg-[#0B1D2F] cursor-pointer disabled:opacity-50"
                        >
                          {joiningId === act.id ? 'Joining...' : 'Join Civic Drive'}
                        </button>
                      )}

                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() =>
                            setRosterActivity((cur) => (cur?.id === act.id ? null : act))
                          }
                          className="inline-flex h-8 items-center gap-1 rounded border border-[#102A43] bg-white px-2.5 text-[11px] font-semibold text-[#102A43] cursor-pointer"
                        >
                          <ShieldCheck className="h-3.5 w-3.5" />
                          Verify Roster
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Admin Attendance Roster Verification */}
        {isAdmin && rosterActivity && (
          <div className="mt-4 rounded border border-[#102A43]/20 bg-[#F7F9FF] p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-[0.04em] text-[#102A43]">
                Attendance Roster — {rosterActivity.title}
              </h3>
              <button
                type="button"
                onClick={() => setRosterActivity(null)}
                className="text-xs font-semibold text-[#52606D] underline cursor-pointer"
              >
                Close
              </button>
            </div>
            {rosterParticipants.length === 0 ? (
              <p className="mt-2 text-xs text-[#52606D]">No citizens registered yet.</p>
            ) : (
              <div className="mt-2 divide-y divide-[#E2E8F0] rounded border border-[#E2E8F0] bg-white">
                {rosterParticipants.map((p) => (
                  <div
                    key={p.uid}
                    className="flex items-center justify-between px-3 py-2 text-xs"
                  >
                    <div>
                      <span className="font-semibold text-[#0A1D2B]">{p.displayName}</span>
                      <span className="ml-2 font-mono-tabular text-[11px] text-[#52606D]">
                        Joined {p.createdAt}
                      </span>
                    </div>
                    {p.attendanceVerified ? (
                      <span className="font-semibold text-[#168B55]">Verified (+10 pts)</span>
                    ) : (
                      <button
                        type="button"
                        disabled={verifyingUid === p.uid}
                        onClick={() => handleVerifyAttendance(p)}
                        className="rounded bg-[#168B55] px-2.5 py-1 text-[11px] font-semibold text-white cursor-pointer"
                      >
                        {verifyingUid === p.uid ? 'Verifying...' : 'Confirm Attendance (+10 pts)'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Complete Points Transaction History */}
      <section className="rounded-lg border border-[#102A43]/15 bg-white civic-shadow-1">
        <div className="flex items-center justify-between border-b border-[#E2E8F0] px-5 py-4">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-[#102A43]" />
            <h2 className="font-display text-base font-semibold text-[#0A1D2B]">
              Verified Points Transaction History ({transactions.length})
            </h2>
          </div>
        </div>

        {transactions.length === 0 ? (
          <div className="px-6 py-8 text-center text-xs text-[#52606D]">
            No verified point transactions recorded yet. Submit a civic report and confirm its
            resolution—or contribute independent verifications and accepted context—to build your
            verified score.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#E2E8F0] bg-[#F5F7FA] text-[11px] font-bold uppercase tracking-[0.04em] text-[#52606D]">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Action Type</th>
                  <th className="px-4 py-3">Description &amp; Reference</th>
                  <th className="px-4 py-3">Period</th>
                  <th className="px-4 py-3 text-right">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td className="px-4 py-3 font-mono-tabular text-[#52606D]">{tx.createdAt}</td>
                    <td className="px-4 py-3 font-semibold text-[#102A43]">{tx.actionType}</td>
                    <td className="px-4 py-3 text-[#253746]">{tx.description}</td>
                    <td className="px-4 py-3 font-mono-tabular text-[#52606D]">{tx.monthKey}</td>
                    <td className="px-4 py-3 text-right font-mono-tabular font-bold text-[#168B55]">
                      +{tx.points}
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
