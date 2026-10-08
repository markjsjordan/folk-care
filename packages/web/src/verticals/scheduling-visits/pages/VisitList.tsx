import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Grid, List, CalendarDays, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Zap, Stethoscope } from 'lucide-react';
import { LoadingSpinner, EmptyState, ErrorMessage, Button } from '@/core/components';
import { useVisits } from '../hooks/useVisits';
import { VisitCard } from '../components';
import type { VisitSearchFilters } from '../types';

const getDefaultFilters = (): VisitSearchFilters => ({
  dateFrom: new Date(),
  dateTo: new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
});

export const VisitList: React.FC = () => {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Default to show visits for the next 30 days
  const [filters] = useState<VisitSearchFilters>(getDefaultFilters);

  const { data: visits, isLoading, error, refetch } = useVisits(filters);

  const visitList = visits ?? [];
  const totalVisits = visitList.length;
  const isLargeDataset = totalVisits >= 500;
  const totalPages = Math.max(1, Math.ceil(totalVisits / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalVisits);

  const visibleVisits = useMemo(() => {
    return visitList.slice(startIndex, endIndex);
  }, [visitList, startIndex, endIndex]);

  const upcomingVisits = useMemo(() => {
    return visitList.filter((v) => {
      const scheduledDate = typeof v.scheduledDate === 'string'
        ? new Date(v.scheduledDate)
        : v.scheduledDate;
      return scheduledDate >= new Date() && v.status !== 'CANCELLED' && v.status !== 'COMPLETED';
    });
  }, [visitList]);

  const completedVisits = useMemo(() => visitList.filter((v) => v.status === 'COMPLETED'), [visitList]);
  const unassignedVisits = useMemo(() => visitList.filter((v) => v.status === 'UNASSIGNED'), [visitList]);

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
        retry={() => { void refetch(); }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
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
              <Grid className="h-5 w-5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 ${
                viewMode === 'list' ? 'bg-gray-100' : 'hover:bg-gray-50'
              }`}
              aria-label="List view"
            >
              <List className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      {totalVisits > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Upcoming</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {upcomingVisits.length}
                </p>
              </div>
              <Calendar className="h-8 w-8 text-blue-500" />
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Unassigned</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {unassignedVisits.length}
                </p>
              </div>
              <CalendarDays className="h-8 w-8 text-yellow-500" />
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Completed</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {completedVisits.length}
                </p>
              </div>
              <Calendar className="h-8 w-8 text-green-500" />
            </div>
          </div>
        </div>
      )}

      {/* Visits List or Empty State */}
      {totalVisits === 0 ? (
        <EmptyState
          title="No visits scheduled"
          description="Visits will appear here once they are scheduled in the system. Check back later or contact your coordinator to schedule visits."
          icon={<Calendar className="h-12 w-12" />}
        />
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
          {totalVisits > pageSize && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-lg border border-gray-200">
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <span>
                  Showing <span className="font-semibold">{startIndex + 1}</span> to{' '}
                  <span className="font-semibold">{endIndex}</span> of{' '}
                  <span className="font-semibold">{totalVisits}</span> visits
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
