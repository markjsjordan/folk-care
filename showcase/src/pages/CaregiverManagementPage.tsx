import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShowcaseLayout } from '../components/ShowcaseLayout';
import { useCaregiverProvider } from '@/core/providers/context';
import { Search, Award, DollarSign, Calendar, X, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import type { Certification, CaregiverSearchFilters } from '../types/showcase-types.js';
import { CaregiverFiltersComponent } from '../components/caregivers/CaregiverFiltersComponent.js';

export const CaregiverManagementPage: React.FC = () => {
  const caregiverProvider = useCaregiverProvider();
  
  // Search state with 300ms debounce
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Advanced dropdown filters
  const [advancedFilters, setAdvancedFilters] = useState<CaregiverSearchFilters>({});

  const activeAdvancedFilterCount = useMemo(() => {
    return advancedFilters.status?.length || 0;
  }, [advancedFilters]);

  const hasAnyActiveFilter = Boolean(debouncedSearch) || activeAdvancedFilterCount > 0;

  const handleClearAllFilters = () => {
    setSearchQuery('');
    setDebouncedSearch('');
    setAdvancedFilters({});
  };

  const { data: rawData, isLoading } = useQuery({
    queryKey: ['caregivers', debouncedSearch],
    queryFn: () => caregiverProvider.getCaregivers({ query: debouncedSearch || undefined }),
  });

  // Filter items by status if status filter active
  const data = useMemo(() => {
    if (!rawData) return rawData;
    if (!advancedFilters.status || advancedFilters.status.length === 0) return rawData;
    const filteredItems = rawData.items.filter(c => advancedFilters.status?.includes(c.status));
    return {
      ...rawData,
      items: filteredItems,
      total: filteredItems.length,
    };
  }, [rawData, advancedFilters.status]);

  return (
    <ShowcaseLayout
      title="Caregiver Management"
      description="Manage caregiver profiles, certifications, and specializations"
    >
      {/* Search and Filter Toolbar styled like Schedule page */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Bar */}
          <div className="relative flex-1 max-w-lg">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search caregivers by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-9 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Filter Dropdown + Clear All */}
          <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
            <CaregiverFiltersComponent
              filters={advancedFilters}
              onFiltersChange={setAdvancedFilters}
              activeCount={activeAdvancedFilterCount}
            />

            {hasAnyActiveFilter && (
              <button
                type="button"
                onClick={handleClearAllFilters}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-gray-200"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Clear All</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm font-medium text-gray-600">Total Caregivers</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{data?.total || 0}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm font-medium text-gray-600">Active</p>
          <p className="mt-1 text-2xl font-semibold text-green-600">
            {data?.items.filter(c => c.status === 'ACTIVE').length || 0}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm font-medium text-gray-600">Avg. Rate</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            ${data?.items.length
              ? (data.items.reduce((sum, c) => sum + (c.hourlyRate || 0), 0) / data.items.length).toFixed(2)
              : '0.00'}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm font-medium text-gray-600">Certifications</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {data?.items.reduce((sum, c) => sum + (c.certifications?.length || 0), 0) || 0}
          </p>
        </div>
      </div>

      {/* Caregivers List */}
      {isLoading && (
        <div className="text-center py-12">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
        </div>
      )}

      {data && data.items.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <p className="text-gray-600">No caregivers found</p>
        </div>
      )}

      {data && data.items.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((caregiver) => (
            <div
              key={caregiver.id}
              className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {caregiver.firstName} {caregiver.lastName}
                  </h3>
                  <p className="text-sm text-gray-500">{caregiver.email}</p>
                </div>
                <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                  {caregiver.status}
                </span>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <DollarSign className="h-4 w-4 text-gray-400" />
                  <span>${caregiver.hourlyRate}/hr</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <span>Since {format(new Date(caregiver.hireDate), 'MMM yyyy')}</span>
                </div>
              </div>

              {caregiver.certifications && caregiver.certifications.length > 0 && (
                <div className="border-t border-gray-100 pt-3 mb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Award className="h-4 w-4 text-gray-400" />
                    <p className="text-xs font-medium text-gray-700">Certifications</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {caregiver.certifications.map((cert: Certification, idx: number) => (
                      <span
                        key={idx}
                        className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700"
                      >
                        {cert.type}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {caregiver.specializations && caregiver.specializations.length > 0 && (
                <div className="border-t border-gray-100 pt-3">
                  <p className="text-xs font-medium text-gray-700 mb-2">Specializations</p>
                  <div className="flex flex-wrap gap-1">
                    {caregiver.specializations.map((spec: string, idx: number) => (
                      <span
                        key={idx}
                        className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700"
                      >
                        {spec.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </ShowcaseLayout>
  );
};
