import React from 'react';
import { Check, RotateCcw } from 'lucide-react';
import {
  CivicIncident,
  IncidentCategory,
  IncidentStatus,
  SlaPolicyRule,
} from '../types/civic';
import { CategoryIcon } from './StatusBadge';

interface SlaPolicyScreenProps {
  policies: SlaPolicyRule[];
  incidents: CivicIncident[];
  usingSampleData: boolean;
  onUpdatePolicy: (category: IncidentCategory, updates: Partial<SlaPolicyRule>) => void;
  onApplyDefaultPolicies: () => void;
  onResetWorkspaceData: () => void;
}

export const SlaPolicyScreen: React.FC<SlaPolicyScreenProps> = ({
  policies,
  incidents,
  usingSampleData,
  onUpdatePolicy,
  onApplyDefaultPolicies,
  onResetWorkspaceData,
}) => {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-[-0.01em] text-[#0A1D2B] sm:text-[32px] sm:leading-[40px]">
            SLA Governance &amp; Escalation Policy
          </h1>
          <p className="mt-1 text-sm text-[#43474D]">
            Statutory response targets, resolution thresholds, and automated dispatch directives by infrastructure class.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onApplyDefaultPolicies}
            className="inline-flex h-10 items-center gap-2 rounded bg-[#102A43] px-4 text-xs font-semibold text-white hover:bg-[#0B1D2F] cursor-pointer whitespace-nowrap shrink-0"
          >
            Apply Standard SLA
          </button>
          <button
            type="button"
            onClick={onResetWorkspaceData}
            className="inline-flex h-10 items-center gap-2 rounded border border-[#102A43]/30 bg-white px-4 text-xs font-semibold text-[#102A43] hover:bg-[#ECF4FF] cursor-pointer whitespace-nowrap shrink-0"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Clear to New User State
          </button>
        </div>
      </div>

      {/* Policy Cards Grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {policies.map((rule) => {
          const categoryIncidents = incidents.filter((i) => i.confirmedCategory === rule.category);
          const isConfigured =
            rule.responseTargetHours !== null ||
            rule.resolutionTargetHours !== null ||
            rule.autoEscalateAtPct !== null;

          let liveCompliancePct: number | null = null;
          if (usingSampleData && rule.compliance30dPct !== null) {
            liveCompliancePct = rule.compliance30dPct;
          } else if (categoryIncidents.length > 0) {
            const onTrackCount = categoryIncidents.filter(
              (i) =>
                i.status === IncidentStatus.Resolved ||
                i.status === IncidentStatus.Verified ||
                i.slaHoursRemaining >= 0
            ).length;
            liveCompliancePct = (onTrackCount / categoryIncidents.length) * 100;
          }

          const compliant = liveCompliancePct !== null && liveCompliancePct >= 90;

          return (
            <div
              key={rule.category}
              className="flex flex-col justify-between rounded-lg border border-[#102A43]/10 bg-white p-5 civic-shadow-1"
            >
              <div>
                <div className="flex items-start justify-between gap-3 border-b border-[#E2E8F0] pb-3.5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded border border-[#102A43]/10 bg-[#F5F7FA] text-[#102A43]">
                      <CategoryIcon category={rule.category} className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="font-display text-base font-semibold text-[#0A1D2B]">
                        {rule.category}
                      </h2>
                      <p className="text-xs text-[#52606D]">
                        {usingSampleData
                          ? rule.statutoryMandate
                          : isConfigured
                            ? 'Configured by operator'
                            : 'Pending policy setup'}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    {liveCompliancePct !== null ? (
                      <span
                        className={`inline-flex items-center rounded border px-2 py-0.5 font-mono-tabular text-[11px] font-bold ${
                          compliant
                            ? 'border-[#168B55] bg-[#E8F5EC] text-[#168B55]'
                            : 'border-[#F2A541] bg-[#F2A541]/12 text-[#8A5208]'
                        }`}
                      >
                        {liveCompliancePct.toFixed(1)}% 30d
                      </span>
                    ) : isConfigured ? (
                      <span className="inline-flex items-center rounded border border-[#CBD5E1] bg-[#F5F7FA] px-2 py-0.5 font-mono-tabular text-[11px] font-bold text-[#253746] whitespace-nowrap">
                        Ready · 0 tickets
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded border border-[#CBD5E1] bg-[#F5F7FA] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-[#52606D] whitespace-nowrap">
                        Not Configured
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label
                      htmlFor={`resp-${rule.category}`}
                      className="block text-[11px] font-bold uppercase tracking-[0.04em] text-[#43474D]"
                    >
                      Response Target
                    </label>
                    <div className="mt-1.5 flex items-center gap-2">
                      <input
                        id={`resp-${rule.category}`}
                        type="number"
                        min={1}
                        max={72}
                        placeholder="—"
                        value={rule.responseTargetHours ?? ''}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const val =
                            raw === '' ? null : Math.min(72, Math.max(1, Number(raw)));
                          onUpdatePolicy(rule.category, { responseTargetHours: val });
                        }}
                        className="civic-input h-12 w-full rounded border border-[#CBD5E1] bg-white px-3 font-mono-tabular text-sm font-semibold text-[#0A1D2B] placeholder:text-[#74777E]"
                      />
                      <span className="text-xs font-medium text-[#52606D] shrink-0">hrs</span>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor={`res-${rule.category}`}
                      className="block text-[11px] font-bold uppercase tracking-[0.04em] text-[#43474D]"
                    >
                      Resolution SLA
                    </label>
                    <div className="mt-1.5 flex items-center gap-2">
                      <input
                        id={`res-${rule.category}`}
                        type="number"
                        min={2}
                        max={240}
                        placeholder="—"
                        value={rule.resolutionTargetHours ?? ''}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const val =
                            raw === '' ? null : Math.min(240, Math.max(2, Number(raw)));
                          onUpdatePolicy(rule.category, { resolutionTargetHours: val });
                        }}
                        className="civic-input h-12 w-full rounded border border-[#CBD5E1] bg-white px-3 font-mono-tabular text-sm font-semibold text-[#0A1D2B] placeholder:text-[#74777E]"
                      />
                      <span className="text-xs font-medium text-[#52606D] shrink-0">hrs</span>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor={`esc-${rule.category}`}
                      className="block text-[11px] font-bold uppercase tracking-[0.04em] text-[#43474D]"
                    >
                      Escalate Threshold
                    </label>
                    <div className="mt-1.5 flex items-center gap-2">
                      <input
                        id={`esc-${rule.category}`}
                        type="number"
                        min={50}
                        max={95}
                        placeholder="—"
                        value={rule.autoEscalateAtPct ?? ''}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const val =
                            raw === '' ? null : Math.min(95, Math.max(50, Number(raw)));
                          onUpdatePolicy(rule.category, { autoEscalateAtPct: val });
                        }}
                        className="civic-input h-12 w-full rounded border border-[#CBD5E1] bg-white px-3 font-mono-tabular text-sm font-semibold text-[#0A1D2B] placeholder:text-[#74777E]"
                      />
                      <span className="text-xs font-medium text-[#52606D] shrink-0">%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Custom 48px Touch Target Checkbox Row */}
              <div className="mt-4 flex items-center justify-between border-t border-[#E2E8F0] pt-3">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={rule.autoDispatchEnabled}
                  onClick={() =>
                    onUpdatePolicy(rule.category, {
                      autoDispatchEnabled: !rule.autoDispatchEnabled,
                    })
                  }
                  className="inline-flex min-h-[48px] items-center gap-3 text-left cursor-pointer"
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                      rule.autoDispatchEnabled
                        ? 'border-[#102A43] bg-[#102A43] text-white'
                        : 'border-[#74777E] bg-white'
                    }`}
                  >
                    {rule.autoDispatchEnabled && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                  </span>
                  <span className="text-xs font-semibold text-[#253746]">
                    Auto-route new tickets directly to nearest sector crew
                  </span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
