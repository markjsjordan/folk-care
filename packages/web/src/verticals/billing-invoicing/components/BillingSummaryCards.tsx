import React from 'react';
import { DollarSign, AlertTriangle, CheckCircle2, TrendingUp } from 'lucide-react';
import type { BillingDashboardSummary } from '../types';
import { formatCurrency } from '../utils';

interface BillingSummaryCardsProps {
  summary: BillingDashboardSummary;
  onFilterPendingEVV?: () => void;
  onFilterClaimsReady?: () => void;
}

export const BillingSummaryCards: React.FC<BillingSummaryCardsProps> = ({
  summary,
  onFilterPendingEVV,
  onFilterClaimsReady,
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Total Unbilled */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Total Unbilled
            </p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {formatCurrency(summary.totalUnbilledAmount)}
            </p>
          </div>
          <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
            <DollarSign className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-3 flex items-center text-xs text-gray-500">
          <span className="font-medium text-gray-700 mr-1.5">{summary.totalUnbilledCount} visits</span>
          <span>awaiting billing</span>
        </div>
      </div>

      {/* 2. Pending EVV Verification (Cures Act Gate) */}
      <div 
        onClick={onFilterPendingEVV}
        className={`bg-white rounded-lg shadow-sm border p-5 cursor-pointer transition-colors ${
          summary.pendingEVVCount > 0 
            ? 'border-amber-300 bg-amber-50/30 hover:bg-amber-50/60' 
            : 'border-gray-200'
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider">
                Pending EVV Verification
              </p>
              {summary.pendingEVVCount > 0 && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-200 text-amber-900">
                  ACTION
                </span>
              )}
            </div>
            <p className="text-2xl font-bold text-amber-900 mt-1">
              {summary.pendingEVVCount} <span className="text-sm font-normal text-amber-700">visits</span>
            </p>
          </div>
          <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-700">
            <AlertTriangle className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="text-amber-800 font-medium">
            {formatCurrency(summary.pendingEVVAmount)} blocked
          </span>
          <span className="text-amber-700 underline text-[11px]">Cures Act Gate</span>
        </div>
      </div>

      {/* 3. Claims Ready */}
      <div 
        onClick={onFilterClaimsReady}
        className="bg-white rounded-lg shadow-sm border border-emerald-200 bg-emerald-50/20 hover:bg-emerald-50/40 p-5 cursor-pointer transition-colors"
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">
                Claims Ready
              </p>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                VERIFIED
              </span>
            </div>
            <p className="text-2xl font-bold text-emerald-900 mt-1">
              {formatCurrency(summary.claimsReadyAmount)}
            </p>
          </div>
          <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-emerald-800">
          <span className="font-medium">{summary.claimsReadyCount} verified claims</span>
          <span className="text-emerald-700 underline text-[11px]">Ready for 837P / CMS-1500</span>
        </div>
      </div>

      {/* 4. Total Billed (MTD) */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Total Billed (MTD)
            </p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {formatCurrency(summary.totalBilledMtdAmount)}
            </p>
          </div>
          <div className="h-10 w-10 rounded-full bg-purple-50 flex items-center justify-center text-purple-600">
            <TrendingUp className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-3 flex items-center text-xs text-gray-500">
          <span className="font-medium text-gray-700 mr-1.5">{summary.totalBilledMtdCount} claims</span>
          <span>submitted this month</span>
        </div>
      </div>
    </div>
  );
};
