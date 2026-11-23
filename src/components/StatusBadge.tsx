import React from 'react';
import {
  AlertOctagon,
  CheckCircle2,
  Clock,
  Construction,
  Droplets,
  Lightbulb,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Wrench,
} from 'lucide-react';
import { IncidentCategory, IncidentPriority, IncidentStatus } from '../types/civic';

interface StatusBadgeProps {
  status: IncidentStatus;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  if (status === IncidentStatus.Verified) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded border border-[#168B55] bg-[#E8F5EC] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-[#168B55] whitespace-nowrap shrink-0">
        <ShieldCheck className="h-3 w-3 shrink-0" aria-hidden="true" />
        Verified
      </span>
    );
  }

  if (status === IncidentStatus.Resolved) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded border border-[#168B55]/60 bg-[#E8F5EC]/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-[#168B55] whitespace-nowrap shrink-0">
        <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />
        Resolved (Pending Citizen)
      </span>
    );
  }

  if (status === IncidentStatus.Disputed) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded border border-[#BA1A1A] bg-[#FFDAD6] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-[#BA1A1A] whitespace-nowrap shrink-0">
        <AlertOctagon className="h-3 w-3 shrink-0" aria-hidden="true" />
        Disputed
      </span>
    );
  }

  if (status === IncidentStatus.InProgress) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded border border-[#F2A541] bg-[#F2A541]/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-[#8A5208] whitespace-nowrap shrink-0">
        <Wrench className="h-3 w-3 shrink-0" aria-hidden="true" />
        In-Progress
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded border border-[#CBD5E1] bg-[#F5F7FA] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-[#253746] whitespace-nowrap shrink-0">
      <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
      Submitted
    </span>
  );
};

interface PriorityTextProps {
  priority: IncidentPriority;
}

export const PriorityText: React.FC<PriorityTextProps> = ({ priority }) => {
  if (priority === IncidentPriority.Critical) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#BA1A1A] whitespace-nowrap shrink-0">
        <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Critical
      </span>
    );
  }
  if (priority === IncidentPriority.High) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#8A5208] whitespace-nowrap shrink-0">
        High
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-[#52606D] whitespace-nowrap shrink-0">
      Standard
    </span>
  );
};

interface CategoryIconProps {
  category: IncidentCategory;
  className?: string;
}

export const CategoryIcon: React.FC<CategoryIconProps> = ({
  category,
  className = 'h-4 w-4',
}) => {
  switch (category) {
    case IncidentCategory.WaterLeakage:
      return <Droplets className={className} aria-hidden="true" />;
    case IncidentCategory.Potholes:
      return <Construction className={className} aria-hidden="true" />;
    case IncidentCategory.BrokenStreetlights:
      return <Lightbulb className={className} aria-hidden="true" />;
    case IncidentCategory.GarbageAccumulation:
      return <Trash2 className={className} aria-hidden="true" />;
    default:
      return <Construction className={className} aria-hidden="true" />;
  }
};
