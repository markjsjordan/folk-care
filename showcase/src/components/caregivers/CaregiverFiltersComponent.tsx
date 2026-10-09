import React, { useState, useRef, useEffect } from 'react';
import { Filter, X, Check, RotateCcw } from 'lucide-react';
import type { CaregiverSearchFilters } from '../../types/showcase-types.js';

interface CaregiverFiltersProps {
  filters: CaregiverSearchFilters;
  onFiltersChange: (filters: CaregiverSearchFilters) => void;
  activeCount: number;
}

const ALL_STATUSES: { value: string; label: string }[] = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
  { value: 'ONBOARDING', label: 'Onboarding' },
  { value: 'ON_LEAVE', label: 'On Leave' },
];

export const CaregiverFiltersComponent: React.FC<CaregiverFiltersProps> = ({
  filters,
  onFiltersChange,
  activeCount,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const toggleStatus = (status: string) => {
    const current = filters.status || [];
    const updated = current.includes(status)
      ? current.filter(s => s !== status)
      : [...current, status];
    onFiltersChange({
      ...filters,
      status: updated.length > 0 ? updated : undefined,
    });
  };

  const handleClearAll = () => {
    onFiltersChange({
      query: filters.query,
      status: undefined,
    });
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border text-sm font-medium transition-colors ${
          isOpen || activeCount > 0
            ? 'border-blue-500 bg-blue-50/50 text-blue-700'
            : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
        }`}
        aria-expanded={isOpen}
      >
        <Filter className="w-4 h-4" />
        <span>Filters</span>
        {activeCount > 0 && (
          <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-semibold bg-blue-600 text-white rounded-full min-w-5 h-5">
            {activeCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-gray-200 p-5 z-30">
          <div className="flex items-center justify-between pb-3 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-blue-600" />
              <h3 className="font-semibold text-gray-900 text-sm">Filter Caregivers</h3>
              {activeCount > 0 && (
                <span className="text-xs text-gray-500">({activeCount} active)</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {activeCount > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  Clear All
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded"
                aria-label="Close filters"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="space-y-4 py-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
                Status
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {ALL_STATUSES.map(item => {
                  const isChecked = filters.status?.includes(item.value) ?? false;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => toggleStatus(item.value)}
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium text-left border transition-all ${
                        isChecked
                          ? 'border-blue-500 bg-blue-50 text-blue-900 ring-1 ring-blue-500'
                          : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border ${
                        isChecked ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 bg-white'
                      }`}>
                        {isChecked && <Check className="w-2.5 h-2.5" />}
                      </div>
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-gray-200 flex justify-between items-center">
            <span className="text-xs text-gray-500">
              {activeCount === 0 ? 'No filters applied' : `${activeCount} filter${activeCount > 1 ? 's' : ''} applied`}
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs font-medium hover:bg-blue-700 transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
