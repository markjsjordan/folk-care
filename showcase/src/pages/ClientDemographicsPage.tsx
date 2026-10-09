import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShowcaseLayout } from '../components/ShowcaseLayout';
import { useClientProvider } from '@/core/providers/context';
import { Plus, Search, Mail, Phone, MapPin, X, RotateCcw } from 'lucide-react';
import type { ClientSearchFilters } from '../types/showcase-types.js';
import { ClientFiltersComponent } from '../components/clients/ClientFiltersComponent.js';

export const ClientDemographicsPage: React.FC = () => {
  const clientProvider = useClientProvider();
  
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
  const [advancedFilters, setAdvancedFilters] = useState<ClientSearchFilters>({});

  const activeAdvancedFilterCount = useMemo(() => {
    return advancedFilters.status?.length || 0;
  }, [advancedFilters]);

  const hasAnyActiveFilter = Boolean(debouncedSearch) || activeAdvancedFilterCount > 0;

  const handleClearAllFilters = () => {
    setSearchQuery('');
    setDebouncedSearch('');
    setAdvancedFilters({});
  };

  const { data: rawData, isLoading, error } = useQuery({
    queryKey: ['clients', debouncedSearch],
    queryFn: () => clientProvider.getClients({ query: debouncedSearch || undefined }),
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

  const calculateAge = (dateOfBirth: string) => {
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-green-100 text-green-800';
      case 'INACTIVE':
        return 'bg-gray-100 text-gray-800';
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <ShowcaseLayout
      title="Client Demographics"
      description="Comprehensive client profiles with demographics, contact information, and medical details"
    >
      {/* Header Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-4 mb-4">
        <button 
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 shadow-sm transition-colors"
          data-tour="add-client"
        >
          <Plus className="h-4 w-4" />
          Add Client
        </button>
      </div>

      {/* Search and Filter Toolbar styled like Schedule page */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Bar with 300ms debounce */}
          <div className="relative flex-1 max-w-lg" data-tour="client-search">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search clients..."
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
            <ClientFiltersComponent
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm font-medium text-gray-600">Total Clients</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{data?.total || 0}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm font-medium text-gray-600">Active</p>
          <p className="mt-1 text-2xl font-semibold text-green-600">
            {data?.items.filter(c => c.status === 'ACTIVE').length || 0}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm font-medium text-gray-600">Avg. Age</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {data?.items.length
              ? Math.round(
                  data.items.reduce((sum, c) => sum + calculateAge(c.dateOfBirth), 0) /
                    data.items.length
                )
              : 0}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm font-medium text-gray-600">Cities</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {data?.items.length
              ? new Set(data.items.filter(c => c.primaryAddress?.city).map(c => c.primaryAddress.city)).size
              : 0}
          </p>
        </div>
      </div>

      {/* Client List */}
      {isLoading && (
        <div className="text-center py-12">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
          <p className="mt-2 text-sm text-gray-600">Loading clients...</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-sm text-red-800">Failed to load clients. Please try again.</p>
        </div>
      )}

      {data && data.items.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <p className="text-gray-600">No clients found</p>
        </div>
      )}

      {data && data.items.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-tour="client-list">
          {data.items.map((client) => (
            <div
              key={client.id}
              className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {client.firstName} {client.lastName}
                  </h3>
                  <p className="text-sm text-gray-500">
                    Age {calculateAge(client.dateOfBirth)} • {client.gender}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusColor(
                    client.status
                  )}`}
                >
                  {client.status}
                </span>
              </div>

              <div className="space-y-2">
                {client.email && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Mail className="h-4 w-4 text-gray-400" />
                    <span className="truncate">{client.email}</span>
                  </div>
                )}
                {client.phone && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Phone className="h-4 w-4 text-gray-400" />
                    <span>{client.phone}</span>
                  </div>
                )}
                {client.primaryAddress && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    <span className="truncate">
                      {client.primaryAddress.city}, {client.primaryAddress.stateCode}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </ShowcaseLayout>
  );
};
