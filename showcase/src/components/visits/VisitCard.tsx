import React from 'react';
import { Clock, MapPin, User, ChevronRight, CheckCircle, AlertCircle, XCircle } from 'lucide-react';
import type { Visit } from '../../types/showcase-types.js';
import { getVisitTypeConfig } from '../../config/visitTypeConfig.js';

interface VisitCardProps {
  visit: Visit;
  onClick?: () => void;
  showClient?: boolean;
  showCaregiver?: boolean;
}

export const VisitCard: React.FC<VisitCardProps> = ({
  visit,
  onClick,
  showClient = true,
  showCaregiver = true,
}) => {
  const visitConfig = getVisitTypeConfig(visit.visitType);
  const TypeIcon = visitConfig.icon;

  const statusStyles: Record<string, { badge: string; icon: React.ReactNode; label: string }> = {
    SCHEDULED: {
      badge: 'bg-blue-100 text-blue-800 border border-blue-200',
      icon: <Clock className="w-3 h-3 text-blue-600" />,
      label: 'Scheduled',
    },
    IN_PROGRESS: {
      badge: 'bg-indigo-100 text-indigo-800 border border-indigo-200',
      icon: <Clock className="w-3 h-3 text-indigo-600 animate-pulse" />,
      label: 'In Progress',
    },
    COMPLETED: {
      badge: 'bg-green-100 text-green-800 border border-green-200',
      icon: <CheckCircle className="w-3 h-3 text-green-600" />,
      label: 'Completed',
    },
    UNASSIGNED: {
      badge: 'bg-amber-100 text-amber-800 border border-amber-200',
      icon: <AlertCircle className="w-3 h-3 text-amber-600" />,
      label: 'Unassigned',
    },
    CANCELLED: {
      badge: 'bg-red-100 text-red-800 border border-red-200',
      icon: <XCircle className="w-3 h-3 text-red-600" />,
      label: 'Cancelled',
    },
  };

  const statusInfo = statusStyles[visit.status] || {
    badge: 'bg-gray-100 text-gray-800 border border-gray-200',
    icon: <Clock className="w-3 h-3 text-gray-600" />,
    label: visit.status,
  };

  const completedTasks = visit.tasks?.filter(t => t.completed).length ?? 0;
  const totalTasks = visit.tasks?.length ?? 0;

  // Format date display
  const formatDate = (dateStr: string) => {
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0]!, 10), parseInt(parts[1]!, 10) - 1, parseInt(parts[2]!, 10));
        return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-blue-300 transition-all cursor-pointer group text-left relative focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {/* Top badges bar */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {/* Visit Type Badge */}
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${visitConfig.bgClass} ${visitConfig.colorClass} border ${visitConfig.borderClass}`}>
            <TypeIcon className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{visitConfig.label}</span>
          </span>

          {/* Visit Number */}
          <span className="text-xs text-gray-500 font-mono">
            {visit.visitNumber || visit.id}
          </span>
        </div>

        {/* Status Badge */}
        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${statusInfo.badge}`}>
          {statusInfo.icon}
          <span>{statusInfo.label}</span>
        </span>
      </div>

      {/* Client Name & Time */}
      <div className="mb-2.5">
        {showClient && (
          <h3 className="text-base font-bold text-gray-900 group-hover:text-blue-600 transition-colors truncate">
            {visit.clientName}
          </h3>
        )}
        <div className="flex items-center gap-2 text-xs text-gray-600 mt-1 flex-wrap">
          <span className="font-medium text-gray-700">{formatDate(visit.scheduledDate)}</span>
          <span className="text-gray-400">•</span>
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            {visit.scheduledStartTime} - {visit.scheduledEndTime}
          </span>
          {visit.scheduledDuration && (
            <>
              <span className="text-gray-400">•</span>
              <span className="text-gray-500 font-medium">
                ({visit.scheduledDuration} min)
              </span>
            </>
          )}
        </div>
      </div>

      {/* Caregiver and Location */}
      <div className="space-y-1.5 text-xs text-gray-600 mb-3 min-w-0">
        {showCaregiver && (
          <div className="flex items-center gap-1.5 min-w-0">
            <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            {visit.caregiverName ? (
              <span className="truncate">
                Caregiver: <span className="font-medium text-gray-800">{visit.caregiverName}</span>
              </span>
            ) : (
              <span className="text-amber-700 font-medium bg-amber-50 px-1.5 py-0.5 rounded text-[11px]">
                Caregiver Unassigned
              </span>
            )}
          </div>
        )}

        <div className="flex items-start gap-1.5 min-w-0">
          <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
          <span className="truncate text-gray-500">
            {visit.address.street1}{visit.address.city ? `, ${visit.address.city}` : ''}{visit.address.stateCode ? `, ${visit.address.stateCode}` : ''}
          </span>
        </div>
      </div>

      {/* Services pills */}
      {visit.services && visit.services.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {visit.services.slice(0, 3).map((service, idx) => (
            <span
              key={idx}
              className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-[11px] font-medium truncate max-w-[140px]"
            >
              {service}
            </span>
          ))}
          {visit.services.length > 3 && (
            <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-[11px] font-medium">
              +{visit.services.length - 3} more
            </span>
          )}
        </div>
      )}

      {/* Tasks Progress & View details footer */}
      <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
        {totalTasks > 0 ? (
          <div className="flex items-center gap-2 flex-1 min-w-0 mr-2">
            <span className="text-gray-500 text-[11px] flex-shrink-0">
              Tasks: {completedTasks}/{totalTasks}
            </span>
            <div className="flex-1 max-w-[90px] bg-gray-200 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-blue-600 h-1.5 rounded-full transition-all"
                style={{ width: `${Math.round((completedTasks / totalTasks) * 100)}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="text-gray-400 text-[11px]">No checklist tasks</div>
        )}

        <span className="text-blue-600 group-hover:text-blue-700 font-medium inline-flex items-center gap-0.5 ml-auto flex-shrink-0">
          View Details
          <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
        </span>
      </div>
    </div>
  );
};
