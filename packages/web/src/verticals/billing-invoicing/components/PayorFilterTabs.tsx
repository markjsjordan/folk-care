import React from 'react';
import type { PayorTypeFilter } from '../types';

interface PayorFilterTabsProps {
  selectedPayor: PayorTypeFilter;
  onChange: (payor: PayorTypeFilter) => void;
  counts?: Partial<Record<PayorTypeFilter, number>>;
}

export const PayorFilterTabs: React.FC<PayorFilterTabsProps> = ({
  selectedPayor,
  onChange,
  counts = {},
}) => {
  const tabs: { key: PayorTypeFilter; label: string; description: string }[] = [
    { key: 'ALL', label: 'All Payors', description: 'All claims & visits' },
    { key: 'MEDICAID_MCO', label: 'Medicaid MCO', description: 'Superior, Molina, UHC (EVV Mandated)' },
    { key: 'MEDICARE', label: 'Medicare', description: 'Palmetto GBA, Noridian' },
    { key: 'PRIVATE_PAY', label: 'Private Pay', description: 'Direct Client & Family' },
    { key: 'VA', label: 'VA', description: 'Veterans Affairs Community Care' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1.5 p-1 bg-gray-100 rounded-lg border border-gray-200">
      {tabs.map((tab) => {
        const isSelected = selectedPayor === tab.key;
        const count = counts[tab.key];

        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md transition-all ${
              isSelected
                ? 'bg-white text-blue-700 shadow-sm font-semibold border border-gray-200/80'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/60'
            }`}
            title={tab.description}
          >
            <span>{tab.label}</span>
            {count !== undefined && (
              <span
                className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
                  isSelected
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-gray-200 text-gray-700'
                }`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
