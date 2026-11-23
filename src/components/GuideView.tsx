import React from 'react';
import {
  Award,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Compass,
  FileCheck2,
  FlaskConical,
  GitMerge,
  HeartHandshake,
  HelpCircle,
  IndianRupee,
  Languages,
  MapPin,
  ShieldCheck,
  Smartphone,
  ThumbsUp,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface GuideViewProps {
  mode: 'citizen' | 'admin';
  onStartReport?: () => void;
  onDismissBanner?: () => void;
}

interface GuideStep {
  number: number;
  title: string;
  description: string;
  tip: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const GuideView: React.FC<GuideViewProps> = ({
  mode,
  onStartReport,
  onDismissBanner,
}) => {
  const { t, speakText, stopSpeech, isSpeaking } = useLanguage();

  const citizenSteps: GuideStep[] = [
    {
      number: 1,
      title: 'Choose Your Mother Tongue & Verify Aadhaar + OTP',
      description:
        'Pick your home language at the top right (Kannada, Tamil, Telugu, Marathi, Malayalam, Hindi, or others). Enter your 12-digit Aadhaar number and 10-digit mobile number to confirm OTP once.',
      tip: 'Your full Aadhaar number is never shown to anyone — only the last 4 digits are saved for safety.',
      icon: Languages,
    },
    {
      number: 2,
      title: t('simpleStep1Title'),
      description:
        'Tap the green "Report Problem" button. Take a clear photo of the pothole, garbage pile, water leak, or broken streetlight. Our AI automatically suggests what problem it is.',
      tip: 'If the AI picks the wrong box, just tap the big picture button for the right problem.',
      icon: Camera,
    },
    {
      number: 3,
      title: t('simpleStep2Title'),
      description:
        'Tap "Tap for Exact Location (GPS)". Your phone automatically finds the street and ward number so repair crews reach the exact spot.',
      tip: 'Also type one nearby shop, bus stop, or landmark name if you know it.',
      icon: MapPin,
    },
    {
      number: 4,
      title: t('simpleStep3Title'),
      description:
        'Tap "Send Complaint Now". The system checks if a neighbor already reported the same issue within 100 meters so teams do not do double work.',
      tip: 'If a neighbor already reported it, tap "Support" instead of filing twice!',
      icon: ThumbsUp,
    },
    {
      number: 5,
      title: 'Check & Confirm the Repair (Earn 50+ Points)',
      description:
        'When officers upload an "After Repair" photo, compare Before vs After photos. Tap "Confirm Resolved" if fixed properly, or "Dispute & Reopen" if it is still broken.',
      tip: 'Every verified fix gives you +50 points (+20/+40 extra for Serious/Emergency issues).',
      icon: CheckCircle2,
    },
    {
      number: 6,
      title: 'Apply for Student Scholarships & Welfare Support',
      description:
        'Use your verified civic points and participation record in the "Welfare Benefits" tab to apply for education scholarships and community support.',
      tip: 'Tap the speaker ("Listen") button anywhere in the guide to hear instructions aloud.',
      icon: Award,
    },
  ];

  const adminSteps: GuideStep[] = [
    {
      number: 1,
      title: 'Strict Political & Official Field ID Gate',
      description:
        'Admin Command is locked to verified Aadhaar + OTP holders who submit a valid Political / Public Office ID (Ward Corporator, MLA Office, MP Office, Standing Committee, ECI/SEC, or Nodal Officer) and receive supervisor approval.',
      tip: 'Inspect and approve or reject incoming political/officer applications in Authority Access.',
      icon: ShieldCheck,
    },
    {
      number: 2,
      title: 'Triage Priority Queue & Ward Dispatch',
      description:
        'Open Operations Overview and Incident Ledger to inspect tickets scored 0–100 by the trained 28-Tree Random Forest model. Assign field crews or override priority with a documented reason.',
      tip: 'Every override and status change is recorded permanently in the ticket Audit Trail.',
      icon: ClipboardCheck,
    },
    {
      number: 3,
      title: 'Reversible Duplicate Merging (100m GPS + Visual Hash)',
      description:
        'Use Duplicate & Merge to review complaints flagged within 100m using Haversine GPS, perceptual dHash, and text similarity. Merging keeps citizen reporter records linked and reversible.',
      tip: 'Never delete duplicates — always use Merge or Reverse Merge for full auditability.',
      icon: GitMerge,
    },
    {
      number: 4,
      title: 'Submit Before/After Proof & Close Issues',
      description:
        'Upload an After Repair photo with live GPS inside Incident Drawer. Our CV engine verifies 250m GPS tolerance and computes structural SSIM before sending to the citizen for final confirmation.',
      tip: 'Issues only award full citizen points once confirmed or verified.',
      icon: FileCheck2,
    },
    {
      number: 5,
      title: 'Manage Ward Budgets (₹), Welfare & AI/ML Evaluation',
      description:
        'Track ward expenditures in Indian Rupees (₹), review student/citizen welfare applications in Welfare Governance, and inspect real held-out test metrics & confusion matrices in AI/ML Evaluation.',
      tip: 'Zero fabricated metrics are ever shown — all figures come from real model evaluation artifacts.',
      icon: IndianRupee,
    },
  ];

  const steps = mode === 'citizen' ? citizenSteps : adminSteps;
  const fullGuideNarration = steps
    .map((s) => `Step ${s.number}: ${s.title}. ${s.description}`)
    .join(' ');

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border border-[#102A43]/15 bg-[#102A43] p-6 text-white civic-shadow-1">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.06em] text-[#F2A541]">
              <HelpCircle className="h-4 w-4" aria-hidden="true" />
              {mode === 'citizen' ? t('userGuideTitle') : t('adminGuideTitle')}
            </div>
            <h1 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
              {mode === 'citizen'
                ? 'Simple 6-Step Guide for Every Citizen'
                : 'Political Representative & Admin Authority Handbook'}
            </h1>
            <p className="mt-2 text-sm text-[#D1E4FF]">
              {mode === 'citizen'
                ? 'Designed so anyone — even first-time smartphone users — can report road, water, garbage, or light problems in under 1 minute.'
                : 'Complete operational workflow for verified political representatives, ward officers, and civic supervisors.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => (isSpeaking ? stopSpeech() : speakText(fullGuideNarration))}
              className="inline-flex h-11 cursor-pointer items-center gap-2 rounded bg-[#F2A541] px-4 text-xs font-bold text-[#102A43] hover:bg-[#e59835]"
            >
              {isSpeaking ? (
                <>
                  <VolumeX className="h-4 w-4" aria-hidden="true" />
                  {t('stopAudio')}
                </>
              ) : (
                <>
                  <Volume2 className="h-4 w-4" aria-hidden="true" />
                  {t('listenAloud')} (Full Guide)
                </>
              )}
            </button>
            {onDismissBanner && (
              <button
                type="button"
                onClick={onDismissBanner}
                className="inline-flex h-11 cursor-pointer items-center rounded border border-white/30 px-4 text-xs font-semibold text-white hover:bg-white/10"
              >
                Mark Guide Complete
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <article
              key={step.number}
              className="flex flex-col justify-between rounded-lg border border-[#102A43]/12 bg-white p-5 civic-shadow-1"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#ECF4FF] text-[#102A43]">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <div className="font-mono-tabular text-[11px] font-bold uppercase tracking-[0.05em] text-[#52606D]">
                        STEP {step.number}
                      </div>
                      <h2 className="font-display text-base font-bold text-[#0A1D2B]">
                        {step.title}
                      </h2>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      speakText(`Step ${step.number}: ${step.title}. ${step.description} ${step.tip}`)
                    }
                    aria-label={`${t('listenAloud')} step ${step.number}`}
                    className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1 rounded border border-[#CBD5E1] bg-[#F5F7FA] px-2.5 text-xs font-semibold text-[#102A43] hover:bg-[#ECF4FF]"
                  >
                    <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('listenAloud')}
                  </button>
                </div>

                <p className="mt-3 text-sm leading-relaxed text-[#253746]">
                  {step.description}
                </p>
              </div>

              <div className="mt-4 rounded border border-[#E2E8F0] bg-[#F5F7FA] px-3 py-2 text-xs text-[#43474D]">
                <strong className="text-[#102A43]">Tip:</strong> {step.tip}
              </div>
            </article>
          );
        })}
      </section>

      {mode === 'citizen' && onStartReport && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[#168B55]/30 bg-[#E8F5EC] p-5">
          <div className="flex items-center gap-3">
            <Smartphone className="h-6 w-6 text-[#168B55]" aria-hidden="true" />
            <div>
              <div className="font-display text-base font-bold text-[#0A1D2B]">
                Ready to report your first civic problem?
              </div>
              <p className="text-xs text-[#253746]">
                Just take 1 photo, tap GPS location, and press Send. Takes less than 60 seconds.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onStartReport}
            className="inline-flex h-12 cursor-pointer items-center gap-2 rounded bg-[#168B55] px-6 text-sm font-bold text-white hover:bg-[#127446]"
          >
            <Camera className="h-4 w-4" aria-hidden="true" />
            {t('tabReport')}
          </button>
        </div>
      )}

      {mode === 'admin' && (
        <div className="grid grid-cols-1 gap-4 rounded-lg border border-[#102A43]/15 bg-white p-5 text-xs text-[#253746] sm:grid-cols-3 civic-shadow-1">
          <div className="flex items-start gap-2.5">
            <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-[#102A43]" aria-hidden="true" />
            <div>
              <div className="font-bold text-[#0A1D2B]">Trained AI/ML Active</div>
              <p className="mt-0.5 text-[#52606D]">
                Objective 1 Visual MLP &amp; Objective 3 Random Forest-28 run live against trained weights.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <Compass className="mt-0.5 h-4 w-4 shrink-0 text-[#102A43]" aria-hidden="true" />
            <div>
              <div className="font-bold text-[#0A1D2B]">GPS &amp; SSIM Verification</div>
              <p className="mt-0.5 text-[#52606D]">
                Resolution proof checks 250m Haversine proximity and structural image similarity.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <HeartHandshake className="mt-0.5 h-4 w-4 shrink-0 text-[#102A43]" aria-hidden="true" />
            <div>
              <div className="font-bold text-[#0A1D2B]">Citizen Welfare Links</div>
              <p className="mt-0.5 text-[#52606D]">
                Every verified complaint builds citizen contribution scores toward scholarships.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
