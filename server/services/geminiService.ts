import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { COMPLAINT_CATEGORIES, SEVERITY_LEVELS } from '../../shared/constants.ts';
import type { ComplaintCategory, SeverityLevel, SupportedLanguage } from '../../shared/types.ts';

const GEMINI_TEXT_MODEL = 'gemini-4-hydrogen';
const GEMINI_STT_MODEL = 'gemini-3.5-transcribe';
const GEMINI_TTS_MODEL = 'gemini-3.8-flash-lite-tts';

function stripJsonFences(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('```')) {
    return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }
  return trimmed;
}

function getGeminiClient(): GoogleGenAI | null {
  const key = (process.env.GEMINI_API_KEY || '').trim();
  if (!key || key === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function isGeminiConfigured(): boolean {
  return getGeminiClient() !== null;
}

const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  en: 'English',
  kn: 'Kannada',
  hi: 'Hindi',
  ta: 'Tamil',
  te: 'Telugu',
};

export interface PhotoAnalysisResult {
  available: boolean;
  aiSuggestion: boolean;
  suggestedCategory: ComplaintCategory;
  suggestedSeverity: SeverityLevel;
  suggestedTitle: string;
  suggestedDescription: string;
  englishTranslation: string;
  suspectedAiGenerated: boolean;
  aiImageReason: string;
  notice?: string;
}

export async function analyzeCivicPhoto(
  imageBase64: string,
  mimeType: string,
  language: SupportedLanguage
): Promise<PhotoAnalysisResult> {
  const ai = getGeminiClient();
  const fallback: PhotoAnalysisResult = {
    available: false,
    aiSuggestion: false,
    suggestedCategory: 'Other civic issue',
    suggestedSeverity: 'Medium',
    suggestedTitle: 'Civic issue reported via photo',
    suggestedDescription: 'Please add a short note describing the civic issue.',
    englishTranslation: 'Civic issue reported via photo.',
    suspectedAiGenerated: false,
    aiImageReason: 'AI analysis unavailable right now; please choose category and description manually.',
    notice: 'AI photo auto-description is currently unavailable. Please enter a short description manually.',
  };

  if (!ai) return fallback;

  try {
    const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    const targetLangName = LANGUAGE_NAMES[language] || 'English';

    const response = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: mimeType || 'image/jpeg',
                data: cleanBase64,
              },
            },
            {
              text: `You are helping a citizen in Karnataka file a civic infrastructure issue report immediately from an uploaded photo.
Carefully inspect what is visible in the photo and generate a complete, ready-to-submit draft:
1. Classify the visible civic issue into ONE of: ${COMPLAINT_CATEGORIES.join(', ')}.
2. Assess urgency/severity as ONE of: ${SEVERITY_LEVELS.join(', ')} based on safety risk, traffic obstruction, or public health impact visible.
3. Write a specific, clear 5-10 word title (max 85 chars) in ${targetLangName} naming the exact visible problem (e.g. "Deep waterlogged pothole blocking two-wheeler lane").
4. Write a concrete, ready-to-send 2-3 sentence description in ${targetLangName} that helps the citizen immediately without needing to write from scratch: state clearly what is damaged/overflowing/broken, visible road or roadside context/obstruction, and why it poses a hazard or inconvenience to commuters/residents. Do NOT say "please add details" — write the actual observation directly.
5. Provide a clear, faithful English translation of suggestedDescription in englishTranslation (if ${targetLangName} is English, match it closely).
6. Note honestly if the image shows obvious synthetic/AI-generated visual artifacts (suspectedAiGenerated boolean + short reason). Do NOT invent accuracy percentages.`,
            },
          ],
        },
      ],
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            suggestedCategory: { type: Type.STRING },
            suggestedSeverity: { type: Type.STRING },
            suggestedTitle: { type: Type.STRING },
            suggestedDescription: { type: Type.STRING },
            englishTranslation: { type: Type.STRING },
            suspectedAiGenerated: { type: Type.BOOLEAN },
            aiImageReason: { type: Type.STRING },
          },
          required: [
            'suggestedCategory',
            'suggestedSeverity',
            'suggestedTitle',
            'suggestedDescription',
            'englishTranslation',
            'suspectedAiGenerated',
            'aiImageReason',
          ],
        },
      },
    });

    const parsed = JSON.parse(stripJsonFences(response.text || '{}')) as Partial<PhotoAnalysisResult>;
    const cat = COMPLAINT_CATEGORIES.includes(parsed.suggestedCategory as ComplaintCategory)
      ? (parsed.suggestedCategory as ComplaintCategory)
      : 'Other civic issue';
    const sev = SEVERITY_LEVELS.includes(parsed.suggestedSeverity as SeverityLevel)
      ? (parsed.suggestedSeverity as SeverityLevel)
      : 'Medium';

    const cleanTitle = String(parsed.suggestedTitle || '').trim();
    const cleanDesc = String(parsed.suggestedDescription || '').trim();
    const cleanEng = String(parsed.englishTranslation || cleanDesc || '').trim();

    return {
      available: Boolean(cleanDesc || cleanTitle),
      aiSuggestion: Boolean(cleanDesc || cleanTitle),
      suggestedCategory: cat,
      suggestedSeverity: sev,
      suggestedTitle: (cleanTitle || `${cat} observed in photo`).slice(0, 120),
      suggestedDescription: (
        cleanDesc ||
        `Visible ${cat.toLowerCase()} issue captured in the photo requiring inspection and repair.`
      ).slice(0, 800),
      englishTranslation: (
        cleanEng ||
        cleanDesc ||
        `Visible ${cat.toLowerCase()} issue captured in the photo requiring inspection.`
      ).slice(0, 800),
      suspectedAiGenerated: Boolean(parsed.suspectedAiGenerated),
      aiImageReason: String(parsed.aiImageReason || 'Visual check completed.'),
    };
  } catch (err) {
    console.warn('Gemini photo analysis degraded gracefully:', err);
    return fallback;
  }
}

