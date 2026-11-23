import type { SupportedLanguage } from './types.ts';

export interface UiDictionary {
  appName: string;
  tagline: string;
  chooseLanguage: string;
  simpleMode: string;
  tabs: {
    home: string;
    myReports: string;
    benefits: string;
    rankings: string;
    me: string;
  };
  emergencyBanner: string;
  reportButton: string;
  seriousConcernButton: string;
  takePhoto: string;
  uploadGallery: string;
  speakVoice: string;
  locationStep: string;
  outsideBengaluru: string;
  goesToPrefix: string;
  wrongArea: string;
  anonymousToggle: string;
  submitReport: string;
  nearbyIssues: string;
  thisAffectsMe: string;
  aiSuggestionBadge: string;
  guideBotTitle: string;
  guideBotTurnOff: string;
  notAvailableYet: string;
}

export const UI_STRINGS: Record<SupportedLanguage, UiDictionary> = {
  en: {
    appName: 'Namma Dhwani',
    tagline: 'Your Voice. Your City. Your Impact.',
    chooseLanguage: 'Choose your language',
    simpleMode: 'Simple mode (large text & voice)',
    tabs: {
      home: 'Home',
      myReports: 'My Reports',
      benefits: 'Benefits',
      rankings: 'Rankings',
      me: 'Me',
    },
    emergencyBanner: 'Immediate life or safety emergency? Call 112 right now.',
    reportButton: 'Report a civic issue',
    seriousConcernButton: 'Report corruption or threat privately',
    takePhoto: 'Take live photo',
    uploadGallery: 'Pick from gallery',
    speakVoice: 'Speak your problem',
    locationStep: 'Confirm pin on map',
    outsideBengaluru: 'Outside service area (Karnataka only)',
    goesToPrefix: 'Goes to',
    wrongArea: 'Wrong area?',
    anonymousToggle: 'Submit anonymously (no points, no follow-up)',
    submitReport: 'Send report',
    nearbyIssues: 'Nearby issues in your area',
    thisAffectsMe: 'This affects me too',
    aiSuggestionBadge: 'AI suggestion',
    guideBotTitle: 'Namma Dhwani Helper',
    guideBotTurnOff: 'Turn off helper',
    notAvailableYet: 'Not available yet',
  },
  kn: {
    appName: 'ನಮ್ಮ ಧ್ವನಿ (Namma Dhwani)',
    tagline: 'ನಿಮ್ಮ ಧ್ವನಿ. ನಿಮ್ಮ ನಗರ. ನಿಮ್ಮ ಪ್ರಭಾವ.',
    chooseLanguage: 'ನಿಮ್ಮ ಭಾಷೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ',
    simpleMode: 'ಸರಳ ಮೋಡ್ (ದೊಡ್ಡ ಅಕ್ಷರ ಮತ್ತು ಧ್ವನಿ)',
    tabs: {
      home: 'ಮುಖಪುಟ',
      myReports: 'ನನ್ನ ದೂರುಗಳು',
      benefits: 'ಸವಲತ್ತುಗಳು',
      rankings: 'ಶ್ರೇಯಾಂಕ',
      me: 'ನಾನು',
    },
    emergencyBanner: 'ತಕ್ಷಣದ ಜೀವ ಅಥವಾ ಸುರಕ್ಷತಾ ತುರ್ತು ಸ್ಥಿತಿಯೇ? ಈಗಲೇ 112 ಗೆ ಕರೆ ಮಾಡಿ.',
    reportButton: 'ಸಮಸ್ಯೆಯನ್ನು ವರದಿ ಮಾಡಿ',
    seriousConcernButton: 'ಭ್ರಷ್ಟಾಚಾರ ಅಥವಾ ಬೆದರಿಕೆಯನ್ನು ಗೌಪ್ಯವಾಗಿ ವರದಿ ಮಾಡಿ',
    takePhoto: 'ನೇರ ಫೋಟೋ ತೆಗೆಯಿರಿ',
    uploadGallery: 'ಗ್ಯಾಲರಿಯಿಂದ ಆಯ್ಕೆಮಾಡಿ',
    speakVoice: 'ನಿಮ್ಮ ಸಮಸ್ಯೆಯನ್ನು ಮಾತನಾಡಿ',
    locationStep: 'ನಕ್ಷೆಯಲ್ಲಿ ಸ್ಥಳವನ್ನು ದೃಢೀಕರಿಸಿ',
    outsideBengaluru: 'ಸೇವಾ ವ್ಯಾಪ್ತಿಯ ಹೊರಗಿದೆ (ಕರ್ನಾಟಕ ಮಾತ್ರ)',
    goesToPrefix: 'ಇವರಿಗೆ ಹೋಗುತ್ತದೆ:',
    wrongArea: 'ತಪ್ಪಾದ ಪ್ರದೇಶವೇ?',
    anonymousToggle: 'ಅನಾಮಧೇಯವಾಗಿ ಸಲ್ಲಿಸಿ (ಅಂಕಗಳಿಲ್ಲ, ಹಿಂಬಾಲನೆ ಇಲ್ಲ)',
    submitReport: 'ವರದಿ ಕಳುಹಿಸಿ',
    nearbyIssues: 'ಹತ್ತಿರದ ಸಮಸ್ಯೆಗಳು',
    thisAffectsMe: 'ಇದು ನನಗೂ ತೊಂದರೆ ನೀಡುತ್ತಿದೆ',
    aiSuggestionBadge: 'AI ಸಲಹೆ (AI suggestion)',
    guideBotTitle: 'ನಮ್ಮ ಧ್ವನಿ ಸಹಾಯಕ',
    guideBotTurnOff: 'ಸಹಾಯಕವನ್ನು ಆಫ್ ಮಾಡಿ',
    notAvailableYet: 'ಇನ್ನೂ ಲಭ್ಯವಿಲ್ಲ',
  },
  hi: {
    appName: 'नम्मा ध्वनि (Namma Dhwani)',
    tagline: 'आपकी आवाज़। आपका शहर। आपका प्रभाव।',
    chooseLanguage: 'अपनी भाषा चुनें',
    simpleMode: 'सरल मोड (बड़े अक्षर और आवाज़)',
    tabs: {
      home: 'होम',
      myReports: 'मेरी रिपोर्ट',
      benefits: 'लाभ',
      rankings: 'रैंकिंग',
      me: 'मैं',
    },
    emergencyBanner: 'तुरंत जीवन या सुरक्षा आपातकाल? अभी 112 पर कॉल करें।',
    reportButton: 'नागरिक समस्या दर्ज करें',
    seriousConcernButton: 'भ्रष्टाचार या धमकी की गोपनीय रिपोर्ट करें',
    takePhoto: 'लाइव फ़ोटो लें',
    uploadGallery: 'गैलरी से चुनें',
    speakVoice: 'अपनी समस्या बोलें',
    locationStep: 'मानचित्र पर पिन की पुष्टि करें',
    outsideBengaluru: 'सेवा क्षेत्र से बाहर (केवल कर्नाटक)',
    goesToPrefix: 'यह जाएगा:',
    wrongArea: 'गलत क्षेत्र?',
    anonymousToggle: 'गुमनाम रूप से भेजें (कोई अंक नहीं, कोई फ़ॉलो-अप नहीं)',
    submitReport: 'रिपोर्ट भेजें',
    nearbyIssues: 'आस-पास की समस्याएँ',
    thisAffectsMe: 'यह मुझे भी प्रभावित करता है',
    aiSuggestionBadge: 'AI सुझाव (AI suggestion)',
    guideBotTitle: 'नम्मा ध्वनि सहायक',
    guideBotTurnOff: 'सहायक बंद करें',
    notAvailableYet: 'अभी उपलब्ध नहीं है',
  },
  ta: {
    appName: 'நம்ம த்வனி (Namma Dhwani)',
    tagline: 'உங்கள் குரல். உங்கள் நகரம். உங்கள் தாக்கம்.',
    chooseLanguage: 'உங்கள் மொழியைத் தேர்ந்தெடுக்கவும்',
    simpleMode: 'எளிய முறை (பெரிய எழுத்து & குரல்)',
    tabs: {
      home: 'முகப்பு',
      myReports: 'என் புகார்கள்',
      benefits: 'நலத்திட்டங்கள்',
      rankings: 'தரவரிசை',
      me: 'நான்',
    },
    emergencyBanner: 'உடனடி உயிர் அல்லது பாதுகாப்பு அவசரமா? இப்போதே 112 ஐ அழைக்கவும்.',
    reportButton: 'சிக்கலைப் புகாரளி',
    seriousConcernButton: 'ஊழல் அல்லது அச்சுறுத்தலை ரகசியமாகப் புகாரளி',
    takePhoto: 'நேரடி புகைப்படம் எடுக்கவும்',
    uploadGallery: 'கேலரியில் இருந்து தேர்வு செய்யவும்',
    speakVoice: 'உங்கள் பிரச்சனையைப் பேசுங்கள்',
    locationStep: 'வரைபடத்தில் இடத்தை உறுதிப்படுத்துக',
    outsideBengaluru: 'சேவை பகுதிக்கு வெளியே (கர்நாடகா மட்டும்)',
    goesToPrefix: 'செல்லும் இடம்:',
    wrongArea: 'தவறான பகுதியா?',
    anonymousToggle: 'அநாமதேயமாகச் சமர்ப்பிக்கவும் (புள்ளிகள் இல்லை)',
    submitReport: 'புகாரை அனுப்பு',
    nearbyIssues: 'அருகிலுள்ள சிக்கல்கள்',
    thisAffectsMe: 'இது என்னையும் பாதிக்கிறது',
    aiSuggestionBadge: 'AI பரிந்துரை (AI suggestion)',
    guideBotTitle: 'நம்ம த்வனி உதவியாளர்',
    guideBotTurnOff: 'உதவியாளரை அணைக்கவும்',
    notAvailableYet: 'இன்னும் கிடைக்கவில்லை',
  },
  te: {
    appName: 'నమ్మ ధ్వని (Namma Dhwani)',
    tagline: 'మీ గళం. మీ నగరం. మీ ప్రభావం.',
    chooseLanguage: 'మీ భాషను ఎంచుకోండి',
    simpleMode: 'సరళమైన మోడ్ (పెద్ద అక్షరాలు & వాయిస్)',
    tabs: {
      home: 'హోమ్',
      myReports: 'నా ఫిర్యాదులు',
      benefits: 'ప్రయోజనాలు',
      rankings: 'ర్యాంకింగ్స్',
      me: 'నేను',
    },
    emergencyBanner: 'తక్షణ ప్రాణ లేదా భద్రతా అత్యవసరమా? ఇప్పుడే 112కు కాల్ చేయండి.',
    reportButton: 'సమస్యను నివేదించండి',
    seriousConcernButton: 'అవినీతి లేదా బెదిరింపును రహస్యంగా నివేదించండి',
    takePhoto: 'లైవ్ ఫోటో తీయండి',
    uploadGallery: 'గ్యాలరీ నుండి ఎంచుకోండి',
    speakVoice: 'మీ సమస్యను మాట్లాడండి',
    locationStep: 'మ్యాప్‌లో పిన్ నిర్ధారించండి',
    outsideBengaluru: 'సేవా ప్రాంతం వెలుపల (కర్ణాటక మాత్రమే)',
    goesToPrefix: 'వీరికి వెళుతుంది:',
    wrongArea: 'తప్పు ప్రాంతమా?',
    anonymousToggle: 'అనామకంగా పంపండి (పాయింట్లు లేవు)',
    submitReport: 'నివేదిక పంపండి',
    nearbyIssues: 'సమీపంలోని సమస్యలు',
    thisAffectsMe: 'ఇది నన్ను కూడా ప్రభావితం చేస్తోంది',
    aiSuggestionBadge: 'AI సూచన (AI suggestion)',
    guideBotTitle: 'నమ్మ ధ్వని సహాయకుడు',
    guideBotTurnOff: 'సహాయకుడిని ఆఫ్ చేయండి',
    notAvailableYet: 'ఇంకా అందుబాటులో లేదు',
  },
};
