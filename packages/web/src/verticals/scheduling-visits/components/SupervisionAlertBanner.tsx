import React from 'react';
import { AlertTriangle, Clock, Calendar, ShieldAlert } from 'lucide-react';
import { Button } from '@/core/components';
import { useNavigate } from 'react-router-dom';
import type { SupervisoryCadenceResult } from '../utils/supervisory-cadence';

interface SupervisionAlertBannerProps {
  cadence: SupervisoryCadenceResult;
  onSchedule?: () => void;
  className?: string;
  compact?: boolean;
}

export const SupervisionAlertBanner: React.FC<SupervisionAlertBannerProps> = ({
  cadence,
  onSchedule,
  className = '',
  compact = false,
}) => {
  const navigate = useNavigate();

  if (!cadence.showAlert) {
    return null;
  }

  const handleScheduleClick = () => {
    if (onSchedule) {
      onSchedule();
    } else if (cadence.clientId) {
      navigate(`/scheduling/builder?clientId=${cadence.clientId}&visitType=SUPERVISION`);
    } else {
      navigate('/scheduling/builder?visitType=SUPERVISION');
    }
  };

  const isOverdue = cadence.isOverdue;

  if (compact) {
    return (
      <div
        className={`flex items-center justify-between p-3 rounded-lg border text-sm ${
          isOverdue
            ? 'bg-red-50 border-red-300 text-red-900'
            : 'bg-amber-50 border-amber-300 text-amber-900'
        } ${className}`}
        role="alert"
      >
        <div className="flex items-center gap-2">
          {isOverdue ? (
            <ShieldAlert className="h-4 w-4 text-red-600 flex-shrink-0" />
          ) : (
            <Clock className="h-4 w-4 text-amber-600 flex-shrink-0" />
          )}
          <div>
            <span className="font-semibold">{cadence.alertTitle}: </span>
            <span>{cadence.alertMessage}</span>
          </div>
        </div>
        <Button
          size="sm"
          variant={isOverdue ? 'danger' : 'outline'}
          onClick={handleScheduleClick}
          className="ml-4 flex-shrink-0"
        >
          Schedule Supervision Visit
        </Button>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border p-4 shadow-sm transition-all ${
        isOverdue
          ? 'bg-red-50/90 border-red-300 text-red-950'
          : 'bg-amber-50/90 border-amber-300 text-amber-950'
      } ${className}`}
      role="alert"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div
            className={`p-2 rounded-lg flex-shrink-0 mt-0.5 ${
              isOverdue ? 'bg-red-200/80 text-red-700' : 'bg-amber-200/80 text-amber-700'
            }`}
          >
            {isOverdue ? <AlertTriangle className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-bold text-base tracking-tight">{cadence.alertTitle}</h4>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${
                  isOverdue
                    ? 'bg-red-200 text-red-900 border border-red-300'
                    : 'bg-amber-200 text-amber-900 border border-amber-300'
                }`}
              >
                {isOverdue ? 'Compliance Overdue' : 'Upcoming Mandate'}
              </span>
              <span className="text-xs text-gray-500 bg-white/70 px-2 py-0.5 rounded border border-gray-200">
                {cadence.regulationCitation}
              </span>
            </div>
            <p className="text-sm text-gray-800 leading-relaxed">{cadence.alertMessage}</p>
            <p className="text-xs font-medium text-gray-600 italic">
              Recommendation: {cadence.recommendation}
            </p>
          </div>
        </div>

        <div className="flex-shrink-0 w-full sm:w-auto">
          <Button
            variant={isOverdue ? 'danger' : 'primary'}
            size="sm"
            onClick={handleScheduleClick}
            leftIcon={<Calendar className="h-4 w-4" />}
            className="w-full sm:w-auto shadow-sm"
          >
            Schedule Supervision Visit
          </Button>
        </div>
      </div>
    </div>
  );
};