export interface VoiceTranscriptionResult {
  available: boolean;
  detectedLanguage: SupportedLanguage;
  transcript: string;
  englishTranslation: string;
  suggestedTitle: string;
  suggestedCategory: ComplaintCategory;
  suggestedSeverity: SeverityLevel;
  placeClues: string;
  notice?: string;
}

export async function transcribeAndExtractVoice(
  audioBase64: string,
  mimeType: string,
  hintLanguage: SupportedLanguage
): Promise<VoiceTranscriptionResult> {
  const ai = getGeminiClient();
  const fallback: VoiceTranscriptionResult = {
    available: false,
    detectedLanguage: hintLanguage,
    transcript: '',
    englishTranslation: '',
    suggestedTitle: '',
    suggestedCategory: 'Other civic issue',
    suggestedSeverity: 'Medium',
    placeClues: '',
    notice: 'Voice transcription AI is not connected right now. Please type your report below.',
  };
  if (!ai) return fallback;

  try {
    const cleanAudio = audioBase64.includes(',') ? audioBase64.split(',')[1] : audioBase64;
    const sttResp = await ai.models.generateContent({
      model: GEMINI_STT_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: mimeType || 'audio/webm',
                data: cleanAudio,
              },
            },
            {
              text: 'Transcribe this Karnataka citizen voice note accurately verbatim in the spoken language (English, Kannada, Hindi, Tamil, or Telugu). Return plain transcript text only.',
            },
          ],
        },
      ],
    });

    const transcript = (sttResp.text || '').trim();
    if (!transcript) {
      return {
        ...fallback,
        notice: 'No speech was detected in the recording. Please try speaking closer to the mic or type below.',
      };
    }

    const extractResp = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: `A Karnataka citizen spoke this civic complaint: "${transcript}"
Extract structured fields:
- detectedLanguage: one of "en", "kn", "hi", "ta", "te"
- englishTranslation: clear English translation of the citizen's spoken message
- suggestedTitle: concise 5-10 word title in English
- suggestedCategory: one of ${COMPLAINT_CATEGORIES.join(', ')}
- suggestedSeverity: one of ${SEVERITY_LEVELS.join(', ')}
- placeClues: any landmark, street, or locality mentioned (never override GPS pin — clues only)`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            detectedLanguage: { type: Type.STRING },
            englishTranslation: { type: Type.STRING },
            suggestedTitle: { type: Type.STRING },
            suggestedCategory: { type: Type.STRING },
            suggestedSeverity: { type: Type.STRING },
            placeClues: { type: Type.STRING },
          },
          required: [
            'detectedLanguage',
            'englishTranslation',
            'suggestedTitle',
            'suggestedCategory',
            'suggestedSeverity',
            'placeClues',
          ],
        },
      },
    });

    const parsed = JSON.parse(stripJsonFences(extractResp.text || '{}')) as Partial<VoiceTranscriptionResult>;
    const lang: SupportedLanguage = (['en', 'kn', 'hi', 'ta', 'te'] as const).includes(
      parsed.detectedLanguage as SupportedLanguage
    )
      ? (parsed.detectedLanguage as SupportedLanguage)
      : hintLanguage;
    const cat = COMPLAINT_CATEGORIES.includes(parsed.suggestedCategory as ComplaintCategory)
      ? (parsed.suggestedCategory as ComplaintCategory)
      : 'Other civic issue';
    const sev = SEVERITY_LEVELS.includes(parsed.suggestedSeverity as SeverityLevel)
      ? (parsed.suggestedSeverity as SeverityLevel)
      : 'Medium';

    return {
      available: true,
      detectedLanguage: lang,
      transcript,
      englishTranslation: String(parsed.englishTranslation || transcript),
      suggestedTitle: String(parsed.suggestedTitle || 'Civic complaint via voice'),
      suggestedCategory: cat,
      suggestedSeverity: sev,
      placeClues: String(parsed.placeClues || ''),
    };
  } catch (err) {
    console.warn('Gemini voice transcription degraded gracefully:', err);
    return fallback;
  }
}

