import React, { useState, useRef, useEffect } from 'react';
import { Filter, X, Calendar, Check, RotateCcw } from 'lucide-react';
import type { VisitSearchFilters, VisitStatus, VisitType } from '../types';
import { VISIT_TYPES } from '../config/visitTypeConfig';

export interface VisitFiltersProps {
  filters: VisitSearchFilters;
  onFiltersChange: (filters: VisitSearchFilters) => void;
  activeCount: number;
}

const ALL_STATUSES: { value: VisitStatus; label: string; color: string }[] = [
  { value: 'SCHEDULED', label: 'Scheduled', color: 'bg-blue-100 text-blue-800' },
  { value: 'IN_PROGRESS', label: 'In Progress', color: 'bg-indigo-100 text-indigo-800' },
  { value: 'COMPLETED', label: 'Completed', color: 'bg-green-100 text-green-800' },
  { value: 'UNASSIGNED', label: 'Unassigned', color: 'bg-amber-100 text-amber-800' },
  { value: 'CANCELLED', label: 'Cancelled', color: 'bg-red-100 text-red-800' },
];

export const VisitFilters: React.FC<VisitFiltersProps> = ({
  filters,
  onFiltersChange,
  activeCount,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
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

  const toggleStatus = (status: VisitStatus) => {
    const current = filters.status || [];
    const updated = current.includes(status)
      ? current.filter((s) => s !== status)
      : [...current, status];
    onFiltersChange({
      ...filters,
      status: updated.length > 0 ? updated : undefined,
    });
  };

  const toggleVisitType = (type: VisitType) => {
    const current = filters.visitType || [];
    const updated = current.includes(type)
      ? current.filter((t) => t !== type)
      : [...current, type];
    onFiltersChange({
      ...filters,
      visitType: updated.length > 0 ? updated : undefined,
    });
  };

  const handleDateChange = (field: 'dateFrom' | 'dateTo', value: string) => {
    onFiltersChange({
      ...filters,
      [field]: value || undefined,
    });
  };

  const handleClearAll = () => {
    onFiltersChange({
      query: filters.query,
      status: undefined,
      visitType: undefined,
      dateFrom: undefined,
      dateTo: undefined,
    });
  };

  const formatDateValue = (val?: Date | string) => {
    if (!val) return '';
    if (val instanceof Date) {
      return val.toISOString().split('T')[0]!;
    }
    return String(val).split('T')[0]!;
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
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-xl border border-gray-200 p-5 z-30">
          <div className="flex items-center justify-between pb-3 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-blue-600" />
              <h3 className="font-semibold text-gray-900 text-sm">Filter Visits</h3>
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

          <div className="space-y-4 py-3 max-h-[70vh] overflow-y-auto pr-1">
            {/* Status Section */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
                Visit Status
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {ALL_STATUSES.map((item) => {
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
                      <div
                        className={`w-3.5 h-3.5 rounded flex items-center justify-center border ${
                          isChecked ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 bg-white'
                        }`}
                      >
                        {isChecked && <Check className="w-2.5 h-2.5" />}
                      </div>
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Visit Type Section */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
                Visit Type
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {(Object.keys(VISIT_TYPES) as VisitType[]).map((typeKey) => {
                  const config = VISIT_TYPES[typeKey];
                  const Icon = config.icon;
                  const isChecked = filters.visitType?.includes(typeKey) ?? false;
                  return (
                    <button
                      key={typeKey}
                      type="button"
                      onClick={() => toggleVisitType(typeKey)}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium text-left border transition-all ${
                        isChecked
                          ? 'border-blue-500 bg-blue-50 text-blue-900 ring-1 ring-blue-500'
                          : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <div
                        className={`w-3.5 h-3.5 rounded flex items-center justify-center border flex-shrink-0 ${
                          isChecked ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 bg-white'
                        }`}
                      >
                        {isChecked && <Check className="w-2.5 h-2.5" />}
                      </div>
                      <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${config.colorClass}`} />
                      <span className="truncate">{config.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Date Range Section */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
                Date Range
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[11px] text-gray-500 block mb-1">From</span>
                  <div className="relative">
                    <Calendar className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="date"
                      value={formatDateValue(filters.dateFrom)}
                      onChange={(e) => handleDateChange('dateFrom', e.target.value)}
                      className="w-full pl-8 pr-2 py-1.5 text-xs rounded-md border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <span className="text-[11px] text-gray-500 block mb-1">To</span>
                  <div className="relative">
                    <Calendar className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="date"
                      value={formatDateValue(filters.dateTo)}
                      onChange={(e) => handleDateChange('dateTo', e.target.value)}
                      className="w-full pl-8 pr-2 py-1.5 text-xs rounded-md border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
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
