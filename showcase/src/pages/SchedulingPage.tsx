import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Calendar,
  Clock,
  CheckCircle,
  AlertCircle,
  Search,
  X,
  Grid,
  List,
  RotateCcw,
  Plus,
} from 'lucide-react';
import { ShowcaseLayout } from '../components/ShowcaseLayout';
import { SummaryCard } from '../components/visits/SummaryCard';
import { VisitCard } from '../components/visits/VisitCard';
import { VisitFilters } from '../components/visits/VisitFilters';
import { useVisitProvider } from '@/core/providers/context';
import type { Visit, VisitSearchFilters } from '../types/showcase-types.js';
import { getVisitTypeConfig } from '../config/visitTypeConfig.js';

export const SchedulingPage: React.FC = () => {
  const navigate = useNavigate();
  const visitProvider = useVisitProvider();

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
  const [advancedFilters, setAdvancedFilters] = useState<VisitSearchFilters>({});

  // Summary card active filter
  type SummaryFilterType = 'today' | 'upcoming' | 'unassigned' | 'completed';
  const [activeSummaryFilter, setActiveSummaryFilter] = useState<SummaryFilterType | null>(null);

  // View mode
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Fetch all visits
  const { data: visitsResponse, isLoading, error } = useQuery({
    queryKey: ['visits', debouncedSearch, advancedFilters],
    queryFn: () =>
      visitProvider.getVisits({
        query: debouncedSearch || undefined,
        ...advancedFilters,
        pageSize: 100,
      }),
  });

  const allVisits: Visit[] = visitsResponse?.items || [];

  // Compute today's date string YYYY-MM-DD
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0]!, []);

  // Compute summary metrics across all visits (without summary card active filter)
  const metrics = useMemo(() => {
    let todayCount = 0;
    let upcomingCount = 0;
    let unassignedCount = 0;
    let completedCount = 0;

    allVisits.forEach((v) => {
      if (v.scheduledDate === todayStr) {
        todayCount++;
      }
      if (
        v.scheduledDate >= todayStr &&
        v.status !== 'COMPLETED' &&
        v.status !== 'CANCELLED'
      ) {
        upcomingCount++;
      }
      if (v.status === 'UNASSIGNED') {
        unassignedCount++;
      }
      if (v.status === 'COMPLETED') {
        completedCount++;
      }
    });

    return { todayCount, upcomingCount, unassignedCount, completedCount };
  }, [allVisits, todayStr]);

  // Filter visits by active summary card filter
  const displayedVisits = useMemo(() => {
    if (!activeSummaryFilter) return allVisits;

    switch (activeSummaryFilter) {
      case 'today':
        return allVisits.filter((v) => v.scheduledDate === todayStr);
      case 'upcoming':
        return allVisits.filter(
          (v) =>
            v.scheduledDate >= todayStr &&
            v.status !== 'COMPLETED' &&
            v.status !== 'CANCELLED'
        );
      case 'unassigned':
        return allVisits.filter((v) => v.status === 'UNASSIGNED');
      case 'completed':
        return allVisits.filter((v) => v.status === 'COMPLETED');
      default:
        return allVisits;
    }
  }, [allVisits, activeSummaryFilter, todayStr]);

  // Calculate active filter count for badge
  const activeAdvancedFilterCount = useMemo(() => {
    return (
      (advancedFilters.status?.length || 0) +
      (advancedFilters.visitType?.length || 0) +
      (advancedFilters.dateFrom ? 1 : 0) +
      (advancedFilters.dateTo ? 1 : 0)
    );
  }, [advancedFilters]);

  const hasAnyActiveFilter =
    Boolean(debouncedSearch) ||
    activeAdvancedFilterCount > 0 ||
    activeSummaryFilter !== null;

  const handleClearAllFilters = () => {
    setSearchQuery('');
    setDebouncedSearch('');
    setAdvancedFilters({});
    setActiveSummaryFilter(null);
  };

  const toggleSummaryFilter = (filter: SummaryFilterType) => {
    setActiveSummaryFilter((prev) => (prev === filter ? null : filter));
  };

  return (
    <ShowcaseLayout
      title="Scheduling & Visits"
      description="Manage client visits and caregiver schedules with real-time EVV tracking and visit types"
    >
      <div className="space-y-6">
        {/* Header Action Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Visit Schedule</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Showing {displayedVisits.length} of {allVisits.length} scheduled visits
            </p>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Schedule New Visit
          </button>
        </div>

        {/* Clickable Summary Cards Acting as Active Filters */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard
            title="Today's Visits"
            count={metrics.todayCount}
            icon={<Calendar className="w-5 h-5 text-blue-600" />}
            color="blue"
            subtitle="Scheduled for today"
            onClick={() => toggleSummaryFilter('today')}
            isActive={activeSummaryFilter === 'today'}
          />
          <SummaryCard
            title="Upcoming Visits"
            count={metrics.upcomingCount}
            icon={<Clock className="w-5 h-5 text-indigo-600" />}
            color="indigo"
            subtitle="Upcoming active"
            onClick={() => toggleSummaryFilter('upcoming')}
            isActive={activeSummaryFilter === 'upcoming'}
          />
          <SummaryCard
            title="Unassigned"
            count={metrics.unassignedCount}
            icon={<AlertCircle className="w-5 h-5 text-amber-600" />}
            color="yellow"
            subtitle="Needs caregiver"
            onClick={() => toggleSummaryFilter('unassigned')}
            isActive={activeSummaryFilter === 'unassigned'}
          />
          <SummaryCard
            title="Completed"
            count={metrics.completedCount}
            icon={<CheckCircle className="w-5 h-5 text-green-600" />}
            color="green"
            subtitle="Successfully verified"
            onClick={() => toggleSummaryFilter('completed')}
            isActive={activeSummaryFilter === 'completed'}
          />
        </div>

        {/* Search, Filter Dropdown, and View Mode Toolbar */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Search Bar with 300ms debounce */}
            <div className="relative flex-1 max-w-lg">
              <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search by client, caregiver, address, or services..."
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

            {/* Filter Dropdown + Clear All + View Mode */}
            <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
              <VisitFilters
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

              {/* View Mode Toggle */}
              <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50 ml-auto sm:ml-0">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-md text-xs font-medium transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                  aria-label="Grid view"
                >
                  <Grid className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded-md text-xs font-medium transition-colors ${
                    viewMode === 'list'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                  aria-label="List view"
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Active Filter Pills Bar */}
          {hasAnyActiveFilter && (
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2 flex-wrap text-xs">
              <span className="text-gray-500 font-medium">Active filters:</span>

              {activeSummaryFilter && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 font-medium">
                  Summary: {activeSummaryFilter.toUpperCase()}
                  <button
                    type="button"
                    onClick={() => setActiveSummaryFilter(null)}
                    className="hover:text-blue-950 p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {debouncedSearch && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 text-gray-800 font-medium">
                  Search: "{debouncedSearch}"
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="hover:text-gray-950 p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {advancedFilters.status?.map((st) => (
                <span
                  key={st}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 font-medium"
                >
                  Status: {st}
                  <button
                    type="button"
                    onClick={() =>
                      setAdvancedFilters({
                        ...advancedFilters,
                        status: advancedFilters.status?.filter((s) => s !== st),
                      })
                    }
                    className="hover:text-indigo-950 p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}

              {advancedFilters.visitType?.map((vt) => {
                const cfg = getVisitTypeConfig(vt);
                return (
                  <span
                    key={vt}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full ${cfg.bgClass} ${cfg.colorClass} font-medium border ${cfg.borderClass}`}
                  >
                    Type: {cfg.label}
                    <button
                      type="button"
                      onClick={() =>
                        setAdvancedFilters({
                          ...advancedFilters,
                          visitType: advancedFilters.visitType?.filter((t) => t !== vt),
                        })
                      }
                      className="p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                );
              })}

              {(advancedFilters.dateFrom || advancedFilters.dateTo) && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 text-gray-800 font-medium">
                  Date: {advancedFilters.dateFrom || 'Any'} → {advancedFilters.dateTo || 'Any'}
                  <button
                    type="button"
                    onClick={() =>
                      setAdvancedFilters({
                        ...advancedFilters,
                        dateFrom: undefined,
                        dateTo: undefined,
                      })
                    }
                    className="hover:text-gray-950 p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              <button
                type="button"
                onClick={handleClearAllFilters}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium underline ml-1"
              >
                Reset All
              </button>
            </div>
          )}
        </div>

        {/* Visit List / Grid Display */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-gray-200">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-gray-600 font-medium">Loading visit schedule...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center text-red-800">
            <AlertCircle className="w-10 h-10 text-red-600 mx-auto mb-2" />
            <h3 className="text-base font-semibold">Error Loading Visits</h3>
            <p className="text-sm mt-1 text-red-600">{(error as Error).message}</p>
          </div>
        ) : displayedVisits.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center shadow-sm">
            <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-gray-900">No visits match your criteria</h3>
            <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
              {hasAnyActiveFilter
                ? 'Try adjusting or clearing your search and filters to see more scheduled visits.'
                : 'No visits have been scheduled yet.'}
            </p>
            {hasAnyActiveFilter && (
              <button
                type="button"
                onClick={handleClearAllFilters}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Clear All Filters
              </button>
            )}
          </div>
        ) : (
          <div
            className={
              viewMode === 'grid'
                ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5'
                : 'space-y-3'
            }
          >
            {displayedVisits.map((visit) => (
              <VisitCard
                key={visit.id}
                visit={visit}
                onClick={() => navigate(`/scheduling/visits/${visit.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </ShowcaseLayout>
  );
};
