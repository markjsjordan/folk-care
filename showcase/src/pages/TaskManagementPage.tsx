import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShowcaseLayout } from '../components/ShowcaseLayout';
import { useCarePlanProvider } from '@/core/providers/context';
import { CheckCircle, Clock, AlertTriangle, Search, X, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import type { TaskInstanceSearchFilters } from '../types/showcase-types.js';
import { TaskFiltersComponent } from '../components/tasks/TaskFiltersComponent.js';

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    SCHEDULED: 'bg-blue-100 text-blue-800',
    IN_PROGRESS: 'bg-yellow-100 text-yellow-800',
    COMPLETED: 'bg-green-100 text-green-800',
    SKIPPED: 'bg-gray-100 text-gray-800',
    MISSED: 'bg-red-100 text-red-800',
    CANCELLED: 'bg-gray-100 text-gray-800',
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
};

export const TaskManagementPage: React.FC = () => {
  const carePlanProvider = useCarePlanProvider();
  
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
  const [advancedFilters, setAdvancedFilters] = useState<TaskInstanceSearchFilters>({});

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
    queryKey: ['tasks', { status: advancedFilters.status }],
    queryFn: () =>
      carePlanProvider.getTasks({
        status: advancedFilters.status ? (advancedFilters.status as any) : undefined,
      }),
  });

  // Filter items by search query if set
  const data = useMemo(() => {
    if (!rawData) return rawData;
    if (!debouncedSearch) return rawData;
    const filteredItems = rawData.items.filter(t => 
      t.title.toLowerCase().includes(debouncedSearch) ||
      t.description.toLowerCase().includes(debouncedSearch) ||
      t.category.toLowerCase().includes(debouncedSearch)
    );
    return {
      ...rawData,
      items: filteredItems,
      total: filteredItems.length,
    };
  }, [rawData, debouncedSearch]);

  const stats = {
    total: rawData?.total || 0,
    scheduled: rawData?.items.filter(t => t.status === 'SCHEDULED').length || 0,
    completed: rawData?.items.filter(t => t.status === 'COMPLETED').length || 0,
    overdue: rawData?.items.filter(t =>
      new Date(t.scheduledEndTime) < new Date() && t.status !== 'COMPLETED'
    ).length || 0,
  };

  return (
    <ShowcaseLayout
      title="Task Management"
      description="Schedule, track, and complete care tasks with digital signatures"
    >
      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm font-medium text-gray-600">Total Tasks</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{stats.total}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-600" />
            <p className="text-sm font-medium text-gray-600">Scheduled</p>
          </div>
          <p className="mt-1 text-2xl font-semibold text-blue-600">{stats.scheduled}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <p className="text-sm font-medium text-gray-600">Completed</p>
          </div>
          <p className="mt-1 text-2xl font-semibold text-green-600">{stats.completed}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <p className="text-sm font-medium text-gray-600">Overdue</p>
          </div>
          <p className="mt-1 text-2xl font-semibold text-red-600">{stats.overdue}</p>
        </div>
      </div>

      {/* Search and Filter Toolbar identical to Scheduling */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Bar with 300ms debounce */}
          <div className="relative flex-1 max-w-lg">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search tasks by title, category, or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-9 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
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
            <TaskFiltersComponent
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

      {/* Tasks List */}
      {isLoading && (
        <div className="text-center py-12">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
        </div>
      )}

      {data && data.items.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <p className="text-gray-600">No tasks found</p>
        </div>
      )}

      {data && data.items.length > 0 && (
        <div className="space-y-3">
          {data.items.map((task) => (
            <div
              key={task.id}
              className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-semibold text-gray-900">{task.title}</h3>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getStatusColor(
                        task.status
                      )}`}
                    >
                      {task.status}
                    </span>
                    {task.priority === 'URGENT' && (
                      <span className="text-red-600 text-xs font-medium">URGENT</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{task.description}</p>
                  <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                    <span>Category: {task.category.replace(/_/g, ' ')}</span>
                    <span>•</span>
                    <span>
                      Scheduled: {format(new Date(task.scheduledStartTime), 'MMM d, h:mm a')}
                    </span>
                    {task.requiresSignature && (
                      <>
                        <span>•</span>
                        <span className="text-blue-600">Signature Required</span>
                      </>
                    )}
                    {task.requiresEvv && (
                      <>
                        <span>•</span>
                        <span className="text-purple-600">EVV Required</span>
                      </>
                    )}
                  </div>
                  {task.completionNotes && (
                    <div className="mt-2 rounded bg-green-50 px-3 py-2">
                      <p className="text-xs text-green-800">
                        <strong>Note:</strong> {task.completionNotes}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </ShowcaseLayout>
  );
};
