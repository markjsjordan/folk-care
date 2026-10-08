import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Button, FormField, Select } from '@/core/components';
import { useAuth } from '@/core/hooks';
import { useCreatePayRun, usePayPeriods } from '../hooks';

export interface CreatePayRunModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
  /** Pre-select a pay period, e.g. when triggered from a specific period's row */
  defaultPayPeriodId?: string;
}

const runTypeOptions = [
  { value: 'REGULAR', label: 'Regular' },
  { value: 'OFF_CYCLE', label: 'Off-Cycle' },
  { value: 'CORRECTION', label: 'Correction' },
];

export const CreatePayRunModal: React.FC<CreatePayRunModalProps> = ({
  isOpen,
  onClose,
  onCreated,
  defaultPayPeriodId,
}) => {
  const { user } = useAuth();
  const createPayRun = useCreatePayRun();
  const { data: payPeriodData } = usePayPeriods({ status: 'OPEN' });

  const [payPeriodId, setPayPeriodId] = useState(defaultPayPeriodId ?? '');
  const [runType, setRunType] = useState('REGULAR');

  if (!isOpen) return null;

  const payPeriodOptions = (payPeriodData?.items ?? []).map((period) => ({
    value: period.id,
    label: `#${period.periodNumber} - ${period.periodYear} (${period.startDate.slice(0, 10)} to ${period.endDate.slice(0, 10)})`,
  }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.organizationId || !payPeriodId) return;

    try {
      await createPayRun.mutateAsync({
        organizationId: user.organizationId,
        payPeriodId,
        runType,
      });
      onCreated?.();
      onClose();
    } catch {
      // Error is handled by the mutation
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">New Pay Run</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            leftIcon={<X className="h-4 w-4" />}
          />
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4">
            <FormField label="Pay Period" required>
              <Select
                value={payPeriodId}
                onChange={(e) => setPayPeriodId(e.target.value)}
                options={payPeriodOptions}
                placeholder="Select an open pay period"
              />
            </FormField>

            <FormField label="Run Type" required>
              <Select
                value={runType}
                onChange={(e) => setRunType(e.target.value)}
                options={runTypeOptions}
              />
            </FormField>

            {payPeriodOptions.length === 0 && (
              <p className="text-sm text-gray-500">
                No open pay periods available. Create a pay period first.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 p-6 border-t bg-gray-50">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={createPayRun.isPending || !payPeriodId}>
              {createPayRun.isPending ? 'Creating...' : 'Create Pay Run'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
