import React, { useState, useEffect, useMemo } from 'react';
import { Search, Filter, Grid, List, X, RotateCcw } from 'lucide-react';
import { 
  Button, 
  LoadingSpinner, 
  EmptyState, 
  ErrorMessage, 
  Input, 
  Select,
  Card,
  CardHeader,
  CardContent
} from '@/core/components';
import { usePermissions } from '@/core/hooks';
import { useTasks } from '../hooks';
import { TaskCard } from './TaskCard';
import type { TaskInstanceSearchFilters, TaskStatus, TaskCategory, TaskInstance } from '../types';

interface TaskSearchFiltersProps {
  filters: TaskInstanceSearchFilters;
  onFiltersChange: (filters: TaskInstanceSearchFilters) => void;
  showAdvanced: boolean;
  setShowAdvanced: (show: boolean) => void;
  statusOptions: { value: string; label: string }[];
  categoryOptions: { value: string; label: string }[];
}

const TaskSearchFilters: React.FC<TaskSearchFiltersProps> = ({
  filters,
  onFiltersChange,
  showAdvanced,
  setShowAdvanced,
  statusOptions,
  categoryOptions,
}) => {
  const [queryInput, setQueryInput] = useState(filters.query || '');

  useEffect(() => {
    setQueryInput(filters.query || '');
  }, [filters.query]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if ((filters.query || '') !== queryInput) {
        onFiltersChange({ ...filters, query: queryInput || undefined });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [queryInput]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.status && filters.status.length > 0) count++;
    if (filters.category && filters.category.length > 0) count++;
    if (filters.assignedCaregiverId?.trim()) count++;
    if (filters.scheduledDateFrom?.trim()) count++;
    if (filters.scheduledDateTo?.trim()) count++;
    if (filters.overdue) count++;
    if (filters.requiresSignature) count++;
    return count;
  }, [filters]);

  const hasAnyActiveFilter = Boolean(queryInput) || activeFilterCount > 0;

  const handleClearFilters = () => {
    setQueryInput('');
    onFiltersChange({
      carePlanId: filters.carePlanId,
      clientId: filters.clientId,
    });
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm space-y-3">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-lg">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search tasks..."
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-3 border-t border-gray-100">
          <Select
            label="Status"
            options={statusOptions}
            value={filters.status?.[0] || ''}
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                status: e.target.value ? [e.target.value as TaskStatus] : undefined,
              })
            }
          />
          
          <Select
            label="Category"
            options={categoryOptions}
            value={filters.category?.[0] || ''}
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                category: e.target.value ? [e.target.value as TaskCategory] : undefined,
              })
            }
          />
          
          <Input
            label="Assigned Caregiver ID"
            value={filters.assignedCaregiverId || ''}
            onChange={(e) => onFiltersChange({ ...filters, assignedCaregiverId: e.target.value })}
          />
          
          <Input
            label="Scheduled Date From"
            type="date"
            value={filters.scheduledDateFrom || ''}
            onChange={(e) => onFiltersChange({ ...filters, scheduledDateFrom: e.target.value })}
          />
          
          <Input
            label="Scheduled Date To"
            type="date"
            value={filters.scheduledDateTo || ''}
            onChange={(e) => onFiltersChange({ ...filters, scheduledDateTo: e.target.value })}
          />
          
          <div className="flex items-center gap-2 pt-6">
            <input
              type="checkbox"
              id="overdue"
              checked={filters.overdue || false}
              onChange={(e) => onFiltersChange({ ...filters, overdue: e.target.checked })}
              className="rounded border-gray-300"
            />
            <label htmlFor="overdue" className="text-sm text-gray-700">
              Show Overdue Only
            </label>
          </div>
          
          <div className="flex items-center gap-2 pt-6">
            <input
              type="checkbox"
              id="requiresSignature"
              checked={filters.requiresSignature || false}
              onChange={(e) => onFiltersChange({ ...filters, requiresSignature: e.target.checked })}
              className="rounded border-gray-300"
            />
            <label htmlFor="requiresSignature" className="text-sm text-gray-700">
              Requires Signature Only
            </label>
          </div>
        </div>
      )}
    </div>
  );
};

export interface TaskInstanceListProps {
  carePlanId?: string;
  clientId?: string;
  showFilters?: boolean;
  showViewToggle?: boolean;
  onTaskClick?: (task: TaskInstance) => void;
}

