import React, { useState } from 'react';
import { Button, LoadingSpinner, EmptyState, ErrorMessage } from '@/core/components';
import { useClients, ClientSearch } from '@/verticals/client-demographics';
import type { ClientSearchFilters } from '@/verticals/client-demographics';

export interface TaskClientPickerProps {
  onSelectClient: (client: {
    id: string;
    firstName: string;
    lastName: string;
    preferredName?: string;
    clientNumber: string;
  }) => void;
}

export const TaskClientPicker: React.FC<TaskClientPickerProps> = ({ onSelectClient }) => {
  const [filters, setFilters] = useState<ClientSearchFilters>({});
  const { data, isLoading, error, refetch } = useClients(filters);

  const clients = data?.items ?? [];

  return (
    <div className="space-y-4">
      <ClientSearch filters={filters} onFiltersChange={setFilters} />

      {isLoading && (
        <div className="flex justify-center items-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      )}

      {!isLoading && error && (
        <ErrorMessage
          message={(error as Error).message || 'Failed to load clients'}
          retry={refetch}
        />
      )}

      {!isLoading && !error && clients.length === 0 && (
        <EmptyState
          title="No clients found"
          description="No clients match your current filters."
          action={
            <Button variant="outline" onClick={() => setFilters({})}>
              Clear Filters
            </Button>
          }
        />
      )}

      {!isLoading && !error && clients.length > 0 && (
        <div className="space-y-2">
          {clients.map((client) => (
            <div
              key={client.id}
              role="button"
              tabIndex={0}
              data-testid="client-picker-row"
              onClick={() => onSelectClient(client)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectClient(client);
                }
              }}
              aria-label={client.preferredName ?? `${client.firstName} ${client.lastName}`}
              className="w-full flex items-center justify-between gap-4 py-4 px-4 bg-white border border-gray-200 rounded-md cursor-pointer hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <div>
                <p className="text-base font-medium text-gray-900">
                  {client.preferredName ?? `${client.firstName} ${client.lastName}`}
                </p>
                <p className="text-sm text-gray-500">{client.clientNumber}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
