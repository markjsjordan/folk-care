import React from 'react';
import type { EVVSearchFilters } from '../types';

interface EVVRecordSearchProps {
  filters: EVVSearchFilters;
  onFiltersChange: (filters: EVVSearchFilters) => void;
}

export const EVVRecordSearch: React.FC<EVVRecordSearchProps> = ({ 
  filters, 
  onFiltersChange 
}) => {
  const handleFilterChange = (key: keyof EVVSearchFilters, value: string) => {
    onFiltersChange({
      ...filters,
      [key]: value || undefined,
    });
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Status
          </label>
          <select
            value={filters.status || ''}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="COMPLETE">Complete</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="AMENDED">Amended</option>
            <option value="VOIDED">Voided</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Verification Level
          </label>
          <select
            value={filters.verificationLevel || ''}
            onChange={(e) => handleFilterChange('verificationLevel', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Levels</option>
            <option value="FULL">Full</option>
            <option value="PARTIAL">Partial</option>
            <option value="MANUAL">Manual</option>
            <option value="PHONE">Phone</option>
            <option value="EXCEPTION">Exception</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Start Date
          </label>
          <input
            type="date"
            value={filters.startDate || ''}
            onChange={(e) => handleFilterChange('startDate', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
    </div>
  );
};
