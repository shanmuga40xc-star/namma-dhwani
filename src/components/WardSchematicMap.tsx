import React, { useState } from 'react';
import { CivicIncident, IncidentStatus, WardSummary } from '../types/civic';

interface WardSchematicMapProps {
  wards: WardSummary[];
  incidents: CivicIncident[];
  selectedWard: number | null;
  onSelectWard: (wardNumber: number | null) => void;
}

export const WardSchematicMap: React.FC<WardSchematicMapProps> = ({
  wards,
  incidents,
  selectedWard,
  onSelectWard,
}) => {
  const [hoveredWard, setHoveredWard] = useState<number | null>(null);

  const getWardStats = (wardNumber: number) => {
    const wardTickets = incidents.filter((i) => i.wardNumber === wardNumber && !i.isMergedDuplicate);
    const isClosed = (s: IncidentStatus) =>
      s === IncidentStatus.Resolved || s === IncidentStatus.Verified;
    const active = wardTickets.filter((i) => !isClosed(i.status)).length;
    const overdue = wardTickets.filter(
      (i) => !isClosed(i.status) && i.slaHoursRemaining < 0
    ).length;
    return { total: wardTickets.length, active, overdue };
  };

  const activeWardData = wards.find((w) => w.wardNumber === (hoveredWard ?? selectedWard));
  const activeStats = activeWardData ? getWardStats(activeWardData.wardNumber) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative rounded border border-[#102A43]/10 bg-[#F7F9FF] p-3">
        <svg
          viewBox="0 0 440 320"
          className="w-full h-auto max-h-[270px] select-none"
          role="img"
          aria-label="Municipal Ward Incident Density Map"
        >
          {/* Subtle municipal grid lines */}
          <defs>
            <pattern id="civicGrid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path
                d="M 24 0 L 0 0 0 24"
                fill="none"
                stroke="#102A43"
                strokeOpacity="0.045"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect x="0" y="0" width="440" height="320" fill="url(#civicGrid)" rx="4" />

          {wards.map((ward) => {
            const stats = getWardStats(ward.wardNumber);
            const isSelected = selectedWard === ward.wardNumber;
            const isHovered = hoveredWard === ward.wardNumber;

            let fillColor = '#FFFFFF';
            if (stats.overdue > 0) {
              fillColor = '#FFEDE9';
            } else if (stats.active >= 2) {
              fillColor = '#FEF5E7';
            } else if (stats.active === 1) {
              fillColor = '#ECF4FF';
            } else {
              fillColor = '#E8F5EC';
            }

            if (isSelected) {
              fillColor = '#102A43';
            }

            const strokeColor = isSelected
              ? '#00152A'
              : isHovered
                ? '#102A43'
                : 'rgba(16, 42, 67, 0.28)';

            return (
              <g
                key={ward.wardNumber}
                onClick={() => onSelectWard(isSelected ? null : ward.wardNumber)}
                onMouseEnter={() => setHoveredWard(ward.wardNumber)}
                onMouseLeave={() => setHoveredWard(null)}
                className="cursor-pointer transition-opacity duration-150"
                role="button"
                tabIndex={0}
                aria-label={`Ward 0${ward.wardNumber} ${ward.name}: ${stats.active} open incidents`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectWard(isSelected ? null : ward.wardNumber);
                  }
                }}
              >
                <path
                  d={ward.gridPath}
                  fill={fillColor}
                  stroke={strokeColor}
                  strokeWidth={isSelected || isHovered ? 2 : 1.25}
                  strokeLinejoin="round"
                />
                <text
                  x={ward.labelX}
                  y={ward.labelY - 4}
                  textAnchor="middle"
                  className="font-mono-tabular text-[11px] font-bold"
                  fill={isSelected ? '#FFFFFF' : '#102A43'}
                >
                  W0{ward.wardNumber}
                </text>
                <text
                  x={ward.labelX}
                  y={ward.labelY + 12}
                  textAnchor="middle"
                  className="text-[10px] font-semibold"
                  fill={
                    isSelected
                      ? '#B0C9E8'
                      : stats.overdue > 0
                        ? '#BA1A1A'
                        : stats.active >= 2
                          ? '#8A5208'
                          : '#253746'
                  }
                >
                  {stats.active} open
                </text>
              </g>
            );
          })}
        </svg>

        {/* Legend & Active Ward Readout */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[#102A43]/10 pt-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-4 text-[#43474D]">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm border border-[#168B55]/50 bg-[#E8F5EC]" />
              Clear (0)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm border border-[#102A43]/30 bg-[#ECF4FF]" />
              Low (1)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm border border-[#F2A541] bg-[#FEF5E7]" />
              Elevated (2+)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm border border-[#BA1A1A] bg-[#FFEDE9]" />
              SLA Breach
            </span>
          </div>

          {activeWardData && activeStats ? (
            <div className="font-medium text-[#102A43] tabular-nums">
              Ward 0{activeWardData.wardNumber} · {activeWardData.name} ({activeStats.active} active
              {activeWardData.slaCompliancePct !== null
                ? ` / ${activeWardData.slaCompliancePct.toFixed(1)}% SLA`
                : ''}
              )
            </div>
          ) : (
            <div className="text-[#52606D]">Click any ward polygon to filter dispatch queue</div>
          )}
        </div>
      </div>
    </div>
  );
};
