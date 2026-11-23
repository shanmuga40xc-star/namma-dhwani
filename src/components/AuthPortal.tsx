import React, { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  reload,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  AlertCircle,
  BadgeCheck,
  CheckCircle2,
  HelpCircle,
  KeyRound,
  Landmark,
  LogOut,
  MailCheck,
  RefreshCw,
  Shield,
  Smartphone,
  UserCheck,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { auth, BOOTSTRAP_ADMIN_EMAIL, googleProvider } from '../firebase';
import { NEW_USER_WARDS } from '../data/mockCivicData';
import { useLanguage } from '../i18n/LanguageContext';
import {
  checkIsAdminUser,
  getAdminRequest,
  getCitizenProfile,
  submitAdminAccessRequest,
  upsertCitizenProfile,
} from '../services/firestoreService';
import { AdminRequest, CitizenProfile, UserPortalRole } from '../types/civic';
import { GuideView } from './GuideView';
import { LanguageSelector } from './LanguageSelector';

interface AuthPortalProps {
  currentUser: User | null;
  citizenProfile: CitizenProfile | null;
  pendingAdminRequest: AdminRequest | null;
  selectedPortal: UserPortalRole;
  onSelectPortal: (role: UserPortalRole) => void;
  onAuthComplete: () => Promise<void>;
}

const POLITICAL_ROLES = [
  'Local MLA / Assembly Representative',
  'BBMP Municipal Official / Engineer',
  'Ward Corporator / Councillor',
  'Municipal Nodal / Commissioner Office',
  'Chief Minister (CM) Office / State Oversight',
  'Standing Committee Chairperson',
  'MP Office / Parliamentary Representative',
  'Electoral / Returning Officer (ECI/SEC)',
];

interface VerifiedKycState {
  maskedAadhaar: string;
  aadhaarLast4: string;
  phone: string;
  kycVerifiedAt: string;
}

export const AuthPortal: React.FC<AuthPortalProps> = ({
  currentUser,
  citizenProfile,
  pendingAdminRequest,
  selectedPortal,
  onSelectPortal,
  onAuthComplete,
}) => {
  const { language, t, speakText, stopSpeech, isSpeaking } = useLanguage();
  const isAuthorityPortal = selectedPortal !== 'citizen';

  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [wardNumber, setWardNumber] = useState<number>(citizenProfile?.wardNumber || 1);
  const [locality, setLocality] = useState(citizenProfile?.locality || 'Harbor & Civic Center');

  // Aadhaar + Mobile OTP KYC state
  const [aadhaarInput, setAadhaarInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [otpPreview, setOtpPreview] = useState<string | null>(null);
  const [verifiedKyc, setVerifiedKyc] = useState<VerifiedKycState | null>(null);
  const [otpBusy, setOtpBusy] = useState(false);

  // Political-field Admin credentials state
  const [department, setDepartment] = useState('Public Works & Roadway');
  const [badgeId, setBadgeId] = useState('');
  const [politicalRole, setPoliticalRole] = useState(POLITICAL_ROLES[0]);
  const [politicalIdNumber, setPoliticalIdNumber] = useState('');
  const [constituency, setConstituency] = useState('');
  const [partyOrBody, setPartyOrBody] = useState('');

  const [showGuideModal, setShowGuideModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const handleSendOtp = async () => {
    setErrorMsg(null);
    setInfoMsg(null);
    setOtpBusy(true);
    try {
      const resp = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aadhaar: aadhaarInput, phone: phoneInput }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setErrorMsg(data.error || 'Could not send OTP. Check Aadhaar and mobile number.');
        return;
      }
      setChallengeId(data.challengeId);
      setOtpPreview(data.otpPreview || null);
      setInfoMsg(
        `OTP sent to ${data.maskedPhone} for Aadhaar ${data.maskedAadhaar}. Enter the 6-digit code below.`
      );
    } catch {
      setErrorMsg('Network error while requesting OTP.');
    } finally {
      setOtpBusy(false);
    }
  };

  const handleVerifyOtp = async (): Promise<VerifiedKycState | null> => {
    if (!challengeId) {
      setErrorMsg('Tap "Get OTP" first to receive your 6-digit code.');
      return null;
    }
    setErrorMsg(null);
    setOtpBusy(true);
    try {
      const resp = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId, otp: otpInput }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setErrorMsg(data.error || 'OTP verification failed.');
        return null;
      }
      const verified: VerifiedKycState = {
        maskedAadhaar: data.maskedAadhaar,
        aadhaarLast4: data.aadhaarLast4,
        phone: data.phone,
        kycVerifiedAt: data.kycVerifiedAt,
      };
      setVerifiedKyc(verified);
      setOtpPreview(null);
      setInfoMsg(`${t('aadhaarVerifiedBadge')} (${data.maskedAadhaar}).`);
      return verified;
    } catch {
      setErrorMsg('Network error while verifying OTP.');
      return null;
    } finally {
      setOtpBusy(false);
    }
  };

  const validatePoliticalCredentials = async () => {
    const resp = await fetch('/api/auth/validate-political-id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        politicalRole,
        politicalIdNumber,
        constituency,
        partyOrBody,
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(data.error || 'Invalid political/official field credentials.');
    }
    return data as {
      valid: boolean;
      normalizedId: string;
      politicalRole: string;
      authorityTier?: 'CM' | 'MLA' | 'BBMP';
      constituency: string;
      partyOrBody: string;
    };
  };

  // Helper UI block for Aadhaar + Mobile OTP KYC
  const renderAadhaarOtpBlock = (showSaveButton = false, onSaveKycAfterOtp?: (k: VerifiedKycState) => Promise<void>) => (
    <div className="rounded-lg border border-[#102A43]/20 bg-[#F7F9FF] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.04em] text-[#102A43]">
          <Smartphone className="h-4 w-4 text-[#168B55]" />
          <span>Aadhaar + Mobile OTP Verification *</span>
        </div>
        {verifiedKyc && (
          <span className="inline-flex items-center gap-1 rounded border border-[#168B55] bg-[#E8F5EC] px-2 py-0.5 text-[11px] font-bold text-[#168B55]">
            <BadgeCheck className="h-3.5 w-3.5" />
            {verifiedKyc.maskedAadhaar}
          </span>
        )}
      </div>
      <p className="mt-1 text-[11px] text-[#52606D]">
        Your 12-digit Aadhaar is checked with UIDAI Verhoeff checksum. Only masked last-4 digits are stored privately.
      </p>

      {!verifiedKyc ? (
        <div className="mt-3 flex flex-col gap-2.5">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-[0.04em] text-[#253746]">
                {t('aadhaarNumber')} *
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={14}
                value={aadhaarInput}
                onChange={(e) => setAadhaarInput(e.target.value)}
                placeholder="12 digits (e.g. 2341 2341 2346)"
                className="civic-input mt-1 h-11 w-full rounded border border-[#CBD5E1] bg-white px-3 font-mono-tabular text-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-[0.04em] text-[#253746]">
                {t('mobileNumber')} *
              </label>
              <div className="mt-1 flex gap-1.5">
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={14}
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="9876543210"
                  className="civic-input h-11 min-w-0 flex-1 rounded border border-[#CBD5E1] bg-white px-3 font-mono-tabular text-sm"
                />
                <button
                  type="button"
                  disabled={otpBusy}
                  onClick={handleSendOtp}
                  className="h-11 shrink-0 cursor-pointer rounded bg-[#102A43] px-3 text-xs font-semibold text-white hover:bg-[#0B1D2F] disabled:opacity-60"
                >
                  {otpBusy ? '...' : t('sendOtp')}
                </button>
              </div>
            </div>
          </div>

          {challengeId && (
            <div className="flex flex-col gap-2 rounded border border-[#168B55]/30 bg-white p-3">
              {otpPreview && (
                <div className="flex items-center justify-between rounded bg-[#E8F5EC] px-3 py-1.5 text-xs text-[#168B55]">
                  <span>
                    <KeyRound className="mr-1 inline h-3.5 w-3.5" />
                    Demo SMS OTP Code:
                  </span>
                  <strong className="font-mono-tabular text-sm tracking-widest">{otpPreview}</strong>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otpInput}
                  onChange={(e) => setOtpInput(e.target.value)}
                  placeholder={t('enterOtp')}
                  className="civic-input h-11 w-44 rounded border border-[#CBD5E1] px-3 font-mono-tabular text-sm tracking-widest"
                />
                <button
                  type="button"
                  disabled={otpBusy || otpInput.trim().length < 6}
                  onClick={async () => {
                    const res = await handleVerifyOtp();
                    if (res && showSaveButton && onSaveKycAfterOtp) {
                      await onSaveKycAfterOtp(res);
                    }
                  }}
                  className="h-11 cursor-pointer rounded bg-[#168B55] px-4 text-xs font-bold text-white hover:bg-[#127446] disabled:opacity-60"
                >
                  {t('verifyOtp')}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-2 flex items-center justify-between rounded border border-[#168B55]/40 bg-[#E8F5EC] px-3 py-2 text-xs font-semibold text-[#168B55]">
          <span>
            {t('aadhaarVerifiedBadge')} · {verifiedKyc.phone}
          </span>
          <button
            type="button"
            onClick={() => {
              setVerifiedKyc(null);
              setChallengeId(null);
              setOtpInput('');
            }}
            className="cursor-pointer text-[11px] underline"
          >
            Change
          </button>
        </div>
      )}
    </div>
  );

  // Top Header Bar with Mother Tongue Selector & Help Guide
  const renderTopUtilityBar = () => (
    <div className="mx-auto mb-4 flex w-full max-w-4xl flex-wrap items-center justify-between gap-3 rounded-lg border border-[#102A43]/10 bg-white px-4 py-2.5 civic-shadow-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowGuideModal(true)}
          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded border border-[#102A43]/25 bg-[#ECF4FF] px-3 text-xs font-semibold text-[#102A43] hover:bg-[#dcebff]"
        >
          <HelpCircle className="h-4 w-4" />
          {t('openGuide')}
        </button>
        <button
          type="button"
          onClick={() =>
            isSpeaking
              ? stopSpeech()
              : speakText(
                  `${t('appTitle')}. ${t('appSubtitle')}. ${
                    selectedPortal === 'admin' ? t('politicalGateNote') : ''
                  }`
                )
          }
          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded border border-[#CBD5E1] bg-white px-3 text-xs font-semibold text-[#253746] hover:bg-[#F5F7FA]"
        >
          {isSpeaking ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          {isSpeaking ? t('stopAudio') : t('listenAloud')}
        </button>
      </div>
      <LanguageSelector />
    </div>
  );

  // Guide Modal for First-Time Users prior to login
  const renderGuideModal = () =>
    showGuideModal && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-[#102A43]/55 p-4"
        onClick={() => setShowGuideModal(false)}
      >
        <div
          className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-[#F5F7FA] p-5 civic-shadow-2"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex items-center justify-between">
            <span className="font-display text-base font-bold text-[#0A1D2B]">
              {selectedPortal === 'citizen' ? t('userGuideTitle') : t('adminGuideTitle')}
            </span>
            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="inline-flex h-9 cursor-pointer items-center gap-1 rounded border border-[#CBD5E1] bg-white px-3 text-xs font-semibold text-[#253746]"
            >
              <X className="h-4 w-4" />
              Close
            </button>
          </div>
          <GuideView mode={selectedPortal === 'citizen' ? 'citizen' : 'admin'} />
        </div>
      </div>
    );

  // GATE 1A: Email Verification Required
  if (currentUser && !currentUser.emailVerified) {
    const handleResend = async () => {
      setSubmitting(true);
      setErrorMsg(null);
      try {
        await sendEmailVerification(currentUser);
        setInfoMsg(`Verification email resent to ${currentUser.email}.`);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Unable to send verification email.');
      } finally {
        setSubmitting(false);
      }
    };

    const handleCheckVerified = async () => {
      setSubmitting(true);
      setErrorMsg(null);
      try {
        await reload(currentUser);
        if (auth.currentUser?.emailVerified) {
          await onAuthComplete();
        } else {
          setErrorMsg('Email is still unverified. Click the link in your inbox, then check again.');
        }
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Verification check failed.');
      } finally {
        setSubmitting(false);
      }
    };

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#F5F7FA] p-4">
        {renderTopUtilityBar()}
        <div className="w-full max-w-md rounded-lg border border-[#102A43]/15 bg-white p-6 civic-shadow-2">
          <div className="flex items-center gap-3 border-b border-[#E2E8F0] pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded bg-[#102A43] text-[#F2A541]">
              <MailCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-lg font-semibold text-[#0A1D2B]">
                Email Verification Required
              </h1>
              <p className="text-xs text-[#52606D]">{currentUser.email}</p>
            </div>
          </div>

          <p className="mt-4 text-sm text-[#253746]">
            NAGRIK security rules require a verified email before submitting or managing municipal
            records. Open the verification link sent to your inbox, then click below.
          </p>

          {errorMsg && (
            <div className="mt-4 rounded border border-[#BA1A1A] bg-[#FFDAD6] px-3 py-2 text-xs font-medium text-[#BA1A1A]">
              {errorMsg}
            </div>
          )}
          {infoMsg && (
            <div className="mt-4 rounded border border-[#168B55] bg-[#E8F5EC] px-3 py-2 text-xs font-medium text-[#168B55]">
              {infoMsg}
            </div>
          )}

          <div className="mt-5 flex flex-col gap-2.5">
            <button
              type="button"
              disabled={submitting}
              onClick={handleCheckVerified}
              className="inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded bg-[#102A43] px-4 text-sm font-semibold text-white hover:bg-[#0B1D2F] disabled:opacity-60"
            >
              <RefreshCw className="h-4 w-4" />
              I Verified My Email — Continue
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={handleResend}
              className="inline-flex h-11 w-full cursor-pointer items-center justify-center rounded border border-[#102A43] px-4 text-sm font-semibold text-[#102A43] hover:bg-[#ECF4FF]"
            >
              Resend Verification Link
            </button>
            <button
              type="button"
              onClick={() => signOut(auth)}
              className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 text-xs font-semibold text-[#52606D] hover:text-[#0A1D2B]"
            >
              <LogOut className="h-3.5 w-3.5" />
              {t('signOutBtn')}
            </button>
          </div>
        </div>
        {renderGuideModal()}
      </div>
    );
  }

  // GATE 1B: Post-Sign-In Citizen Aadhaar + Mobile OTP KYC Verification
  if (
    currentUser &&
    currentUser.emailVerified &&
    selectedPortal === 'citizen' &&
    !citizenProfile?.kycVerified
  ) {
    const saveVerifiedCitizenKyc = async (kyc: VerifiedKycState) => {
      setSubmitting(true);
      setErrorMsg(null);
      try {
        const wardObj = NEW_USER_WARDS.find((w) => w.wardNumber === wardNumber) ?? NEW_USER_WARDS[0];
        await upsertCitizenProfile({
          uid: currentUser.uid,
          displayName: currentUser.displayName || displayName || 'Citizen Reporter',
          wardNumber: wardObj.wardNumber,
          locality: locality || wardObj.name,
          email: currentUser.email || '',
          phone: kyc.phone,
          kycVerified: true,
          aadhaarVerified: true,
          aadhaarLast4: kyc.aadhaarLast4,
          otpVerified: true,
          preferredLanguage: language,
          maskedAadhaar: kyc.maskedAadhaar,
          kycVerifiedAt: kyc.kycVerifiedAt,
        });
        await onAuthComplete();
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to save Aadhaar verification.');
      } finally {
        setSubmitting(false);
      }
    };

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#F5F7FA] p-4">
        {renderTopUtilityBar()}
        <div className="w-full max-w-lg rounded-lg border border-[#102A43]/15 bg-white p-6 civic-shadow-2">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded bg-[#102A43] text-[#F2A541]">
                <BadgeCheck className="h-5 w-5" />
              </div>
              <div>
                <h1 className="font-display text-lg font-semibold text-[#0A1D2B]">
                  Complete Aadhaar + OTP Check
                </h1>
                <p className="text-xs text-[#52606D]">{currentUser.email}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => signOut(auth)}
              className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded border border-[#CBD5E1] px-3 text-xs font-semibold text-[#253746] hover:bg-[#F5F7FA]"
            >
              <LogOut className="h-3.5 w-3.5" />
              {t('signOutBtn')}
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-[0.04em] text-[#253746]">
                  Home Ward
                </label>
                <select
                  value={wardNumber}
                  onChange={(e) => {
                    const num = Number(e.target.value);
                    setWardNumber(num);
                    const w = NEW_USER_WARDS.find((item) => item.wardNumber === num);
                    if (w) setLocality(w.name);
                  }}
                  className="civic-input mt-1 h-11 w-full rounded border border-[#CBD5E1] bg-white px-3 text-sm"
                >
                  {NEW_USER_WARDS.map((w) => (
                    <option key={w.wardNumber} value={w.wardNumber}>
                      Ward 0{w.wardNumber} — {w.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-[0.04em] text-[#253746]">
                  Locality
                </label>
                <input
                  type="text"
                  value={locality}
                  onChange={(e) => setLocality(e.target.value)}
                  className="civic-input mt-1 h-11 w-full rounded border border-[#CBD5E1] px-3 text-sm"
                />
              </div>
            </div>

            {renderAadhaarOtpBlock(true, saveVerifiedCitizenKyc)}

            {errorMsg && (
              <div className="rounded border border-[#BA1A1A] bg-[#FFDAD6] px-3 py-2 text-xs font-medium text-[#BA1A1A]">
                {errorMsg}
              </div>
            )}
            {infoMsg && (
              <div className="rounded border border-[#168B55] bg-[#E8F5EC] px-3 py-2 text-xs font-medium text-[#168B55]">
                {infoMsg}
              </div>
            )}

            {verifiedKyc && (
              <button
                type="button"
                disabled={submitting}
                onClick={() => saveVerifiedCitizenKyc(verifiedKyc)}
                className="h-12 w-full cursor-pointer rounded bg-[#168B55] px-5 text-sm font-bold text-white hover:bg-[#127446] disabled:opacity-60"
              >
                {submitting ? 'Entering Portal...' : 'Continue to Citizen Portal'}
              </button>
            )}
          </div>
        </div>
        {renderGuideModal()}
      </div>
    );
  }

  // GATE 1C: Signed in as Political/BBMP/CM Authority but not yet in admins registry
  if (currentUser && currentUser.emailVerified && isAuthorityPortal) {
    const handleRequestAdmin = async (e: React.FormEvent) => {
      e.preventDefault();
      setErrorMsg(null);
      setInfoMsg(null);

      if (!badgeId.trim()) {
        setErrorMsg('Enter your Official Badge / Assembly / BBMP Employee ID.');
        return;
      }
      const kycLast4 = verifiedKyc?.aadhaarLast4 || citizenProfile?.aadhaarLast4;
      if (!kycLast4 && !citizenProfile?.kycVerified) {
        setErrorMsg('Complete Aadhaar + Mobile OTP verification before requesting Official Authority access.');
        return;
      }

      setSubmitting(true);
      try {
        const validated = await validatePoliticalCredentials();

        // Strictly do NOT create a citizen profile or citizenStats entry for authority accounts.
        await submitAdminAccessRequest({
          uid: currentUser.uid,
          displayName: currentUser.displayName || displayName || 'Authority Officer',
          department,
          badgeId,
          authorityTier: validated.authorityTier,
          politicalRole: validated.politicalRole,
          politicalIdNumber: validated.normalizedId,
          constituency: validated.constituency,
          partyOrBody: validated.partyOrBody,
          aadhaarLast4: kycLast4,
          wardJurisdiction: wardNumber,
        });
        setInfoMsg('Local MLA / BBMP / CM Authority credentials submitted for supervisor approval.');
        await onAuthComplete();
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to submit request.');
      } finally {
        setSubmitting(false);
      }
    };

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#F5F7FA] p-4">
        {renderTopUtilityBar()}
        <div className="w-full max-w-2xl rounded-lg border border-[#102A43]/15 bg-white p-6 civic-shadow-2">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded bg-[#102A43] text-[#F2A541]">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <h1 className="font-display text-lg font-semibold text-[#0A1D2B]">
                  Political Field &amp; Admin Authority Clearance Required
                </h1>
                <p className="text-xs text-[#52606D]">{currentUser.email}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => signOut(auth)}
              className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded border border-[#CBD5E1] px-3 text-xs font-semibold text-[#253746] hover:bg-[#F5F7FA]"
            >
              <LogOut className="h-3.5 w-3.5" />
              {t('signOutBtn')}
            </button>
          </div>

          {pendingAdminRequest ? (
            <div className="mt-5 flex flex-col gap-4">
              <div
                className={`rounded border px-4 py-3 text-sm ${
                  pendingAdminRequest.status === 'rejected'
                    ? 'border-[#BA1A1A] bg-[#FFDAD6] text-[#BA1A1A]'
                    : 'border-[#F2A541] bg-[#FEF5E7] text-[#8A5208]'
                }`}
              >
                <div className="font-semibold">
                  Request Status: {pendingAdminRequest.status.toUpperCase()}
                </div>
                <div className="mt-1 text-xs">
                  {pendingAdminRequest.politicalRole || 'Public Office'} · Political ID:{' '}
                  <span className="font-mono-tabular font-semibold">
                    {pendingAdminRequest.politicalIdNumber || 'N/A'}
                  </span>{' '}
                  · Constituency: {pendingAdminRequest.constituency || 'N/A'}
                </div>
                <div className="mt-1 text-xs">
                  Department: {pendingAdminRequest.department} · Badge ID:{' '}
                  <span className="font-mono-tabular">{pendingAdminRequest.badgeId}</span> · Ward 0
                  {pendingAdminRequest.wardJurisdiction}
                </div>
                <p className="mt-2 text-xs">
                  Primary municipal supervisor ({BOOTSTRAP_ADMIN_EMAIL}) must approve this political
                  office ID in the Authority Access queue before Admin Command is unlocked.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => onAuthComplete()}
                  className="h-11 cursor-pointer rounded bg-[#102A43] px-4 text-xs font-semibold text-white hover:bg-[#0B1D2F]"
                >
                  Refresh Approval Status
                </button>
                <button
                  type="button"
                  onClick={() => onSelectPortal('citizen')}
                  className="h-11 cursor-pointer rounded border border-[#102A43] px-4 text-xs font-semibold text-[#102A43] hover:bg-[#ECF4FF]"
                >
                  Continue to Citizen Portal Instead
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleRequestAdmin} className="mt-4 flex flex-col gap-4">
              <div className="rounded border border-[#F2A541]/60 bg-[#FEF5E7] px-3.5 py-2.5 text-xs font-medium text-[#8A5208]">
                {t('politicalGateNote')}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-[0.04em] text-[#253746]">
                    {t('politicalRoleLabel')} *
                  </label>
                  <select
                    value={politicalRole}
                    onChange={(e) => setPoliticalRole(e.target.value)}
                    className="civic-input mt-1 h-11 w-full rounded border border-[#CBD5E1] bg-white px-3 text-sm"
                  >
                    {POLITICAL_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-[0.04em] text-[#253746]">
                    {t('politicalIdLabel')} *
                  </label>
                  <input
                    type="text"
                    value={politicalIdNumber}
                    onChange={(e) => setPoliticalIdNumber(e.target.value)}
                    placeholder="e.g. KA-BBMP-104 or ECI-IND-2026"
                    className="civic-input mt-1 h-11 w-full rounded border border-[#CBD5E1] px-3 font-mono-tabular text-sm uppercase"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-[0.04em] text-[#253746]">
                    {t('constituencyLabel')} *
                  </label>
                  <input
                    type="text"
                    value={constituency}
                    onChange={(e) => setConstituency(e.target.value)}
                    placeholder="e.g. Shanthinagar / Ward 117"
                    className="civic-input mt-1 h-11 w-full rounded border border-[#CBD5E1] px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-[0.04em] text-[#253746]">
                    {t('partyBodyLabel')} *
                  </label>
                  <input
                    type="text"
                    value={partyOrBody}
                    onChange={(e) => setPartyOrBody(e.target.value)}
                    placeholder="e.g. BBMP Council / State Assembly"
                    className="civic-input mt-1 h-11 w-full rounded border border-[#CBD5E1] px-3 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-[0.04em] text-[#253746]">
                    Municipal Department
                  </label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="civic-input mt-1 h-11 w-full rounded border border-[#CBD5E1] bg-white px-3 text-sm"
                  >
                    <option value="Public Works & Roadway">Public Works &amp; Roadway</option>
                    <option value="Water & Hydraulics">Water &amp; Hydraulics</option>
                    <option value="Sanitation & Solid Waste">Sanitation &amp; Solid Waste</option>
                    <option value="Electrical & Streetlights">Electrical &amp; Streetlights</option>
                    <option value="Central Operations Command">Central Operations Command</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-[0.04em] text-[#253746]">
                    Official Badge / Emp ID *
                  </label>
                  <input
                    type="text"
                    value={badgeId}
                    onChange={(e) => setBadgeId(e.target.value)}
                    placeholder="e.g. MUN-PW-204"
                    className="civic-input mt-1 h-11 w-full rounded border border-[#CBD5E1] px-3 font-mono-tabular text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-[0.04em] text-[#253746]">
                    Ward Jurisdiction
                  </label>
                  <select
                    value={wardNumber}
                    onChange={(e) => setWardNumber(Number(e.target.value))}
                    className="civic-input mt-1 h-11 w-full rounded border border-[#CBD5E1] bg-white px-3 text-sm"
                  >
                    {NEW_USER_WARDS.map((w) => (
                      <option key={w.wardNumber} value={w.wardNumber}>
                        Ward 0{w.wardNumber} — {w.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {citizenProfile?.kycVerified ? (
                <div className="rounded border border-[#168B55]/40 bg-[#E8F5EC] px-3 py-2 text-xs font-semibold text-[#168B55]">
                  <BadgeCheck className="mr-1.5 inline h-4 w-4" />
                  Aadhaar Verified (XXXX-XXXX-{citizenProfile.aadhaarLast4 || 'XXXX'})
                </div>
              ) : (
                renderAadhaarOtpBlock(false)
              )}

              {errorMsg && (
                <div className="rounded border border-[#BA1A1A] bg-[#FFDAD6] px-3 py-2 text-xs font-medium text-[#BA1A1A]">
                  {errorMsg}
                </div>
              )}
              {infoMsg && (
                <div className="rounded border border-[#168B55] bg-[#E8F5EC] px-3 py-2 text-xs font-medium text-[#168B55]">
                  {infoMsg}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => onSelectPortal('citizen')}
                  className="h-11 cursor-pointer rounded border border-[#102A43] px-4 text-xs font-semibold text-[#102A43] hover:bg-[#ECF4FF]"
                >
                  Use Citizen Portal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="h-12 cursor-pointer rounded bg-[#102A43] px-5 text-sm font-semibold text-white hover:bg-[#0B1D2F] disabled:opacity-60"
                >
                  {submitting ? 'Verifying & Submitting...' : 'Submit Political / Admin Request'}
                </button>
              </div>
            </form>
          )}
        </div>
        {renderGuideModal()}
      </div>
    );
  }

  // Primary Login / Register Screen (Before Auth)
  const handleGoogleSignIn = async () => {
    setSubmitting(true);
    setErrorMsg(null);
    setInfoMsg(null);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const user = cred.user;
      const isAdminAccount = await checkIsAdminUser(user.uid, user.email);

      if (isAdminAccount) {
        // Authorities (CM / MLA / BBMP) must NEVER be registered as citizens.
        if (user.email?.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase()) {
          onSelectPortal('cm');
        } else {
          onSelectPortal('politician_bbmp');
        }
      } else if (!isAuthorityPortal) {
        const existingProfile = await getCitizenProfile(user.uid);
        if (!existingProfile) {
          const wardObj = NEW_USER_WARDS.find((w) => w.wardNumber === wardNumber) ?? NEW_USER_WARDS[0];
          await upsertCitizenProfile({
            uid: user.uid,
            displayName: user.displayName || 'Citizen Reporter',
            wardNumber: wardObj.wardNumber,
            locality: wardObj.name,
            email: user.email || '',
            preferredLanguage: language,
          });
        }
      } else {
        if (authMode === 'register' && badgeId.trim() && politicalIdNumber.trim()) {
          const validated = await validatePoliticalCredentials();
          const existingReq = await getAdminRequest(user.uid);
          if (!existingReq) {
            await submitAdminAccessRequest({
              uid: user.uid,
              displayName: user.displayName || displayName || 'Authority Officer',
              department,
              badgeId,
              authorityTier: validated.authorityTier,
              politicalRole: validated.politicalRole,
              politicalIdNumber: validated.normalizedId,
              constituency: validated.constituency,
              partyOrBody: validated.partyOrBody,
              aadhaarLast4: verifiedKyc?.aadhaarLast4,
              wardJurisdiction: wardNumber,
            });
          }
        }
      }
      await onAuthComplete();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Google Sign-In failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    if (!email.trim() || password.length < 6) {
      setErrorMsg('Enter a valid email address and password (minimum 6 characters).');
      return;
    }

    if (authMode === 'register') {
      if (displayName.trim().length < 2) {
        setErrorMsg('Enter your full name (minimum 2 characters).');
        return;
      }
      if (!verifiedKyc) {
        setErrorMsg('Complete Aadhaar (12-digit) + Mobile 6-digit OTP verification first.');
        return;
      }
      if (isAuthorityPortal) {
        if (badgeId.trim().length < 2) {
          setErrorMsg('Enter your Municipal / Political Authority Badge ID.');
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      if (authMode === 'login') {
        await signInWithEmailAndPassword(auth, email.trim(), password);
        await onAuthComplete();
      } else {
        let validatedPolitical: Awaited<ReturnType<typeof validatePoliticalCredentials>> | null = null;
        if (isAuthorityPortal) {
          validatedPolitical = await validatePoliticalCredentials();
        }

        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(cred.user, { displayName: displayName.trim() });
        await sendEmailVerification(cred.user);

        if (cred.user.emailVerified) {
          const isAdminAccount = await checkIsAdminUser(cred.user.uid, cred.user.email);
          if (!isAuthorityPortal && !isAdminAccount) {
            await upsertCitizenProfile({
              uid: cred.user.uid,
              displayName: displayName.trim(),
              wardNumber,
              locality,
              email: email.trim(),
              phone: verifiedKyc!.phone,
              kycVerified: true,
              aadhaarVerified: true,
              aadhaarLast4: verifiedKyc!.aadhaarLast4,
              otpVerified: true,
              preferredLanguage: language,
              maskedAadhaar: verifiedKyc!.maskedAadhaar,
              kycVerifiedAt: verifiedKyc!.kycVerifiedAt,
            });
          } else if (isAuthorityPortal && validatedPolitical && !isAdminAccount) {
            await submitAdminAccessRequest({
              uid: cred.user.uid,
              displayName: displayName.trim(),
              department,
              badgeId,
              authorityTier: validatedPolitical.authorityTier,
              politicalRole: validatedPolitical.politicalRole,
              politicalIdNumber: validatedPolitical.normalizedId,
              constituency: validatedPolitical.constituency,
              partyOrBody: validatedPolitical.partyOrBody,
              aadhaarLast4: verifiedKyc!.aadhaarLast4,
              wardJurisdiction: wardNumber,
            });
          }
        } else {
          setInfoMsg(
            `Account created. A verification email was sent to ${email.trim()}. Please verify your inbox to continue.`
          );
        }
        await onAuthComplete();
      }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/operation-not-allowed') {
        setErrorMsg(
          'Email/Password sign-in is disabled in Firebase Console for this project. Use "Continue with Google" below, or enable Email/Password in Firebase Authentication -> Sign-in method.'
        );
      } else if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
        setErrorMsg('Invalid email or password. Check credentials or switch to Register.');
      } else if (code === 'auth/email-already-in-use') {
        setErrorMsg('An account already exists for this email. Switch to Sign In.');
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Authentication failed.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-[#F5F7FA] px-4 py-6">
      {renderTopUtilityBar()}

      <div className="mx-auto w-full max-w-4xl">
        {/* Institutional Header */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#102A43] text-[#F2A541] civic-shadow-1">
            <Landmark className="h-6 w-6" />
          </div>
          <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-[#0A1D2B] sm:text-3xl">
            {t('appTitle')}
          </h1>
          <p className="mt-1 max-w-xl text-sm text-[#43474D]">{t('appSubtitle')}</p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Auth Form Card */}
          <div className="rounded-lg border border-[#102A43]/15 bg-white p-6 civic-shadow-2 lg:col-span-7">
            {/* Strict Categorized Role Portal Selector (Citizen vs Local MLA / BBMP vs CM Oversight) */}
            <div
              className="grid grid-cols-1 gap-1.5 rounded border border-[#E2E8F0] bg-[#F5F7FA] p-1 sm:grid-cols-3"
              role="tablist"
              aria-label="Select portal category"
            >
              <button
                type="button"
                role="tab"
                aria-selected={selectedPortal === 'citizen'}
                onClick={() => {
                  onSelectPortal('citizen');
                  setErrorMsg(null);
                }}
                className={`inline-flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded px-2 text-xs font-semibold transition-colors ${
                  selectedPortal === 'citizen'
                    ? 'bg-[#102A43] text-white'
                    : 'text-[#253746] hover:bg-white'
                }`}
              >
                <UserCheck className="h-4 w-4 shrink-0" />
                <span>Citizen</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={selectedPortal === 'politician_bbmp'}
                onClick={() => {
                  onSelectPortal('politician_bbmp');
                  setPoliticalRole('Local MLA / Assembly Representative');
                  setErrorMsg(null);
                }}
                className={`inline-flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded px-2 text-xs font-semibold transition-colors ${
                  selectedPortal === 'politician_bbmp'
                    ? 'bg-[#102A43] text-white'
                    : 'text-[#253746] hover:bg-white'
                }`}
              >
                <Shield className="h-4 w-4 shrink-0" />
                <span>Local MLA / BBMP</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={selectedPortal === 'cm' || selectedPortal === 'admin'}
                onClick={() => {
                  onSelectPortal('cm');
                  setPoliticalRole('Chief Minister (CM) Office / State Oversight');
                  setDepartment('Central Operations Command');
                  setErrorMsg(null);
                }}
                className={`inline-flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded px-2 text-xs font-semibold transition-colors ${
                  selectedPortal === 'cm' || selectedPortal === 'admin'
                    ? 'bg-[#102A43] text-white'
                    : 'text-[#253746] hover:bg-white'
                }`}
              >
                <Landmark className="h-4 w-4 shrink-0 text-[#F2A541]" />
                <span>CM Oversight</span>
              </button>
            </div>

            {isAuthorityPortal && (
              <div className="mt-3 rounded border border-[#F2A541]/60 bg-[#FEF5E7] px-3 py-2 text-xs font-medium text-[#8A5208]">
                {selectedPortal === 'cm' || selectedPortal === 'admin'
                  ? 'Chief Minister (CM) Oversight Command: Strictly separated from citizen accounts. Receives direct misuse alerts from Local MLA & BBMP municipal work.'
                  : 'Local MLA & BBMP Official Portal: Strictly categorized outside citizen rosters. All ticket actions, SLA compliance & budgets are transparently audited by citizens and the CM.'}
              </div>
            )}

            {/* Sign In / Register Switch */}
            <div className="mt-4 flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <div>
                <h2 className="font-display text-lg font-semibold text-[#0A1D2B]">
                  {selectedPortal === 'citizen'
                    ? authMode === 'login'
                      ? `${t('citizenPortal')} · ${t('signIn')}`
                      : `${t('citizenPortal')} · ${t('createAccount')}`
                    : selectedPortal === 'politician_bbmp'
                      ? authMode === 'login'
                        ? `Local MLA / BBMP Official · ${t('signIn')}`
                        : `Local MLA / BBMP Official · ${t('createAccount')}`
                      : authMode === 'login'
                        ? `Chief Minister (CM) Oversight · ${t('signIn')}`
                        : `Chief Minister (CM) Office · ${t('createAccount')}`}
                </h2>
                <p className="text-xs text-[#52606D]">
                  {selectedPortal === 'citizen'
                    ? 'Aadhaar + Mobile OTP verified civic reporting & MLA/CM appointments.'
                    : selectedPortal === 'politician_bbmp'
                      ? 'Transparent ward & constituency command for Local MLAs & BBMP officials.'
                      : 'Executive state oversight receiving misuse alerts & CM appointment escalations.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAuthMode((m) => (m === 'login' ? 'register' : 'login'));
                  setErrorMsg(null);
                  setInfoMsg(null);
                }}
                className="shrink-0 cursor-pointer whitespace-nowrap text-xs font-semibold text-[#102A43] underline hover:text-[#0B1D2F]"
              >
                {authMode === 'login' ? t('createAccount') : 'Already Registered? Sign In'}
              </button>
            </div>

            {/* Primary Google Sign-In */}
            <div className="mt-4">
              <button
                type="button"
                disabled={submitting}
                onClick={handleGoogleSignIn}
                className="flex h-12 w-full cursor-pointer items-center justify-center gap-2.5 rounded border-[1.5px] border-[#102A43] bg-white px-4 text-sm font-semibold text-[#102A43] transition-colors hover:bg-[#ECF4FF] disabled:opacity-60"
              >
                <span className="font-mono-tabular text-base font-bold">G</span>
                <span>
                  {t('continueGoogle')} (
                  {selectedPortal === 'citizen'
                    ? t('citizenPortal')
                    : selectedPortal === 'politician_bbmp'
                      ? 'Local MLA / BBMP'
                      : 'CM Oversight'}
                  )
                </span>
              </button>
            </div>

            <div className="my-4 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#52606D]">
              <div className="h-px flex-1 bg-[#E2E8F0]" />
              <span>Or Email &amp; Password + Aadhaar OTP</span>
              <div className="h-px flex-1 bg-[#E2E8F0]" />
            </div>

            <form onSubmit={handleEmailAuth} className="flex flex-col gap-3.5" noValidate>
              {authMode === 'register' && (
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-[0.04em] text-[#253746]">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={
                      selectedPortal === 'citizen' ? 'e.g., Ananya Sharma' : 'e.g., K. Deshmukh'
                    }
                    className="civic-input mt-1 h-12 w-full rounded border border-[#CBD5E1] px-3 text-sm"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-[0.04em] text-[#253746]">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="civic-input mt-1 h-12 w-full rounded border border-[#CBD5E1] px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-[0.04em] text-[#253746]">
                    Password *
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="civic-input mt-1 h-12 w-full rounded border border-[#CBD5E1] px-3 text-sm"
                  />
                </div>
              </div>

              {authMode === 'register' && selectedPortal === 'citizen' && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-[0.04em] text-[#253746]">
                      Home Ward
                    </label>
                    <select
                      value={wardNumber}
                      onChange={(e) => {
                        const num = Number(e.target.value);
                        setWardNumber(num);
                        const w = NEW_USER_WARDS.find((item) => item.wardNumber === num);
                        if (w) setLocality(w.name);
                      }}
                      className="civic-input mt-1 h-12 w-full rounded border border-[#CBD5E1] bg-white px-2.5 text-sm"
                    >
                      {NEW_USER_WARDS.map((w) => (
                        <option key={w.wardNumber} value={w.wardNumber}>
                          Ward 0{w.wardNumber} — {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-[0.04em] text-[#253746]">
                      Locality
                    </label>
                    <input
                      type="text"
                      value={locality}
                      onChange={(e) => setLocality(e.target.value)}
                      className="civic-input mt-1 h-12 w-full rounded border border-[#CBD5E1] px-3 text-sm"
                    />
                  </div>
                </div>
              )}

              {authMode === 'register' && isAuthorityPortal && (
                <div className="flex flex-col gap-3 rounded-lg border border-[#102A43]/15 bg-[#F5F7FA] p-3.5">
                  <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#102A43]">
                    {selectedPortal === 'cm' || selectedPortal === 'admin'
                      ? 'Chief Minister (CM) Oversight Office Credentials'
                      : 'Local MLA / BBMP Municipal Verification Credentials'}
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-[0.04em] text-[#253746]">
                        {t('politicalRoleLabel')} *
                      </label>
                      <select
                        value={politicalRole}
                        onChange={(e) => setPoliticalRole(e.target.value)}
                        className="civic-input mt-1 h-11 w-full rounded border border-[#CBD5E1] bg-white px-2.5 text-xs"
                      >
                        {POLITICAL_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-[0.04em] text-[#253746]">
                        {t('politicalIdLabel')} *
                      </label>
                      <input
                        type="text"
                        value={politicalIdNumber}
                        onChange={(e) => setPoliticalIdNumber(e.target.value)}
                        placeholder="KA-BBMP-104"
                        className="civic-input mt-1 h-11 w-full rounded border border-[#CBD5E1] bg-white px-3 font-mono-tabular text-xs uppercase"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-[0.04em] text-[#253746]">
                        {t('constituencyLabel')} *
                      </label>
                      <input
                        type="text"
                        value={constituency}
                        onChange={(e) => setConstituency(e.target.value)}
                        placeholder="Shanthinagar / Ward 117"
                        className="civic-input mt-1 h-11 w-full rounded border border-[#CBD5E1] bg-white px-3 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-[0.04em] text-[#253746]">
                        {t('partyBodyLabel')} *
                      </label>
                      <input
                        type="text"
                        value={partyOrBody}
                        onChange={(e) => setPartyOrBody(e.target.value)}
                        placeholder="BBMP Council / Assembly Office"
                        className="civic-input mt-1 h-11 w-full rounded border border-[#CBD5E1] bg-white px-3 text-xs"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-[0.04em] text-[#253746]">
                        Department
                      </label>
                      <select
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                        className="civic-input mt-1 h-11 w-full rounded border border-[#CBD5E1] bg-white px-2.5 text-xs"
                      >
                        <option value="Public Works & Roadway">Public Works</option>
                        <option value="Water & Hydraulics">Water &amp; Pipes</option>
                        <option value="Sanitation & Solid Waste">Sanitation</option>
                        <option value="Electrical & Streetlights">Streetlights</option>
                        <option value="Central Operations Command">Central Ops</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-[0.04em] text-[#253746]">
                        Badge ID *
                      </label>
                      <input
                        type="text"
                        value={badgeId}
                        onChange={(e) => setBadgeId(e.target.value)}
                        placeholder="MUN-2026-01"
                        className="civic-input mt-1 h-11 w-full rounded border border-[#CBD5E1] bg-white px-3 font-mono-tabular text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-[0.04em] text-[#253746]">
                        Jurisdiction
                      </label>
                      <select
                        value={wardNumber}
                        onChange={(e) => setWardNumber(Number(e.target.value))}
                        className="civic-input mt-1 h-11 w-full rounded border border-[#CBD5E1] bg-white px-2.5 text-xs"
                      >
                        {NEW_USER_WARDS.map((w) => (
                          <option key={w.wardNumber} value={w.wardNumber}>
                            Ward 0{w.wardNumber}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {authMode === 'register' && renderAadhaarOtpBlock(false)}

              {errorMsg && (
                <div className="flex items-start gap-2 rounded border border-[#BA1A1A] bg-[#FFDAD6] px-3 py-2.5 text-xs font-medium text-[#BA1A1A]">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}
              {infoMsg && (
                <div className="flex items-start gap-2 rounded border border-[#168B55] bg-[#E8F5EC] px-3 py-2.5 text-xs font-medium text-[#168B55]">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{infoMsg}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="mt-1 h-12 w-full cursor-pointer rounded bg-[#102A43] px-5 text-sm font-semibold text-white hover:bg-[#0B1D2F] disabled:opacity-60"
              >
                {submitting
                  ? 'Authenticating...'
                  : authMode === 'login'
                    ? `${t('signIn')} (${
                        selectedPortal === 'citizen'
                          ? t('citizenPortal')
                          : selectedPortal === 'politician_bbmp'
                            ? 'Local MLA / BBMP'
                            : 'CM Oversight'
                      })`
                    : `${t('createAccount')} (${
                        selectedPortal === 'citizen'
                          ? t('citizenPortal')
                          : selectedPortal === 'politician_bbmp'
                            ? 'Local MLA / BBMP'
                            : 'CM Oversight'
                      })`}
              </button>
            </form>
          </div>

          {/* Right Research, Language & Role Summary */}
          <div className="flex flex-col justify-between rounded-lg border border-[#102A43]/15 bg-[#102A43] p-6 text-white civic-shadow-2 lg:col-span-5">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#F2A541]">
                NAGRIK · Simple &amp; Trained Civic AI
              </div>
              <h3 className="mt-1 font-display text-lg font-semibold">
                Built for Every Citizen &amp; Verified Public Representative
              </h3>

              <ul className="mt-4 flex flex-col gap-3 text-xs text-[#D1E4FF]">
                <li className="rounded border border-white/10 bg-white/5 p-3">
                  <div className="font-semibold text-white">
                    1. 12 Mother Tongues + Voice Help
                  </div>
                  <p className="mt-0.5 text-[#B0C9E8]">
                    Switch to Kannada, Tamil, Telugu, Marathi, Malayalam, Hindi &amp; more. Tap
                    Listen anywhere to hear instructions aloud.
                  </p>
                </li>
                <li className="rounded border border-white/10 bg-white/5 p-3">
                  <div className="font-semibold text-white">
                    2. Aadhaar + Mobile OTP Verified Citizens
                  </div>
                  <p className="mt-0.5 text-[#B0C9E8]">
                    Every new citizen verifies 12-digit Aadhaar (Verhoeff checksum) and 6-digit SMS
                    OTP before reporting.
                  </p>
                </li>
                <li className="rounded border border-white/10 bg-white/5 p-3">
                  <div className="font-semibold text-white">
                    3. Political-Field ID Gated Admin Command
                  </div>
                  <p className="mt-0.5 text-[#B0C9E8]">
                    Only holders of verified Political / Electoral / Municipal Nodal IDs can apply
                    for Admin Authority clearance.
                  </p>
                </li>
                <li className="rounded border border-white/10 bg-white/5 p-3">
                  <div className="font-semibold text-white">
                    4. Trained AI/ML Pipelines Active
                  </div>
                  <p className="mt-0.5 text-[#B0C9E8]">
                    24-Feature Visual CV + 2-Layer Softmax MLP (93.3% held-out Acc), Haversine +
                    dHash Duplicate Detection, Random Forest-28 Priority, and SSIM Verification.
                  </p>
                </li>
              </ul>
            </div>

            <div className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-3 text-[11px] text-[#B0C9E8]">
              <button
                type="button"
                onClick={() => setShowGuideModal(true)}
                className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded bg-[#F2A541] px-3 text-xs font-bold text-[#102A43] hover:bg-[#e59835]"
              >
                <HelpCircle className="h-4 w-4" />
                {selectedPortal === 'citizen' ? t('userGuideTitle') : t('adminGuideTitle')}
              </button>
              <div>
                Primary supervisor:{' '}
                <span className="font-mono-tabular text-white">{BOOTSTRAP_ADMIN_EMAIL}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      {renderGuideModal()}
    </div>
  );
};