export async function translateComplaintText(
  text: string,
  sourceLanguage: SupportedLanguage
): Promise<{ englishTranslation: string; available: boolean }> {
  if (!text.trim() || sourceLanguage === 'en') {
    return { englishTranslation: text, available: true };
  }
  const ai = getGeminiClient();
  if (!ai) {
    return { englishTranslation: text, available: false };
  }
  try {
    const resp = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: `Translate this Karnataka civic complaint from ${LANGUAGE_NAMES[sourceLanguage]} into clear, literal English for government staff. Return only the English translation:\n\n${text}`,
    });
    return {
      englishTranslation: (resp.text || text).trim(),
      available: true,
    };
  } catch {
    return { englishTranslation: text, available: false };
  }
}

export async function generateGuideBotMessage(params: {
  language: SupportedLanguage;
  screen: string;
  userMessage?: string;
  simpleMode?: boolean;
}): Promise<{ text: string; actionLabel?: string; available: boolean }> {
  const ai = getGeminiClient();
  const langName = LANGUAGE_NAMES[params.language] || 'English';

  const deterministicTips: Record<string, string> = {
    home: 'Tap "Report a civic issue" to take a photo or speak your problem. We find your MLA or local civic desk from your map pin automatically across Karnataka.',
    report: 'Step 1: Take a photo or speak. Step 2: Confirm the map pin anywhere in Karnataka. Step 3: Tap Send report.',
    my_reports: 'Here you can track updates from your local civic office and confirm when a fix is genuinely completed.',
    me: 'Check your verification status, turn on Simple mode for larger text, or manage your privacy choices here.',
  };

  const defaultText = deterministicTips[params.screen] || deterministicTips.home;

  if (!ai) {
    return { text: defaultText, available: false };
  }

  try {
    const prompt = params.userMessage
      ? `You are the friendly Namma Dhwani civic helper bot for Karnataka citizens. Answer in ${langName} using AT MOST 2 short, friendly plain sentences (no jargon). Screen: "${params.screen}". Simple mode: ${Boolean(params.simpleMode)}. User asked: "${params.userMessage}"`
      : `Give a 1-2 short sentence welcome tip in ${langName} for a citizen currently on the "${params.screen}" screen of Namma Dhwani (Karnataka civic reporting app). Keep it warm and plain.`;

    const resp = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: prompt,
    });
    const txt = (resp.text || '').trim();
    return { text: txt || defaultText, available: true };
  } catch {
    return { text: defaultText, available: false };
  }
}

function wrapPcmAsWav(pcmBuffer: Buffer, sampleRate = 24000): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcmBuffer]);
}

