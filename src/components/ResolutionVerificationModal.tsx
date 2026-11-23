import React, { useEffect, useState } from 'react';
import { Camera, CheckCircle2, Compass, ShieldAlert, X } from 'lucide-react';
import {
  verifyResolutionEvidence,
  type VerifyResolutionApiResponse,
} from '../services/aiClient';
import { adminSubmitResolutionVerification } from '../services/firestoreService';
import { buildCompleteLocationString, reverseGeocodeSpot } from '../services/mapsClient';
import { CivicIncident } from '../types/civic';
import { compressImageFileToDataUrl } from '../utils/imageCompression';
import { CivicSpotPickerMap } from './CivicLiveMap';

interface ResolutionVerificationModalProps {
  incident: CivicIncident | null;
  adminUid: string;
  adminName: string;
  onClose: () => void;
  onVerifiedSubmitted: (complaintId: string) => void;
}

export const ResolutionVerificationModal: React.FC<ResolutionVerificationModalProps> = ({
  incident,
  adminUid,
  adminName,
  onClose,
  onVerifiedSubmitted,
}) => {
  const [afterPhotoDataUrl, setAfterPhotoDataUrl] = useState('');
  const [resolutionLocation, setResolutionLocation] = useState(incident?.address || '');
  const [resolutionLat, setResolutionLat] = useState<number>(incident?.latitude || 12.9716);
  const [resolutionLng, setResolutionLng] = useState<number>(incident?.longitude || 77.5946);
  const [gpsStatus, setGpsStatus] = useState('Click map, drag pin, or capture field GPS to verify site');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [aiResult, setAiResult] = useState<VerifyResolutionApiResponse | null>(null);
  const [checkingAi, setCheckingAi] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (incident) {
      setResolutionLocation(incident.address || '');
      setResolutionLat(incident.latitude || 12.9716);
      setResolutionLng(incident.longitude || 77.5946);
      setAiResult(null);
      setErrorMsg(null);
    }
  }, [incident?.id]);

  if (!incident) return null;

  const handleCaptureGps = () => {
    if (!navigator.geolocation) {
      setGpsStatus('Browser geolocation unavailable; using verified site coordinates or click map below.');
      return;
    }
    setGpsStatus('Capturing field GPS via browser...');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        setResolutionLat(lat);
        setResolutionLng(lng);
        setGpsStatus(`Field GPS captured (±${Math.round(pos.coords.accuracy)}m)`);
        try {
          const geo = await reverseGeocodeSpot(lat, lng);
          const composed = buildCompleteLocationString({
            specificSpot: geo.specificSpot,
            formattedAddress: geo.formattedAddress,
            area: geo.area,
          });
          if (composed) setResolutionLocation(composed);
        } catch {
          // keep current location text
        }
      },
      (err) => {
        const msg = (err.message || '').toLowerCase();
        if (msg.includes('permissions policy') || msg.includes('disabled in this document')) {
          setGpsStatus(
            'Preview frame blocks live GPS — drag/click pin on the live map below or use verified site coordinates.'
          );
        } else {
          setGpsStatus('GPS permission unavailable — drag/click pin on the live map below.');
        }
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleAfterPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    const compressed = await compressImageFileToDataUrl(file);
    setAfterPhotoDataUrl(compressed);
    setAiResult(null);
  };

  const handleRunAiComparison = async (): Promise<VerifyResolutionApiResponse | null> => {
    if (!afterPhotoDataUrl) {
      setErrorMsg('Upload an After-Resolution photograph first.');
      return null;
    }
    setCheckingAi(true);
    setErrorMsg(null);
    try {
      const resp = await verifyResolutionEvidence({
        before_image_base64: incident.photoDataUrl || '',
        after_image_base64: afterPhotoDataUrl,
        original_latitude: incident.latitude,
        original_longitude: incident.longitude,
        resolution_latitude: resolutionLat,
        resolution_longitude: resolutionLng,
      });
      setAiResult(resp);
      return resp;
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'AI verification check failed.');
      return null;
    } finally {
      setCheckingAi(false);
    }
  };

  const handleSubmitVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!afterPhotoDataUrl) {
      setErrorMsg('After-Resolution photograph is mandatory.');
      return;
    }
    if (resolutionLocation.trim().length < 3) {
      setErrorMsg('Enter the verified resolution location.');
      return;
    }
    if (resolutionNotes.trim().length < 4) {
      setErrorMsg('Enter resolution work notes.');
      return;
    }

    setSubmitting(true);
    try {
      const result = aiResult ?? (await handleRunAiComparison());
      if (!result) {
        setSubmitting(false);
        return;
      }

      await adminSubmitResolutionVerification({
        complaintId: incident.id,
        actorUid: adminUid,
        actorName: adminName,
        beforePhotoDataUrl: incident.photoDataUrl,
        afterPhotoDataUrl,
        resolutionLocation: resolutionLocation.trim(),
        resolutionLat,
        resolutionLng,
        gpsDistanceMeters: result.gps_validation.distance_meters,
        imageSimilarityScore: result.image_comparison.image_similarity,
        ssimScore: result.image_comparison.ssim_score,
        aiRecommendation: result.ai_recommendation,
        aiExplanation: result.explanation,
        aiSource: result.ai_source,
        resolutionNotes: resolutionNotes.trim(),
      });

      onVerifiedSubmitted(incident.id);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save verification.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#102A43]/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white p-6 civic-shadow-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-[#E2E8F0] pb-4">
          <div>
            <div className="font-mono-tabular text-xs font-bold text-[#102A43]">
              {incident.id} · OBJECTIVE 4 AI-ASSISTED RESOLUTION VERIFICATION
            </div>
            <h2 className="mt-1 font-display text-xl font-semibold text-[#0A1D2B]">
              {incident.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close resolution verification modal"
            className="flex h-10 w-10 items-center justify-center rounded border border-[#CBD5E1] text-[#253746] hover:bg-[#F5F7FA] cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmitVerification} className="mt-5 flex flex-col gap-5">
          {/* Side-by-Side Before & After Photos */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded border border-[#E2E8F0] bg-[#F5F7FA] p-3">
              <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#52606D]">
                Before Photograph (Original Complaint)
              </div>
              {incident.photoDataUrl ? (
                <img
                  src={incident.photoDataUrl}
                  alt="Original civic complaint"
                  className="mt-2 h-48 w-full rounded object-cover"
                />
              ) : (
                <div className="mt-2 flex h-48 items-center justify-center rounded border border-dashed border-[#CBD5E1] bg-white text-xs text-[#52606D]">
                  Citizen did not attach an original photo
                </div>
              )}
              <div className="mt-2 font-mono-tabular text-[11px] text-[#43474D]">
                Origin GPS: {incident.latitude.toFixed(5)}, {incident.longitude.toFixed(5)}
              </div>
            </div>

            <div className="rounded border border-[#102A43]/20 bg-[#F7F9FF] p-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#102A43]">
                  After-Resolution Photograph *
                </span>
                <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded bg-[#102A43] px-3 text-[11px] font-semibold text-white">
                  <Camera className="h-3.5 w-3.5" />
                  {afterPhotoDataUrl ? 'Replace' : 'Upload Photo'}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleAfterPhotoChange}
                    className="hidden"
                  />
                </label>
              </div>
              {afterPhotoDataUrl ? (
                <img
                  src={afterPhotoDataUrl}
                  alt="After resolution"
                  className="mt-2 h-48 w-full rounded object-cover"
                />
              ) : (
                <div className="mt-2 flex h-48 items-center justify-center rounded border border-dashed border-[#CBD5E1] bg-white text-xs text-[#52606D]">
                  Upload after-repair photograph
                </div>
              )}
              <div className="mt-2 font-mono-tabular text-[11px] text-[#43474D]">
                Timestamp: {new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC
              </div>
            </div>
          </div>

          {/* Location, Live Dual-Pin Map & Browser GPS Capture */}
          <div className="flex flex-col gap-3 rounded border border-[#E2E8F0] bg-[#F5F7FA] p-4">
            <CivicSpotPickerMap
              latitude={resolutionLat}
              longitude={resolutionLng}
              secondaryPin={{
                lat: incident.latitude,
                lng: incident.longitude,
                label: 'Original Complaint Spot',
              }}
              pinLabel="Crew Resolution Spot"
              heightClass="h-[220px]"
              onSelectLocation={(coords, resolved) => {
                setResolutionLat(coords.lat);
                setResolutionLng(coords.lng);
                if (resolved) {
                  const composed = buildCompleteLocationString({
                    specificSpot: resolved.specificSpot,
                    formattedAddress: resolved.formattedAddress,
                    area: resolved.area,
                  });
                  if (composed) setResolutionLocation(composed);
                }
              }}
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
              <div className="md:col-span-5">
                <label className="block text-[11px] font-bold uppercase tracking-[0.04em] text-[#253746]">
                  Resolution Spot &amp; Full Address *
                </label>
                <input
                  type="text"
                  value={resolutionLocation}
                  onChange={(e) => setResolutionLocation(e.target.value)}
                  className="civic-input mt-1 h-11 w-full rounded border border-[#CBD5E1] bg-white px-3 text-sm"
                />
              </div>
              <div className="md:col-span-4">
                <label className="block text-[11px] font-bold uppercase tracking-[0.04em] text-[#253746]">
                  Field GPS (Lat / Lng)
                </label>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    step="0.000001"
                    value={resolutionLat}
                    onChange={(e) => setResolutionLat(Number(e.target.value))}
                    className="civic-input h-11 rounded border border-[#CBD5E1] bg-white px-2.5 font-mono-tabular text-xs"
                  />
                  <input
                    type="number"
                    step="0.000001"
                    value={resolutionLng}
                    onChange={(e) => setResolutionLng(Number(e.target.value))}
                    className="civic-input h-11 rounded border border-[#CBD5E1] bg-white px-2.5 font-mono-tabular text-xs"
                  />
                </div>
              </div>
              <div className="flex flex-col justify-end md:col-span-3">
                <button
                  type="button"
                  onClick={handleCaptureGps}
                  className="inline-flex h-11 items-center justify-center gap-1.5 rounded border border-[#102A43] bg-white px-3 text-xs font-semibold text-[#102A43] hover:bg-[#ECF4FF] cursor-pointer"
                >
                  <Compass className="h-4 w-4" />
                  Capture GPS
                </button>
              </div>
              <div className="text-[11px] text-[#52606D] md:col-span-12">{gpsStatus}</div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-[0.04em] text-[#253746]">
              Resolution Notes &amp; Field Sign-Off *
            </label>
            <textarea
              rows={2}
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              placeholder="Detail materials replaced, valve/lamp verification, or crew sign-off..."
              className="civic-input mt-1 w-full rounded border border-[#CBD5E1] p-3 text-sm"
            />
          </div>

          {/* AI Comparison Result */}
          {aiResult && (
            <div
              className={`rounded border p-4 text-xs ${
                aiResult.ai_recommendation === 'Suspicious Evidence'
                  ? 'border-[#BA1A1A] bg-[#FFDAD6] text-[#BA1A1A]'
                  : aiResult.ai_recommendation === 'Likely Resolved'
                    ? 'border-[#168B55] bg-[#E8F5EC] text-[#168B55]'
                    : 'border-[#F2A541] bg-[#FEF5E7] text-[#8A5208]'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 font-bold">
                <span className="inline-flex items-center gap-1.5">
                  {aiResult.ai_recommendation === 'Suspicious Evidence' ? (
                    <ShieldAlert className="h-4 w-4" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  AI Recommendation: {aiResult.ai_recommendation}
                </span>
                <span className="font-mono-tabular">
                  GPS Distance: {aiResult.gps_validation.distance_meters}m (Threshold{' '}
                  {aiResult.gps_validation.threshold_meters}m) · Image Sim:{' '}
                  {Math.round(aiResult.image_comparison.image_similarity * 100)}% · SSIM:{' '}
                  {aiResult.image_comparison.ssim_score.toFixed(2)}
                </span>
              </div>
              <p className="mt-1.5">{aiResult.explanation}</p>
            </div>
          )}

          {errorMsg && (
            <div className="rounded border border-[#BA1A1A] bg-[#FFDAD6] px-3 py-2 text-xs font-medium text-[#BA1A1A]">
              {errorMsg}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E2E8F0] pt-4">
            <button
              type="button"
              disabled={checkingAi || !afterPhotoDataUrl}
              onClick={handleRunAiComparison}
              className="inline-flex h-11 items-center gap-2 rounded border border-[#102A43] px-4 text-xs font-semibold text-[#102A43] hover:bg-[#ECF4FF] cursor-pointer disabled:opacity-50"
            >
              {checkingAi ? 'Comparing Before/After...' : 'Run AI Verification Check'}
            </button>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="h-11 rounded border border-[#CBD5E1] px-4 text-xs font-semibold text-[#253746] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex h-11 items-center gap-2 rounded bg-[#168B55] px-5 text-xs font-semibold text-white hover:bg-[#127446] cursor-pointer disabled:opacity-60"
              >
                {submitting ? 'Saving Evidence...' : 'Submit Verification & Mark Resolved'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
