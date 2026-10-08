import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Button, FormField, Select } from '@/core/components';
import { useAuth } from '@/core/hooks';
import { useCreatePayPeriod, useOpenPayPeriod } from '../hooks';
import type { PayPeriodType } from '../types';

export interface CreatePayPeriodModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

const periodTypeOptions = [
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'BI_WEEKLY', label: 'Bi-Weekly' },
  { value: 'SEMI_MONTHLY', label: 'Semi-Monthly' },
  { value: 'MONTHLY', label: 'Monthly' },
];

export const CreatePayPeriodModal: React.FC<CreatePayPeriodModalProps> = ({
  isOpen,
  onClose,
  onCreated,
}) => {
  const { user } = useAuth();
  const createPayPeriod = useCreatePayPeriod();
  const openPayPeriod = useOpenPayPeriod();

  const [periodType, setPeriodType] = useState<PayPeriodType>('BI_WEEKLY');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [payDate, setPayDate] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.organizationId) return;

    try {
      const period = await createPayPeriod.mutateAsync({
        organizationId: user.organizationId,
        periodType,
        startDate,
        endDate,
        payDate,
      });
      // New pay periods are created in DRAFT status; immediately open them
      // for timesheet submission so they're usable right away (Lock in
      // PayPeriodManagement only applies to OPEN periods).
      await openPayPeriod.mutateAsync(period.id);
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
          <h2 className="text-xl font-semibold text-gray-900">Create Pay Period</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            leftIcon={<X className="h-4 w-4" />}
          />
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4">
            <FormField label="Period Type" required>
              <Select
                value={periodType}
                onChange={(e) => setPeriodType(e.target.value as PayPeriodType)}
                options={periodTypeOptions}
              />
            </FormField>

            <FormField label="Start Date" required>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </FormField>

            <FormField label="End Date" required>
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </FormField>

            <FormField label="Pay Date" required>
              <input
                type="date"
                required
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </FormField>
          </div>

          <div className="flex justify-end gap-3 p-6 border-t bg-gray-50">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={createPayPeriod.isPending}>
              {createPayPeriod.isPending ? 'Creating...' : 'Create Pay Period'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