export async function synthesizeGuideSpeech(
  text: string,
  language: SupportedLanguage
): Promise<{ audioBase64?: string; mimeType?: string; fallbackToBrowserTts: boolean }> {
  const ai = getGeminiClient();
  if (!ai || !text.trim()) {
    return { fallbackToBrowserTts: true };
  }

  try {
    const resp = await ai.models.generateContent({
      model: GEMINI_TTS_MODEL,
      contents: `Speak this calmly and clearly in ${LANGUAGE_NAMES[language]}: ${text}`,
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const part = resp.candidates?.[0]?.content?.parts?.[0];
    if (!part?.inlineData?.data) {
      return { fallbackToBrowserTts: true };
    }

    const rawBytes = Buffer.from(part.inlineData.data, 'base64');
    const mime = part.inlineData.mimeType || 'audio/pcm';
    if (mime.includes('wav')) {
      return {
        audioBase64: rawBytes.toString('base64'),
        mimeType: 'audio/wav',
        fallbackToBrowserTts: false,
      };
    }

    const wavBuffer = wrapPcmAsWav(rawBytes, 24000);
    return {
      audioBase64: wavBuffer.toString('base64'),
      mimeType: 'audio/wav',
      fallbackToBrowserTts: false,
    };
  } catch (err) {
    console.warn('Gemini TTS falling back to browser speechSynthesis:', err);
    return { fallbackToBrowserTts: true };
  }
}

export interface VerifyRepairAiInput {
  title: string;
  description: string;
  category: string;
  resolutionNote?: string;
  beforePhotoDataUrl?: string;
  afterPhotoDataUrl?: string;
}

export interface VerifyRepairAiOutput {
  available: boolean;
  aiSuggestion: true;
  verdict: 'looks_fixed' | 'unclear' | 'needs_check' | 'unavailable';
  summary: string;
  checkedAt: string;
}

function extractInlineImagePart(dataUrl?: string): { mimeType: string; data: string } | null {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    return null;
  }
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return null;
  const header = dataUrl.slice(5, commaIdx);
  const mimeType = header.split(';')[0] || 'image/jpeg';
  const data = dataUrl.slice(commaIdx + 1);
  if (!data) return null;
  return { mimeType, data };
}

export async function verifyRepairWithAi(
  input: VerifyRepairAiInput
): Promise<VerifyRepairAiOutput> {
  const checkedAt = new Date().toISOString();
  const ai = getGeminiClient();
  const fallback: VerifyRepairAiOutput = {
    available: false,
    aiSuggestion: true,
    verdict: 'unavailable',
    summary:
      'AI suggestion unavailable right now. Please inspect the before and after photos directly.',
    checkedAt,
  };

  if (!ai) return fallback;

  try {
    const parts: Array<
      { inlineData: { mimeType: string; data: string } } | { text: string }
    > = [];
    const beforeImg = extractInlineImagePart(input.beforePhotoDataUrl);
    const afterImg = extractInlineImagePart(input.afterPhotoDataUrl);

    if (beforeImg) {
      parts.push({ text: 'BEFORE PHOTO (original citizen report):' });
      parts.push({ inlineData: beforeImg });
    }
    if (afterImg) {
      parts.push({ text: 'AFTER PHOTO (repair proof uploaded by office):' });
      parts.push({ inlineData: afterImg });
    }

    parts.push({
      text: `You are an objective civic repair reviewer for Karnataka.
Complaint title: "${input.title}"
Category: "${input.category}"
Citizen issue description: "${input.description}"
Office repair note: "${input.resolutionNote || 'None provided'}"

Compare the evidence carefully. Do NOT invent confidence percentages or accuracy numbers.
Return JSON with:
- verdict: ONE of "looks_fixed", "unclear", or "needs_check"
- summary: 1-2 short plain-language sentences explaining what changed or why citizen verification is needed.`,
    });

    const resp = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: [{ role: 'user', parts }],
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            verdict: { type: Type.STRING },
            summary: { type: Type.STRING },
          },
          required: ['verdict', 'summary'],
        },
      },
    });

    const parsed = JSON.parse(stripJsonFences(resp.text || '{}')) as {
      verdict?: string;
      summary?: string;
    };
    const verdict =
      parsed.verdict === 'looks_fixed' ||
      parsed.verdict === 'unclear' ||
      parsed.verdict === 'needs_check'
        ? parsed.verdict
        : 'needs_check';

    return {
      available: true,
      aiSuggestion: true,
      verdict,
      summary: String(
        parsed.summary || 'Please verify whether the issue is resolved on site.'
      ).slice(0, 400),
      checkedAt,
    };
  } catch (err) {
    console.warn('Gemini fix verification degraded gracefully:', err);
    return fallback;
  }
}

