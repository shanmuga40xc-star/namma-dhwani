import { AlertOctagon, LocateFixed, Lock, Mail, MapPin, PhoneCall, Search, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { KARNATAKA_BOUNDS } from '@shared/constants';
import { isInsideKarnataka, lookupConstituency } from '@shared/geo';
import { UI_STRINGS } from '@shared/i18n';
import type {
  ConstituencyBoundary,
  SeriousConcern,
  SupportedLanguage,
} from '@shared/types';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { requestBestCurrentPosition } from '../utils/gps';

interface SeriousConcernModalProps {
  open: boolean;
  onClose: () => void;
  language: SupportedLanguage;
  constituencies: ConstituencyBoundary[];
  cmOfficeEmail?: string;
  demoMode?: boolean;
  onSubmitted: (msg: string) => void;
}

export const SeriousConcernModal: React.FC<SeriousConcernModalProps> = ({
  open,
  onClose,
  language,
  constituencies,
  cmOfficeEmail,
  demoMode,
  onSubmitted,
}) => {
  const t = UI_STRINGS[language] || UI_STRINGS.en;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [concernType, setConcernType] =
    useState<SeriousConcern['concernType']>('corruption');
  const [directToCm, setDirectToCm] = useState(true);
  const [isAnonymous, setIsAnonymous] = useState(false);

  const [lat, setLat] = useState<number>(KARNATAKA_BOUNDS.centerLat);
  const [lng, setLng] = useState<number>(KARNATAKA_BOUNDS.centerLng);
  const [localityName, setLocalityName] = useState('Bengaluru');
  const [gpsBusy, setGpsBusy] = useState(false);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeResults, setPlaceResults] = useState<
    Array<{ label: string; lat: number; lng: number; locality: string }>
  >([]);
  const [placeSearching, setPlaceSearching] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentConfirmation, setSentConfirmation] = useState<{
    message: string;
    mailtoHref?: string;
    cmEmail?: string;
  } | null>(null);

  function detectLocation(userInitiated = false) {
    setGpsBusy(true);
    if (userInitiated) {
      setLocationNotice('Detecting your current GPS location...');
    }
    const { promise } = requestBestCurrentPosition({
      onRefine: async (fix) => {
        if (isInsideKarnataka(fix.lat, fix.lng)) {
          setLat(fix.lat);
          setLng(fix.lng);
        }
      },
    });

    void promise.then(async (outcome) => {
      setGpsBusy(false);
      if (!outcome.ok) {
        if (userInitiated || outcome.reason === 'permission_denied') {
          setLocationNotice(outcome.message);
        }
        return;
      }

      const { fix } = outcome;
      if (isInsideKarnataka(fix.lat, fix.lng)) {
        setLat(fix.lat);
        setLng(fix.lng);
        try {
          const resp = await fetch(`/api/maps/reverse-geocode?lat=${fix.lat}&lng=${fix.lng}`);
          const data = (await resp.json()) as { localityName?: string };
          setLocalityName(data.localityName || 'Karnataka');
        } catch {
          setLocalityName('Karnataka');
        }
        if (userInitiated || fix.isLowAccuracy) {
          setLocationNotice(
            fix.isLowAccuracy
              ? `Approximate location detected (±${fix.accuracyMeters}m). Search your locality below if needed.`
              : `Karnataka GPS location detected (±${fix.accuracyMeters}m).`
          );
        }
      } else if (userInitiated) {
        setLocationNotice(
          'Your device GPS appears outside Karnataka. Search any city or town in Karnataka below or keep Bengaluru.'
        );
      }
    });
  }

  async function searchKarnatakaLocality() {
    const q = placeQuery.trim();
    if (q.length < 2) return;
    setPlaceSearching(true);
    setLocationNotice(null);
    try {
      const resp = await fetch(`/api/maps/search?q=${encodeURIComponent(q)}`);
      const data = (await resp.json()) as {
        results?: Array<{ label: string; lat: number; lng: number; locality: string }>;
      };
      const items = Array.isArray(data.results) ? data.results : [];
      setPlaceResults(items);
      if (items.length === 0) {
        setLocationNotice(`No Karnataka places found for "${q}".`);
      }
    } catch {
      setLocationNotice('Locality search unavailable right now.');
    } finally {
      setPlaceSearching(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    setError(null);
    setLocationNotice(null);
    setPlaceResults([]);
    setSentConfirmation(null);
    detectLocation(false);
  }, [open]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;
    if (title.trim().length < 3 || description.trim().length < 6) {
      setError('Please enter a brief title and description.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const safeLat = isInsideKarnataka(lat, lng) ? lat : KARNATAKA_BOUNDS.centerLat;
      const safeLng = isInsideKarnataka(lat, lng) ? lng : KARNATAKA_BOUNDS.centerLng;
      const match = lookupConstituency(safeLat, safeLng, constituencies);
      const matchedConst = match.constituency;
      const cleanArea = (localityName || 'Karnataka').trim();
      const areaSlug =
        cleanArea
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') || 'karnataka';

      // CM Office direct submissions NEVER block when area boundaries aren't loaded yet!
      const constituencyId =
        matchedConst?.id || (directToCm ? 'cm-office-direct' : `karnataka-${areaSlug}-desk`);
      const constituencyName =
        matchedConst?.name ||
        (directToCm ? `${cleanArea}, Karnataka (Direct to CM Office)` : `${cleanArea}, Karnataka`);
      const targetMlaName = directToCm
        ? 'CM Office (Direct Escalation)'
        : matchedConst?.mlaName || `${cleanArea} Civic & MLA Desk`;

      const now = new Date().toISOString();
      const id = `sc-${Date.now()}`;
      let translated = description.trim();
      if (language !== 'en') {
        try {
          const token = await user.getIdToken();
          const trResp = await fetch('/api/ai/translate', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ text: description.trim(), sourceLanguage: language }),
          });
          const trData = (await trResp.json()) as { englishTranslation?: string };
          translated = trData.englishTranslation || description.trim();
        } catch {
          translated = description.trim();
        }
      }

      const concern: SeriousConcern = {
        id,
        title: title.trim(),
        description: description.trim(),
        originalLanguage: language,
        englishTranslation: translated,
        concernType,
        latitude: safeLat,
        longitude: safeLng,
        localityName: localityName || 'Bengaluru',
        constituencyId,
        constituencyName,
        targetMlaName,
        directToCm,
        isAnonymous,
        reporterUid: user.uid,
        status: 'Submitted privately',
        lastChangedBy: isAnonymous ? 'Anonymous citizen' : user.displayName || 'Citizen',
        createdAt: now,
        updatedAt: now,
      };

      await setDoc(doc(db, 'seriousConcerns', id), concern);

      // Log CM / MLA Office dispatch notice when sending directly to CM or official email is configured
      const targetEmail = directToCm
        ? cmOfficeEmail || (demoMode ? 'cm-demo@example.com' : '')
        : matchedConst?.mlaOfficeEmail || '';

      if (targetEmail) {
        const dlogId = `dlog-${Date.now()}`;
        await setDoc(doc(db, 'demoEmailLogs', dlogId), {
          id: dlogId,
          recipientEmail: targetEmail,
          subject: `[URGENT PRIVATE CONCERN] ${title.trim()} (${localityName})`,
          previewText: `Type: ${concernType} | Area: ${localityName}, ${constituencyName} | Confidentially submitted via Namma Dhwani Citizen Portal.`,
          relatedId: id,
          createdAt: now,
        }).catch(() => null);
      }

      const successMsg = directToCm
        ? 'Private concern sent directly to CM Office portal inbox. It will never appear publicly.'
        : `Private concern sent confidentially to ${targetMlaName}.`;

      onSubmitted(successMsg);

      const cleanCmEmail = directToCm && cmOfficeEmail && !cmOfficeEmail.endsWith('@example.com')
        ? cmOfficeEmail
        : '';

      if (cleanCmEmail) {
        const subject = encodeURIComponent(`[Namma Dhwani Urgent Concern] ${title.trim()} — ${localityName}`);
        const body = encodeURIComponent(
          `Concern Type: ${concernType}\nArea: ${localityName} (${constituencyName})\nReference ID: ${id}\n\n${translated}`
        );
        setSentConfirmation({
          message: successMsg,
          cmEmail: cleanCmEmail,
          mailtoHref: `mailto:${cleanCmEmail}?subject=${subject}&body=${body}`,
        });
      } else {
        setTitle('');
        setDescription('');
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send private concern.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F2942]/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Private serious concern submission"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-[#0F2942]" />
            <h2 className="font-display text-lg font-bold text-[#0F2942]">
              Private Serious Concern / CM Office Escalation
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 112 emergency banner */}
        <div className="flex items-center gap-3 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          <PhoneCall className="h-5 w-5 shrink-0 text-red-700" />
          <div>
            <div className="font-bold">{t.emergencyBanner}</div>
            <div className="text-xs text-red-800">
              For immediate danger, crime in progress, or medical emergency, call <strong>112</strong>{' '}
              first. Use this form to confidentially report to the CM Office or MLA Office.
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-700 border border-slate-200">
          <AlertOctagon className="h-4 w-4 shrink-0 text-[#0F2942] mt-0.5" />
          <span>
            Private concerns are <strong>never shown</strong> on the Public Feed, Public Map,
            Rankings, or Nearby Issues list.
          </span>
        </div>

        {error && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
            {error}
          </div>
        )}

        {sentConfirmation ? (
          <div className="space-y-4 rounded-xl border-2 border-[#15803D] bg-emerald-50 p-4">
            <div className="text-sm font-bold text-[#0F2942]">{sentConfirmation.message}</div>
            {sentConfirmation.mailtoHref && (
              <div className="space-y-2">
                <p className="text-xs text-slate-700">
                  You can also email the configured CM Office address directly from your mail app:
                </p>
                <a
                  href={sentConfirmation.mailtoHref}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#0F2942] px-4 py-2.5 text-xs font-bold text-white"
                >
                  <Mail className="h-4 w-4 text-[#E67E22]" />
                  <span>Email CM Office ({sentConfirmation.cmEmail})</span>
                </a>
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                setTitle('');
                setDescription('');
                setSentConfirmation(null);
                onClose();
              }}
              className="w-full rounded-xl border border-slate-300 bg-white py-2.5 text-xs font-bold text-[#0F2942]"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
            {/* Location Picker for Serious Concern */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#0F2942]">
                  <MapPin className="h-4 w-4 text-[#E67E22]" />
                  <span>Karnataka Location: {localityName}</span>
                </div>
                <button
                  type="button"
                  disabled={gpsBusy}
                  onClick={() => detectLocation(true)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-[#0F2942]"
                >
                  <LocateFixed className="h-3.5 w-3.5 text-[#E67E22]" />
                  <span>{gpsBusy ? 'Locating...' : 'Detect GPS'}</span>
                </button>
              </div>
              <div className="flex gap-1.5">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={placeQuery}
                    onChange={(e) => setPlaceQuery(e.target.value)}
                    placeholder="Optional: search any city or locality in Karnataka..."
                    className="w-full rounded-lg border border-slate-300 bg-white pl-8 pr-2.5 py-1.5 text-xs"
                  />
                </div>
                <button
                  type="button"
                  disabled={placeSearching || placeQuery.trim().length < 2}
                  onClick={() => void searchKarnatakaLocality()}
                  className="rounded-lg bg-[#0F2942] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
                >
                  {placeSearching ? '...' : 'Set'}
                </button>
              </div>
              {placeResults.length > 0 && (
                <div className="max-h-24 overflow-y-auto rounded border border-slate-200 bg-white divide-y divide-slate-100">
                  {placeResults.map((r, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setLat(Number(r.lat.toFixed(6)));
                        setLng(Number(r.lng.toFixed(6)));
                        setLocalityName(r.locality);
                        setPlaceResults([]);
                        setLocationNotice(`Area set to ${r.locality}`);
                      }}
                      className="w-full px-2.5 py-1.5 text-left text-[11px] hover:bg-amber-50"
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              )}
              {locationNotice && (
                <div className="text-[11px] text-amber-900">{locationNotice}</div>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                Concern type
              </label>
              <select
                value={concernType}
                onChange={(e) => setConcernType(e.target.value as SeriousConcern['concernType'])}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
              >
                <option value="corruption">Corruption or bribery demand</option>
                <option value="safety_threat">Safety risk or intimidation</option>
                <option value="official_misconduct">Official misconduct or negligence</option>
                <option value="urgent_hazard">Critical hazardous condition</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                Title
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Short summary of the concern"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                What happened?
              </label>
              <textarea
                rows={4}
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Include names, dates, or office location if safe to share."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <label className="flex items-start gap-2 rounded-xl border border-purple-200 bg-purple-50/70 p-3 text-sm text-slate-800">
              <input
                type="checkbox"
                checked={directToCm}
                onChange={(e) => setDirectToCm(e.target.checked)}
                className="mt-1"
              />
              <span>
                Send directly to <strong>CM Office</strong> (recommended for urgent safety,
                corruption, or if the concern involves the local MLA office)
              </span>
            </label>

            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={isAnonymous}
                onChange={(e) => setIsAnonymous(e.target.checked)}
              />
              <span>Hide my identity from reviewing staff</span>
            </label>

            <button
              type="submit"
              disabled={busy}
              className="w-full min-h-[48px] rounded-xl bg-[#0F2942] px-4 py-3 text-sm font-bold text-white hover:bg-[#173A5E] disabled:opacity-50"
            >
              {busy
                ? 'Sending privately...'
                : directToCm
                  ? 'Send Directly to CM Office'
                  : 'Send Private Concern'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
