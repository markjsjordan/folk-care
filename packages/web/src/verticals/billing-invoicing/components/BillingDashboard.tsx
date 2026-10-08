import React, { useState, useMemo } from 'react';
import {
  FileText,
  Plus,
  RefreshCw,
  ShieldAlert,
  Layers,
  Receipt,
  FileCheck2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, LoadingSpinner, ErrorMessage } from '@/core/components';
import { usePermissions } from '@/core/hooks';
import {
  useClaimsQueue,
  useGenerateInvoicesForVerifiedVisits,
  useBillingApi,
  useInvoices,
} from '../hooks';
import { billingErrorMessage } from '../services/billing-api';
import { BillingSummaryCards } from './BillingSummaryCards';
import { PayorFilterTabs } from './PayorFilterTabs';
import { BatchActionsBar } from './BatchActionsBar';
import { ClaimsQueueTable } from './ClaimsQueueTable';
import { ClaimsExportModal } from './ClaimsExportModal';
import { InvoiceCard } from './InvoiceCard';
import type {
  PayorTypeFilter,
  ClaimsQueueItem,
  CMS1500ClaimForm,
} from '../types';

export const BillingDashboard: React.FC = () => {
  const { can } = usePermissions();
  const billingApi = useBillingApi();

  // Navigation tab: 'claims' or 'invoices'
  const [activeViewTab, setActiveViewTab] = useState<'claims' | 'invoices'>('claims');

  // Payor Filter state
  const [selectedPayor, setSelectedPayor] = useState<PayorTypeFilter>('ALL');

  // Search state
  const [search, setSearch] = useState('');

  // Selected claims in queue
  const [selectedClaimIds, setSelectedClaimIds] = useState<string[]>([]);

  // Export Modal state
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [activeExportClaim, setActiveExportClaim] = useState<ClaimsQueueItem | null>(null);
  const [ediContent, setEdiContent] = useState<string>('');
  const [cms1500Forms, setCms1500Forms] = useState<CMS1500ClaimForm[]>([]);
  const [csvContent, setCsvContent] = useState<string>('');
  const [exportErrors, setExportErrors] = useState<{ edi?: string; cms1500?: string; csv?: string }>({});

  // Queries
  const {
    data: claimsQueueData,
    isLoading: isLoadingClaims,
    error: claimsError,
    refetch: refetchClaims,
  } = useClaimsQueue({ payor: selectedPayor, search });

  const {
    data: invoiceData,
    isLoading: isLoadingInvoices,
    refetch: refetchInvoices,
  } = useInvoices();

  // Mutations
  const generateBatchMutation = useGenerateInvoicesForVerifiedVisits();

  const claims = useMemo(() => claimsQueueData?.items || [], [claimsQueueData]);
  const summary = claimsQueueData?.summary || {
    totalUnbilledAmount: 0,
    totalUnbilledCount: 0,
    pendingEVVCount: 0,
    pendingEVVAmount: 0,
    claimsReadyCount: 0,
    claimsReadyAmount: 0,
    totalBilledMtdAmount: 0,
    totalBilledMtdCount: 0,
  };

  // Payor count statistics
  const payorCounts = useMemo(() => {
    const counts: Partial<Record<PayorTypeFilter, number>> = {
      ALL: claims.length,
      MEDICAID_MCO: 0,
      MEDICARE: 0,
      PRIVATE_PAY: 0,
      VA: 0,
    };

    for (const c of claims) {
      if (c.payorType === 'MEDICAID' || c.payorType === 'MANAGED_CARE') {
        counts.MEDICAID_MCO = (counts.MEDICAID_MCO || 0) + 1;
      } else if (c.payorType === 'MEDICARE' || c.payorType === 'MEDICARE_ADVANTAGE') {
        counts.MEDICARE = (counts.MEDICARE || 0) + 1;
      } else if (c.payorType === 'PRIVATE_PAY') {
        counts.PRIVATE_PAY = (counts.PRIVATE_PAY || 0) + 1;
      } else if (c.payorType === 'VETERANS_BENEFITS') {
        counts.VA = (counts.VA || 0) + 1;
      }
    }

    return counts;
  }, [claims]);

  const verifiedReadyCount = useMemo(() => {
    // Only uninvoiced claims are picked up by "Generate Invoices".
    return claims.filter((c) => c.status === 'VERIFIED_READY' && !c.invoiceId).length;
  }, [claims]);

  // Handlers
  const addClaimToSelection = (claimId: string) => setSelectedClaimIds((prev) => [...prev, claimId]);
  const removeClaimFromSelection = (claimId: string) =>
    setSelectedClaimIds((prev) => prev.filter((id) => id !== claimId));

  const handleGenerateInvoices = () => {
    // The server re-reads EVV for every item; we only narrow the batch to the
    // user's selection when they picked uninvoiced, verified claims.
    const selectedReady = claims
      .filter((c) => selectedClaimIds.includes(c.id) && c.status === 'VERIFIED_READY' && !c.invoiceId)
      .map((c) => c.id);

    generateBatchMutation.mutate(selectedReady.length > 0 ? { billableItemIds: selectedReady } : {}, {
      onSuccess: () => setSelectedClaimIds([]),
    });
  };

  const handleOpenExportModal = async (
    _type: '837p' | 'cms1500' | 'csv',
    claim?: ClaimsQueueItem
  ) => {
    const targetClaim = claim ?? claims.find((c) => c.status === 'VERIFIED_READY' && c.invoiceId) ?? null;
    setActiveExportClaim(targetClaim);
    setEdiContent('');
    setCms1500Forms([]);
    setCsvContent('');

    const errors: { edi?: string; cms1500?: string; csv?: string } = {};
    const invoiceId = targetClaim?.invoiceId;

    if (invoiceId) {
      const [edi, cms] = await Promise.allSettled([
        billingApi.export837P(invoiceId),
        billingApi.exportCMS1500(invoiceId),
      ]);
      if (edi.status === 'fulfilled') setEdiContent(edi.value);
      else errors.edi = billingErrorMessage(edi.reason, 'Failed to export 837P');
      if (cms.status === 'fulfilled') setCms1500Forms(cms.value);
      else errors.cms1500 = billingErrorMessage(cms.reason, 'Failed to export CMS-1500');
    } else {
      const reason = targetClaim
        ? `Claim ${targetClaim.claimNumber} is not on an invoice yet. Generate invoices for verified visits first.`
        : 'No invoiced, EVV-verified claims are available to export.';
      errors.edi = reason;
      errors.cms1500 = reason;
    }

    try {
      setCsvContent(await billingApi.exportClaimsCsv(selectedPayor));
    } catch (err) {
      errors.csv = billingErrorMessage(err, 'Failed to export claims CSV');
    }

    setExportErrors(errors);
    setExportModalOpen(true);
  };

  if (isLoadingClaims && activeViewTab === 'claims') {
    return (
      <div className="flex justify-center items-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (claimsError && activeViewTab === 'claims') {
    return (
      <ErrorMessage
        message={(claimsError as Error).message || 'Failed to load billing & claims queue'}
        retry={refetchClaims}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-gray-900">Billing & Claims Dashboard</h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
              <FileCheck2 className="h-3.5 w-3.5 text-blue-600" />
              EVV Gate Active
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            21st Century Cures Act compliance validation, electronic 837P/CMS-1500 claims queue, and invoice generation.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              refetchClaims();
              refetchInvoices();
            }}
            leftIcon={<RefreshCw className="h-4 w-4" />}
            className="text-xs"
          >
            Refresh
          </Button>

          {can('billing:write') && (
            <Link to="/billing/new">
              <Button leftIcon={<Plus className="h-4 w-4" />} className="text-xs">
                New Invoice
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <BillingSummaryCards
        summary={summary}
        onFilterPendingEVV={() => {
          setActiveViewTab('claims');
          setSelectedPayor('ALL');
        }}
        onFilterClaimsReady={() => {
          setActiveViewTab('claims');
          setSelectedPayor('ALL');
        }}
      />

      {/* Regulatory Context Alert Banner when EVV items are incomplete */}
      {summary.pendingEVVCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3.5 flex items-start justify-between">
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="h-5 w-5 text-amber-700 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-bold text-amber-900 uppercase tracking-wide">
                21st Century Cures Act Mandate: Electronic Visit Verification Required
              </p>
              <p className="text-xs text-amber-800 mt-0.5">
                {summary.pendingEVVCount} visit(s) cannot be invoiced or submitted to Medicaid until GPS geofence verification
                or approved manual exception reason is completed. Submitting unverified visits violates federal regulations (42 CFR § 440.387).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Primary Section Tabs: Claims Queue vs Invoices */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveViewTab('claims')}
          className={`pb-3 px-4 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
            activeViewTab === 'claims'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Layers className="h-4 w-4" />
          <span>Claims Queue & EVV Verification</span>
          <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-blue-100 text-blue-800">
            {claims.length}
          </span>
        </button>

        <button
          onClick={() => setActiveViewTab('invoices')}
          className={`pb-3 px-4 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
            activeViewTab === 'invoices'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Receipt className="h-4 w-4" />
          <span>Generated Invoices</span>
          <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-gray-100 text-gray-700">
            {invoiceData?.total || 0}
          </span>
        </button>
      </div>

      {/* TAB 1: CLAIMS QUEUE & EVV VERIFICATION */}
      {activeViewTab === 'claims' && (
        <div className="space-y-4">
          {/* Payor Filter Tabs */}
          <PayorFilterTabs
            selectedPayor={selectedPayor}
            onChange={setSelectedPayor}
            counts={payorCounts}
          />

          {/* Batch Actions Bar (Generate Invoices for Verified Visits, Export, Search) */}
          <BatchActionsBar
            onGenerateInvoices={handleGenerateInvoices}
            isGenerating={generateBatchMutation.isPending}
            onOpenExportModal={(type) => handleOpenExportModal(type)}
            search={search}
            onSearchChange={setSearch}
            selectedCount={selectedClaimIds.length}
            totalCount={claims.length}
            verifiedReadyCount={verifiedReadyCount}
          />

          {/* Claims Queue Table with Status Badges */}
          <ClaimsQueueTable
            claims={claims}
            selectedClaimIds={selectedClaimIds}
            onSelectClaim={(claimId, selected) =>
              selected ? addClaimToSelection(claimId) : removeClaimFromSelection(claimId)
            }
            onSelectAll={(selected) => setSelectedClaimIds(selected ? claims.map((c) => c.id) : [])}
            onViewExport={(claim) => handleOpenExportModal('837p', claim)}
          />
        </div>
      )}

      {/* TAB 2: INVOICES LIST VIEW */}
      {activeViewTab === 'invoices' && (
        <div className="space-y-4">
          {isLoadingInvoices ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner size="md" />
            </div>
          ) : (invoiceData?.items || []).length === 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 p-12 text-center text-gray-500">
              <FileText className="h-10 w-10 mx-auto text-gray-300 mb-2" />
              <p className="text-sm font-semibold text-gray-900">No invoices generated yet</p>
              <p className="text-xs text-gray-500 mt-1">
                Go to the Claims Queue and click &quot;Generate Invoices for Verified Visits&quot; to batch bill compliant visits.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(invoiceData?.items || []).map((invoice) => (
                <InvoiceCard key={invoice.id} invoice={invoice} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Export 837P / CMS-1500 / CSV Modal */}
      <ClaimsExportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        selectedClaim={activeExportClaim}
        allClaims={claims}
        ediContent={ediContent}
        cms1500Forms={cms1500Forms}
        csvContent={csvContent}
        exportErrors={exportErrors}
      />
    </div>
  );
};
