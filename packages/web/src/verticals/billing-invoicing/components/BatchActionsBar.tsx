import React, { useState } from 'react';
import {
  Sparkles,
  Download,
  Search,
  FileText,
  ShieldCheck,
  FileSpreadsheet,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/core/components';

interface BatchActionsBarProps {
  onGenerateInvoices: () => void;
  isGenerating: boolean;
  onOpenExportModal: (type: '837p' | 'cms1500' | 'csv') => void;
  search: string;
  onSearchChange: (search: string) => void;
  selectedCount: number;
  totalCount: number;
  verifiedReadyCount: number;
}

export const BatchActionsBar: React.FC<BatchActionsBarProps> = ({
  onGenerateInvoices,
  isGenerating,
  onOpenExportModal,
  search,
  onSearchChange,
  selectedCount,
  totalCount,
  verifiedReadyCount,
}) => {
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3.5 rounded-lg border border-gray-200 shadow-sm">
      {/* Left: Search Bar */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search patient, caregiver, claim #, or service code..."
          className="w-full pl-9 pr-3 py-2 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50/50"
        />
        {search && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        )}
      </div>

      {/* Right: Batch Action Buttons */}
      <div className="flex items-center gap-2.5">
        {/* Selection indicator */}
        {selectedCount > 0 && (
          <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-1.5 rounded-md border border-blue-200 whitespace-nowrap">
            {selectedCount} of {totalCount} selected
          </span>
        )}

        {/* Generate Invoices for Verified Visits */}
        <Button
          onClick={onGenerateInvoices}
          disabled={isGenerating || verifiedReadyCount === 0}
          leftIcon={<Sparkles className="h-4 w-4 text-yellow-400" />}
          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm whitespace-nowrap"
          title={`Generate invoices for ${verifiedReadyCount} EVV-verified visits. Visits with missing EVV are blocked.`}
        >
          {isGenerating ? 'Validating & Invoicing...' : `Generate Invoices (${verifiedReadyCount} Verified)`}
        </Button>

        {/* Export Claims Dropdown */}
        <div className="relative">
          <Button
            variant="outline"
            onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
            rightIcon={<ChevronDown className="h-3.5 w-3.5" />}
            leftIcon={<Download className="h-4 w-4 text-gray-600" />}
            className="text-xs font-semibold border-gray-300 text-gray-700 hover:bg-gray-50 whitespace-nowrap"
          >
            Export Claims
          </Button>

          {exportDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-20"
                onClick={() => setExportDropdownOpen(false)}
              />
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-1.5 z-30 text-xs animate-in fade-in zoom-in-95 duration-100">
                <button
                  type="button"
                  onClick={() => {
                    setExportDropdownOpen(false);
                    onOpenExportModal('837p');
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-blue-50 text-gray-700 hover:text-blue-700 flex items-center gap-2.5 transition-colors"
                >
                  <ShieldCheck className="h-4 w-4 text-blue-600" />
                  <div>
                    <p className="font-semibold">ANSI 837P EDI Preview</p>
                    <p className="text-[11px] text-gray-500">Electronic professional claim</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setExportDropdownOpen(false);
                    onOpenExportModal('cms1500');
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-blue-50 text-gray-700 hover:text-blue-700 flex items-center gap-2.5 transition-colors border-t border-gray-100"
                >
                  <FileText className="h-4 w-4 text-emerald-600" />
                  <div>
                    <p className="font-semibold">CMS-1500 Form Preview</p>
                    <p className="text-[11px] text-gray-500">Standard paper claim layout</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setExportDropdownOpen(false);
                    onOpenExportModal('csv');
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-blue-50 text-gray-700 hover:text-blue-700 flex items-center gap-2.5 transition-colors border-t border-gray-100"
                >
                  <FileSpreadsheet className="h-4 w-4 text-purple-600" />
                  <div>
                    <p className="font-semibold">Clearinghouse CSV Export</p>
                    <p className="text-[11px] text-gray-500">Spreadsheet batch upload</p>
                  </div>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
