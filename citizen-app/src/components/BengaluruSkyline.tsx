import React from 'react';

export const BengaluruSkyline: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <svg
      viewBox="0 0 800 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      {/* Subtle ground line */}
      <line x1="0" y1="112" x2="800" y2="112" stroke="#CBD5E1" strokeWidth="1.5" />

      {/* Lalbagh Glasshouse Arch (Left) */}
      <path
        d="M40 112 V72 C40 50, 96 50, 96 72 V112"
        stroke="#0F2942"
        strokeWidth="2"
        fill="#E2E8F0"
        fillOpacity="0.35"
      />
      <path d="M54 112 V76 C54 62, 82 62, 82 76 V112" stroke="#0F2942" strokeWidth="1.5" />
      <circle cx="68" cy="53" r="4" fill="#E67E22" />

      {/* Metro Viaduct & Pillars */}
      <rect x="130" y="76" width="160" height="6" rx="2" fill="#0F2942" fillOpacity="0.85" />
      <rect x="155" y="82" width="6" height="30" fill="#64748B" />
      <rect x="210" y="82" width="6" height="30" fill="#64748B" />
      <rect x="265" y="82" width="6" height="30" fill="#64748B" />
      <rect x="160" y="66" width="58" height="9" rx="2" fill="#15803D" fillOpacity="0.85" />

      {/* Vidhana Soudha Central Dome & Columns (Center) */}
      <rect x="330" y="68" width="140" height="44" fill="#FFFFFF" stroke="#0F2942" strokeWidth="2" />
      <rect x="366" y="46" width="68" height="22" fill="#FFFFFF" stroke="#0F2942" strokeWidth="2" />
      <path
        d="M380 46 C380 26, 420 26, 420 46 Z"
        fill="#0F2942"
      />
      <line x1="400" y1="20" x2="400" y2="30" stroke="#E67E22" strokeWidth="2.5" />
      <circle cx="400" cy="18" r="3" fill="#E67E22" />
      {/* Pillars */}
      <line x1="348" y1="74" x2="348" y2="112" stroke="#0F2942" strokeWidth="2" />
      <line x1="364" y1="74" x2="364" y2="112" stroke="#0F2942" strokeWidth="2" />
      <line x1="380" y1="74" x2="380" y2="112" stroke="#0F2942" strokeWidth="2" />
      <line x1="420" y1="74" x2="420" y2="112" stroke="#0F2942" strokeWidth="2" />
      <line x1="436" y1="74" x2="436" y2="112" stroke="#0F2942" strokeWidth="2" />
      <line x1="452" y1="74" x2="452" y2="112" stroke="#0F2942" strokeWidth="2" />

      {/* Garden City Rain Trees & Tech Corridor (Right) */}
      <circle cx="520" cy="86" r="14" fill="#15803D" fillOpacity="0.22" stroke="#15803D" strokeWidth="1.5" />
      <line x1="520" y1="96" x2="520" y2="112" stroke="#0F2942" strokeWidth="2" />

      <rect x="570" y="54" width="44" height="58" fill="#FFFFFF" stroke="#0F2942" strokeWidth="1.75" />
      <rect x="626" y="40" width="50" height="72" fill="#FFFFFF" stroke="#0F2942" strokeWidth="1.75" />
      <rect x="688" y="64" width="38" height="48" fill="#FFFFFF" stroke="#0F2942" strokeWidth="1.75" />

      <circle cx="752" cy="88" r="13" fill="#15803D" fillOpacity="0.22" stroke="#15803D" strokeWidth="1.5" />
      <line x1="752" y1="97" x2="752" y2="112" stroke="#0F2942" strokeWidth="2" />
    </svg>
  );
};
