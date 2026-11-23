import { HelpCircle, Mic, Send, Volume2, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { SUPPORTED_LANGUAGES } from '@shared/constants';
import { UI_STRINGS } from '@shared/i18n';
import type { SupportedLanguage } from '@shared/types';
import { auth } from '../firebase';

interface GuideBotWidgetProps {
  language: SupportedLanguage;
  screen: 'home' | 'report' | 'my_reports' | 'benefits' | 'rankings' | 'me';
  enabled: boolean;
  simpleMode: boolean;
  onTurnOff: () => void;
  onTriggerAction?: () => void;
  actionButtonLabel?: string;
}

export const GuideBotWidget: React.FC<GuideBotWidgetProps> = ({
  language,
  screen,
  enabled,
  simpleMode,
  onTurnOff,
  onTriggerAction,
  actionButtonLabel,
}) => {
  const t = UI_STRINGS[language] || UI_STRINGS.en;
  const [open, setOpen] = useState(false);
  const [dismissedForScreen, setDismissedForScreen] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState('');
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const seenScreensRef = useRef<Set<string>>(new Set());

  // Contextual popup on first visit to a screen
  useEffect(() => {
    if (!enabled) return;
    if (!seenScreensRef.current.has(screen) && !dismissedForScreen[screen]) {
      seenScreensRef.current.add(screen);
      setOpen(true);
      void fetchContextualTip();
    }
  }, [screen, enabled]);

  async function fetchContextualTip(userText?: string) {
    setLoading(true);
    setVoiceNotice(null);
    try {
      const resp = await fetch('/api/ai/guide-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language,
          screen,
          userMessage: userText,
          simpleMode,
        }),
      });
      const data = (await resp.json()) as { text?: string };
      setMessage(
        data.text ||
          'Tap the large button to report an issue or check nearby reports.'
      );
    } catch {
      setMessage('Tap "Report a civic issue" to send a photo or voice report in 3 taps.');
    } finally {
      setLoading(false);
    }
  }

  async function speakCurrentMessage() {
    if (!message.trim()) return;
    setVoiceNotice(null);

    try {
      const resp = await fetch('/api/ai/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message, language }),
      });
      const data = (await resp.json()) as {
        audioBase64?: string;
        mimeType?: string;
        fallbackToBrowserTts?: boolean;
      };
      if (data.audioBase64 && !data.fallbackToBrowserTts) {
        const audio = new Audio(`data:${data.mimeType || 'audio/wav'};base64,${data.audioBase64}`);
        await audio.play();
        return;
      }
    } catch {
      // Fall through cleanly to browser speechSynthesis
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const targetLang =
        SUPPORTED_LANGUAGES.find((l) => l.code === language)?.speechLang || 'en-IN';
      const voices = window.speechSynthesis.getVoices();
      const hasMatchingVoice = voices.some((v) =>
        v.lang.toLowerCase().startsWith(language.toLowerCase())
      );
      if (voices.length > 0 && !hasMatchingVoice && language !== 'en') {
        setVoiceNotice(
          `Voice playback is not available for ${SUPPORTED_LANGUAGES.find((l) => l.code === language)?.nativeName || language} on this device — showing text only.`
        );
        return;
      }
      const utter = new SpeechSynthesisUtterance(message);
      utter.lang = targetLang;
      window.speechSynthesis.speak(utter);
    } else {
      setVoiceNotice('Voice playback is not supported on this browser — showing text only.');
    }
  }

  async function toggleVoiceQuestion() {
    if (recording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = String(reader.result || '');
          const token = await auth.currentUser?.getIdToken().catch(() => null);
          if (!token) {
            setVoiceNotice('Please sign in first to use voice help.');
            return;
          }
          setLoading(true);
          try {
            const resp = await fetch('/api/ai/transcribe-voice', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                audioBase64: base64,
                mimeType: blob.type || 'audio/webm',
                hintLanguage: language,
              }),
            });
            const data = (await resp.json()) as { transcript?: string; notice?: string };
            if (data.transcript) {
              setQuestion(data.transcript);
              await fetchContextualTip(data.transcript);
            } else {
              setVoiceNotice(data.notice || 'Could not hear speech clearly; try typing below.');
              setLoading(false);
            }
          } catch {
            setVoiceNotice('Voice recognition unavailable right now.');
            setLoading(false);
          }
        };
        reader.readAsDataURL(blob);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setVoiceNotice('Microphone access not available on this device.');
    }
  }

  if (!enabled) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          if (!message) void fetchContextualTip();
        }}
        className="fixed bottom-20 right-4 z-30 flex items-center gap-2 rounded-lg bg-[#0F2942] px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-[#173A5E] focus:outline-none focus:ring-2 focus:ring-[#E67E22]"
        aria-label={t.guideBotTitle}
      >
        <HelpCircle className="h-5 w-5 text-[#E67E22]" />
        <span>{t.guideBotTitle}</span>
      </button>
    );
  }

  return (
    <aside
      aria-label={t.guideBotTitle}
      className="fixed bottom-20 right-4 z-30 w-[calc(100vw-2rem)] max-w-sm rounded-xl border border-slate-300 bg-white p-4 shadow-xl"
    >
      <div className="mb-2 flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-[#E67E22]" />
          <span className="font-display text-sm font-bold text-[#0F2942]">
            {t.guideBotTitle}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onTurnOff}
            className="text-xs font-medium text-slate-500 underline hover:text-slate-800"
          >
            {t.guideBotTurnOff}
          </button>
          <button
            type="button"
            onClick={() => {
              setDismissedForScreen((prev) => ({ ...prev, [screen]: true }));
              setOpen(false);
            }}
            className="rounded p-1 text-slate-500 hover:bg-slate-100"
            aria-label="Close helper"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <p className="text-sm text-slate-800 leading-relaxed">
        {loading ? 'Thinking...' : message}
      </p>

      {voiceNotice && (
        <p className="mt-2 rounded bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 border border-amber-200">
          {voiceNotice}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void speakCurrentMessage()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-[#0F2942] hover:bg-slate-100"
        >
          <Volume2 className="h-4 w-4" />
          <span>Listen</span>
        </button>

        {onTriggerAction && actionButtonLabel && (
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onTriggerAction();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#E67E22] px-3 py-2 text-xs font-semibold text-white hover:bg-[#D36D16]"
          >
            {actionButtonLabel}
          </button>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!question.trim()) return;
          void fetchContextualTip(question.trim());
          setQuestion('');
        }}
        className="mt-3 flex items-center gap-1.5"
      >
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a quick question..."
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-[#0F2942] focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void toggleVoiceQuestion()}
          className={`rounded-lg border px-2.5 py-2 text-xs ${
            recording
              ? 'border-red-500 bg-red-600 text-white'
              : 'border-slate-300 bg-white text-[#0F2942] hover:bg-slate-50'
          }`}
          aria-label="Speak question"
        >
          <Mic className="h-4 w-4" />
        </button>
        <button
          type="submit"
          className="rounded-lg bg-[#0F2942] px-2.5 py-2 text-xs text-white hover:bg-[#173A5E]"
          aria-label="Ask"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </aside>
  );
};
