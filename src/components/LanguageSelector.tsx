import React from 'react';
import { Languages } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../i18n/translations';

interface LanguageSelectorProps {
  compact?: boolean;
  dark?: boolean;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  compact = false,
  dark = false,
}) => {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div className="inline-flex items-center gap-2">
      {!compact && (
        <span
          className={`hidden items-center gap-1 text-xs font-semibold sm:inline-flex ${
            dark ? 'text-[#B0C9E8]' : 'text-[#253746]'
          }`}
        >
          <Languages className="h-3.5 w-3.5" aria-hidden="true" />
          {t('chooseLanguage')}:
        </span>
      )}
      <select
        aria-label={t('chooseLanguage')}
        value={language}
        onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
        className={`h-9 cursor-pointer rounded border px-2.5 text-xs font-semibold outline-none ${
          dark
            ? 'border-white/25 bg-[#0B1D2F] text-white hover:border-white/50'
            : 'border-[#CBD5E1] bg-white text-[#0A1D2B] hover:border-[#102A43]'
        }`}
      >
        {SUPPORTED_LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.nativeName} ({lang.englishName})
          </option>
        ))}
      </select>
    </div>
  );
};
