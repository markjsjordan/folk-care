import React from 'react';
import { Search, Filter, X } from 'lucide-react';
import { Input, Select, Button } from '@/core/components';
import type { CaregiverSearchFilters } from '../types';

export interface CaregiverSearchProps {
  filters: CaregiverSearchFilters;
  onFiltersChange: (filters: CaregiverSearchFilters) => void;
}

const statusOptions = [
  { value: '', label: 'All Statuses' },
  { value: 'APPLICATION', label: 'Application' },
  { value: 'INTERVIEWING', label: 'Interviewing' },
  { value: 'PENDING_ONBOARDING', label: 'Pending Onboarding' },
  { value: 'ONBOARDING', label: 'Onboarding' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
  { value: 'ON_LEAVE', label: 'On Leave' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'TERMINATED', label: 'Terminated' },
  { value: 'RETIRED', label: 'Retired' },
];

const roleOptions = [
  { value: '', label: 'All Roles' },
  { value: 'RN', label: 'Registered Nurse' },
  { value: 'LPN', label: 'Licensed Practical Nurse' },
  { value: 'CNA', label: 'Certified Nursing Assistant' },
  { value: 'HHA', label: 'Home Health Aide' },
  { value: 'PT', label: 'Physical Therapist' },
  { value: 'OT', label: 'Occupational Therapist' },
  { value: 'THERAPIST', label: 'Therapist' },
  { value: 'SUPPORT', label: 'Support Staff' },
];

const complianceStatusOptions = [
  { value: '', label: 'All Compliance Status' },
  { value: 'COMPLIANT', label: 'Compliant' },
  { value: 'PENDING_VERIFICATION', label: 'Pending Verification' },
  { value: 'EXPIRING_SOON', label: 'Expiring Soon' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'NON_COMPLIANT', label: 'Non-Compliant' },
];

export const CaregiverSearch: React.FC<CaregiverSearchProps> = ({ filters, onFiltersChange }) => {
  const [showAdvanced, setShowAdvanced] = React.useState(false);

  // Count active filters
  const activeFilterCount = React.useMemo(() => {
    let count = 0;
    if (filters.query?.trim()) count++;
    if (filters.status && filters.status.length > 0) count++;
    if (filters.role && filters.role.length > 0) count++;
    if (filters.complianceStatus && filters.complianceStatus.length > 0) count++;
    return count;
  }, [filters]);

  // Clear all filters
  const handleClearFilters = () => {
    onFiltersChange({});
  };

  // Get current status value
  const currentStatusValue = React.useMemo(() => {
    return filters.status && filters.status.length > 0 ? filters.status[0] : '';
  }, [filters.status]);

  // Get current role value
  const currentRoleValue = React.useMemo(() => {
    return filters.role && filters.role.length > 0 ? filters.role[0] : '';
  }, [filters.role]);

  // Get current compliance status value
  const currentComplianceStatusValue = React.useMemo(() => {
    return filters.complianceStatus && filters.complianceStatus.length > 0 ? filters.complianceStatus[0] : '';
  }, [filters.complianceStatus]);

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <Input
            placeholder="Search by name or employee number..."
            value={filters.query || ''}
            onChange={(e) => onFiltersChange({ ...filters, query: e.target.value })}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowAdvanced(!showAdvanced)}
            leftIcon={<Filter className="h-4 w-4" />}
            className="relative"
          >
            Filters
            {activeFilterCount > 0 && (
              <span className="absolute -top-2 -right-2 flex items-center justify-center h-5 w-5 text-xs font-bold text-white bg-blue-600 rounded-full">
                {activeFilterCount}
              </span>
            )}
          </Button>
          {activeFilterCount > 0 && (
            <Button
              variant="outline"
              onClick={handleClearFilters}
              leftIcon={<X className="h-4 w-4" />}
              className="text-gray-600 hover:text-gray-900"
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {showAdvanced && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-md">
          <Select
            label="Status"
            options={statusOptions}
            value={currentStatusValue}
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                status: e.target.value ? [e.target.value as any] : undefined,
              })
            }
          />
          <Select
            label="Role"
            options={roleOptions}
            value={currentRoleValue}
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                role: e.target.value ? [e.target.value as any] : undefined,
              })
            }
          />
          <Select
            label="Compliance Status"
            options={complianceStatusOptions}
            value={currentComplianceStatusValue}
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                complianceStatus: e.target.value ? [e.target.value as any] : undefined,
              })
            }
          />
        </div>
      )}

      {/* Active filters indicator */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.query?.trim() && (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded-full">
              Search: {filters.query}
              <button
                onClick={() => onFiltersChange({ ...filters, query: '' })}
                className="hover:text-blue-900"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {filters.status && filters.status.length > 0 && (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded-full">
              Status: {statusOptions.find(opt => opt.value === filters.status![0])?.label}
              <button
                onClick={() => onFiltersChange({ ...filters, status: undefined })}
                className="hover:text-blue-900"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {filters.role && filters.role.length > 0 && (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded-full">
              Role: {roleOptions.find(opt => opt.value === filters.role![0])?.label}
              <button
                onClick={() => onFiltersChange({ ...filters, role: undefined })}
                className="hover:text-blue-900"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {filters.complianceStatus && filters.complianceStatus.length > 0 && (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded-full">
              Compliance: {complianceStatusOptions.find(opt => opt.value === filters.complianceStatus![0])?.label}
              <button
                onClick={() => onFiltersChange({ ...filters, complianceStatus: undefined })}
                className="hover:text-blue-900"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
};
