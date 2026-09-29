import React from 'react';
import { Link } from 'react-router-dom';
import { Phone, Mail, Calendar } from 'lucide-react';
import { Card, StatusBadge, DemoBadge } from '@/core/components';
import { formatDate, formatPhone } from '@/core/utils';
import type { CaregiverListItem } from '../types';

export interface CaregiverCardProps {
  caregiver: CaregiverListItem;
  compact?: boolean;
}

export const CaregiverCard: React.FC<CaregiverCardProps> = ({ caregiver, compact = false }) => {
  const fullName = [caregiver.firstName, caregiver.middleName, caregiver.lastName]
    .filter(Boolean)
    .join(' ');

  return (
    <Link to={`/caregivers/${caregiver.id}`}>
      <Card padding="md" hover className="h-full">
        <div className="flex justify-between items-start gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold text-gray-900 truncate">
              {caregiver.preferredName || fullName}
            </h3>
            <p className="text-sm text-gray-600 truncate">{caregiver.employeeNumber}</p>
            <p className="text-sm text-gray-600 truncate">{caregiver.role}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {caregiver.isDemoData && <DemoBadge />}
            <StatusBadge status={caregiver.status} />
          </div>
        </div>

        {!compact && (
          <div className="mt-4 space-y-2">
            {caregiver.primaryPhone && (
              <div className="flex items-center gap-2 text-sm text-gray-600 min-w-0">
                <Phone className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">{formatPhone(caregiver.primaryPhone.number)}</span>
              </div>
            )}
            {caregiver.email && (
              <div className="flex items-center gap-2 text-sm text-gray-600 min-w-0">
                <Mail className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">{caregiver.email}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Calendar className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">Hired: {formatDate(caregiver.hireDate)}</span>
            </div>
          </div>
        )}
      </Card>
    </Link>
  );
};
