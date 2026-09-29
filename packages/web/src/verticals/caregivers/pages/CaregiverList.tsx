/**
 * Caregiver List Page
 */

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Grid, List, Users, Sparkles } from 'lucide-react';
import { 
  Button, 
  LoadingSpinner, 
  EmptyState, 
  ErrorMessage,
  DemoDataBanner 
} from '@/core/components/index.js';
import { usePermissions, useDemoData } from '@/core/hooks/index.js';
import { useCaregivers } from '../hooks/index.js';
import { CaregiverCard, CaregiverSearch } from '../components/index.js';
import type { CaregiverSearchFilters } from '../types/index.js';

export const CaregiverList: React.FC = () => {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [filters, setFilters] = useState<CaregiverSearchFilters>({});
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const { data, isLoading, error, refetch } = useCaregivers(filters);
  const {
    hasDemoData,
    isSeeding,
    isClearing,
    seedDemoData,
    clearDemoData,
    stats,
  } = useDemoData();

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
        message={(error as Error).message || 'Failed to load caregivers'}
        retry={refetch}
      />
    );
  }

  const caregivers = data?.items || [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Caregivers</h1>
          <p className="text-gray-600 mt-1">
            {data?.total || 0} total caregivers
          </p>
        </div>
        <div className="flex gap-2">
          <div className="flex border border-gray-300 rounded-md">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 ${
                viewMode === 'grid' ? 'bg-gray-100' : 'hover:bg-gray-50'
              }`}
              title="Grid view"
            >
              <Grid className="h-5 w-5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 ${
                viewMode === 'list' ? 'bg-gray-100' : 'hover:bg-gray-50'
              }`}
              title="List view"
            >
              <List className="h-5 w-5" />
            </button>
          </div>
          {can('caregivers:write') && (
            <Link to="/caregivers/new">
              <Button leftIcon={<Plus className="h-4 w-4" />}>
                New Caregiver
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Demo Data Banner */}
      {hasDemoData && (
        <DemoDataBanner
          onClearDemo={clearDemoData}
          onAddRealData={() => navigate('/caregivers/new')}
          isClearing={isClearing}
          stats={stats || undefined}
        />
      )}

      <CaregiverSearch filters={filters} onFiltersChange={setFilters} />

      {caregivers.length === 0 ? (
        <EmptyState
          title="No caregivers found"
          description={
            !hasDemoData
              ? "Get started by loading sample data to explore the platform, or add your first caregiver."
              : "Get started by creating your first caregiver."
          }
          icon={<Users />}
          size="lg"
          action={
            !hasDemoData ? (
              <Button
                variant="primary"
                size="lg"
                leftIcon={<Sparkles className="h-4 w-4" />}
                onClick={() => void seedDemoData()}
                isLoading={isSeeding}
              >
                Load Sample Data
              </Button>
            ) : (
              can('caregivers:write') && (
                <Button
                  variant="primary"
                  size="lg"
                  leftIcon={<Plus className="h-4 w-4" />}
                  onClick={() => navigate('/caregivers/new')}
                >
                  Add Caregiver
                </Button>
              )
            )
          }
          secondaryAction={
            !hasDemoData && can('caregivers:write') ? (
              <Button
                variant="outline"
                size="lg"
                leftIcon={<Plus className="h-4 w-4" />}
                onClick={() => navigate('/caregivers/new')}
              >
                Add Caregiver
              </Button>
            ) : null
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
          {caregivers.map((caregiver) => (
            <CaregiverCard
              key={caregiver.id}
              caregiver={caregiver}
              compact={viewMode === 'list'}
            />
          ))}
        </div>
      )}

      {data && data.totalPages > 1 && (
        <div className="flex justify-center">
          <Button variant="outline">Load More</Button>
        </div>
      )}
    </div>
  );
};
