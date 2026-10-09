import React, { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar,
  Grid,
  List,
  Clock,
  CheckCircle,
  AlertCircle,
  Search,
  X,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Zap,
  Stethoscope,
} from 'lucide-react';
import { LoadingSpinner, EmptyState, ErrorMessage, Button } from '@/core/components';
import { useVisits } from '../hooks/useVisits';
import { VisitCard, SummaryCard, VisitFilters } from '../components';
import type { VisitSearchFilters, Visit } from '../types';
import { VISIT_STATUS_LABELS, VISIT_TYPE_LABELS } from '../types';

const getDefaultFilters = (): VisitSearchFilters => ({
  dateFrom: new Date(),
  dateTo: new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
});

type SummaryFilterType = 'today' | 'upcoming' | 'unassigned' | 'completed';

export const VisitList: React.FC = () => {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Search state with 300ms debounce
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim().toLowerCase());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Advanced dropdown filters
  const [advancedFilters, setAdvancedFilters] = useState<VisitSearchFilters>({});

  // Summary card active filter
  const [activeSummaryFilter, setActiveSummaryFilter] = useState<SummaryFilterType | null>(null);

  // Backend query (gets default 30-day window)
  const [queryFilters] = useState<VisitSearchFilters>(getDefaultFilters);
  const { data: visits, isLoading, error, refetch } = useVisits(queryFilters);

  const visitList: Visit[] = visits ?? [];
  const totalVisits = visitList.length;

  // Compute today's date string YYYY-MM-DD
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0]!, []);

  // Compute summary metrics across all visits
  const metrics = useMemo(() => {
    let todayCount = 0;
    let upcomingCount = 0;
    let unassignedCount = 0;
    let completedCount = 0;

    const now = new Date();

    visitList.forEach((v) => {
      const scheduledDateStr =
        v.scheduledDate instanceof Date
          ? v.scheduledDate.toISOString().split('T')[0]!
          : String(v.scheduledDate).split('T')[0]!;

      const scheduledDateObj =
        v.scheduledDate instanceof Date ? v.scheduledDate : new Date(v.scheduledDate);

      if (scheduledDateStr === todayStr) {
        todayCount++;
      }
      if (
        scheduledDateObj >= now &&
        v.status !== 'COMPLETED' &&
        v.status !== 'CANCELLED'
      ) {
        upcomingCount++;
      }
      if (v.status === 'UNASSIGNED' || !v.assignedCaregiverId) {
        unassignedCount++;
      }
      if (v.status === 'COMPLETED') {
        completedCount++;
      }
    });

    return { todayCount, upcomingCount, unassignedCount, completedCount };
  }, [visitList, todayStr]);

  // Filter visits by search, advanced filters, and active summary card filter
  const filteredVisits = useMemo(() => {
    return visitList.filter((v) => {
      const scheduledDateStr =
        v.scheduledDate instanceof Date
          ? v.scheduledDate.toISOString().split('T')[0]!
          : String(v.scheduledDate).split('T')[0]!;

      const scheduledDateObj =
        v.scheduledDate instanceof Date ? v.scheduledDate : new Date(v.scheduledDate);

      // 1. Summary Card Filter
      if (activeSummaryFilter === 'today') {
        if (scheduledDateStr !== todayStr) return false;
      } else if (activeSummaryFilter === 'upcoming') {
        if (
          scheduledDateObj < new Date() ||
          v.status === 'COMPLETED' ||
          v.status === 'CANCELLED'
        ) {
          return false;
        }
      } else if (activeSummaryFilter === 'unassigned') {
        if (v.status !== 'UNASSIGNED' && Boolean(v.assignedCaregiverId)) {
          return false;
        }
      } else if (activeSummaryFilter === 'completed') {
        if (v.status !== 'COMPLETED') return false;
      }

      // 2. Debounced Search Query
      if (debouncedSearch) {
        const clientName = `${v.clientFirstName || ''} ${v.clientLastName || ''}`.toLowerCase();
        const serviceName = (v.serviceTypeName || '').toLowerCase();
        const visitNum = (v.visitNumber || '').toLowerCase();
        const address = `${v.address?.line1 || ''} ${v.address?.city || ''} ${v.address?.state || ''} ${v.address?.postalCode || ''}`.toLowerCase();

        const matches =
          clientName.includes(debouncedSearch) ||
          serviceName.includes(debouncedSearch) ||
          visitNum.includes(debouncedSearch) ||
          address.includes(debouncedSearch);

        if (!matches) return false;
      }

      // 3. Status Filter
      if (advancedFilters.status && advancedFilters.status.length > 0) {
        if (!advancedFilters.status.includes(v.status)) return false;
      }

      // 4. Visit Type Filter
      if (advancedFilters.visitType && advancedFilters.visitType.length > 0) {
        if (!advancedFilters.visitType.includes(v.visitType)) return false;
      }

      // 5. Date Range Filter
      if (advancedFilters.dateFrom) {
        const fromDateStr =
          advancedFilters.dateFrom instanceof Date
            ? advancedFilters.dateFrom.toISOString().split('T')[0]!
            : String(advancedFilters.dateFrom).split('T')[0]!;
        if (scheduledDateStr < fromDateStr) return false;
      }
      if (advancedFilters.dateTo) {
        const toDateStr =
          advancedFilters.dateTo instanceof Date
            ? advancedFilters.dateTo.toISOString().split('T')[0]!
            : String(advancedFilters.dateTo).split('T')[0]!;
        if (scheduledDateStr > toDateStr) return false;
      }

      return true;
    });
  }, [visitList, activeSummaryFilter, debouncedSearch, advancedFilters, todayStr]);

  // Active filter count for dropdown badge
  const activeAdvancedFilterCount = useMemo(() => {
    return (
      (advancedFilters.status?.length || 0) +
      (advancedFilters.visitType?.length || 0) +
      (advancedFilters.dateFrom ? 1 : 0) +
      (advancedFilters.dateTo ? 1 : 0)
    );
  }, [advancedFilters]);

  const hasAnyFilterActive = useMemo(() => {
    return (
      Boolean(debouncedSearch) ||
      Boolean(activeSummaryFilter) ||
      activeAdvancedFilterCount > 0
    );
  }, [debouncedSearch, activeSummaryFilter, activeAdvancedFilterCount]);

  const clearAllFilters = () => {
    setSearchQuery('');
    setDebouncedSearch('');
    setActiveSummaryFilter(null);
    setAdvancedFilters({});
    setPage(1);
  };

  // Pagination on filtered visits
  const filteredCount = filteredVisits.length;
  const isLargeDataset = filteredCount >= 500;
  const totalPages = Math.max(1, Math.ceil(filteredCount / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredCount);

  const visibleVisits = useMemo(() => {
    return filteredVisits.slice(startIndex, endIndex);
  }, [filteredVisits, startIndex, endIndex]);

  // Reset pagination to page 1 whenever filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, activeSummaryFilter, advancedFilters, pageSize]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorMessage
        message={(error as Error).message || 'Failed to load visits'}
        retry={() => {
          void refetch();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Scheduling & Visits</h1>
            {isLargeDataset && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                <Zap className="h-3 w-3" />
                500+ Visits (Optimized)
              </span>
            )}
          </div>
          <p className="text-gray-600 mt-1">
            {totalVisits === 0
              ? 'No visits scheduled'
              : hasAnyFilterActive
                ? `Showing ${filteredCount} of ${totalVisits} visits (${startIndex + 1}–${endIndex} shown)`
                : `${totalVisits} total visits (${startIndex + 1}–${endIndex} shown)`}
          </p>
        </div>

        <div className="flex gap-3 items-center">
          <Link to="/scheduling/builder?visitType=SUPERVISION">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Stethoscope className="h-4 w-4 text-blue-600" />}
            >
              Schedule Supervision Visit
            </Button>
          </Link>
          <div className="flex border border-gray-300 rounded-md">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 ${
                viewMode === 'grid' ? 'bg-gray-100' : 'hover:bg-gray-50'
              }`}
              aria-label="Grid view"
            >
              <Grid className="h-5 w-5 text-gray-700" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 ${
                viewMode === 'list' ? 'bg-gray-100' : 'hover:bg-gray-50'
              }`}
              aria-label="List view"
            >
              <List className="h-5 w-5 text-gray-700" />
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Summary Cards */}
      {totalVisits > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard
            title="Today"
            count={metrics.todayCount}
            icon={<Calendar className="h-5 w-5" />}
            color="blue"
            subtitle="Scheduled for today"
            isActive={activeSummaryFilter === 'today'}
            onClick={() =>
              setActiveSummaryFilter(activeSummaryFilter === 'today' ? null : 'today')
            }
          />
          <SummaryCard
            title="Upcoming"
            count={metrics.upcomingCount}
            icon={<Clock className="h-5 w-5" />}
            color="indigo"
            subtitle="Active upcoming"
            isActive={activeSummaryFilter === 'upcoming'}
            onClick={() =>
              setActiveSummaryFilter(activeSummaryFilter === 'upcoming' ? null : 'upcoming')
            }
          />
          <SummaryCard
            title="Unassigned"
            count={metrics.unassignedCount}
            icon={<AlertCircle className="h-5 w-5" />}
            color="yellow"
            subtitle="Needs caregiver"
            isActive={activeSummaryFilter === 'unassigned'}
            onClick={() =>
              setActiveSummaryFilter(activeSummaryFilter === 'unassigned' ? null : 'unassigned')
            }
          />
          <SummaryCard
            title="Completed"
            count={metrics.completedCount}
            icon={<CheckCircle className="h-5 w-5" />}
            color="green"
            subtitle="Visits finished"
            isActive={activeSummaryFilter === 'completed'}
            onClick={() =>
              setActiveSummaryFilter(activeSummaryFilter === 'completed' ? null : 'completed')
            }
          />
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by client, caregiver, service, address, or visit #..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-9 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <VisitFilters
              filters={advancedFilters}
              onFiltersChange={setAdvancedFilters}
              activeCount={activeAdvancedFilterCount}
            />

            {hasAnyFilterActive && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                title="Clear all active filters"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Clear All</span>
              </button>
            )}
          </div>
        </div>

        {/* Active Filter Chips */}
        {hasAnyFilterActive && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100 text-xs">
            <span className="text-gray-500 font-medium">Active filters:</span>

            {activeSummaryFilter && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 font-medium capitalize">
                Tab: {activeSummaryFilter}
                <button
                  type="button"
                  onClick={() => setActiveSummaryFilter(null)}
                  className="hover:text-blue-900 ml-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {debouncedSearch && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 text-gray-800 font-medium">
                Search: &quot;{debouncedSearch}&quot;
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="hover:text-gray-900 ml-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {advancedFilters.status?.map((st) => (
              <span
                key={st}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-800 font-medium"
              >
                Status: {VISIT_STATUS_LABELS[st] || st}
                <button
                  type="button"
                  onClick={() =>
                    setAdvancedFilters({
                      ...advancedFilters,
                      status: advancedFilters.status?.filter((s) => s !== st),
                    })
                  }
                  className="hover:text-indigo-900 ml-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}

            {advancedFilters.visitType?.map((vt) => (
              <span
                key={vt}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-100 text-purple-800 font-medium"
              >
                Type: {VISIT_TYPE_LABELS[vt] || vt}
                <button
                  type="button"
                  onClick={() =>
                    setAdvancedFilters({
                      ...advancedFilters,
                      visitType: advancedFilters.visitType?.filter((t) => t !== vt),
                    })
                  }
                  className="hover:text-purple-900 ml-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}

            {(advancedFilters.dateFrom || advancedFilters.dateTo) && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 font-medium">
                Date: {String(advancedFilters.dateFrom || 'Any')} to {String(advancedFilters.dateTo || 'Any')}
                <button
                  type="button"
                  onClick={() =>
                    setAdvancedFilters({
                      ...advancedFilters,
                      dateFrom: undefined,
                      dateTo: undefined,
                    })
                  }
                  className="hover:text-amber-900 ml-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            <button
              type="button"
              onClick={clearAllFilters}
              className="text-blue-600 hover:text-blue-800 hover:underline font-medium ml-1"
            >
              Reset all
            </button>
          </div>
        )}
      </div>

      {/* Visits List or Empty State */}
      {totalVisits === 0 ? (
        <EmptyState
          title="No visits scheduled"
          description="Visits will appear here once they are scheduled in the system. Check back later or contact your coordinator to schedule visits."
          icon={<Calendar className="h-12 w-12 text-gray-400" />}
        />
      ) : filteredVisits.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4 text-gray-500">
            <Search className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-gray-900">No visits match your filter</h3>
          <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
            Try adjusting your search query, status filters, or date range to see more results.
          </p>
          <div className="mt-4">
            <Button variant="outline" size="sm" onClick={clearAllFilters}>
              Reset Filters
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div
            data-testid="visit-list"
            className={
              viewMode === 'grid'
                ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
                : 'space-y-4'
            }
          >
            {visibleVisits.map((visit) => (
              <VisitCard
                key={visit.id}
                visit={visit}
                compact={viewMode === 'list'}
              />
            ))}
          </div>

          {/* Pagination Controls */}
          {filteredCount > pageSize && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-lg border border-gray-200">
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <span>
                  Showing <span className="font-semibold">{startIndex + 1}</span> to{' '}
                  <span className="font-semibold">{endIndex}</span> of{' '}
                  <span className="font-semibold">{filteredCount}</span> visits
                </span>
                {isLargeDataset && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                    <Zap className="h-3 w-3" />
                    Windowing Active
                  </span>
                )}
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <label htmlFor="pageSizeSelect" className="text-sm text-gray-600">
                    Per page:
                  </label>
                  <select
                    id="pageSizeSelect"
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="border border-gray-300 rounded px-2 py-1 text-sm bg-white text-gray-900"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(1)}
                    disabled={currentPage === 1}
                    aria-label="First page"
                    className="p-1.5 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700"
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    aria-label="Previous page"
                    className="p-1.5 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>

                  <span className="px-3 py-1 text-sm text-gray-700">
                    Page {currentPage} of {totalPages}
                  </span>

                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    aria-label="Next page"
                    className="p-1.5 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setPage(totalPages)}
                    disabled={currentPage === totalPages}
                    aria-label="Last page"
                    className="p-1.5 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700"
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