export const TaskInstanceList: React.FC<TaskInstanceListProps> = ({ 
  carePlanId,
  clientId,
  showFilters = true,
  showViewToggle = true,
  onTaskClick 
}) => {
  const { can } = usePermissions();
  const [filters, setFilters] = useState<TaskInstanceSearchFilters>({
    carePlanId,
    clientId,
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const { data, isLoading, error, refetch } = useTasks(filters);

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
        message={(error as Error).message || 'Failed to load tasks'}
        retry={refetch}
      />
    );
  }

  const tasks = data?.items || [];

  const statusOptions = [
    { value: '', label: 'All Statuses' },
    { value: 'SCHEDULED', label: 'Scheduled' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
    { value: 'COMPLETED', label: 'Completed' },
    { value: 'SKIPPED', label: 'Skipped' },
    { value: 'MISSED', label: 'Missed' },
    { value: 'CANCELLED', label: 'Cancelled' },
    { value: 'ISSUE_REPORTED', label: 'Issue Reported' },
  ];

  const categoryOptions = [
    { value: '', label: 'All Categories' },
    { value: 'PERSONAL_HYGIENE', label: 'Personal Hygiene' },
    { value: 'BATHING', label: 'Bathing' },
    { value: 'DRESSING', label: 'Dressing' },
    { value: 'GROOMING', label: 'Grooming' },
    { value: 'TOILETING', label: 'Toileting' },
    { value: 'MOBILITY', label: 'Mobility' },
    { value: 'TRANSFERRING', label: 'Transferring' },
    { value: 'AMBULATION', label: 'Ambulation' },
    { value: 'MEDICATION', label: 'Medication' },
    { value: 'MEAL_PREPARATION', label: 'Meal Preparation' },
    { value: 'FEEDING', label: 'Feeding' },
    { value: 'HOUSEKEEPING', label: 'Housekeeping' },
    { value: 'LAUNDRY', label: 'Laundry' },
    { value: 'SHOPPING', label: 'Shopping' },
    { value: 'TRANSPORTATION', label: 'Transportation' },
    { value: 'COMPANIONSHIP', label: 'Companionship' },
    { value: 'MONITORING', label: 'Monitoring' },
    { value: 'DOCUMENTATION', label: 'Documentation' },
    { value: 'OTHER', label: 'Other' },
  ];

  // Quick status filters
  const quickFilters = [
    { label: 'All Tasks', status: undefined },
    { label: 'Scheduled', status: ['SCHEDULED'] as TaskStatus[] },
    { label: 'In Progress', status: ['IN_PROGRESS'] as TaskStatus[] },
    { label: 'Completed', status: ['COMPLETED'] as TaskStatus[] },
    { label: 'Overdue', status: ['SCHEDULED'] as TaskStatus[], overdue: true },
  ];

  const applyQuickFilter = (filter: typeof quickFilters[0]) => {
    setFilters({
      ...filters,
      status: filter.status,
      overdue: filter.overdue,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Tasks</h2>
          <p className="text-gray-600 mt-1">
            {data?.total || 0} total tasks
          </p>
        </div>
        
        {showViewToggle && (
          <div className="flex gap-2">
            <div className="flex border border-gray-300 rounded-md">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 ${
                  viewMode === 'grid' ? 'bg-gray-100' : 'hover:bg-gray-50'
                }`}
              >
                <Grid className="h-5 w-5" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 ${
                  viewMode === 'list' ? 'bg-gray-100' : 'hover:bg-gray-50'
                }`}
              >
                <List className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Quick Filters */}
      <div className="flex gap-2">
        {quickFilters.map((filter, index) => (
          <Button
            key={index}
            variant={
              filters.status === filter.status && filters.overdue === filter.overdue
                ? undefined
                : 'outline'
            }
            size="sm"
            onClick={() => applyQuickFilter(filter)}
          >
            {filter.label}
          </Button>
        ))}
      </div>

      {/* Search and Advanced Filters */}
      {showFilters && (
        <TaskSearchFilters
          filters={filters}
          onFiltersChange={setFilters}
          showAdvanced={showAdvanced}
          setShowAdvanced={setShowAdvanced}
          statusOptions={statusOptions}
          categoryOptions={categoryOptions}
        />
      )}

      {/* Tasks List */}
      {tasks.length === 0 ? (
        <EmptyState
          title="No tasks found"
          description="No tasks match your current filters."
          action={
            <Button variant="outline" onClick={() => setFilters({ carePlanId, clientId })}>
              Clear Filters
            </Button>
          }
        />
      ) : (
        <div
          className={
            viewMode === 'grid'
              ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
              : 'space-y-4'
          }
        >
          {tasks.map((task) => (
            <div key={task.id} onClick={() => onTaskClick?.(task)}>
              <TaskCard
                task={task}
                showCompleteButton={can('tasks:write') && task.status === 'SCHEDULED'}
                onCompleted={() => refetch()}
              />
            </div>
          ))}
        </div>
      )}

      {/* Load More */}
      {data && data.hasMore && (
        <div className="flex justify-center">
          <Button variant="outline">Load More</Button>
        </div>
      )}

      {/* Summary Stats */}
      {tasks.length > 0 && (
        <Card>
          <CardHeader title="Summary" />
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {tasks.filter(t => t.status === 'SCHEDULED').length}
                </div>
                <div className="text-sm text-gray-600">Scheduled</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">
                  {tasks.filter(t => t.status === 'IN_PROGRESS').length}
                </div>
                <div className="text-sm text-gray-600">In Progress</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {tasks.filter(t => t.status === 'COMPLETED').length}
                </div>
                <div className="text-sm text-gray-600">Completed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">
                  {tasks.filter(t => {
                    const scheduledDate = new Date(t.scheduledDate);
                    return scheduledDate < new Date() && t.status === 'SCHEDULED';
                  }).length}
                </div>
                <div className="text-sm text-gray-600">Overdue</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};