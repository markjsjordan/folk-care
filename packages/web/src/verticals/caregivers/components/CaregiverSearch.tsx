import React from 'react';
import { Search, Filter, X, RotateCcw } from 'lucide-react';
import { Select } from '@/core/components';
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

  // Search input state with 300ms debounce
  const [queryInput, setQueryInput] = React.useState(filters.query || '');
  const [prevQuery, setPrevQuery] = React.useState(filters.query);

  if (filters.query !== prevQuery) {
    setPrevQuery(filters.query);
    setQueryInput(filters.query || '');
  }

  React.useEffect(() => {
    const timer = setTimeout(() => {
      if ((filters.query || '') !== queryInput) {
        onFiltersChange({ ...filters, query: queryInput || undefined });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [queryInput]);

  // Count active filters
  const activeFilterCount = React.useMemo(() => {
    let count = 0;
    if (filters.status && filters.status.length > 0) count++;
    if (filters.role && filters.role.length > 0) count++;
    if (filters.complianceStatus && filters.complianceStatus.length > 0) count++;
    return count;
  }, [filters]);

  const hasAnyActiveFilter = Boolean(queryInput) || activeFilterCount > 0;

  // Clear all filters
  const handleClearFilters = () => {
    setQueryInput('');
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
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm space-y-3">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Search Input styled like Schedule search bar */}
        <div className="relative flex-1 max-w-lg">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by name or employee number..."
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            className="w-full pl-10 pr-9 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
          />
          {queryInput && (
            <button
              type="button"
              onClick={() => setQueryInput('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter Toggle & Clear Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border text-sm font-medium transition-colors ${
              showAdvanced || activeFilterCount > 0
                ? 'border-blue-500 bg-blue-50/50 text-blue-700'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Filter className="w-4 h-4" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-semibold bg-blue-600 text-white rounded-full min-w-5 h-5">
                {activeFilterCount}
              </span>
            )}
          </button>

          {hasAnyActiveFilter && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-gray-200"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Clear All</span>
            </button>
          )}
        </div>
      </div>

      {showAdvanced && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-gray-100">
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
    </div>
  );
};
