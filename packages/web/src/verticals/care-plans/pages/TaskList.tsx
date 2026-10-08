import React, { useState } from 'react';
import { Button } from '@/core/components';
import { TaskClientPicker, TaskInstanceList } from '../components';

export const TaskList: React.FC = () => {
  const [mode, setMode] = useState<'client' | 'all'>('client');
  const [selectedClient, setSelectedClient] = useState<{ id: string; displayName: string } | null>(null);

  const handleBackToClientSearch = () => {
    setMode('client');
    setSelectedClient(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
      </div>

      {mode === 'client' && !selectedClient && (
        <div className="space-y-4">
          <TaskClientPicker
            onSelectClient={(c) =>
              setSelectedClient({
                id: c.id,
                displayName: c.preferredName ?? `${c.firstName} ${c.lastName}`,
              })
            }
          />
          <Button variant="outline" onClick={() => setMode('all')}>
            View All Clients
          </Button>
        </div>
      )}

      {mode === 'client' && selectedClient && (
        <div className="space-y-6">
          <Button variant="outline" onClick={() => setSelectedClient(null)}>
            Back to client search
          </Button>
          <h2 className="text-xl font-semibold text-gray-900">{selectedClient.displayName}</h2>
          <TaskInstanceList clientId={selectedClient.id} showFilters={true} showViewToggle={true} />
        </div>
      )}

      {mode === 'all' && (
        <div className="space-y-6">
          <Button variant="outline" onClick={handleBackToClientSearch}>
            Back to client search
          </Button>
          <TaskInstanceList showFilters={true} showViewToggle={true} />
        </div>
      )}
    </div>
  );
};
