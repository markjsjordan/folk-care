import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Clock, MapPin, User, AlertCircle, ChevronRight } from 'lucide-react';
import type { Visit } from '../types';
import { VISIT_STATUS_LABELS, VISIT_STATUS_COLORS } from '../types';
import { getVisitTypeConfig } from '../config/visitTypeConfig';

interface VisitCardProps {
  visit: Visit;
  compact?: boolean;
  onClick?: () => void;
}

export const VisitCard: React.FC<VisitCardProps> = ({ visit, compact = false, onClick }) => {
  const navigate = useNavigate();
  const statusColor = VISIT_STATUS_COLORS[visit.status];
  const isUrgent = visit.isUrgent || visit.isPriority;

  const visitConfig = getVisitTypeConfig(visit.visitType);
  const TypeIcon = visitConfig.icon;

  const handleCardClick = () => {
    if (onClick) {
      onClick();
    } else {
      navigate(`/scheduling/visits/${visit.id}`);
    }
  };

  const formatDate = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getClientName = () => {
    if (visit.clientFirstName && visit.clientLastName) {
      return `${visit.clientFirstName} ${visit.clientLastName}`;
    }
    return 'Client';
  };

  const getStatusBadgeClasses = () => {
    const baseClasses = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium flex-shrink-0';
    const colorClasses: Record<string, string> = {
      gray: 'bg-gray-100 text-gray-800',
      blue: 'bg-blue-100 text-blue-800',
      yellow: 'bg-yellow-100 text-yellow-800',
      cyan: 'bg-cyan-100 text-cyan-800',
      green: 'bg-green-100 text-green-800',
      indigo: 'bg-indigo-100 text-indigo-800',
      purple: 'bg-purple-100 text-purple-800',
      orange: 'bg-orange-100 text-orange-800',
      red: 'bg-red-100 text-red-800',
    };
    return `${baseClasses} ${colorClasses[statusColor] || colorClasses.gray}`;
  };

  if (compact) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={handleCardClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleCardClick();
          }
        }}
        className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg hover:shadow-md hover:border-blue-300 transition-all cursor-pointer group focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <div className="flex items-center space-x-4 flex-1 min-w-0">
          <div className="flex-shrink-0">
            <div className={`p-2 rounded-lg ${visitConfig.bgClass} ${visitConfig.colorClass}`}>
              <TypeIcon className="h-5 w-5" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="text-sm font-semibold text-gray-900 group-hover:text-blue-600 transition-colors truncate">
                {getClientName()}
              </h3>
              {isUrgent && <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />}
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${visitConfig.badgeClass}`}>
                {visitConfig.label}
              </span>
            </div>
            <p className="text-xs text-gray-500 truncate mt-0.5">
              {visit.serviceTypeName} • {visit.visitNumber}
            </p>
          </div>
          <div className="text-xs text-gray-600 flex-shrink-0">
            {visit.scheduledStartTime} - {visit.scheduledEndTime}
            {Boolean(visit.scheduledDuration) && (
              <span className="text-gray-400 ml-1">({visit.scheduledDuration} min)</span>
            )}
          </div>
          <span className={getStatusBadgeClasses()}>
            {VISIT_STATUS_LABELS[visit.status]}
          </span>
          <ChevronRight className="h-4 w-4 text-gray-400 group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
        </div>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardClick();
        }
      }}
      className="bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md hover:border-blue-300 transition-all cursor-pointer group text-left focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <div className="p-5">
        {/* Header Badges & Status */}
        <div className="flex justify-between items-start gap-2 mb-3.5">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            {/* Visit Type Badge with Icon */}
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${visitConfig.bgClass} ${visitConfig.colorClass} border ${visitConfig.borderClass}`}>
              <TypeIcon className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">{visitConfig.label}</span>
            </span>

            {/* Visit Number */}
            <span className="text-xs text-gray-500 font-mono">
              {visit.visitNumber}
            </span>
          </div>

          <span className={getStatusBadgeClasses()}>
            {VISIT_STATUS_LABELS[visit.status]}
          </span>
        </div>

        {/* Client Name & Service */}
        <div className="mb-3 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-base font-bold text-gray-900 group-hover:text-blue-600 transition-colors truncate">
              {getClientName()}
            </h3>
            {isUrgent && <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />}
          </div>
          <p className="text-xs text-gray-500 font-medium truncate mt-0.5">
            {visit.serviceTypeName}
          </p>
        </div>

        {/* Details Grid */}
        <div className="space-y-2 text-xs text-gray-600">
          {/* Date */}
          <div className="flex items-center text-gray-600">
            <Calendar className="h-3.5 w-3.5 mr-2 text-gray-400 flex-shrink-0" />
            <span className="truncate">{formatDate(visit.scheduledDate)}</span>
          </div>

          {/* Time & Duration */}
          <div className="flex items-center text-gray-600">
            <Clock className="h-3.5 w-3.5 mr-2 text-gray-400 flex-shrink-0" />
            <span className="truncate font-medium text-gray-700">
              {visit.scheduledStartTime} - {visit.scheduledEndTime}
              {Boolean(visit.scheduledDuration) && (
                <span className="text-gray-500 font-normal ml-1">
                  ({visit.scheduledDuration} min)
                </span>
              )}
            </span>
          </div>

          {/* Address */}
          <div className="flex items-start text-gray-600 min-w-0">
            <MapPin className="h-3.5 w-3.5 mr-2 mt-0.5 text-gray-400 flex-shrink-0" />
            <span className="truncate">
              {visit.address.line1}
              {visit.address.city ? `, ${visit.address.city}` : ''}
              {visit.address.state ? `, ${visit.address.state}` : ''}
            </span>
          </div>

          {/* Caregiver */}
          <div className="flex items-center text-gray-600 min-w-0">
            <User className="h-3.5 w-3.5 mr-2 text-gray-400 flex-shrink-0" />
            {visit.assignedCaregiverId ? (
              <span className="text-gray-700 font-medium truncate">Caregiver Assigned</span>
            ) : (
              <span className="text-amber-700 font-medium bg-amber-50 px-1.5 py-0.2 rounded text-[11px]">
                Caregiver Unassigned
              </span>
            )}
          </div>
        </div>

        {/* Tasks Progress & View details link */}
        <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
          {visit.tasksTotal !== undefined && visit.tasksTotal > 0 ? (
            <div className="flex items-center gap-2 flex-1 min-w-0 mr-3">
              <span className="text-gray-500 text-[11px] flex-shrink-0">
                Tasks: {visit.tasksCompleted ?? 0}/{visit.tasksTotal}
              </span>
              <div className="flex-1 max-w-[80px] bg-gray-200 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-blue-600 h-1.5 rounded-full transition-all"
                  style={{
                    width: `${((visit.tasksCompleted ?? 0) / visit.tasksTotal) * 100}%`,
                  }}
                />
              </div>
            </div>
          ) : (
            <span className="text-gray-400 text-[11px]">Standard Visit</span>
          )}

          <span className="text-blue-600 group-hover:text-blue-700 font-medium inline-flex items-center gap-0.5 ml-auto flex-shrink-0">
            View Details
            <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
          </span>
        </div>
      </div>
    </div>
  );
};