export interface BackgroundComplaintAiInput {
  title: string;
  description: string;
  category: string;
  status: string;
  originalLanguage: SupportedLanguage;
  localityName: string;
  constituencyName: string;
}

export async function runBackgroundComplaintAi(
  input: BackgroundComplaintAiInput
): Promise<{
  available: boolean;
  aiStatus: 'completed' | 'unavailable';
  draftReply: string;
}> {
  const ai = getGeminiClient();
  const langName = LANGUAGE_NAMES[input.originalLanguage] || 'English';

  if (!ai) {
    return {
      available: false,
      aiStatus: 'unavailable',
      draftReply: '',
    };
  }

  try {
    const resp = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: `You assist a Karnataka civic grievance desk. Write a polite, neutral, plain-language status update draft (2 short sentences max) in English for staff to review and send regarding this report:
Title: "${input.title}"
Category: "${input.category}"
Current Status: "${input.status}"
Area: "${input.localityName}, ${input.constituencyName}"
Citizen language: "${langName}"
Details: "${input.description}"
Do not invent timelines, phone numbers, or fake compensation.`,
    });

    const draftReply = (resp.text || '').trim().slice(0, 500);
    return {
      available: Boolean(draftReply),
      aiStatus: draftReply ? 'completed' : 'unavailable',
      draftReply,
    };
  } catch (err) {
    console.warn('Background complaint AI drafting degraded gracefully:', err);
    return {
      available: false,
      aiStatus: 'unavailable',
      draftReply: '',
    };
  }
}

export async function generateCommunityImpactBrief(input: {
  title: string;
  description: string;
  category: string;
  localityName: string;
  constituencyName: string;
  upvoteCount: number;
  status: string;
  language?: SupportedLanguage;
}): Promise<{
  available: boolean;
  aiSuggestion: true;
  aiStatus: 'completed' | 'unavailable';
  communityBrief: string;
}> {
  const ai = getGeminiClient();
  const langName = LANGUAGE_NAMES[input.language || 'en'] || 'English';
  if (!ai) {
    return {
      available: false,
      aiSuggestion: true,
      aiStatus: 'unavailable',
      communityBrief: '',
    };
  }

  try {
    const resp = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: `You help citizens and civic/MLA offices in Karnataka understand local civic impact as neighbours upvote an issue.
Write 1-2 short plain sentences in ${langName} summarizing why this ${input.category} report in ${input.localityName} (${input.constituencyName}) matters to the neighbourhood now that ${input.upvoteCount} resident(s) have supported it, and suggest the clearest civic next step for ${input.status}.
Issue: "${input.title}" — "${input.description}"
Rules: Be factual, politically neutral, no invented statistics or accuracy numbers, no promises of dates.`,
    });
    const brief = (resp.text || '').trim().slice(0, 480);
    return {
      available: Boolean(brief),
      aiSuggestion: true,
      aiStatus: brief ? 'completed' : 'unavailable',
      communityBrief: brief,
    };
  } catch (err) {
    console.warn('Community impact AI brief degraded gracefully:', err);
    return {
      available: false,
      aiSuggestion: true,
      aiStatus: 'unavailable',
      communityBrief: '',
    };
  }
}

export interface DuplicateAiVerificationResult {
  available: boolean;
  isDuplicate: boolean;
  matchedComplaintId?: string;
  confidenceLabel: 'high' | 'possible' | 'none';
  reason: string;
}

