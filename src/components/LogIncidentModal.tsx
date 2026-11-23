import React, { useState } from 'react';
import { Camera, Compass, X } from 'lucide-react';
import { BENGALURU_WARD_COORDS } from '../data/mockCivicData';
import {
  classifyCivicPhoto,
  scoreComplaintPriority,
  type ClassifyApiResponse,
} from '../services/aiClient';
import { createComplaintInFirestore } from '../services/firestoreService';
import {
  buildCompleteLocationString,
  reverseGeocodeSpot,
  type ReverseGeocodeResult,
} from '../services/mapsClient';
import {
  IncidentCategory,
  SeverityLevel,
  SlaPolicyRule,
  WardSummary,
} from '../types/civic';
import { compressImageFileToDataUrl } from '../utils/imageCompression';
import { CivicSpotPickerMap } from './CivicLiveMap';

interface LogIncidentModalProps {
  isOpen: boolean;
  wards: WardSummary[];
  policies: SlaPolicyRule[];
  actorUid: string;
  actorName: string;
  onClose: () => void;
  onSubmitted: (complaintId: string) => void;
}

const CATEGORIES = Object.values(IncidentCategory);
const SEVERITIES: SeverityLevel[] = ['Low', 'Medium', 'High', 'Critical'];

export const LogIncidentModal: React.FC<LogIncidentModalProps> = ({
  isOpen,
  wards,
  policies,
  actorUid,
  actorName,
  onClose,
  onSubmitted,
}) => {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<IncidentCategory>(IncidentCategory.Potholes);
  const [severity, setSeverity] = useState<SeverityLevel>('High');
  const [wardNumber, setWardNumber] = useState<number>(1);
  const [locality, setLocality] = useState<string>('Bengaluru');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState<number>(12.9716);
  const [longitude, setLongitude] = useState<number>(77.5946);
  const [resolvedGeo, setResolvedGeo] = useState<ReverseGeocodeResult | null>(null);
  const [description, setDescription] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState('');
  const [aiClassify, setAiClassify] = useState<ClassifyApiResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!isOpen) return null;

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await compressImageFileToDataUrl(file);
    setPhotoDataUrl(compressed);
    const res = await classifyCivicPhoto(compressed, `${title} ${description}`);
    setAiClassify(res);
    setCategory(res.predicted_category);
    setSeverity(res.predicted_severity);
  };

  const applyResolvedSpot = (
    coords: { lat: number; lng: number },
    resolved?: ReverseGeocodeResult
  ) => {
    setLatitude(coords.lat);
    setLongitude(coords.lng);
    if (resolved) {
      setResolvedGeo(resolved);
      if (resolved.area || resolved.matchedLocality) {
        setLocality(resolved.area || resolved.matchedLocality);
      }
      if (resolved.matchedWardNumber) {
        setWardNumber(resolved.matchedWardNumber);
      }
      const composed = buildCompleteLocationString({
        specificSpot: resolved.specificSpot,
        formattedAddress: resolved.formattedAddress,
        area: resolved.area,
      });
      if (composed) {
        setAddress(composed);
        if (errors.address) setErrors((prev) => ({ ...prev, address: '' }));
      }
    }
  };

  const handleCaptureGps = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        setLatitude(lat);
        setLongitude(lng);
        try {
          const geo = await reverseGeocodeSpot(lat, lng);
          applyResolvedSpot({ lat, lng }, geo);
        } catch {
          // keep coordinates
        }
      },
      () => {
        // Keep existing Bengaluru ward coordinates if iframe blocks geolocation
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const validateAndSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};

    if (title.trim().length < 4) {
      nextErrors.title = 'Enter a concise incident headline (minimum 4 characters).';
    }
    if (address.trim().length < 3) {
      nextErrors.address = 'Provide a verified street address or intersection.';
    }
    if (description.trim().length < 6) {
      nextErrors.description = 'Include field observations (minimum 6 characters).';
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    try {
      const wardObj = wards.find((w) => w.wardNumber === wardNumber) ?? wards[0];
      const policy = policies.find((p) => p.category === category);
      const slaTargetHours = policy?.resolutionTargetHours ?? 24;
      const newId = `INC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 8999)}`;

      const priorityResp = await scoreComplaintPriority({
        severity,
        category,
        unique_supports: 0,
        age_hours: 0,
        locality: wardObj.name,
        duplicate_count: 0,
      });

      const predictedCat = aiClassify?.predicted_category ?? category;
      const predictedSev = aiClassify?.predicted_severity ?? severity;

      await createComplaintInFirestore({
        id: newId,
        title: title.trim(),
        description: description.trim(),
        locality: (resolvedGeo?.area || locality || wardObj.name).slice(0, 120),
        address: address.trim(),
        wardNumber: wardObj.wardNumber,
        wardName: wardObj.name,
        latitude,
        longitude,
        reporterUid: actorUid,
        reporterName: actorName,
        aiPredictedCategory: predictedCat,
        aiCategoryConfidence: aiClassify?.confidence ?? 0.42,
        confirmedCategory: category,
        categoryCorrectedByCitizen: Boolean(aiClassify && predictedCat !== category),
        aiPredictedSeverity: predictedSev,
        confirmedSeverity: severity,
        severityCorrectedByHuman: Boolean(aiClassify && predictedSev !== severity),
        aiSource: aiClassify?.ai_source ?? 'fallback_rule_based',
        priorityScore: priorityResp.priority_score,
        priorityTier: priorityResp.priority_tier,
        prioritySource: priorityResp.scoring_source,
        priorityFactors: priorityResp.influencing_factors,
        photoDataUrl: photoDataUrl || undefined,
        slaTargetHours,
      });

      onSubmitted(newId);
      setTitle('');
      setAddress('');
      setDescription('');
      setPhotoDataUrl('');
      setAiClassify(null);
      setErrors({});
      onClose();
    } catch (err) {
      setErrors({
        submit: err instanceof Error ? err.message : 'Failed to log incident to Firestore.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#102A43]/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="log-incident-heading"
    >
      <div
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white civic-shadow-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#E2E8F0] bg-[#F7F9FF] px-6 py-4">
          <div>
            <h2
              id="log-incident-heading"
              className="font-display text-xl font-semibold text-[#0A1D2B]"
            >
              Register Municipal Incident
            </h2>
            <p className="text-xs text-[#52606D]">
              Direct Firestore intake with Objective 1 AI photo classifier &amp; Objective 3 priority
              scoring.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close registration modal"
            className="flex h-10 w-10 items-center justify-center rounded border border-[#CBD5E1] bg-white text-[#253746] hover:bg-[#F5F7FA] cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={validateAndSubmit} className="flex-1 overflow-y-auto px-6 py-5" noValidate>
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-[#CBD5E1] bg-[#F7F9FF] p-3">
              <div className="text-xs text-[#253746]">
                <strong>Site Photo (Optional AI Classification)</strong>
                {aiClassify && (
                  <div className="mt-0.5 text-[11px] text-[#168B55]">
                    AI Suggested: {aiClassify.predicted_category} (
                    {Math.round(aiClassify.confidence * 100)}%) · {aiClassify.predicted_severity}
                  </div>
                )}
              </div>
              <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded bg-[#102A43] px-3 text-xs font-semibold text-white">
                <Camera className="h-4 w-4" />
                {photoDataUrl ? 'Replace Photo' : 'Attach Photo'}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </label>
            </div>

            <div>
              <label
                htmlFor="inc-title"
                className="block text-xs font-bold uppercase tracking-[0.04em] text-[#253746]"
              >
                Incident Headline *
              </label>
              <input
                id="inc-title"
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (errors.title) setErrors({ ...errors, title: '' });
                }}
                placeholder="e.g., Water leakage near main arterial junction"
                className={`civic-input mt-1.5 h-12 w-full rounded border border-[#CBD5E1] bg-white px-3 text-sm ${
                  errors.title ? 'civic-input-error' : ''
                }`}
              />
              {errors.title && (
                <p className="mt-1 text-xs font-medium text-[#BA1A1A]">{errors.title}</p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-[0.04em] text-[#253746]">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as IncidentCategory)}
                  className="civic-input mt-1.5 h-12 w-full rounded border border-[#CBD5E1] bg-white px-3 text-sm"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-[0.04em] text-[#253746]">
                  Severity
                </label>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as SeverityLevel)}
                  className="civic-input mt-1.5 h-12 w-full rounded border border-[#CBD5E1] bg-white px-3 text-sm"
                >
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-[0.04em] text-[#253746]">
                  Municipal Ward
                </label>
                <select
                  value={wardNumber}
                  onChange={(e) => {
                    const nextW = Number(e.target.value);
                    setWardNumber(nextW);
                    const c = BENGALURU_WARD_COORDS[nextW];
                    if (c) {
                      setLatitude(c.lat);
                      setLongitude(c.lng);
                    }
                  }}
                  className="civic-input mt-1.5 h-12 w-full rounded border border-[#CBD5E1] bg-white px-3 text-sm"
                >
                  {wards.map((w) => (
                    <option key={w.wardNumber} value={w.wardNumber}>
                      Ward 0{w.wardNumber} — {w.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rounded border border-[#E2E8F0] bg-[#F5F7FA] p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-[0.04em] text-[#102A43]">
                  Pin Exact Spot on Live Map
                </span>
                <button
                  type="button"
                  onClick={handleCaptureGps}
                  className="inline-flex h-8 cursor-pointer items-center gap-1 rounded border border-[#102A43] bg-white px-2.5 text-[11px] font-semibold text-[#102A43] hover:bg-[#ECF4FF]"
                >
                  <Compass className="h-3.5 w-3.5" />
                  GPS
                </button>
              </div>
              <CivicSpotPickerMap
                latitude={latitude}
                longitude={longitude}
                onSelectLocation={applyResolvedSpot}
                externalResolved={resolvedGeo}
                heightClass="h-[220px]"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
              <div className="sm:col-span-8">
                <label className="block text-xs font-bold uppercase tracking-[0.04em] text-[#253746]">
                  Complete Spot &amp; Street Address *
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Auto-filled from map pin, or type specific spot / landmark..."
                  className="civic-input mt-1.5 h-12 w-full rounded border border-[#CBD5E1] px-3 text-sm"
                />
                {errors.address && (
                  <p className="mt-1 text-xs font-medium text-[#BA1A1A]">{errors.address}</p>
                )}
              </div>
              <div className="sm:col-span-4">
                <label className="block text-xs font-bold uppercase tracking-[0.04em] text-[#253746]">
                  Area / Neighborhood
                </label>
                <input
                  type="text"
                  value={locality}
                  onChange={(e) => setLocality(e.target.value)}
                  placeholder="Area / Locality"
                  className="civic-input mt-1.5 h-12 w-full rounded border border-[#CBD5E1] px-3 text-sm"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="inc-desc"
                className="block text-xs font-bold uppercase tracking-[0.04em] text-[#253746]"
              >
                Field Observations *
              </label>
              <textarea
                id="inc-desc"
                rows={3}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  if (errors.description) setErrors({ ...errors, description: '' });
                }}
                placeholder="Describe asset condition, traffic impact, or containment status..."
                className="civic-input mt-1.5 w-full rounded border border-[#CBD5E1] p-3 text-sm"
              />
              {errors.description && (
                <p className="mt-1 text-xs font-medium text-[#BA1A1A]">{errors.description}</p>
              )}
            </div>

            {errors.submit && (
              <p className="rounded border border-[#BA1A1A] bg-[#FFDAD6] p-2.5 text-xs font-medium text-[#BA1A1A]">
                {errors.submit}
              </p>
            )}
          </div>

          <div className="mt-6 flex items-center justify-end gap-3 border-t border-[#E2E8F0] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="h-12 rounded border-[1.5px] border-[#102A43] px-5 text-sm font-semibold text-[#102A43] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="h-12 rounded bg-[#102A43] px-6 text-sm font-semibold text-white hover:bg-[#0B1D2F] cursor-pointer disabled:opacity-60"
            >
              {submitting ? 'Submitting...' : 'Submit Incident Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