export async function verifyDuplicateWithAi(
  candidate: {
    title: string;
    description: string;
    englishTranslation?: string;
    category: string;
  },
  nearbyComplaints: Array<{
    id: string;
    title: string;
    description: string;
    englishTranslation?: string;
    category: string;
    distanceMeters: number;
    status: string;
  }>
): Promise<DuplicateAiVerificationResult> {
  const ai = getGeminiClient();
  if (!ai || nearbyComplaints.length === 0) {
    return {
      available: false,
      isDuplicate: false,
      confidenceLabel: 'none',
      reason: '',
    };
  }

  try {
    const candidateSummary = `${candidate.category}: "${candidate.title}" — ${
      candidate.englishTranslation || candidate.description
    }`;
    const nearbyList = nearbyComplaints
      .slice(0, 6)
      .map(
        (c, idx) =>
          `${idx + 1}. id="${c.id}" | dist=${Math.round(c.distanceMeters)}m | cat="${c.category}" | status="${c.status}" | title="${c.title}" | details="${(
            c.englishTranslation || c.description
          ).slice(0, 240)}"`
      )
      .join('\n');

    const resp = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: `You are a trained civic duplicate-detection classifier for Karnataka (Namma Dhwani).
Determine whether the NEW complaint describes the SAME underlying civic issue at the same site as one of the NEARBY ACTIVE complaints (including paraphrases, cross-language equivalents, or slightly shifted GPS pins within 250m), OR whether it is a genuinely different civic problem.

Few-shot training examples:
- DUPLICATE (true): New: Potholes "Waterlogged crater on curved road" vs Existing: Potholes "Large rainwater filled pit blocking bend" (90m away) -> isDuplicate=true, same pothole hazard.
- DUPLICATE (true): New: Other civic issue "Stinking trash pile near gate" vs Existing: Garbage accumulation "Overflowing garbage bin not cleared" (65m away) -> isDuplicate=true, same waste dump.
- DUPLICATE (true): New: Broken streetlights "Street dark near temple" vs Existing: Broken streetlights "Three pole bulbs out at temple road" (80m away) -> isDuplicate=true, same streetlight outage.
- DUPLICATE (true): New Kannada/Hindi/Tamil description translating to same leaking pipe as existing English Water leakage report (110m away) -> isDuplicate=true.
- DISTINCT (false): New: Broken streetlights "Junction pole light off at night" vs Existing: Potholes "Deep pothole near bus shelter" (35m away) -> isDuplicate=false, different civic failure types at the same junction.
- DISTINCT (false): New: Water leakage "Drinking water pipe burst" vs Existing: Water leakage "Road pothole 280m away" -> isDuplicate=false.

NEW COMPLAINT CANDIDATE:
${candidateSummary}

NEARBY ACTIVE COMPLAINTS:
${nearbyList}

Return JSON with:
- isDuplicate: boolean (true only if the new report is clearly raising the same problem already active nearby)
- matchedComplaintId: string (exact id from NEARBY ACTIVE COMPLAINTS if isDuplicate=true, else "")
- confidenceLabel: "high" | "possible" | "none"
- reason: 1 short plain sentence explaining to the citizen why this matches (or why it's distinct).`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isDuplicate: { type: Type.BOOLEAN },
            matchedComplaintId: { type: Type.STRING },
            confidenceLabel: { type: Type.STRING },
            reason: { type: Type.STRING },
          },
          required: ['isDuplicate', 'matchedComplaintId', 'confidenceLabel', 'reason'],
        },
      },
    });

    const parsed = JSON.parse(stripJsonFences(resp.text || '{}')) as {
      isDuplicate?: boolean;
      matchedComplaintId?: string;
      confidenceLabel?: string;
      reason?: string;
    };

    const validId = nearbyComplaints.find((c) => c.id === parsed.matchedComplaintId)?.id;
    const isDuplicate = Boolean(parsed.isDuplicate && validId);
    const confidenceLabel =
      parsed.confidenceLabel === 'high' || parsed.confidenceLabel === 'possible'
        ? parsed.confidenceLabel
        : 'none';

    return {
      available: true,
      isDuplicate,
      ...(validId ? { matchedComplaintId: validId } : {}),
      confidenceLabel: isDuplicate ? confidenceLabel : 'none',
      reason: String(parsed.reason || '').slice(0, 260),
    };
  } catch (err) {
    console.warn('Gemini duplicate verification degraded gracefully:', err);
    return {
      available: false,
      isDuplicate: false,
      confidenceLabel: 'none',
      reason: '',
    };
  }
}
